/**
 * Session Refresher — headless D2L cookie auto-refresh.
 *
 * Uses saved ADFS browser state from S3 to silently refresh D2L session
 * cookies without Duo MFA. If ADFS state has expired (30-90 days),
 * sends a push notification asking the user to re-auth manually.
 *
 * Two entry points:
 *   - refreshD2LSession(userId)  — on-demand refresh (called from auth.ts)
 *   - startSessionRefreshScheduler() — background scheduler (called from index.ts)
 */

import { chromium } from "playwright";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { supabase } from "../utils/supabase.js";
import { loadStorageStateFromS3, saveStorageStateToS3 } from "../utils/s3Storage.js";
import { sendPushToUser } from "../api/push.js";
import { getD2LCredentials } from "../auth.js";

const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium";
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // check every 30 min
const STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000; // refresh if token older than 12h
const NAV_TIMEOUT_MS = 30_000; // 30s page load timeout

export interface RefreshResult {
  success: boolean;
  reason?: "no_stored_state" | "duo_required" | "nav_failed" | "no_cookies" | "error";
  error?: string;
}

/**
 * Attempt a headless credential-based D2L login for a user.
 * Used as a fallback when ADFS browser state is absent or expired.
 * On success: upserts token to DB, saves new browser state to S3, clears duo_required_at.
 * Returns { token, storageStatePath } on success, null if Duo wall hit or no creds stored.
 */
async function attemptCredentialLogin(
  userId: string,
  d2lHost: string
): Promise<{ token: string; storageStatePath: string } | null> {
  const creds = await getD2LCredentials(userId);
  if (!creds?.username || !creds?.password) {
    console.error(`[REFRESH] No stored credentials for user ${userId} — cannot attempt credential login`);
    return null;
  }

  console.error(`[REFRESH] Attempting credential-based login for user ${userId}`);

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`https://${d2lHost}/d2l/home`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
    await page.waitForTimeout(3000);

    const landingUrl = page.url();
    console.error(`[REFRESH] Credential login landing URL for user ${userId}: ${landingUrl}`);

    // If Duo wall — cannot proceed headlessly
    if (landingUrl.includes("duo") || landingUrl.includes("duosecurity")) {
      console.error(`[REFRESH] Credential login hit Duo wall for user ${userId}`);
      await browser.close();
      return null;
    }

    // If on a username/password form — fill credentials
    if (
      landingUrl.includes("adfs") ||
      landingUrl.includes("login") ||
      landingUrl.includes("saml") ||
      landingUrl.includes("microsoftonline") ||
      landingUrl.includes("sso")
    ) {
      console.error(`[REFRESH] Filling credentials for user ${userId}`);
      await page.fill('input[type="text"], input[name="UserName"], input[name="username"]', creds.username).catch(() => {});

      // Look for a Next/Submit button (multi-step ADFS forms)
      const nextSelectors = [
        'input[type="submit"]',
        'button[type="submit"]',
        '#submitButton',
        'input[value*="Next" i]',
        'button:has-text("Next")',
      ];
      let clicked = false;
      for (const sel of nextSelectors) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 1000 })) {
            await btn.click();
            clicked = true;
            await page.waitForTimeout(2000);
            break;
          }
        } catch { continue; }
      }
      if (!clicked) {
        await page.keyboard.press("Enter");
        await page.waitForTimeout(2000);
      }

      await page.fill('input[type="password"], input[name="Password"], input[name="password"]', creds.password).catch(() => {});

      const submitSelectors = [
        'input[type="submit"]',
        'button[type="submit"]',
        'button:has-text("Sign in")',
        'button:has-text("Log in")',
        '#submitButton',
      ];
      let submitted = false;
      for (const sel of submitSelectors) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 1000 })) {
            await btn.click();
            submitted = true;
            break;
          }
        } catch { continue; }
      }
      if (!submitted) {
        await page.keyboard.press("Enter");
      }

      await page.waitForTimeout(5000);

      const postLoginUrl = page.url();
      console.error(`[REFRESH] Post-credential URL for user ${userId}: ${postLoginUrl}`);

      if (
        postLoginUrl.includes("duo") ||
        postLoginUrl.includes("duosecurity") ||
        postLoginUrl.includes("adfs") ||
        postLoginUrl.includes("login") ||
        postLoginUrl.includes("microsoftonline")
      ) {
        console.error(`[REFRESH] Still on auth/Duo page after credential fill for user ${userId}`);
        await browser.close();
        return null;
      }
    }

    // Extract D2L session cookies
    const cookies = await context.cookies();
    const sessionVal = cookies.find(c => c.name === "d2lSessionVal" && c.domain.includes(d2lHost))?.value;
    const secureVal = cookies.find(c => c.name === "d2lSecureSessionVal" && c.domain.includes(d2lHost))?.value;

    if (!sessionVal || !secureVal) {
      console.error(`[REFRESH] Credential login: no D2L cookies found for user ${userId}`);
      await browser.close();
      return null;
    }

    // Save browser storage state to S3
    const tmpStatePath = path.join(os.tmpdir(), `cred-login-state-${userId}.json`);
    await context.storageState({ path: tmpStatePath });
    await saveStorageStateToS3(userId, tmpStatePath);
    await fs.unlink(tmpStatePath).catch(() => {});

    const token = JSON.stringify({ d2lSessionVal: sessionVal, d2lSecureSessionVal: secureVal });

    // Upsert fresh token and clear duo_required_at
    const { error } = await supabase.from("user_credentials").upsert({
      user_id: userId,
      service: "d2l",
      host: d2lHost,
      token,
      duo_required_at: null,
      notification_sent_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,service" });

    if (error) {
      console.error(`[REFRESH] Failed to store credential-login token for user ${userId}:`, error.message);
    }

    await browser.close();
    console.error(`[REFRESH] Credential login succeeded for user ${userId}`);
    return { token, storageStatePath: tmpStatePath };

  } catch (err: any) {
    console.error(`[REFRESH] Credential login error for user ${userId}:`, err?.message);
    if (browser) await browser.close().catch(() => {});
    return null;
  }
}

