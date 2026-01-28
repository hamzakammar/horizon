/**
 * Brightspace Valence API Authentication
 * 
 * Based on official Valence API documentation:
 * https://docs.valence.desire2learn.com/basic/apicall.html
 * https://docs.valence.desire2learn.com/admin/lmsauth.html
 * 
 * Uses session-based authentication via org login path:
 * - POST to /d2l/lp/auth/login/login.d2l with credentials
 * - Extract session cookies (d2lSessionVal, d2lSecureSessionVal, etc.)
 * - Use cookies for all API calls
 */

import "dotenv/config";
import { chromium, BrowserContext } from "playwright";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import { supabase } from "./utils/supabase.js";

// Brightspace session cookie names (from Valence API docs)
const D2L_SESSION_COOKIES = [
  'd2lSessionVal',
  'd2lSecureSessionVal', 
  'd2lSessionId',
  'd2lUser',
  'd2lAuth'
];

interface D2LSessionCookies {
  d2lSessionVal?: string;
  d2lSecureSessionVal?: string;
  d2lSessionId?: string;
  d2lUser?: string;
  d2lAuth?: string;
  [key: string]: string | undefined;
}

interface SessionData {
  cookies: D2LSessionCookies;
  cookieString: string; // Formatted for Cookie header
  host: string;
  expiresAt: number;
}

// Per-user session cache
const sessionCache: Record<string, SessionData> = {};

function getSessionPath(userId?: string): string {
  if (userId) {
    return join(homedir(), `.d2l-session-${userId}`);
  }
  return join(homedir(), ".d2l-session");
}

/**
 * Load stored session cookies from database
 */
async function getStoredSession(userId?: string): Promise<SessionData | null> {
  if (!userId) return null;
  
  try {
    const { data, error } = await supabase
      .from("user_credentials")
      .select("host, token, updated_at")
      .eq("user_id", userId)
      .eq("service", "d2l")
      .limit(1);
    
    const cred = Array.isArray(data) ? data[0] : data;
    
    if (!error && cred && cred.token) {
      // Token should be cookie string
      const host = cred.host || process.env.D2L_HOST || "learn.ul.ie";
      const cookieString = cred.token;
      
      // Parse cookie string into object
      const cookies: D2LSessionCookies = {};
      cookieString.split(';').forEach((cookie: string) => {
        const [name, value] = cookie.trim().split('=');
        if (name && value && D2L_SESSION_COOKIES.some(c => name.includes(c))) {
          cookies[name] = value;
        }
      });
      
      // Check if session is still valid (cookies expire after ~23 hours)
      const tokenAge = Date.now() - (new Date(cred.updated_at || 0).getTime());
      const maxAge = 20 * 60 * 60 * 1000; // 20 hours
      
      if (tokenAge < maxAge && Object.keys(cookies).length > 0) {
        return {
          cookies,
          cookieString,
          host,
          expiresAt: Date.now() + (23 * 60 * 60 * 1000) // 23 hours
        };
      }
    }
  } catch (e) {
    console.error("[AUTH-VALENCE] Error loading stored session:", e);
  }
  
  return null;
}

/**
 * Load credentials from database or env
 */
async function getCredentials(userId?: string): Promise<{ host: string; username: string; password: string } | null> {
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
      console.error("[AUTH-VALENCE] Error loading credentials:", e);
    }
  }
  
  // Fallback to environment variables
  const host = process.env.D2L_HOST || "learn.ul.ie";
  const username = process.env.D2L_USERNAME;
  const password = process.env.D2L_PASSWORD;
  
  if (username && password) {
    return { host, username, password };
  }
  
  return null;
}

/**
 * Extract D2L session cookies from browser context
 * Following Valence API patterns for session-based auth
 */
