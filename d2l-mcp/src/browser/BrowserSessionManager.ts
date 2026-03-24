/**
 * BrowserSessionManager
 *
 * Manages per-user Playwright browser instances with noVNC streaming.
 * Each user gets an isolated browser + Xvfb display + websockify port.
 *
 * Flow:
 *   1. startSession(userId, d2lHost) → returns { sessionId, vncUrl }
 *   2. User opens vncUrl, logs into D2L, approves Duo
 *   3. Playwright detects successful login, captures cookies
 *   4. Cookies stored to EFS + Supabase
 *   5. Session auto-closes after success or 10min timeout
 */

import { chromium, Browser, BrowserContext, Page } from "playwright";
import { spawn, ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs/promises";
import { supabase } from "../utils/supabase.js";

const SESSIONS_BASE = process.env.SESSIONS_PATH || "/sessions";
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const VNC_BASE_PORT = 5900;
const WS_BASE_PORT = 6080;

// Port pool — supports up to 50 concurrent auth sessions
const MAX_SESSIONS = 50;
const usedPorts = new Set<number>();

function allocatePort(base: number): number {
  for (let i = 0; i < MAX_SESSIONS; i++) {
    const port = base + i;
    if (!usedPorts.has(port)) {
      usedPorts.add(port);
      return port;
    }
  }
  throw new Error("No available ports for new browser session");
}

function releasePort(port: number) {
  usedPorts.delete(port);
}

export interface BrowserSession {
  sessionId: string;
  userId: string;
  d2lHost: string;
  vncUrl: string;
  wsPort: number;
  vncPort: number;
  displayNum: number;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  xvfbProc: ChildProcess;
  x11vncProc: ChildProcess;
  websockifyProc: ChildProcess;
  timeoutHandle: NodeJS.Timeout;
  status: "waiting" | "authenticated" | "failed" | "closed";
  createdAt: number;
}

const activeSessions = new Map<string, BrowserSession>();
const userSessionMap = new Map<string, string>(); // userId → sessionId

export class BrowserSessionManager {

  /**
   * Start a new browser session for a user.
   * Returns the noVNC URL the user should open.
   */
  static async startSession(userId: string, d2lHost: string): Promise<{ sessionId: string; vncUrl: string }> {
    // Close any existing session for this user
    const existingId = userSessionMap.get(userId);
    if (existingId) {
      await BrowserSessionManager.closeSession(existingId);
    }

    const sessionId = randomUUID();
    const displayNum = 10 + activeSessions.size; // :10, :11, etc.
    const vncPort = allocatePort(VNC_BASE_PORT);
    const wsPort = allocatePort(WS_BASE_PORT);

    // 1. Start Xvfb virtual display
    const xvfbProc = spawn("Xvfb", [
      `:${displayNum}`,
      "-screen", "0", "1280x800x24",
      "-ac", "-nolisten", "tcp"
    ], { stdio: ["ignore", "ignore", "pipe"] });
    xvfbProc.stderr?.on("data", (d: Buffer) => console.error(`[XVFB] ${d.toString().trim()}`));
    xvfbProc.on("exit", (code) => console.error(`[XVFB] exited with code ${code}`));

    await new Promise(r => setTimeout(r, 1000)); // Wait for Xvfb to start

    // 2. Start x11vnc to share the display
    const x11vncProc = spawn("x11vnc", [
      "-display", `:${displayNum}`,
      "-rfbport", String(vncPort),
      "-nopw",
      "-shared",
      "-forever",
      "-quiet",
    ], { stdio: ["ignore", "ignore", "pipe"] });
    x11vncProc.stderr?.on("data", (d: Buffer) => console.error(`[X11VNC] ${d.toString().trim()}`));
    x11vncProc.on("exit", (code) => console.error(`[X11VNC] exited with code ${code}`));

    await new Promise(r => setTimeout(r, 300));

    // 3. Start websockify to proxy VNC over WebSocket (for noVNC)
    const noVncPath = "/usr/share/novnc";
    const websockifyProc = spawn("websockify", [
      "--web", noVncPath,
      String(wsPort),
      `localhost:${vncPort}`
    ], { stdio: "ignore" });

    await new Promise(r => setTimeout(r, 300));

    // 4. Launch Playwright browser on the virtual display
    const browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
      headless: false,
      env: { ...process.env, DISPLAY: `:${displayNum}` },
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        `--display=:${displayNum}`,
        "--window-size=1280,800",
        "--window-position=0,0",
      ],
    });

    // 5. Load existing cookies if any (resume session)
    const sessionDir = path.join(SESSIONS_BASE, userId);
    await fs.mkdir(sessionDir, { recursive: true });

    const cookiePath = path.join(sessionDir, "cookies.json");
    const storageState = await fs.access(cookiePath).then(() => cookiePath).catch(() => undefined);

    const context = await browser.newContext({
      storageState,
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();
    await page.goto(`https://${d2lHost}`);

    // 6. Watch for successful login
    const timeoutHandle = setTimeout(async () => {
      console.error(`[VNC] Session ${sessionId} timed out for user ${userId}`);
      const session = activeSessions.get(sessionId);
      if (session) {
        session.status = "failed";
        await BrowserSessionManager.closeSession(sessionId);
      }
    }, SESSION_TIMEOUT_MS);

    BrowserSessionManager._watchForLogin(sessionId, userId, d2lHost, page, context);

    const vncUrl = `https://${process.env.API_HOST || "api.hamzaammar.ca"}/vnc/${sessionId}/vnc.html?autoconnect=true&reconnect=true`;

    const session: BrowserSession = {
      sessionId, userId, d2lHost, vncUrl,
      wsPort, vncPort, displayNum,
      browser, context, page,
      xvfbProc, x11vncProc, websockifyProc,
      timeoutHandle,
      status: "waiting",
      createdAt: Date.now(),
    };

    activeSessions.set(sessionId, session);
    userSessionMap.set(userId, sessionId);

    console.error(`[VNC] Started session ${sessionId} for user ${userId} on display :${displayNum}, wsPort ${wsPort}`);
    return { sessionId, vncUrl };
  }

  /**
   * Watch the page for a successful D2L login.
   * Triggers cookie capture when detected.
   */
  private static _watchForLogin(
    sessionId: string,
    userId: string,
    d2lHost: string,
    page: Page,
    context: BrowserContext
  ) {
    // Poll every 2 seconds for login success indicators
    const interval = setInterval(async () => {
      const session = activeSessions.get(sessionId);
      if (!session || session.status !== "waiting") {
        clearInterval(interval);
        return;
      }

      try {
        const url = page.url();
        // D2L dashboard/home indicates successful login
        const isLoggedIn = (
          url.includes("/d2l/home") ||
          url.includes("/d2l/le/") ||
          url.includes("/d2l/lp/") ||
          (url.includes(d2lHost) && !url.includes("/login") && !url.includes("/auth"))
        );

        if (isLoggedIn) {
          clearInterval(interval);
          await BrowserSessionManager._captureAndStore(sessionId, userId, d2lHost, context);
        }
      } catch {
        // Page may be navigating — ignore
      }
    }, 2000);
  }

  /**
   * Capture cookies from the browser context and store to EFS + Supabase.
   */
  private static async _captureAndStore(
    sessionId: string,
    userId: string,
    d2lHost: string,
    context: BrowserContext
  ) {
    const session = activeSessions.get(sessionId);
    if (!session) return;

    try {
      console.error(`[VNC] Login detected for user ${userId}, capturing cookies...`);

      // Get all cookies
      const cookies = await context.cookies();
      const d2lCookies = cookies.filter(c =>
        c.domain.includes(d2lHost) || c.domain.includes("brightspace")
      );

      // Build cookie token string (d2lSessionVal + d2lSecureSessionVal)
      const sessionVal = d2lCookies.find(c => c.name === "d2lSessionVal")?.value;
      const secureVal = d2lCookies.find(c => c.name === "d2lSecureSessionVal")?.value;

      if (!sessionVal || !secureVal) {
        console.error(`[VNC] Missing D2L session cookies for user ${userId}`);
        // Not logged in yet despite URL match — keep waiting
        session.status = "waiting";
        BrowserSessionManager._watchForLogin(sessionId, userId, d2lHost, session.page, context);
        return;
      }

      const token = JSON.stringify({ d2lSessionVal: sessionVal, d2lSecureSessionVal: secureVal });

      // Save full storage state to EFS
      const sessionDir = path.join(SESSIONS_BASE, userId);
      await fs.mkdir(sessionDir, { recursive: true });
      await context.storageState({ path: path.join(sessionDir, "cookies.json") });

      // Store token in Supabase user_credentials
      const { error } = await supabase.from("user_credentials").upsert({
        user_id: userId,
        service: "d2l",
        host: d2lHost,
        token,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,service" });

      if (error) {
        console.error(`[VNC] Failed to store credentials for user ${userId}:`, error.message);
      } else {
        console.error(`[VNC] Successfully stored D2L credentials for user ${userId}`);
      }

      session.status = "authenticated";

      // Close session after short delay (let user see the logged-in state)
      setTimeout(() => BrowserSessionManager.closeSession(sessionId), 3000);

    } catch (err) {
      console.error(`[VNC] Error capturing cookies for user ${userId}:`, err);
      session.status = "failed";
      await BrowserSessionManager.closeSession(sessionId);
    }
  }

  /**
   * Get the status of a session.
   */
  static getSession(sessionId: string): BrowserSession | undefined {
    return activeSessions.get(sessionId);
  }

  /**
   * Get session for a user.
   */
  static getSessionForUser(userId: string): BrowserSession | undefined {
    const sessionId = userSessionMap.get(userId);
    return sessionId ? activeSessions.get(sessionId) : undefined;
  }

  /**
   * Close and clean up a session.
   */
  static async closeSession(sessionId: string) {
    const session = activeSessions.get(sessionId);
    if (!session) return;

    clearTimeout(session.timeoutHandle);

    try { await session.browser.close(); } catch {}
    try { session.websockifyProc.kill("SIGTERM"); } catch {}
    try { session.x11vncProc.kill("SIGTERM"); } catch {}
    try { session.xvfbProc.kill("SIGTERM"); } catch {}

    releasePort(session.vncPort);
    releasePort(session.wsPort);

    activeSessions.delete(sessionId);
    userSessionMap.delete(session.userId);

    console.error(`[VNC] Closed session ${sessionId} for user ${session.userId}`);
  }

  /**
   * Clean up all sessions (on shutdown).
   */
  static async closeAll() {
    const ids = [...activeSessions.keys()];
    await Promise.all(ids.map(id => BrowserSessionManager.closeSession(id)));
  }
}