/**
 * Attempt to refresh a user's D2L session cookies using saved ADFS browser state.
 * Falls back to credential-based login if ADFS state is absent or expired.
 * No VNC, no Xvfb — fully headless.
 */
export async function refreshD2LSession(userId: string): Promise<RefreshResult> {
  const startTime = Date.now();
  console.error(`[REFRESH] Starting headless refresh for user ${userId}`);

  // 1. Get the user's D2L host via direct REST API (needed for both S3 and credential paths)
  let d2lHost = process.env.D2L_HOST || "learn.uwaterloo.ca";
  try {
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
    if (sbUrl && sbKey) {
      const resp = await fetch(`${sbUrl}/rest/v1/user_credentials?user_id=eq.${userId}&service=eq.d2l&select=host&limit=1`, {
        headers: { "apikey": sbKey, "Authorization": `Bearer ${sbKey}` },
      });
      if (resp.ok) {
        const rows = await resp.json() as Array<{ host: string }>;
        if (rows.length > 0 && rows[0].host) d2lHost = rows[0].host;
      }
    }
  } catch (e) {
    console.error("[REFRESH] Error fetching D2L host:", e);
  }

  // 2. Load saved browser state from S3
  const storageStatePath = await loadStorageStateFromS3(userId);
  if (!storageStatePath) {
    console.error(`[REFRESH] No stored browser state for user ${userId} — trying credential login`);
    const credResult = await attemptCredentialLogin(userId, d2lHost);
    if (credResult) {
      console.error(`[REFRESH] Credential login succeeded for user ${userId} (no prior S3 state)`);
      return { success: true };
    }
    console.error(`[REFRESH] Credential login failed for user ${userId} — marking duo_required`);
    return { success: false, reason: "no_stored_state" };
  }

  let browser;
  try {
    // 3. Launch headless Playwright — no display needed
    browser = await chromium.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const context = await browser.newContext({
      storageState: storageStatePath,
    });

    const page = await context.newPage();

    // 4. Navigate to D2L — ADFS cookies should auto-login if still valid
    await page.goto(`https://${d2lHost}/d2l/home`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });

    // Give redirects time to settle
    await page.waitForTimeout(3000);

    const finalUrl = page.url();
    console.error(`[REFRESH] Final URL for user ${userId}: ${finalUrl}`);

    // 5. Check if we landed on a login page (ADFS expired, Duo needed)
    const isLoginPage =
      finalUrl.includes("login") ||
      finalUrl.includes("microsoftonline") ||
      finalUrl.includes("sso") ||
      finalUrl.includes("adfs");

    if (isLoginPage) {
      console.error(`[REFRESH] ADFS session expired for user ${userId} — trying credential login`);
      await browser.close();
      browser = undefined;
      const credResult = await attemptCredentialLogin(userId, d2lHost);
      if (credResult) {
        console.error(`[REFRESH] Credential login succeeded for user ${userId} (ADFS state expired)`);
        return { success: true };
      }
      console.error(`[REFRESH] Credential login failed for user ${userId} — marking duo_required`);
      return { success: false, reason: "duo_required" };
    }

    // 6. Extract D2L session cookies
    const cookies = await context.cookies();
    const sessionVal = cookies.find(c => c.name === "d2lSessionVal" && c.domain.includes(d2lHost))?.value;
    const secureVal = cookies.find(c => c.name === "d2lSecureSessionVal" && c.domain.includes(d2lHost))?.value;

    if (!sessionVal || !secureVal) {
      console.error(`[REFRESH] Missing D2L cookies for user ${userId} after navigation`);
      await browser.close();
      return { success: false, reason: "no_cookies" };
    }

    // 7. Save refreshed storage state back to S3 (extends ADFS lifetime)
    const tmpStatePath = path.join(os.tmpdir(), `refresh-state-${userId}.json`);
    await context.storageState({ path: tmpStatePath });
    await saveStorageStateToS3(userId, tmpStatePath);
    await fs.unlink(tmpStatePath).catch(() => {});

    // 8. Upsert fresh D2L token into database (clear duo_required_at if set)
    const token = JSON.stringify({ d2lSessionVal: sessionVal, d2lSecureSessionVal: secureVal });
    const { error } = await supabase.from("user_credentials").upsert({
      user_id: userId,
      service: "d2l",
      host: d2lHost,
      token,
      duo_required_at: null,
      notification_sent_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,service" });

    if (error) {
      console.error(`[REFRESH] Failed to store refreshed token for user ${userId}:`, error.message);
    }

    await browser.close();

    const durationMs = Date.now() - startTime;
    console.error(`[REFRESH] Successfully refreshed D2L session for user ${userId} (${durationMs}ms)`);
    return { success: true };

  } catch (err: any) {
    console.error(`[REFRESH] Error refreshing session for user ${userId}:`, err?.message);
    if (browser) {
      await browser.close().catch(() => {});
    }
    return { success: false, reason: "error", error: err?.message };
  }
}

/**
 * Background scheduler that proactively refreshes stale D2L sessions.
 * Runs every 30 minutes, checks all users with D2L credentials older than 18 hours.
 */
export function startSessionRefreshScheduler(): void {
  console.error("[REFRESH] Session refresh scheduler started (interval: 30min, threshold: 18h)");

  const runRefreshCycle = async () => {
    try {
      const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

      const { data: staleUsers, error } = await supabase
        .from("user_credentials")
        .select("user_id, updated_at")
        .eq("service", "d2l")
        .lt("updated_at", cutoff);

      if (error) {
        console.error("[REFRESH] Failed to query stale sessions:", error.message);
        return;
      }

      if (!staleUsers || staleUsers.length === 0) {
        console.error("[REFRESH] No stale sessions found");
        return;
      }

      console.error(`[REFRESH] Found ${staleUsers.length} stale session(s), refreshing...`);

      for (const user of staleUsers) {
        const result = await refreshD2LSession(user.user_id);

        if (!result.success && (result.reason === "duo_required" || result.reason === "no_stored_state")) {
          sendPushToUser(
            user.user_id,
            "D2L Session Expired",
            "Your D2L connection needs re-authentication. Open Horizon to reconnect.",
            { type: "reauth_required" }
          ).catch(err => {
            console.error(`[REFRESH] Failed to send push to user ${user.user_id}:`, err?.message);
          });
        }
      }
    } catch (err: any) {
      console.error("[REFRESH] Scheduler cycle error:", err?.message);
    }
  };

  // Run first cycle after a short delay (let server finish starting)
  setTimeout(runRefreshCycle, 10_000);

  // Then run every 30 minutes
  setInterval(runRefreshCycle, REFRESH_INTERVAL_MS);
}
