import "dotenv/config";
import { chromium, BrowserContext } from "playwright";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";

const SESSION_PATH = join(homedir(), ".piazza-session");

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

export async function getPiazzaAuthenticatedContext(): Promise<BrowserContext> {
  const hasExistingSession = existsSync(SESSION_PATH);

  const browserArgs: string[] = [];
  if (REMOTE_DEBUG) {
    browserArgs.push("--remote-debugging-port=9223", "--no-sandbox", "--disable-setuid-sandbox");
    console.error("[PIAZZA_AUTH] Remote debugging enabled on port 9223");
  }

  // Try headless first only if we have an existing session
  let context = await chromium.launchPersistentContext(SESSION_PATH, {
    headless: hasExistingSession && !REMOTE_DEBUG,
    viewport: { width: 1280, height: 720 },
    args: browserArgs.length ? browserArgs : undefined,
  });

  const page = await context.newPage();
  console.error(`[PIAZZA_AUTH] Navigating to ${PIAZZA_HOME}`);
  await page.goto(PIAZZA_HOME, { waitUntil: "networkidle" });

  // Check if we're actually logged in (not just on the homepage)
  const loggedIn = await isLoggedIn(page);
  console.error(`[PIAZZA_AUTH] Logged in: ${loggedIn}`);

  if (!loggedIn) {
    console.error(`[PIAZZA_AUTH] Login required`);

    // If we were headless, restart with visible browser for manual login
    if (hasExistingSession && !REMOTE_DEBUG) {
      await context.close();
      console.error("[PIAZZA_AUTH] Session expired, reopening browser for login...");
      context = await chromium.launchPersistentContext(SESSION_PATH, {
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

export async function getPiazzaCookieHeader(): Promise<string> {
  const context = await getPiazzaAuthenticatedContext();
  try {
    const cookies = await context.cookies(["https://piazza.com"]);
    // Build a Cookie header: "name=value; name2=value2"
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  } finally {
    await context.close();
  }
}