async function extractSessionCookies(context: BrowserContext, host: string): Promise<D2LSessionCookies | null> {
  try {
    const allCookies = await context.cookies();
    const d2lCookies: D2LSessionCookies = {};
    
    // Extract only the session cookies Brightspace uses
    for (const cookie of allCookies) {
      // Check if cookie domain matches host
      const cookieDomain = cookie.domain.replace(/^\./, ''); // Remove leading dot
      if (!host.includes(cookieDomain) && !cookieDomain.includes(host.split('.')[0])) {
        continue;
      }
      
      // Extract session cookies
      for (const sessionCookieName of D2L_SESSION_COOKIES) {
        if (cookie.name.includes(sessionCookieName) || cookie.name === sessionCookieName) {
          d2lCookies[cookie.name] = cookie.value;
          break;
        }
      }
    }
    
    // Validate we have at least the essential cookies
    if (d2lCookies.d2lSessionVal || d2lCookies.d2lSecureSessionVal) {
      console.error(`[AUTH-VALENCE] Extracted ${Object.keys(d2lCookies).length} session cookies: ${Object.keys(d2lCookies).join(', ')}`);
      return d2lCookies;
    }
    
    console.error(`[AUTH-VALENCE] No valid session cookies found (found: ${Object.keys(d2lCookies).join(', ') || 'none'})`);
    return null;
  } catch (e) {
    console.error(`[AUTH-VALENCE] Error extracting cookies: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * Format cookies as Cookie header string
 */
function formatCookieString(cookies: D2LSessionCookies): string {
  return Object.entries(cookies)
    .filter(([_, value]) => value)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

/**
 * Authenticate using Brightspace's official login endpoint
 * Based on: https://docs.valence.desire2learn.com/admin/lmsauth.html
 */
async function authenticateWithValence(
  context: BrowserContext,
  host: string,
  username: string,
  password: string
): Promise<D2LSessionCookies> {
  const page = await context.newPage();
  
  try {
    // Navigate to login page
    const loginUrl = `https://${host}/d2l/lp/auth/login/login.d2l`;
    console.error(`[AUTH-VALENCE] Navigating to login: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: "networkidle", timeout: 30000 });
    
    // Wait for login form to appear
    await page.waitForSelector('input[type="text"], input[type="email"], input#userNameInput, input[name="UserName"]', { timeout: 10000 });
    
    // Find and fill username field
    const usernameSelectors = [
      'input#userNameInput',
      'input[name="UserName"]',
      'input[type="email"]',
      'input[name="username"]',
      'input[name="userName"]',
    ];
    
    let usernameField = null;
    for (const selector of usernameSelectors) {
      try {
        const field = page.locator(selector).first();
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
    
    await usernameField.fill(username);
    console.error(`[AUTH-VALENCE] Username filled`);
    
    // Handle multi-step login (Microsoft ADFS, etc.)
    const nextButton = page.locator('input[type="submit"], button[type="submit"], input[value*="Next" i], button:has-text("Next")').first();
    if (await nextButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nextButton.click();
      await page.waitForTimeout(2000);
    } else {
      await usernameField.press("Enter");
      await page.waitForTimeout(2000);
    }
    
    // Find and fill password field
    const passwordSelectors = [
      'input#passwordInput',
      'input[name="Password"]',
      'input[type="password"]',
      'input[name="password"]',
    ];
    
    let passwordField = null;
    for (const selector of passwordSelectors) {
      try {
        const field = page.locator(selector).first();
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
    console.error(`[AUTH-VALENCE] Password filled`);
    
    // Submit form
    const submitButton = page.locator('input[type="submit"], button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first();
    if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitButton.click();
    } else {
      await passwordField.press("Enter");
    }
    
    // Wait for login to complete (redirect away from login page)
    console.error(`[AUTH-VALENCE] Waiting for login to complete...`);
    await page.waitForURL((url) => !url.toString().includes('/login') && !url.toString().includes('/adfs'), {
      timeout: 30000,
    });
    
    await page.waitForLoadState("networkidle");
    console.error(`[AUTH-VALENCE] Login completed, URL: ${page.url()}`);
    
    // Wait a moment for cookies to be set
    await page.waitForTimeout(2000);
    
    // Extract session cookies
    const cookies = await extractSessionCookies(context, host);
    if (!cookies || (!cookies.d2lSessionVal && !cookies.d2lSecureSessionVal)) {
      throw new Error("Failed to extract session cookies after login");
    }
    
    return cookies;
  } finally {
    await page.close();
  }
}

/**
 * Get session cookies for API authentication
 * Main entry point - follows Valence API session-based auth pattern
 */
export async function getSessionCookies(userId?: string): Promise<string> {
  const cacheKey = userId || "default";
  
  // Check in-memory cache
  const cached = sessionCache[cacheKey];
  if (cached && cached.expiresAt > Date.now()) {
    console.error(`[AUTH-VALENCE] Using cached session (expires in ${Math.round((cached.expiresAt - Date.now()) / 1000)}s)`);
    return cached.cookieString;
  }
  
  // Check stored session in database
  const stored = await getStoredSession(userId);
  if (stored && stored.expiresAt > Date.now()) {
    sessionCache[cacheKey] = stored;
    console.error(`[AUTH-VALENCE] Using stored session from database`);
    return stored.cookieString;
  }
  
  // Need to authenticate
  console.error(`[AUTH-VALENCE] No valid session found, authenticating...`);
  
  const credentials = await getCredentials(userId);
  if (!credentials) {
    throw new Error("No credentials available for authentication");
  }
  
  const { host, username, password } = credentials;
  const sessionPath = getSessionPath(userId);
  const hasExistingSession = existsSync(sessionPath);
  
  // Launch browser
  const isProduction = process.env.NODE_ENV === "production" || !process.env.DISPLAY;
  const headlessMode = isProduction || hasExistingSession;
  
  const dockerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--single-process',
  ];
  
  const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || 
                       (isProduction ? '/usr/bin/chromium-browser' : undefined);
  
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(sessionPath, {
      headless: headlessMode,
      viewport: { width: 1280, height: 720 },
      args: dockerArgs,
      executablePath: chromiumPath,
    } as any);
  } catch (launchError: any) {
    console.error(`[AUTH-VALENCE] First launch attempt failed, retrying...`);
    context = await chromium.launchPersistentContext(sessionPath, {
      headless: headlessMode,
      viewport: { width: 1280, height: 720 },
      args: dockerArgs,
    } as any);
  }
  
  try {
    // Authenticate and get session cookies
    const cookies = await authenticateWithValence(context, host, username, password);
    const cookieString = formatCookieString(cookies);
    
    // Store in cache
    const sessionData: SessionData = {
      cookies,
      cookieString,
      host,
      expiresAt: Date.now() + (23 * 60 * 60 * 1000), // 23 hours
    };
    sessionCache[cacheKey] = sessionData;
    
    // Store in database if userId provided
    if (userId) {
      try {
        await supabase
          .from("user_credentials")
          .upsert({
            user_id: userId,
            service: "d2l",
            host: host,
            token: cookieString, // Store cookie string as "token"
            updated_at: new Date().toISOString(),
          }, {
            onConflict: "user_id,service"
          });
        console.error(`[AUTH-VALENCE] Session cookies stored in database`);
      } catch (e) {
        console.error(`[AUTH-VALENCE] Failed to store session in database: ${e}`);
      }
    }
    
    return cookieString;
  } finally {
    await context.close();
  }
}

/**
 * Clear session cache
 */
export function clearSessionCache(userId?: string): void {
  const cacheKey = userId || "default";
  delete sessionCache[cacheKey];
}
