import "dotenv/config";
import { chromium, BrowserContext } from "playwright";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import { supabase } from "./utils/supabase.js";

const REMOTE_DEBUG = process.env.REMOTE_DEBUG === "true";

// Get session path for a user (or default)
function getSessionPath(userId?: string): string {
  if (userId) {
    return join(homedir(), `.d2l-session-${userId}`);
  }
  return join(homedir(), ".d2l-session");
}

// Load D2L token for a user from database
async function getD2LToken(userId?: string): Promise<{ host: string; token: string; updated_at?: string } | null> {
  if (userId) {
    try {
      const { data, error } = await supabase
        .from("user_credentials")
        .select("host, token, updated_at")
        .eq("user_id", userId)
        .eq("service", "d2l")
        .limit(1);
      
      const cred = Array.isArray(data) ? data[0] : data;

      if (!error && cred && cred.token) {
        return {
          host: cred.host || process.env.D2L_HOST || "learn.ul.ie",
          token: cred.token,
          updated_at: cred.updated_at,
        };
      }
    } catch (e) {
      console.error("[AUTH] Error loading D2L token from DB:", e);
    }
  }
  return null;
}

// Load D2L credentials for a user from database, or fall back to env vars
async function getD2LCredentials(userId?: string): Promise<{ host: string; username: string; password: string } | null> {
  if (userId) {
    try {
      const { data, error } = await supabase
        .from("user_credentials")
        .select("host, username, password")
        .eq("user_id", userId)
        .eq("service", "d2l")
        .limit(1);
      
      const cred = Array.isArray(data) ? data[0] : data;

      if (!error && cred && cred.username && cred.password) {
        return {
          host: cred.host || process.env.D2L_HOST || "learn.ul.ie",
          username: cred.username,
          password: cred.password,
        };
      }
    } catch (e) {
      console.error("[AUTH] Error loading D2L credentials from DB:", e);
    }
  }

  // Fall back to environment variables
  const host = process.env.D2L_HOST || "learn.ul.ie";
  const username = process.env.D2L_USERNAME;
  const password = process.env.D2L_PASSWORD;

  if (username && password) {
    return { host, username, password };
  }

  return null;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache = { token: "", expiresAt: 0 };

function isLoginPage(url: string): boolean {
  return (
    url.includes("login") ||
    url.includes("microsoftonline") ||
    url.includes("sso") ||
    url.includes("adfs")
  );
}

// Per-user token cache
const userTokenCache: Record<string, TokenCache> = {};

/**
 * Mark that a user needs Duo re-authentication.
 * This is checked by the daily health job and MCP tool responses.
 */
async function markDuoRequired(userId: string): Promise<void> {
  try {
    await supabase.from("user_credentials").update({
      duo_required_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("service", "d2l");
    console.error(`[AUTH] Marked Duo required for user ${userId}`);
  } catch (e) {
    console.error(`[AUTH] Failed to mark Duo required for user ${userId}:`, e);
  }
}

/**
 * Clear Duo required flag after successful re-authentication.
 */
export async function clearDuoRequired(userId: string): Promise<void> {
  try {
    await supabase.from("user_credentials").update({
      duo_required_at: null,
      notification_sent_at: null,
    }).eq("user_id", userId).eq("service", "d2l");
  } catch {}
}

/**
 * Check if a user needs Duo re-authentication.
 */
export async function isDuoRequired(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("user_credentials")
      .select("duo_required_at")
      .eq("user_id", userId)
      .eq("service", "d2l")
      .single();
    return !!data?.duo_required_at;
  } catch {
    return false;
  }
}

/**
 * Attempt a silent headless re-login using stored credentials + S3 browser state.
 * Returns the new token on success, null if Duo wall is hit.
 */
async function attemptSilentRelogin(userId: string): Promise<string | null> {
  const creds = await getD2LCredentials(userId);
  if (!creds?.username || !creds?.password) {
    console.error(`[AUTH] No stored credentials for user ${userId}, cannot silent re-login`);
    return null;
  }

  console.error(`[AUTH] Attempting silent re-login for user ${userId}`);

  const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium";
  const sessionPath = getSessionPath(userId);

  let context;
  try {
    context = await chromium.launchPersistentContext(sessionPath, {
      headless: true,
      executablePath: chromiumPath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  } catch (e: any) {
    console.error(`[AUTH] Silent re-login browser launch failed: ${e.message}`);
    return null;
  }

  try {
    const page = await context.newPage();
    await page.goto(`https://${creds.host}/d2l/home`, { timeout: 15000 });
    const url = page.url();

    // Duo/ADFS wall — cannot proceed headlessly
    if (url.includes("adfs") || url.includes("login") || url.includes("saml")) {
      console.error(`[AUTH] Silent re-login hit auth wall for user ${userId}: ${url}`);
      return null;
    }

    // Try to fill credentials if on a login page
    if (url.includes("login") || url.includes("signin")) {
      await page.fill('input[type="text"], input[name="username"]', creds.username).catch(() => {});
      await page.fill('input[type="password"]', creds.password).catch(() => {});
      await page.keyboard.press("Enter");
      await page.waitForURL(`**/${creds.host}/**`, { timeout: 10000 }).catch(() => {});
    }

    const finalUrl = page.url();
    if (finalUrl.includes("adfs") || finalUrl.includes("login")) {
      console.error(`[AUTH] Silent re-login still on auth page for user ${userId}`);
      return null;
    }

    // Extract D2L session cookies
    const cookies = await context.cookies();
    const sessionVal = cookies.find(c => c.name === "d2lSessionVal")?.value;
    const secureVal = cookies.find(c => c.name === "d2lSecureSessionVal")?.value;

    if (!sessionVal || !secureVal) {
      console.error(`[AUTH] Silent re-login: no D2L cookies found for user ${userId}`);
      return null;
    }

    const token = JSON.stringify({ d2lSessionVal: sessionVal, d2lSecureSessionVal: secureVal });

    // Persist new token
    await supabase.from("user_credentials").upsert({
      user_id: userId,
      service: "d2l",
      host: creds.host,
      token,
      duo_required_at: null,
      notification_sent_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,service" });

    userTokenCache[userId] = { token, expiresAt: Date.now() + 82800000 };
    console.error(`[AUTH] Silent re-login succeeded for user ${userId}`);
    return token;

  } catch (e: any) {
    console.error(`[AUTH] Silent re-login error for user ${userId}: ${e.message}`);
    return null;
  } finally {
    try { await context.close(); } catch {}
  }
}

export async function getToken(userId?: string): Promise<string> {
  const authStartTime = Date.now();
  const cacheKey = userId || "default";
  const isProduction = process.env.NODE_ENV === "production";

  // If userId is provided, check for stored token first (from WebView login)
  if (userId) {
    const userToken = await getD2LToken(userId);
    if (userToken && userToken.token) {
      // Check if token is already aged (older than 20 hours)
      const tokenAge = Date.now() - (new Date(userToken.updated_at || 0).getTime());
      const maxAge = 20 * 60 * 60 * 1000; // 20 hours
      
      if (tokenAge > maxAge) {
        console.error(`[AUTH] Stored token for user ${userId} is too old (${Math.round(tokenAge / 3600000)}h), attempting silent re-login`);
        // Try headless re-login with stored credentials before giving up
        const refreshed = await attemptSilentRelogin(userId);
        if (refreshed) return refreshed;
        // If silent re-login fails (Duo wall), mark duo_required and throw
        await markDuoRequired(userId);
        throw new Error("REAUTH_REQUIRED");
      } else {
        console.error(`[AUTH] Using stored token for user ${userId} (age: ${Math.round(tokenAge / 3600000)}h)`);
        userTokenCache[cacheKey] = {
          token: userToken.token,
          expiresAt: Date.now() + 82800000,
        };
        return userToken.token;
      }
    }

    // No token at all — try silent re-login with stored credentials
    console.error(`[AUTH] No token for user ${userId}, attempting silent re-login`);
    const refreshed = await attemptSilentRelogin(userId);
    if (refreshed) return refreshed;

    // Silent re-login failed — Duo required
    await markDuoRequired(userId);
    throw new Error("REAUTH_REQUIRED");
  } else {
    // No userId - use env token if available (legacy behavior)
    const envToken = process.env.D2L_TOKEN;
    if (envToken) {
      console.error("[AUTH] Using D2L_TOKEN from environment variable (no userId)");
      userTokenCache[cacheKey] = {
        token: envToken,
        expiresAt: Date.now() + 82800000, // 23 hours
      };
      return envToken;
    }
  }

  // Return cached token if still valid (with 1 hour buffer for safety)
  // Also check if token is already aged beyond reasonable use
  const cachedToken = userTokenCache[cacheKey];
  if (cachedToken?.token) {
    const timeUntilExpiry = cachedToken.expiresAt - Date.now();
    const isExpired = timeUntilExpiry < 3600000; // Less than 1 hour left
    
    if (!isExpired) {
      const cacheTime = Date.now() - authStartTime;
      console.error(
        `[AUTH] Token cache hit for user ${userId || 'default'} (${cacheTime}ms, expires in ${Math.round(
          timeUntilExpiry / 1000
        )}s)`
      );
      return cachedToken.token;
    } else {
      console.error(
        `[AUTH] Cached token for user ${userId || 'default'} is expired or too close to expiry (${Math.round(
          timeUntilExpiry / 1000
        )}s), refreshing`
      );
      // Clear expired cache
      delete userTokenCache[cacheKey];
    }
  }

  console.error(`[AUTH] Token cache miss - refreshing token for user ${userId || 'default'}`);
  const sessionPath = getSessionPath(userId);
  const hasExistingSession = existsSync(sessionPath);
  console.error(
    `[AUTH] Existing session file: ${hasExistingSession ? "yes" : "no"}`
  );

  // Load credentials
  const credentials = await getD2LCredentials(userId);
  const D2L_HOST = credentials?.host || process.env.D2L_HOST || "learn.ul.ie";
  const D2L_USERNAME = credentials?.username || process.env.D2L_USERNAME;
  const D2L_PASSWORD = credentials?.password || process.env.D2L_PASSWORD;
  const HOME_URL = `https://${D2L_HOST}/d2l/home`;

  // Configure browser args for remote debugging if enabled
  const browserArgs: string[] = [];
  if (REMOTE_DEBUG) {
    browserArgs.push(
      '--remote-debugging-port=9222',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    );
    console.error('[AUTH] Remote debugging enabled on port 9222');
    console.error('[AUTH] Connect via: chrome://inspect after setting up SSH tunnel');
    console.error('[AUTH] SSH tunnel: ssh -L 9222:localhost:9222 ec2-user@your-ip');
  }

  // Always try headless first if session exists - only show browser if login needed
  const browserStartTime = Date.now();
  // Use the isProduction variable already declared at the top of getToken function
  const isProductionEnv = process.env.NODE_ENV === "production" || !process.env.DISPLAY;
  
  // In Docker/production/AWS, ALWAYS use headless mode
  const headlessMode = isProductionEnv || (hasExistingSession && !REMOTE_DEBUG);
  
  // In production, ensure we never launch a headed browser
  if (isProductionEnv && !headlessMode) {
    console.error("[AUTH] Production mode: Forcing headless mode");
  }
  
  // Add required args for headless mode in Docker/Alpine
  const dockerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=TranslateUI',
    '--disable-ipc-flooding-protection',
    '--single-process', // Required for some Docker environments
  ];
  
  const allArgs = [...dockerArgs, ...browserArgs];
  
  // Try to use Alpine's chromium if available, otherwise use Playwright's
  const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || 
                       (isProduction ? '/usr/bin/chromium' : undefined);
  
  let context;
  try {
    context = await chromium.launchPersistentContext(sessionPath, {
      headless: headlessMode, // true for headless, false for headed
      viewport: { width: 1280, height: 720 },
      args: allArgs.length > 0 ? allArgs : undefined,
      executablePath: chromiumPath,
    } as any); // Type assertion for headless: 'shell' support
  } catch (launchError: any) {
    // If launch fails, try without explicit executable path (use Playwright's bundled)
    console.error(`[AUTH] First launch attempt failed: ${launchError.message}`);
    console.error(`[AUTH] Retrying without explicit executable path...`);
    context = await chromium.launchPersistentContext(sessionPath, {
      headless: headlessMode,
      viewport: { width: 1280, height: 720 },
      args: allArgs.length > 0 ? allArgs : undefined,
    } as any);
  }
  const browserTime = Date.now() - browserStartTime;
  console.error(
    `[AUTH] Browser launched (headless: ${isProductionEnv || hasExistingSession}, ${browserTime}ms)`
  );

  try {
    const captureStartTime = Date.now();
    const result = await captureToken(context, hasExistingSession, HOME_URL, D2L_USERNAME, D2L_PASSWORD, userId);
    const captureTime = Date.now() - captureStartTime;
    console.error(`[AUTH] Token captured (${captureTime}ms)`);

    // If we need to login and were running headless, restart with headed browser (only in non-production)
    if (result.needsLogin && hasExistingSession && !isProductionEnv) {
      await context.close();
      console.error("[AUTH] Session expired, opening browser for login...");
      const retryBrowserStartTime = Date.now();
      context = await chromium.launchPersistentContext(sessionPath, {
        headless: false,
        viewport: { width: 1280, height: 720 },
        args: browserArgs.length > 0 ? browserArgs : undefined,
      });
      const retryBrowserTime = Date.now() - retryBrowserStartTime;
      console.error(
        `[AUTH] Browser relaunched (headed, ${retryBrowserTime}ms)`
      );

      const retryCaptureStartTime = Date.now();
      const retryResult = await captureToken(context, false, HOME_URL, D2L_USERNAME, D2L_PASSWORD, userId);
      const retryCaptureTime = Date.now() - retryCaptureStartTime;
      console.error(`[AUTH] Token captured on retry (${retryCaptureTime}ms)`);

      userTokenCache[cacheKey] = {
        token: retryResult.token,
        expiresAt: Date.now() + 82800000, // 23 hours
      };
      const totalTime = Date.now() - authStartTime;
      console.error(`[AUTH] Token refresh completed (${totalTime}ms)`);
      return retryResult.token;
    } else if (result.needsLogin && isProductionEnv) {
      // In production, we cannot handle login - throw REAUTH_REQUIRED
      await context.close();
      throw new Error("REAUTH_REQUIRED");
    }

    userTokenCache[cacheKey] = {
      token: result.token,
      expiresAt: Date.now() + 82800000, // 23 hours
    };
    const totalTime = Date.now() - authStartTime;
    console.error(`[AUTH] Token refresh completed (${totalTime}ms)`);
    return result.token;
  } finally {
    const closeStartTime = Date.now();
    await context.close();
    const closeTime = Date.now() - closeStartTime;
    console.error(`[AUTH] Browser context closed (${closeTime}ms)`);
  }
}

async function captureToken(
  context: BrowserContext,
  quickCheck: boolean,
  homeUrl: string,
  username?: string | null,
  password?: string | null,
  userId?: string
): Promise<{ token: string; needsLogin: boolean }> {
  const captureStartTime = Date.now();
  console.error(`[AUTH] Starting token capture (quickCheck: ${quickCheck})`);

  // First, try to get cookies from database (prioritize stored cookies)
  if (userId) {
    try {
      const storedToken = await getD2LToken(userId);
      if (storedToken && storedToken.token) {
        // Check if it's a cookie string (contains d2lSessionVal or d2lSecureSessionVal)
        if (storedToken.token.includes('d2lSessionVal') || storedToken.token.includes('d2lSecureSessionVal')) {
          const tokenAge = Date.now() - (new Date(storedToken.updated_at || 0).getTime());
          const maxAge = 20 * 60 * 60 * 1000; // 20 hours
          
          if (tokenAge < maxAge) {
            console.error(`[AUTH] Using stored cookies from database (age: ${Math.round(tokenAge / 3600000)}h)`);
            return { token: storedToken.token, needsLogin: false };
          } else {
            console.error(`[AUTH] Stored cookies are too old (${Math.round(tokenAge / 3600000)}h), will capture new ones`);
          }
        }
      }
    } catch (e) {
      console.error(`[AUTH] Error checking stored cookies: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const page = await context.newPage();
  let capturedToken = "";
  
  // Helper function to extract cookies from browser context
  // Prioritize d2lSessionVal and d2lSecureSessionVal
  const extractCookiesFromContext = async (): Promise<string | null> => {
    try {
      const cookies = await context.cookies();
      // Prioritize the two essential cookies
      const essentialCookies = cookies.filter(c => 
        c.name === 'd2lSessionVal' || 
        c.name === 'd2lSecureSessionVal'
      );
      
      // Also include other D2L session cookies if available
      const otherD2lCookies = cookies.filter(c => 
        (c.name.includes('d2lSession') || 
         c.name.includes('d2lSecure') ||
         c.name.includes('d2lUser') ||
         c.name.includes('d2lAuth')) &&
        c.name !== 'd2lSessionVal' &&
        c.name !== 'd2lSecureSessionVal'
      );
      
      // Combine essential cookies first, then others
      const allD2lCookies = [...essentialCookies, ...otherD2lCookies];
      
      if (allD2lCookies.length > 0) {
        const cookieString = allD2lCookies.map(c => `${c.name}=${c.value}`).join('; ');
        console.error(`[AUTH] Extracted ${allD2lCookies.length} D2L cookies from context: ${allD2lCookies.map(c => c.name).join(', ')}`);
        
        // Ensure we have at least one of the essential cookies
        if (essentialCookies.length > 0) {
          return cookieString;
        } else {
          console.error(`[AUTH] Warning: No essential cookies (d2lSessionVal/d2lSecureSessionVal) found, but found other cookies`);
          return cookieString; // Still return it, but log warning
        }
      }
    } catch (e) {
      console.error(`[AUTH] Failed to extract cookies from context: ${e instanceof Error ? e.message : String(e)}`);
    }
    return null;
  };

  // Listen for requests to capture Authorization header or cookies from any D2L API call
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/d2l/api/")) {
      // Try to capture Bearer token first
      const auth = request.headers()["authorization"];
      if (auth?.startsWith("Bearer ")) {
        capturedToken = auth.slice(7);
        const captureTime = Date.now() - captureStartTime;
        console.error(
          `[AUTH] Token captured from API request Authorization header to ${url} (${captureTime}ms)`
        );
        return;
      }
      
      // Fallback: Try to capture cookies (D2L might use session cookies instead of Bearer token)
      const cookies = request.headers()["cookie"];
      if (cookies && (cookies.includes("d2lSessionVal") || cookies.includes("d2lSecureSessionVal"))) {
        capturedToken = cookies;
        const captureTime = Date.now() - captureStartTime;
        console.error(
          `[AUTH] Token captured from API request cookies to ${url} (${captureTime}ms)`
        );
      }
    }
  });
  
  // Also listen for responses to capture cookies from Set-Cookie headers
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/d2l/api/") || url.includes("/d2l/home")) {
      const setCookieHeaders = response.headers()["set-cookie"];
      if (setCookieHeaders) {
        const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders.join("; ") : setCookieHeaders;
        if (cookies.includes("d2lSessionVal") || cookies.includes("d2lSecureSessionVal")) {
          if (!capturedToken || !capturedToken.includes("d2lSessionVal")) {
            // Extract relevant cookies
            const cookieParts = cookies.split(";").filter(c => 
              c.includes("d2lSessionVal") || 
              c.includes("d2lSecureSessionVal") || 
              c.includes("d2lSessionId") ||
              c.includes("d2lUser")
            );
            if (cookieParts.length > 0) {
              capturedToken = cookieParts.join("; ");
              const captureTime = Date.now() - captureStartTime;
              console.error(
                `[AUTH] Token captured from response Set-Cookie headers from ${url} (${captureTime}ms)`
              );
            }
          }
        }
      }
    }
  });

  // Go to home page
  const navigateStartTime = Date.now();
  console.error(`[AUTH] Navigating to ${homeUrl}`);
  await page.goto(homeUrl, { waitUntil: "networkidle" });
  const navigateTime = Date.now() - navigateStartTime;
  console.error(`[AUTH] Navigation completed (${navigateTime}ms)`);

  // Check if we're on login page
  let currentUrl = page.url();
  const isOnLoginPage = isLoginPage(currentUrl);
  console.error(
    `[AUTH] Current URL: ${currentUrl}, Is login page: ${isOnLoginPage}`
  );

  if (isOnLoginPage) {
    console.error(`[AUTH] Login required`);
    // If username and password are provided, use them for login
    if (username && password) {
      console.error(`[AUTH] Attempting automated login with credentials`);
      console.error(`[AUTH] Username configured: ${username ? 'yes' : 'no'}`);
      console.error(`[AUTH] Password configured: ${password ? 'yes (hidden)' : 'no'}`);
      try {
        // Try to find and fill username field (common selectors)
        const usernameSelectors = [
          "input#userNameInput", // Microsoft ADFS
          'input[name="UserName"]', // Microsoft ADFS
          'input[type="email"]',
          'input[placeholder*="username" i]',
          'input[placeholder*="user" i]',
          'input[placeholder*="MyCarletonOne" i]',
          'input[name="userName"]',
          'input[name="username"]',
          'input[name="user"]',
          'input[type="text"][id*="user"]',
          'input[type="text"][id*="User"]',
          "input#userName",
          "input#username",
        ];

        const passwordSelectors = [
          "input#passwordInput", // Microsoft ADFS
          'input[name="Password"]', // Microsoft ADFS
          'input[type="password"][placeholder*="password" i]',
          'input[type="password"][placeholder*="Password" i]',
          'input[name="password"]',
          'input[name="passWord"]',
          'input[type="password"]',
          "input#password",
          "input#passWord",
        ];

        let usernameField = null;
        let passwordField = null;

        // Try to find username field
        console.error(`[AUTH] Searching for username field...`);
        for (const selector of usernameSelectors) {
          try {
            const field = page.locator(selector);
            if (await field.isVisible({ timeout: 2000 })) {
              usernameField = field;
              console.error(`[AUTH] Found username field with selector: ${selector}`);
              break;
            }
          } catch {
            continue;
          }
        }

        if (!usernameField) {
          console.error(`[AUTH] Could not find username field`);
          throw new Error("Could not find username field");
        }

        // Fill username first - password field might appear after
        console.error(`[AUTH] Filling username field...`);
        await usernameField.fill(username);
        
        // Look for a "Next" or "Continue" button (common in multi-step forms)
        console.error(`[AUTH] Looking for Next/Continue button...`);
        const nextButtonSelectors = [
          'input[type="submit"]',
          'button[type="submit"]',
          'input[value*="Next" i]',
          'button:has-text("Next")',
          'button:has-text("Continue")',
          'input[value*="Continue" i]',
          'button:has-text("Submit")',
          '#submitButton',
        ];
        
        let nextButtonClicked = false;
        for (const selector of nextButtonSelectors) {
          try {
            const nextButton = page.locator(selector).first();
            if (await nextButton.isVisible({ timeout: 1000 })) {
              console.error(`[AUTH] Found Next button with selector: ${selector}, clicking...`);
              await nextButton.click();
              nextButtonClicked = true;
              await page.waitForTimeout(2000); // Wait for password page to load
              break;
            }
          } catch {
            continue;
          }
        }
        
        if (!nextButtonClicked) {
          console.error(`[AUTH] No Next button found, trying Enter key...`);
          await usernameField.press("Enter");
          await page.waitForTimeout(2000); // Wait for password page to load
        }

        // Try to find password field
        console.error(`[AUTH] Searching for password field...`);
        for (const selector of passwordSelectors) {
          try {
            const field = page.locator(selector);
            if (await field.isVisible({ timeout: 3000 })) {
              passwordField = field;
              console.error(`[AUTH] Found password field with selector: ${selector}`);
              break;
            }
          } catch {
            continue;
          }
        }

        if (!passwordField) {
          console.error(`[AUTH] Could not find password field after filling username`);
          throw new Error("Could not find password field");
        }

        // Fill password
        console.error(`[AUTH] Filling password field...`);
        await passwordField.fill(password);
        console.error(`[AUTH] Credentials filled, looking for submit button...`);

          // Try to find and click submit button
          const submitSelectors = [
            'input[type="submit"]',
            'button[type="submit"]',
            'button:has-text("Log in")',
            'button:has-text("Login")',
            'button:has-text("Sign in")',
            'button:has-text("Sign In")',
            'input[value*="Sign in" i]',
            'input[value*="Log in" i]',
            "form button",
            'form input[type="submit"]',
          ];

          let submitted = false;
          for (const selector of submitSelectors) {
            try {
              const submitButton = page.locator(selector).first();
              if (await submitButton.isVisible({ timeout: 1000 })) {
                console.error(`[AUTH] Found submit button with selector: ${selector}`);
                await submitButton.click();
                submitted = true;
                break;
              }
            } catch {
              continue;
            }
          }

          // If no submit button found, try pressing Enter or submitting form
          if (!submitted) {
            console.error(`[AUTH] No submit button found, trying form submission...`);
            try {
              // Try multiple submission methods
              await page.evaluate(() => {
                const form = document.querySelector('form');
                if (form) {
                  // Try triggering submit event first (for JS handlers)
                  const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                  if (form.dispatchEvent(submitEvent)) {
                    form.submit();
                  }
                  return;
                }
              });
              await page.waitForTimeout(2000);
            } catch (e) {
              // Fallback to pressing Enter on password field
              console.error(`[AUTH] Form submit failed, pressing Enter...`);
              try {
                await passwordField.press("Enter");
                await page.waitForTimeout(2000);
              } catch (enterError) {
                console.error(`[AUTH] Enter key press also failed: ${enterError}`);
              }
            }
          }

          // Wait for navigation away from login page
          // Reduced timeout to prevent overall process from exceeding ALB timeout
          const loginWaitStartTime = Date.now();
          console.error(`[AUTH] Waiting for login to complete...`);
          await page.waitForURL((url) => !isLoginPage(url.toString()), {
            timeout: quickCheck ? 20000 : 30000, // Reduced from 60000 to 30000
          });
          await page.waitForLoadState("networkidle");
          const loginWaitTime = Date.now() - loginWaitStartTime;
          console.error(`[AUTH] Login completed (${loginWaitTime}ms)`);
          
          // Extract cookies directly from browser context after login
          const extractedCookies = await extractCookiesFromContext();
          if (extractedCookies) {
            capturedToken = extractedCookies;
            console.error(`[AUTH] Token captured from browser context cookies immediately after login`);
          } else {
            // Also try extracting from page's document.cookie
            try {
              const pageCookies = await page.evaluate(() => document.cookie);
              if (pageCookies && (pageCookies.includes('d2lSessionVal') || pageCookies.includes('d2lSecureSessionVal'))) {
                capturedToken = pageCookies;
                console.error(`[AUTH] Token captured from document.cookie`);
              }
            } catch (e) {
              console.error(`[AUTH] Failed to read document.cookie: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
          
          // If we still don't have a token, wait a bit for cookies to be set, then try again
          if (!capturedToken) {
            console.error(`[AUTH] No token captured yet, waiting for cookies to be set...`);
            await page.waitForTimeout(2000);
            const retryCookies = await extractCookiesFromContext();
            if (retryCookies) {
              capturedToken = retryCookies;
              console.error(`[AUTH] Token captured from browser context after wait`);
            }
          }
          
          // If we still don't have a token, trigger an API call to force cookie usage
          if (!capturedToken) {
            try {
              const apiUrl = homeUrl.replace('/d2l/home', '/d2l/api/lp/1.43/enrollments/myenrollments/');
              console.error(`[AUTH] No token yet, triggering API call to capture token: ${apiUrl}`);
              await page.goto(apiUrl, { waitUntil: "networkidle", timeout: 15000 });
              await page.waitForTimeout(2000); // Give time for request to complete
              
              // Try extracting cookies again after API call
              const finalCookies = await extractCookiesFromContext();
              if (finalCookies) {
                capturedToken = finalCookies;
                console.error(`[AUTH] Token captured from browser context after API call`);
              }
            } catch (e) {
              console.error(`[AUTH] Failed to trigger API call: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
      } catch (error) {
        // Fall back to SSO button click if form login fails
        console.error(`[AUTH] Form login failed: ${error instanceof Error ? error.message : String(error)}`);
        console.error("[AUTH] Trying SSO button as fallback...");
        try {
          const ssoButton = page.locator(
            'button.d2l-button-sso-1, button:has-text("Student & Staff Login")'
          );
          if (await ssoButton.isVisible({ timeout: 2000 })) {
            await ssoButton.click();
            await page.waitForURL((url) => !isLoginPage(url.toString()), {
              timeout: quickCheck ? 15000 : 30000, // Reduced from 60000 to 30000
            });
            await page.waitForLoadState("networkidle");
          }
        } catch {
          if (quickCheck) {
            await page.close();
            return { token: "", needsLogin: true };
          }
        }
      }
    } else {
      // No credentials provided, try SSO button
      try {
        const ssoButton = page.locator(
          'button.d2l-button-sso-1, button:has-text("Student & Staff Login")'
        );
        if (await ssoButton.isVisible({ timeout: 2000 })) {
          await ssoButton.click();
          // Wait for SSO redirect and completion
          await page.waitForURL((url) => !isLoginPage(url.toString()), {
            timeout: quickCheck ? 15000 : 60000,
          });
          await page.waitForLoadState("networkidle");
        }
      } catch {
        // SSO auto-login failed (needs user interaction)
        if (quickCheck) {
          await page.close();
          return { token: "", needsLogin: true };
        }
      }
    }
  }

  // Wait for token capture
  // Reduced max wait to prevent 504 Gateway Timeout (ALB timeout is typically 60s)
  const maxWait = quickCheck ? 10000 : 45000; // Reduced from 120000 to 45000 (45s)
  const waitStartTime = Date.now();
  console.error(`[AUTH] Waiting for token capture (max wait: ${maxWait}ms)`);

  while (Date.now() - waitStartTime < maxWait) {
    try {
      currentUrl = page.url();
    } catch (e) {
      // Page might have navigated or closed, check if we have token
      console.error(`[AUTH] Failed to get page URL (page may have navigated): ${e instanceof Error ? e.message : String(e)}`);
      if (capturedToken) {
        const waitTime = Date.now() - waitStartTime;
        console.error(`[AUTH] Token captured before page navigation (${waitTime}ms)`);
        break;
      }
      // If no token and page is gone, wait a bit and check again
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }

    if (!isLoginPage(currentUrl)) {
      // We're logged in, wait for API calls
      if (!capturedToken) {
        console.error(
          `[AUTH] Token not captured yet, waiting and scrolling...`
        );
        try {
          await page.waitForTimeout(2000);
          // Try scrolling to trigger more API calls (wrap in try-catch in case page navigates)
          try {
            await page.evaluate(() => window.scrollBy(0, 100));
          } catch (e) {
            // Page might have navigated, that's okay - token might have been captured
            console.error(`[AUTH] Scroll failed (page may have navigated): ${e instanceof Error ? e.message : String(e)}`);
          }
          await page.waitForTimeout(1000);
        } catch (e) {
          // Page might have navigated or closed, check if we have token
          console.error(`[AUTH] Wait failed (page may have navigated): ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (capturedToken) {
        const waitTime = Date.now() - waitStartTime;
        console.error(`[AUTH] Token captured after waiting (${waitTime}ms)`);
        break;
      }
    } else if (!quickCheck) {
      // Wait for user to login
      try {
        await page.waitForTimeout(2000);
      } catch (e) {
        // Page might have navigated, that's okay
        console.error(`[AUTH] Wait failed during login wait: ${e instanceof Error ? e.message : String(e)}`);
      }
    } else {
      break;
    }
  }

  const closePageStartTime = Date.now();
  await page.close();
  const closePageTime = Date.now() - closePageStartTime;
  console.error(`[AUTH] Page closed (${closePageTime}ms)`);

  if (!capturedToken) {
    const totalTime = Date.now() - captureStartTime;
    if (quickCheck) {
      console.error(
        `[AUTH] Token capture failed (quickCheck mode, ${totalTime}ms) - needs login`
      );
      return { token: "", needsLogin: true };
    }
    console.error(`[AUTH] Token capture failed (${totalTime}ms)`);
    throw new Error(
      "Failed to capture authentication token. Please try again."
    );
  }

  const totalTime = Date.now() - captureStartTime;
  console.error(`[AUTH] Token capture successful (${totalTime}ms)`);
  return { token: capturedToken, needsLogin: false };
}

export async function refreshTokenIfNeeded(userId?: string): Promise<string> {
  return getToken(userId);
}

export function clearTokenCache(userId?: string): void {
  const cacheKey = userId || "default";
  if (userId) {
    delete userTokenCache[cacheKey];
  } else {
    userTokenCache[cacheKey] = { token: "", expiresAt: 0 };
  }
}

export function getTokenExpiry(userId?: string): number {
  const cacheKey = userId || "default";
  return userTokenCache[cacheKey]?.expiresAt || 0;
}

export async function getAuthenticatedContext(userId?: string): Promise<BrowserContext> {
  // Load credentials
  const credentials = await getD2LCredentials(userId);
  const D2L_HOST = credentials?.host || process.env.D2L_HOST || "learn.ul.ie";
  const username = credentials?.username || process.env.D2L_USERNAME;
  const password = credentials?.password || process.env.D2L_PASSWORD;
  const HOME_URL = `https://${D2L_HOST}/d2l/home`;
  const sessionPath = getSessionPath(userId);
  
  const hasExistingSession = existsSync(sessionPath);
  const isProductionEnv = process.env.NODE_ENV === "production" || !process.env.DISPLAY;

  // In production, always use headless mode
  const headlessMode = isProductionEnv || hasExistingSession;

  let context = await chromium.launchPersistentContext(sessionPath, {
    headless: headlessMode,
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  // Go to home to check auth status
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

  let currentUrl = page.url();
  if (isLoginPage(currentUrl)) {
    // If username and password are provided via env vars, use them for login
    if (username && password) {
      try {
        // Try to find and fill username field
        const usernameSelectors = [
          "input#userNameInput", // Microsoft ADFS
          'input[name="UserName"]', // Microsoft ADFS
          'input[type="email"]',
          'input[placeholder*="username" i]',
          'input[placeholder*="user" i]',
          'input[placeholder*="MyCarletonOne" i]',
          'input[name="userName"]',
          'input[name="username"]',
          'input[name="user"]',
          'input[type="text"][id*="user"]',
          'input[type="text"][id*="User"]',
          "input#userName",
          "input#username",
        ];

        const passwordSelectors = [
          "input#passwordInput", // Microsoft ADFS
          'input[name="Password"]', // Microsoft ADFS
          'input[type="password"][placeholder*="password" i]',
          'input[type="password"][placeholder*="Password" i]',
          'input[name="password"]',
          'input[name="passWord"]',
          'input[type="password"]',
          "input#password",
          "input#passWord",
        ];

        let usernameField = null;
        let passwordField = null;

        for (const selector of usernameSelectors) {
          try {
            const field = page.locator(selector);
            if (await field.isVisible({ timeout: 2000 })) {
              usernameField = field;
              break;
            }
          } catch {
            continue;
          }
        }

        if (!usernameField) {
          throw new Error("Could not find username field");
        }

        // Fill username first
        await usernameField.fill(username);
        
        // Look for Next button in multi-step forms
        const nextButtonSelectors = [
          'input[type="submit"]',
          'button[type="submit"]',
          'input[value*="Next" i]',
          'button:has-text("Next")',
          'button:has-text("Continue")',
          'input[value*="Continue" i]',
          'button:has-text("Submit")',
          '#submitButton',
        ];
        
        let nextButtonClicked = false;
        for (const selector of nextButtonSelectors) {
          try {
            const nextButton = page.locator(selector).first();
            if (await nextButton.isVisible({ timeout: 1000 })) {
              await nextButton.click();
              nextButtonClicked = true;
              await page.waitForTimeout(2000);
              break;
            }
          } catch {
            continue;
          }
        }
        
        if (!nextButtonClicked) {
          await usernameField.press("Enter");
          await page.waitForTimeout(2000);
        }

        // Now find password field
        for (const selector of passwordSelectors) {
          try {
            const field = page.locator(selector);
            if (await field.isVisible({ timeout: 3000 })) {
              passwordField = field;
              break;
            }
          } catch {
            continue;
          }
        }

        if (!passwordField) {
          throw new Error("Could not find password field");
        }

        await passwordField.fill(password);

        const submitSelectors = [
          'input[type="submit"]',
          'button[type="submit"]',
          'button:has-text("Log in")',
          'button:has-text("Login")',
          'button:has-text("Sign in")',
          'button:has-text("Sign In")',
          'input[value*="Sign in" i]',
          'input[value*="Log in" i]',
          "form button",
          'form input[type="submit"]',
        ];

        let submitted = false;
        for (const selector of submitSelectors) {
          try {
            const submitButton = page.locator(selector).first();
            if (await submitButton.isVisible({ timeout: 1000 })) {
              await submitButton.click();
              submitted = true;
              break;
            }
          } catch {
            continue;
          }
        }

        if (!submitted) {
          try {
            // Try submitting the form directly
            await page.evaluate(() => {
              const form = document.querySelector('form');
              if (form) {
                form.submit();
                return;
              }
            });
            await page.waitForTimeout(1000);
          } catch {
            // Fallback to pressing Enter
            await passwordField.press("Enter");
          }
        }

        await page.waitForURL((url) => !isLoginPage(url.toString()), {
          timeout: 60000,
        });
        await page.waitForLoadState("domcontentloaded");
      } catch (error) {
        console.error("Form login failed:", error);
      }
    } else {
      // No credentials provided, try SSO button
      try {
        const ssoButton = page.locator(
          'button.d2l-button-sso-1, button:has-text("Student & Staff Login")'
        );
        if (await ssoButton.isVisible({ timeout: 2000 })) {
          await ssoButton.click();
          await page.waitForURL((url) => !isLoginPage(url.toString()), {
            timeout: hasExistingSession ? 15000 : 60000,
          });
          await page.waitForLoadState("domcontentloaded");
        }
      } catch {
        // If headless failed to auto-login, restart with visible browser (only in non-production)
        const isProductionEnv = process.env.NODE_ENV === "production" || !process.env.DISPLAY;
        if (hasExistingSession && !isProductionEnv) {
          await context.close();
          console.error("Session expired, opening browser for login...");
          context = await chromium.launchPersistentContext(sessionPath, {
            headless: false,
            viewport: { width: 1280, height: 720 },
          });
          const newPage = await context.newPage();
          await newPage.goto(HOME_URL, { waitUntil: "domcontentloaded" });

          // Wait for user to complete login
          await newPage.waitForURL((url) => !isLoginPage(url.toString()), {
            timeout: 120000,
          });
          await newPage.close();
        } else if (hasExistingSession && isProductionEnv) {
          // In production, cannot handle login - throw error
          await context.close();
          throw new Error("REAUTH_REQUIRED");
        }
      }
    }
  }

  await page.close();
  return context;
}
