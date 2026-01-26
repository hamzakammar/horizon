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

// Load D2L credentials for a user from database, or fall back to env vars
async function getD2LCredentials(userId?: string): Promise<{ host: string; username: string; password: string } | null> {
  if (userId) {
    try {
      const { data, error } = await supabase
        .from("user_credentials")
        .select("host, username, password")
        .eq("user_id", userId)
        .eq("service", "d2l")
        .single();

      if (!error && data) {
        return {
          host: data.host || process.env.D2L_HOST || "learn.ul.ie",
          username: data.username,
          password: data.password,
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

export async function getToken(userId?: string): Promise<string> {
  const authStartTime = Date.now();
  const cacheKey = userId || "default";

  // If D2L_TOKEN is provided via env var, use it directly (bypass browser auth)
  const envToken = process.env.D2L_TOKEN;
  if (envToken) {
    console.error("[AUTH] Using D2L_TOKEN from environment variable");
    userTokenCache[cacheKey] = {
      token: envToken,
      expiresAt: Date.now() + 82800000, // 23 hours
    };
    return envToken;
  }

  // Return cached token if still valid (with 1 hour buffer for safety)
  if (userTokenCache[cacheKey]?.token && Date.now() < userTokenCache[cacheKey].expiresAt - 3600000) {
    const cacheTime = Date.now() - authStartTime;
    const timeUntilExpiry = userTokenCache[cacheKey].expiresAt - Date.now();
    console.error(
      `[AUTH] Token cache hit for user ${userId || 'default'} (${cacheTime}ms, expires in ${Math.round(
        timeUntilExpiry / 1000
      )}s)`
    );
    return userTokenCache[cacheKey].token;
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
  const isProduction = process.env.NODE_ENV === "production" || !process.env.DISPLAY;
  let context = await chromium.launchPersistentContext(sessionPath, {
    headless: isProduction || (hasExistingSession && !REMOTE_DEBUG),
    viewport: { width: 1280, height: 720 },
    args: browserArgs.length > 0 ? browserArgs : undefined,
  });
  const browserTime = Date.now() - browserStartTime;
  console.error(
    `[AUTH] Browser launched (headless: ${isProduction || hasExistingSession}, ${browserTime}ms)`
  );

  try {
    const captureStartTime = Date.now();
    const result = await captureToken(context, hasExistingSession, HOME_URL, D2L_USERNAME, D2L_PASSWORD);
    const captureTime = Date.now() - captureStartTime;
    console.error(`[AUTH] Token captured (${captureTime}ms)`);

    // If we need to login and were running headless, restart with headed browser
    if (result.needsLogin && hasExistingSession) {
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
      const retryResult = await captureToken(context, false, HOME_URL, D2L_USERNAME, D2L_PASSWORD);
      const retryCaptureTime = Date.now() - retryCaptureStartTime;
      console.error(`[AUTH] Token captured on retry (${retryCaptureTime}ms)`);

      userTokenCache[cacheKey] = {
        token: retryResult.token,
        expiresAt: Date.now() + 82800000, // 23 hours
      };
      const totalTime = Date.now() - authStartTime;
      console.error(`[AUTH] Token refresh completed (${totalTime}ms)`);
      return retryResult.token;
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
  password?: string | null
): Promise<{ token: string; needsLogin: boolean }> {
  const captureStartTime = Date.now();
  console.error(`[AUTH] Starting token capture (quickCheck: ${quickCheck})`);

  const page = await context.newPage();
  let capturedToken = "";

  // Listen for requests to capture Authorization header from any D2L API call
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/d2l/api/")) {
      const auth = request.headers()["authorization"];
      if (auth?.startsWith("Bearer ")) {
        capturedToken = auth.slice(7);
        const captureTime = Date.now() - captureStartTime;
        console.error(
          `[AUTH] Token captured from API request to ${url} (${captureTime}ms)`
        );
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
              console.error(`[AUTH] Form submit failed, pressing Enter...`);
              await passwordField.press("Enter");
            }
          }

          // Wait for navigation away from login page
          const loginWaitStartTime = Date.now();
          console.error(`[AUTH] Waiting for login to complete...`);
          await page.waitForURL((url) => !isLoginPage(url.toString()), {
            timeout: quickCheck ? 30000 : 60000,
          });
          await page.waitForLoadState("networkidle");
          const loginWaitTime = Date.now() - loginWaitStartTime;
          console.error(`[AUTH] Login completed (${loginWaitTime}ms)`);
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
              timeout: quickCheck ? 15000 : 60000,
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
  const maxWait = quickCheck ? 10000 : 120000;
  const waitStartTime = Date.now();
  console.error(`[AUTH] Waiting for token capture (max wait: ${maxWait}ms)`);

  while (Date.now() - waitStartTime < maxWait) {
    currentUrl = page.url();

    if (!isLoginPage(currentUrl)) {
      // We're logged in, wait for API calls
      if (!capturedToken) {
        console.error(
          `[AUTH] Token not captured yet, waiting and scrolling...`
        );
        await page.waitForTimeout(2000);
        // Try scrolling to trigger more API calls
        await page.evaluate(() => window.scrollBy(0, 100));
        await page.waitForTimeout(1000);
      }

      if (capturedToken) {
        const waitTime = Date.now() - waitStartTime;
        console.error(`[AUTH] Token captured after waiting (${waitTime}ms)`);
        break;
      }
    } else if (!quickCheck) {
      // Wait for user to login
      await page.waitForTimeout(2000);
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

  let context = await chromium.launchPersistentContext(sessionPath, {
    headless: hasExistingSession,
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
        // If headless failed to auto-login, restart with visible browser
        if (hasExistingSession) {
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
        }
      }
    }
  }

  await page.close();
  return context;
}
