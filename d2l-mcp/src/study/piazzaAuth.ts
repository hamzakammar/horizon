import "dotenv/config";
import { chromium, BrowserContext } from "playwright";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import { supabase } from "../utils/supabase.js";

// Get session path for a user (or default)
function getSessionPath(userId?: string): string {
  if (userId) {
    return join(homedir(), `.piazza-session-${userId}`);
  }
  return join(homedir(), ".piazza-session");
}

// Load Piazza credentials for a user from database, or fall back to env vars
async function getPiazzaCredentials(userId?: string): Promise<{ email: string; password: string } | null> {
  if (userId) {
    try {
      const { data, error } = await supabase
        .from("user_credentials")
        .select("email, password")
        .eq("user_id", userId)
        .eq("service", "piazza")
        .single();

      if (!error && data) {
        return {
          email: data.email,
          password: data.password,
        };
      }
    } catch (e) {
      console.error("[PIAZZA_AUTH] Error loading Piazza credentials from DB:", e);
    }
  }

  // Fall back to environment variables (if they exist)
  const email = process.env.PIAZZA_USERNAME;
  const password = process.env.PIAZZA_PASSWORD;

  if (email && password) {
    return { email, password };
  }

  return null;
}

// Pick a URL that reliably requires auth and lands you inside Piazza when logged in.
// You can use piazza.com and then navigate to a class page after.
const PIAZZA_HOME = "https://piazza.com/";

const REMOTE_DEBUG = process.env.REMOTE_DEBUG === "true";

// Detect if we're on a login page OR if we're on the homepage without being logged in
function isLoginPage(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("login") ||
    u.includes("sso") ||
    u.includes("adfs") ||
    u.includes("microsoftonline") ||
    u.includes("shibboleth") ||
    u.includes("saml")
  );
}

// Check if user is logged into Piazza by looking for authenticated elements
async function isLoggedIn(page: import("playwright").Page): Promise<boolean> {
  try {
    // If we're on a login/SSO page, not logged in
    if (isLoginPage(page.url())) return false;
    
    // If we're on a class page, we're logged in
    if (page.url().includes('/class/')) return true;
    
    // Check for elements that indicate NOT logged in (Login link on homepage)
    const loginLink = await page.$('a[href*="/account/login"]');
    if (loginLink) {
      return false;
    }
    
    // Check for dashboard/class elements that indicate logged in
    const loggedInIndicator = await page.$('#my_piazzas, .network-list, [data-pats="network_list"]');
    return loggedInIndicator !== null;
  } catch {
    return false;
  }
}

