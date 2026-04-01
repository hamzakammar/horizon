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

const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium";
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // check every 30 min
const STALE_THRESHOLD_MS = 18 * 60 * 60 * 1000; // refresh if token older than 18h
const NAV_TIMEOUT_MS = 30_000; // 30s page load timeout

export interface RefreshResult {
  success: boolean;
  reason?: "no_stored_state" | "duo_required" | "nav_failed" | "no_cookies" | "error";
  error?: string;
}

/**
 * Attempt to refresh a user's D2L session cookies using saved ADFS browser state.
 * No VNC, no Xvfb — fully headless.
 */
export async function refreshD2LSession(userId: string): Promise<RefreshResult> {
  const startTime = Date.now();
  console.error(`[REFRESH] Starting headless refresh for user ${userId}`);

  // 1. Load saved browser state from S3
  const storageStatePath = await loadStorageStateFromS3(userId);
  if (!storageStatePath) {
    console.error(`[REFRESH] No stored browser state for user ${userId} — cannot auto-refresh`);
    return { success: false, reason: "no_stored_state" };
  }

  // 2. Get the user's D2L host via direct REST API
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
      console.error(`[REFRESH] ADFS session expired for user ${userId} — Duo required`);
      await browser.close();
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

    // 8. Upsert fresh D2L token into database
    const token = JSON.stringify({ d2lSessionVal: sessionVal, d2lSecureSessionVal: secureVal });
    const { error } = await supabase.from("user_credentials").upsert({
      user_id: userId,
      service: "d2l",
      host: d2lHost,
      token,
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

        if (!result.success && result.reason === "duo_required") {
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