export async function getPiazzaAuthenticatedContext(userId?: string): Promise<BrowserContext> {
  const sessionPath = getSessionPath(userId);
  const hasExistingSession = existsSync(sessionPath);

  // Force headless in production/AWS (ECS Fargate can't display)
  const isProduction = process.env.NODE_ENV === "production" || process.env.AWS_EXECUTION_ENV !== undefined || !process.env.DISPLAY;
  const shouldBeHeadless = isProduction || (hasExistingSession && !REMOTE_DEBUG);

  const browserArgs: string[] = [];
  if (REMOTE_DEBUG) {
    browserArgs.push("--remote-debugging-port=9223", "--no-sandbox", "--disable-setuid-sandbox");
    console.error("[PIAZZA_AUTH] Remote debugging enabled on port 9223");
  }
  
  // Add headless args for production/AWS (same as D2L auth)
  if (isProduction) {
    browserArgs.push(
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=TranslateUI",
      "--disable-ipc-flooding-protection",
      "--single-process"
    );
  }

  // Try headless first only if we have an existing session or in production
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(sessionPath, {
      headless: shouldBeHeadless,
      viewport: { width: 1280, height: 720 },
      args: browserArgs.length > 0 ? browserArgs : undefined,
      executablePath: isProduction ? "/usr/bin/chromium-browser" : undefined,
    });
  } catch (error: any) {
    // If launch fails in production, try with more minimal args
    if (isProduction) {
      console.error("[PIAZZA_AUTH] Initial launch failed, retrying with minimal args:", error.message);
      context = await chromium.launchPersistentContext(sessionPath, {
        headless: true,
        viewport: { width: 1280, height: 720 },
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--single-process"],
        executablePath: "/usr/bin/chromium-browser",
      });
    } else {
      throw error;
    }
  }

  const page = await context.newPage();
  console.error(`[PIAZZA_AUTH] Navigating to ${PIAZZA_HOME}`);
  await page.goto(PIAZZA_HOME, { waitUntil: "networkidle" });

  // Check if we're actually logged in (not just on the homepage)
  const loggedIn = await isLoggedIn(page);
  console.error(`[PIAZZA_AUTH] Logged in: ${loggedIn}`);

  if (!loggedIn) {
    console.error(`[PIAZZA_AUTH] Login required`);

    // If we were headless, restart with visible browser for manual login (only if not in production)
    // In production, we cannot handle manual login - throw error
    const isProduction = process.env.NODE_ENV === "production" || process.env.AWS_EXECUTION_ENV !== undefined || !process.env.DISPLAY;
    if (isProduction) {
      await context.close();
      throw new Error("Piazza session expired and manual login required, but running in production/AWS where browser login is not possible. Please re-authenticate via mobile app.");
    }
    
    if (hasExistingSession && !REMOTE_DEBUG) {
      await context.close();
      console.error("[PIAZZA_AUTH] Session expired, reopening browser for login...");
      context = await chromium.launchPersistentContext(sessionPath, {
        headless: false,
        viewport: { width: 1280, height: 720 },
        args: browserArgs.length ? browserArgs : undefined,
      });
      const page2 = await context.newPage();
      await page2.goto(PIAZZA_HOME, { waitUntil: "networkidle" });

      // Wait for user to log in - detect by checking for logged-in state
      console.error("[PIAZZA_AUTH] Please log in to Piazza in the browser window...");
      await page2.waitForFunction(() => {
        // Wait until we're on a class page or the homepage changes to show classes
        const onClassPage = window.location.href.includes('/class/');
        const hasClassList = document.querySelector('#my_piazzas, .network-list, [data-pats="network_list"]') !== null;
        return onClassPage || hasClassList;
      }, { timeout: 180000 });
      await page2.waitForLoadState("networkidle");
      await page2.close();
    } else {
      // First run or already headed: wait for manual login
      console.error("[PIAZZA_AUTH] Please log in to Piazza in the browser window...");
      await page.waitForFunction(() => {
        const onClassPage = window.location.href.includes('/class/');
        const hasClassList = document.querySelector('#my_piazzas, .network-list, [data-pats="network_list"]') !== null;
        return onClassPage || hasClassList;
      }, { timeout: 180000 });
      await page.waitForLoadState("networkidle");
    }
  }

  await page.close();
  return context;
}

export async function getPiazzaCookieHeader(userId?: string): Promise<string> {
  // First, try to get cookies from database (WebView login)
  if (userId) {
    try {
      const { data, error } = await supabase
        .from("user_credentials")
        .select("token")
        .eq("user_id", userId)
        .eq("service", "piazza")
        .single();
      
      if (!error && data?.token) {
        console.error("[PIAZZA_AUTH] Using stored cookies from database");
        return data.token; // Cookies stored as token
      }
    } catch (e) {
      console.error("[PIAZZA_AUTH] Failed to get cookies from DB, falling back to browser:", e);
    }
  }
  
  // Fallback to browser-based auth (for local dev or if no cookies stored)
  const context = await getPiazzaAuthenticatedContext(userId);
  try {
    const cookies = await context.cookies(["https://piazza.com"]);
    // Build a Cookie header: "name=value; name2=value2"
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  } finally {
    await context.close();
  }
}
