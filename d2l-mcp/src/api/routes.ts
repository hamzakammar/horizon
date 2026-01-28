/**
 * REST API routes for app-first MVP.
 * Mount at /api. All routes use authMiddleware (req.userId).
 */

import { Router, Request, Response } from "express";
import { supabase } from "../utils/supabase.js";
import { ingestPdfBuffer, embedNoteSections, generateEmbedding, NotesTools } from "../study/src/notes.js";
import { isS3Configured, presignUpload, getObjectBuffer, getBucket } from "./s3.js";
import { SyncTools } from "../study/src/sync.js";
import { PiazzaTools } from "../study/src/piazza.js";
import { D2LClient } from "../client.js";
import { getToken } from "../auth.js";
import { getPiazzaCookieHeader } from "../study/piazzaAuth.js";
import { registerDeviceToken, sendPushToUser, checkAndNotifyUpdates } from "./push.js";

const router = Router();

/** POST /api/notes/presign-upload — { filename, contentType, size, courseId? } -> { uploadUrl, s3Key } */
router.post("/notes/presign-upload", async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { filename, contentType, size } = req.body || {};
  if (!filename || !contentType || typeof size !== "number") {
    res.status(400).json({ error: "filename, contentType, and size required" });
    return;
  }
  if (!isS3Configured()) {
    res.status(503).json({ error: "S3 not configured (AWS_REGION, S3_BUCKET)" });
    return;
  }
  try {
    const { uploadUrl, s3Key } = await presignUpload(userId, filename, contentType, size);
    res.json({ uploadUrl, s3Key });
  } catch (e) {
    console.error("[API] presign error:", e);
    res.status(500).json({ error: "Failed to generate presigned URL" });
  }
});

/** POST /api/notes/process — { s3Key, courseId?, title? } -> { noteId, status } */
router.post("/notes/process", async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { s3Key, courseId, title } = req.body || {};
  if (!s3Key || typeof s3Key !== "string") {
    res.status(400).json({ error: "s3Key required" });
    return;
  }
  const prefix = `users/${userId}/`;
  if (!s3Key.startsWith(prefix)) {
    res.status(403).json({ error: "s3Key must be under your user path" });
    return;
  }
  if (!isS3Configured()) {
    res.status(503).json({ error: "S3 not configured" });
    return;
  }

  const course = courseId && typeof courseId === "string" ? courseId : "default";
  const noteTitle = title && typeof title === "string" ? title : "Untitled PDF";
  const url = `s3://${getBucket()}/${s3Key}`;
  let noteId: string | null = null;

  try {
    const { data: note, error: insertErr } = await supabase
      .from("notes")
      .insert({
        user_id: userId,
        s3_key: s3Key,
        title: noteTitle,
        course_id: course,
        status: "processing",
      })
      .select("id")
      .single();

    if (insertErr || !note) {
      console.error("[API] note insert error:", insertErr);
      res.status(500).json({ error: "Failed to create note" });
      return;
    }
    noteId = note.id;

    const buffer = await getObjectBuffer(s3Key);
    if (!buffer) {
      await supabase.from("notes").update({ status: "error" }).eq("id", note.id);
      res.status(404).json({ error: "PDF not found in S3", noteId: note.id });
      return;
    }

    if (buffer.length === 0) {
      await supabase.from("notes").update({ status: "error" }).eq("id", note.id);
      res.status(400).json({ error: "PDF file is empty", noteId: note.id });
      return;
    }

    let chunkCount = 0;
    let pageCount = 0;
    try {
      console.error("[API] Starting PDF ingestion, buffer size:", buffer.length);
      const ingestResult = await ingestPdfBuffer(userId, buffer, {
        courseId: course,
        title: noteTitle,
        noteId: note.id,
        url,
      });
      chunkCount = ingestResult.chunkCount;
      pageCount = ingestResult.pageCount;
      console.error("[API] PDF ingestion successful:", { chunkCount, pageCount });
    } catch (ingestError) {
      const errorMsg = ingestError instanceof Error ? ingestError.message : String(ingestError);
      const errorStack = ingestError instanceof Error ? ingestError.stack : undefined;
      console.error("[API] ingestPdfBuffer error:", errorMsg);
      console.error("[API] ingestPdfBuffer stack:", errorStack);
      console.error("[API] ingestPdfBuffer full error:", ingestError);
      
      await supabase.from("notes").update({ status: "error" }).eq("id", note.id);
      
      // Check if it's a PDF parsing error
      if (errorMsg.includes("pdf-parse") || errorMsg.includes("PDF") || errorMsg.includes("parse")) {
        res.status(500).json({ 
          error: "Failed to parse PDF file", 
          details: errorMsg,
          noteId: note.id,
          suggestion: "The PDF file may be corrupted, encrypted, or in an unsupported format. Please try a different PDF file.",
          debug: {
            bufferSize: buffer.length,
            s3Key: s3Key.substring(0, 50),
          }
        });
      } else {
        res.status(500).json({ 
          error: "Failed to ingest PDF", 
          details: errorMsg,
          noteId: note.id,
          debug: {
            bufferSize: buffer.length,
            s3Key: s3Key.substring(0, 50),
          }
        });
      }
      return;
    }

    let embedded = 0;
    try {
      embedded = await embedNoteSections(userId, note.id);
    } catch (embedError) {
      console.error("[API] embedNoteSections error:", embedError);
      // Don't fail the whole request if embedding fails - note is still usable
      console.error("[API] Continuing despite embedding failure");
    }

    await supabase
      .from("notes")
      .update({ status: "ready", page_count: pageCount })
      .eq("id", note.id);

    res.json({
      noteId: note.id,
      status: "ready",
      chunkCount,
      pageCount,
      embedded,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const errorStack = e instanceof Error ? e.stack : undefined;
    console.error("[API] process error:", errorMessage);
    console.error("[API] process error stack:", errorStack);
    console.error("[API] process error details:", {
      userId,
      s3Key,
      courseId: course,
      title: noteTitle,
      noteId,
      s3KeyPrefix: s3Key?.substring(0, 50),
      s3KeyStartsWithPrefix: s3Key?.startsWith(`users/${userId}/`),
    });
    
    if (noteId) {
      await supabase.from("notes").update({ status: "error" }).eq("id", noteId).eq("user_id", userId);
    }
    
    // Return detailed error for debugging
    res.status(500).json({ 
      error: "Failed to process PDF", 
      details: errorMessage,
      noteId: noteId ?? undefined,
      debug: {
        s3KeyPrefix: s3Key?.substring(0, 50),
        hasS3Key: !!s3Key,
        s3KeyFormat: s3Key?.startsWith(`users/${userId}/`) ? 'valid' : 'invalid',
      }
    });
  }
});

/** GET /api/notes — query courseId? -> { notes: [...] } */
router.get("/notes", async (req: Request, res: Response) => {
  const userId = req.userId!;
  const courseId = req.query.courseId as string | undefined;

  let query = supabase
    .from("notes")
    .select("id, title, course_id, created_at, page_count, status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (courseId) query = query.eq("course_id", courseId);

  const { data: notes, error } = await query;

  if (error) {
    console.error("[API] notes list error:", error);
    res.status(500).json({ error: "Failed to list notes" });
    return;
  }

  res.json({ notes: notes ?? [] });
});

/** GET /api/search — query q, courseId?, limit? -> { hits: [...] } */
router.get("/search", async (req: Request, res: Response) => {
  const userId = req.userId!;
  const q = (req.query.q as string)?.trim();
  const courseId = (req.query.courseId as string) || undefined;
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

  if (!q) {
    res.status(400).json({ error: "query q required" });
    return;
  }

  try {
    const queryEmbedding = await generateEmbedding(q);
    const { data: sections, error } = await supabase.rpc("match_note_sections", {
      query_embedding: queryEmbedding,
      match_count: limit,
      course_filter: courseId ?? null,
      user_filter: userId,
    });

    if (error) {
      console.error("[API] search error:", error);
      res.status(500).json({ error: "Search failed" });
      return;
    }

    const hits = (sections ?? []).map((s: { id: string; note_id: string | null; title: string; url: string; anchor: string; preview: string; similarity: number }) => ({
      sectionId: s.id,
      noteId: s.note_id,
      title: s.title,
      snippet: s.preview,
      url: s.url,
      anchor: s.anchor,
      score: s.similarity,
    }));

    res.json({ hits });
  } catch (e) {
    console.error("[API] search error:", e);
    res.status(500).json({ error: "Search failed" });
  }
});

/** GET /api/dashboard — { recentNotes, usage, stats } */
router.get("/dashboard", async (req: Request, res: Response) => {
  const userId = req.userId!;

  try {
    // Test database connection first
    if (!supabase) {
      console.error("[API] dashboard error: Supabase client not initialized");
      res.status(503).json({
        error: "Database not configured",
        message: "SUPABASE_URL or DATABASE_URL environment variable is missing or invalid"
      });
      return;
    }

    const [notesRes, sectionsRes, notesCountRes] = await Promise.all([
      supabase
        .from("notes")
        .select("id, title, course_id, created_at, status")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("note_sections")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .from("notes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);

    // Check for errors - if any critical query fails, return error
    const errors: string[] = [];
    if (notesRes.error) {
      console.error("[API] dashboard notes error:", notesRes.error);
      errors.push(`Notes query failed: ${notesRes.error.message || JSON.stringify(notesRes.error)}`);
    }
    if (sectionsRes.error) {
      console.error("[API] dashboard sections error:", sectionsRes.error);
      errors.push(`Sections count failed: ${sectionsRes.error.message || JSON.stringify(sectionsRes.error)}`);
    }
    if (notesCountRes.error) {
      console.error("[API] dashboard notesCount error:", notesCountRes.error);
      errors.push(`Notes count failed: ${notesCountRes.error.message || JSON.stringify(notesCountRes.error)}`);
    }

    // If all queries failed, return error
    if (errors.length === 3) {
      res.status(503).json({
        error: "Database queries failed",
        details: errors,
        message: "All database queries failed. Check database connection and table existence."
      });
      return;
    }

    // Return partial data if some queries succeeded
    const recentNotes = notesRes.data ?? [];
    const totalChunks = sectionsRes.count ?? 0;
    const notesCount = notesCountRes.count ?? 0;

    res.json({
      recentNotes,
      usage: { totalChunks },
      stats: { notesCount },
      warnings: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    console.error("[API] dashboard error:", e);
    const errorMessage = e instanceof Error ? e.message : String(e);

    // Check if it's a database connection error
    if (errorMessage.includes('connection') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('timeout')) {
      res.status(503).json({
        error: "Database connection failed",
        details: errorMessage,
        message: "Cannot connect to database. Check SUPABASE_URL/DATABASE_URL and network connectivity."
      });
    } else {
      res.status(500).json({
        error: "Failed to load dashboard",
        details: errorMessage
      });
    }
  }
});

/** POST /api/notes/embed-missing — Embed missing note sections */
router.post("/notes/embed-missing", async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { courseId, limit, minChars } = req.body || {};

  try {
    const result = await NotesTools.notes_embed_missing.handler({
      userId,
      courseId: courseId || undefined,
      limit: limit || 100,
      minChars: minChars || 200,
    });

    const parsed = JSON.parse(result);
    if (parsed.success) {
      res.json(parsed);
    } else {
      res.status(500).json(parsed);
    }
  } catch (e) {
    console.error("[API] embed-missing error:", e);
    res.status(500).json({ error: "Failed to embed missing notes", details: e instanceof Error ? e.message : String(e) });
  }
});

/** POST /api/d2l/connect — Store D2L credentials for user */
/** POST /api/d2l/connect-cookie — Store D2L cookies directly (from WebView) */
router.post("/d2l/connect-cookie", async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { host, cookies } = req.body || {};

  if (!host || !cookies) {
    res.status(400).json({ error: "host and cookies required" });
    return;
  }

  const correlationId = `cookie-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  try {
    // Store cookies in user_credentials table as the 'token'
    const { error } = await supabase
      .from("user_credentials")
      .upsert({
        user_id: userId,
        service: "d2l",
        host: host,
        token: cookies, // Store cookies as the token string
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,service"
      });

    if (error) {
      console.error(`[API] [${correlationId}] d2l/connect-cookie error storing:`, error);
      res.status(500).json({ error: "Failed to store cookies", correlationId });
      return;
    }

    console.error(`[API] [${correlationId}] Cookies stored, verifying...`);

    // Verify cookies work by making a test API call
    try {
      // Clear token cache to force refresh
      const { clearTokenCache } = await import("../auth.js");
      clearTokenCache(userId);

      const client = new D2LClient(userId, host);
      // This will use the stored cookies from getToken() -> D2LClient adapter
      await client.getMyEnrollments();

      console.error(`[API] [${correlationId}] Cookies verified successfully`);
      res.json({
        status: "connected",
        message: "D2L connected via cookies successfully",
        correlationId
      });
    } catch (verifyError) {
      console.error(`[API] [${correlationId}] Cookie verification failed:`, verifyError);

      // Delete invalid credentials
      const { error: deleteError } = await supabase
        .from("user_credentials")
        .delete()
        .eq("user_id", userId)
        .eq("service", "d2l");

      res.status(400).json({
        error: "Invalid or expired cookies. Please try logging in again.",
        details: verifyError instanceof Error ? verifyError.message : String(verifyError),
        correlationId
      });
    }
  } catch (e) {
    console.error(`[API] [${correlationId}] d2l/connect-cookie error:`, e);
    res.status(500).json({
      error: "Failed to store cookies",
      details: e instanceof Error ? e.message : String(e),
      correlationId
    });
  }
});

/** POST /api/d2l/token — Store D2L token directly (from WebView login) */
router.post("/d2l/token", async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { host, token } = req.body || {};

  if (!host || !token) {
    res.status(400).json({ error: "host and token required" });
    return;
  }

  const correlationId = `token-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  try {
    // Store token in user_credentials table
    const { error } = await supabase
      .from("user_credentials")
      .upsert({
        user_id: userId,
        service: "d2l",
        host: host,
        token: token, // Store the token directly
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,service"
      });

    if (error) {
      console.error(`[API] [${correlationId}] d2l/token error storing:`, error);
      res.status(500).json({ error: "Failed to store token", correlationId });
      return;
    }

    console.error(`[API] [${correlationId}] Token stored, verifying...`);

    // Verify token works by making a test API call
    try {
      // Clear token cache to force refresh
      const { clearTokenCache } = await import("../auth.js");
      clearTokenCache(userId);

      const client = new D2LClient(userId, host);
      // This will use the stored token from getToken()
      await client.getMyEnrollments();

      console.error(`[API] [${correlationId}] Token verified successfully`);
      res.json({
        status: "connected",
        message: "D2L token stored and verified successfully",
        correlationId
      });
    } catch (verifyError) {
      console.error(`[API] [${correlationId}] Token verification failed:`, verifyError);

      // Delete invalid token from database
      const { error: deleteError } = await supabase
        .from("user_credentials")
        .delete()
        .eq("user_id", userId)
        .eq("service", "d2l")
        .eq("token", token); // Only delete this specific token

      if (deleteError) {
        console.error(`[API] [${correlationId}] Failed to delete invalid token:`, deleteError);
      } else {
        console.error(`[API] [${correlationId}] Deleted invalid token from database`);
      }

      res.status(400).json({
        error: "Invalid or expired token. Please try logging in again.",
        details: verifyError instanceof Error ? verifyError.message : String(verifyError),
        correlationId
      });
    }
  } catch (e) {
    console.error(`[API] [${correlationId}] d2l/token error:`, e);
    res.status(500).json({
      error: "Failed to store token",
      details: e instanceof Error ? e.message : String(e),
      correlationId
    });
  }
});

router.post("/d2l/connect", async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { host, username, password } = req.body || {};

  if (!host || !username || !password) {
    res.status(400).json({ error: "host, username, and password required" });
    return;
  }

  try {
    // First, verify credentials by attempting to authenticate
    // Temporarily store credentials to test authentication
    const { error: tempError } = await supabase
      .from("user_credentials")
      .upsert({
        user_id: userId,
        service: "d2l",
        host: host,
        username: username,
        password: password, // TODO: Encrypt this in production
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,service"
      });

    if (tempError) {
      console.error("[API] d2l/connect error storing temp credentials:", tempError);
      res.status(500).json({ error: "Failed to store credentials" });
      return;
    }

    // Now try to authenticate with D2L to verify credentials work
    // Set a timeout to prevent 504 Gateway Timeout (ALB timeout is typically 60s)
    const authTimeout = 55000; // 55 seconds - slightly less than typical ALB timeout
    const authPromise = (async () => {
      const client = new D2LClient(userId, host);
      // Try to get enrollments as a test - this will trigger authentication
      await client.getMyEnrollments();
      return { success: true };
    })();
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Authentication timeout - the login process is taking too long. This may be due to 2FA or additional verification steps.")), authTimeout)
    );

    try {
      await Promise.race([authPromise, timeoutPromise]);

      // If we get here, authentication succeeded
      res.json({
        status: "connected",
        message: "D2L credentials verified and stored successfully"
      });
    } catch (authError) {
      // Authentication failed - remove the credentials we just stored
      const deleteResult = await supabase
        .from("user_credentials")
        .delete()
        .eq("user_id", userId)
        .eq("service", "d2l");

      console.error("[API] d2l/connect authentication failed:", authError);
      const errorMessage = authError instanceof Error ? authError.message : String(authError);

      // Check for browser launch failures (Playwright not installed)
      if (errorMessage.includes("ENOENT") || errorMessage.includes("spawn") || errorMessage.includes("chromium") || errorMessage.includes("playwright")) {
        res.status(500).json({
          error: "Browser automation is not available. Please contact support.",
          details: "Playwright/Chromium is not installed in the backend container."
        });
      } else if (errorMessage.includes("login") || errorMessage.includes("password") || errorMessage.includes("credentials") || errorMessage.includes("Invalid") || errorMessage.includes("incorrect")) {
        res.status(401).json({
          error: "Invalid D2L credentials. Please check your username and password.",
          details: errorMessage
        });
      } else {
        res.status(500).json({
          error: "Failed to authenticate with D2L",
          details: errorMessage
        });
      }
    }
  } catch (e) {
    console.error("[API] d2l/connect error:", e);
    res.status(500).json({ error: "Failed to connect", details: e instanceof Error ? e.message : String(e) });
  }
});

/** GET /api/d2l/status — Get D2L connection status */
router.get("/d2l/status", async (req: Request, res: Response) => {
  const userId = req.userId!;
  try {
    // Check if credentials exist in database
    const { data: credsData, error: credError } = await supabase
      .from("user_credentials")
      .select("host, username, token, updated_at")
      .eq("user_id", userId)
      .eq("service", "d2l")
      .limit(1);
    
    const creds = Array.isArray(credsData) ? credsData[0] : credsData;

    // Check if we have token (cookie-based auth) or username (legacy credential-based)
    const hasToken = !credError && !!creds && !!creds.token;
    const hasUsername = !credError && !!creds && !!creds.username;
    const connected = hasToken || hasUsername;

    // Check token age - if older than 20 hours, signal reauth required
    let reauthRequired = false;
    if (hasToken && creds.updated_at) {
      const tokenAge = Date.now() - (new Date(creds.updated_at).getTime());
      const maxAge = 20 * 60 * 60 * 1000; // 20 hours
      reauthRequired = tokenAge > maxAge;
    }

    // Get last sync time from tasks table
    const { data: lastTaskData } = await supabase
      .from("tasks")
      .select("created_at")
      .eq("user_id", req.userId!)
      .eq("source", "d2l")
      .order("created_at", { ascending: false })
      .limit(1);

    const lastTask = Array.isArray(lastTaskData) ? lastTaskData[0] : lastTaskData;

    // Get courses count (optional - don't fail if this doesn't work)
    let coursesCount = 0;
    if (connected && creds && !reauthRequired) {
      try {
        const client = new D2LClient(userId, creds.host);
        const enrollments = await client.getMyEnrollments() as { Items: any[] };
        coursesCount = enrollments?.Items?.filter(
          (e: any) => e.OrgUnit?.Type?.Code === "Course Offering" && e.Access?.IsActive && e.Access?.CanAccess
        ).length || 0;
      } catch (e: any) {
        // Check if error is REAUTH_REQUIRED
        if (e.message === "REAUTH_REQUIRED" || (e instanceof Error && e.message.includes("REAUTH_REQUIRED"))) {
          reauthRequired = true;
        }
        // Ignore other errors getting courses - credentials might be valid but not authenticated yet
        console.error("[API] Error getting courses count:", e);
      }
    }

    res.json({
      connected: connected && !reauthRequired,
      reauthRequired,
      lastSync: lastTask?.created_at || null,
      coursesCount,
    });
  } catch (e) {
    console.error("[API] d2l/status error:", e);
    res.json({
      connected: false,
      reauthRequired: false,
      lastSync: null,
      coursesCount: 0,
    });
  }
});

/** POST /api/d2l/sync — Sync all D2L assignments */
router.post("/d2l/sync", async (req: Request, res: Response) => {
  const userId = req.userId!;

  try {
    const result = await SyncTools.sync_all.handler({ userId });
    const parsed = JSON.parse(result);

    if (parsed.success) {
      res.json({
        status: "completed",
        message: "D2L sync completed successfully",
        result: parsed,
      });
    } else {
      res.status(500).json({
        status: "failed",
        message: parsed.error || "D2L sync failed",
        result: parsed,
      });
    }
  } catch (e: any) {
    console.error("[API] d2l/sync error:", e);
    const errorMessage = e instanceof Error ? e.message : String(e);
    
    // Check if error is REAUTH_REQUIRED
    if (errorMessage === "REAUTH_REQUIRED" || errorMessage.includes("REAUTH_REQUIRED")) {
      res.status(401).json({ 
        status: "failed",
        error: "REAUTH_REQUIRED",
        message: "Your D2L session has expired. Please sign in again using the WebView." 
      });
      return;
    }
    
    // Check if it's an auth error (token issue)
    if (errorMessage.includes("token") || errorMessage.includes("authentication") || errorMessage.includes("unauthorized")) {
      res.status(401).json({
        status: "failed",
        error: "AUTH_REQUIRED",
        message: "Authentication required. Please sign in again.",
      });
      return;
    }
    
    res.status(500).json({
      status: "failed",
      error: errorMessage,
    });
  }
});

/** GET /api/d2l/courses — Get enrolled courses */
router.get("/d2l/courses", async (req: Request, res: Response) => {
  const userId = req.userId!;
  try {
    // Get user's D2L host from credentials
    const { data: credsData } = await supabase
      .from("user_credentials")
      .select("host")
      .eq("user_id", userId)
      .eq("service", "d2l")
      .limit(1);

    const creds = Array.isArray(credsData) ? credsData[0] : credsData;
    if (!creds) {
      res.status(404).json({ error: "D2L credentials not found. Please connect D2L first." });
      return;
    }

    const client = new D2LClient(userId, creds.host);
    const enrollments = await client.getMyEnrollments() as { Items: any[] };

    const courses = enrollments.Items
      .filter((e: any) =>
        e.OrgUnit?.Type?.Code === "Course Offering" &&
        e.Access?.IsActive &&
        e.Access?.CanAccess
      )
      .map((e: any) => ({
        id: String(e.OrgUnit.Id),
        name: e.OrgUnit.Name,
        code: e.OrgUnit.Code || "",
        orgUnitId: e.OrgUnit.Id,
        startDate: e.Access?.StartDate || null,
        endDate: e.Access?.EndDate || null,
      }));

    res.json({ courses });
  } catch (e: any) {
    console.error("[API] d2l/courses error:", e);
    // Check if error is REAUTH_REQUIRED
    if (e.message === "REAUTH_REQUIRED" || (e instanceof Error && e.message.includes("REAUTH_REQUIRED"))) {
      res.status(401).json({ 
        error: "REAUTH_REQUIRED",
        message: "Your D2L session has expired. Please sign in again using the WebView." 
      });
      return;
    }
    res.status(500).json({ error: "Failed to fetch courses", details: e instanceof Error ? e.message : String(e) });
  }
});

/** GET /api/d2l/courses/:courseId/announcements — Get announcements for a course */
router.get("/d2l/courses/:courseId/announcements", async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { courseId } = req.params;
  const orgUnitId = parseInt(courseId, 10);

  if (isNaN(orgUnitId)) {
    res.status(400).json({ error: "Invalid course ID" });
    return;
  }

  try {
    // Get user's D2L host from credentials
    const { data: credsData } = await supabase
      .from("user_credentials")
      .select("host")
      .eq("user_id", userId)
      .eq("service", "d2l")
      .limit(1);

    const creds = Array.isArray(credsData) ? credsData[0] : credsData;
    if (!creds) {
      res.status(404).json({ error: "D2L credentials not found. Please connect D2L first." });
      return;
    }

    const client = new D2LClient(userId, creds.host);
    const news = await client.getNews(orgUnitId) as any[];
    const { marshalAnnouncements } = await import("../utils/marshal.js");
    const announcements = marshalAnnouncements(news);

    res.json({ announcements });
  } catch (e: any) {
    console.error("[API] d2l/courses/:courseId/announcements error:", e);
    // Check if error is REAUTH_REQUIRED
    if (e.message === "REAUTH_REQUIRED" || (e instanceof Error && e.message.includes("REAUTH_REQUIRED"))) {
      res.status(401).json({ 
        error: "REAUTH_REQUIRED",
        message: "Your D2L session has expired. Please sign in again using the WebView." 
      });
      return;
    }
    res.status(500).json({
      error: "Failed to fetch announcements",
      details: e instanceof Error ? e.message : String(e)
    });
  }
});

/** GET /api/d2l/courses/:courseId/assignments — Get assignments for a course */
router.get("/d2l/courses/:courseId/assignments", async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { courseId } = req.params;
  const orgUnitId = parseInt(courseId, 10);

  if (isNaN(orgUnitId)) {
    res.status(400).json({ error: "Invalid course ID" });
    return;
  }

  try {
    // Get user's D2L host from credentials
    const { data: credsData } = await supabase
      .from("user_credentials")
      .select("host")
      .eq("user_id", userId)
      .eq("service", "d2l")
      .limit(1);

    const creds = Array.isArray(credsData) ? credsData[0] : credsData;
    if (!creds) {
      res.status(404).json({ error: "D2L credentials not found. Please connect D2L first." });
      return;
    }

    const client = new D2LClient(userId, creds.host);
    const { assignmentTools } = await import("../tools/dropbox.js");
    const folders = await client.getDropboxFolders(orgUnitId) as any[];
    const { marshalAssignments } = await import("../utils/marshal.js");
    const assignments = marshalAssignments(folders);

    res.json({
      assignments: assignments.map((a: any) => ({
        id: a.id,
        name: a.name,
        dueDate: a.dueDate,
        instructions: a.instructions || null,
      })),
    });
  } catch (e: any) {
    console.error("[API] d2l/courses/:courseId/assignments error:", e);
    // Check if error is REAUTH_REQUIRED
    if (e.message === "REAUTH_REQUIRED" || (e instanceof Error && e.message.includes("REAUTH_REQUIRED"))) {
      res.status(401).json({ 
        error: "REAUTH_REQUIRED",
        message: "Your D2L session has expired. Please sign in again using the WebView." 
      });
      return;
    }
    res.status(500).json({ error: "Failed to fetch assignments", details: e instanceof Error ? e.message : String(e) });
  }
});

/** GET /api/d2l/courses/:courseId/grades — Get grades for a course */
router.get("/d2l/courses/:courseId/grades", async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { courseId } = req.params;
  const orgUnitId = parseInt(courseId, 10);

  if (isNaN(orgUnitId)) {
    res.status(400).json({ error: "Invalid course ID" });
    return;
  }

  try {
    // Get user's D2L host from credentials
    const { data: credsData } = await supabase
      .from("user_credentials")
      .select("host")
      .eq("user_id", userId)
      .eq("service", "d2l")
      .limit(1);

    const creds = Array.isArray(credsData) ? credsData[0] : credsData;
    if (!creds) {
      res.status(404).json({ error: "D2L credentials not found. Please connect D2L first." });
      return;
    }

    const client = new D2LClient(userId, creds.host);
    const grades = await client.getMyGradeValues(orgUnitId) as any[];
    const { marshalGrades } = await import("../utils/marshal.js");
    const marshalledGrades = marshalGrades(grades);

    res.json({ grades: marshalledGrades });
  } catch (e: any) {
    console.error("[API] d2l/courses/:courseId/grades error:", e);
    // Check if error is REAUTH_REQUIRED
    if (e.message === "REAUTH_REQUIRED" || (e instanceof Error && e.message.includes("REAUTH_REQUIRED"))) {
      res.status(401).json({ 
        error: "REAUTH_REQUIRED",
        message: "Your D2L session has expired. Please sign in again using the WebView." 
      });
      return;
    }
    res.status(500).json({ error: "Failed to fetch grades", details: e instanceof Error ? e.message : String(e) });
  }
});

/** POST /api/piazza/connect — Store Piazza credentials for user */
router.post("/piazza/connect", async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { email, password } = req.body || {};

  if (!email || !password) {
    res.status(400).json({ error: "email and password required" });
    return;
  }

  try {
    // Store credentials in database
    const { error } = await supabase
      .from("user_credentials")
      .upsert({
        user_id: userId,
        service: "piazza",
        email: email,
        password: password, // TODO: Encrypt this in production
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,service"
      });

    if (error) {
      console.error("[API] piazza/connect error:", error);
      res.status(500).json({ error: "Failed to store credentials" });
      return;
    }

    res.json({
      status: "connected",
      message: "Piazza credentials stored successfully"
    });
  } catch (e) {
    console.error("[API] piazza/connect error:", e);
    res.status(500).json({ error: "Failed to connect", details: e instanceof Error ? e.message : String(e) });
  }
});

/** POST /api/piazza/connect-cookie — Store Piazza cookies directly (from WebView) */
router.post("/piazza/connect-cookie", async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { cookies } = req.body || {};

  if (!cookies || typeof cookies !== "string") {
    res.status(400).json({ error: "cookies required" });
    return;
  }

  const correlationId = `piazza-cookie-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  try {
    // Extract session_id from cookies (Piazza uses session_id as the main cookie)
    const sessionIdMatch = cookies.match(/session_id=([^;]+)/);
    if (!sessionIdMatch) {
      res.status(400).json({ error: "Invalid cookies: session_id not found" });
      return;
    }

    // Store cookies in user_credentials table as the 'token'
    // We'll use a dummy email since we're using cookies
    const { error } = await supabase
      .from("user_credentials")
      .upsert({
        user_id: userId,
        service: "piazza",
        email: `cookie-auth-${userId}@piazza.local`, // Dummy email for cookie-based auth
        password: cookies, // Store cookies as password (legacy field, but we use token now)
        token: cookies, // Store cookies as the token string
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,service"
      });

    if (error) {
      console.error(`[API] [${correlationId}] piazza/connect-cookie error storing:`, error);
      res.status(500).json({ error: "Failed to store cookies", correlationId });
      return;
    }

    console.error(`[API] [${correlationId}] Piazza cookies stored, verifying...`);

    // Verify cookies work by making a test API call
    try {
      const cookieHeader = cookies;
      const testResponse = await fetch("https://piazza.com/logic/api?method=network.get_my_feed", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json",
          "cookie": cookieHeader,
        },
        body: JSON.stringify({ method: "network.get_my_feed", params: { limit: 1 } }),
      });

      if (!testResponse.ok || testResponse.headers.get("content-type")?.includes("text/html")) {
        throw new Error("Invalid cookies - Piazza API returned error");
      }

      console.error(`[API] [${correlationId}] Piazza cookies verified successfully`);
      res.json({
        status: "connected",
        message: "Piazza connected via cookies successfully",
        correlationId
      });
    } catch (verifyError) {
      console.error(`[API] [${correlationId}] Piazza cookie verification failed:`, verifyError);

      // Delete invalid credentials
      const { error: deleteError } = await supabase
        .from("user_credentials")
        .delete()
        .eq("user_id", userId)
        .eq("service", "piazza");

      res.status(400).json({
        error: "Invalid or expired cookies. Please try logging in again.",
        details: verifyError instanceof Error ? verifyError.message : String(verifyError),
        correlationId
      });
    }
  } catch (e) {
    console.error(`[API] [${correlationId}] piazza/connect-cookie error:`, e);
    res.status(500).json({ 
      error: "Failed to connect Piazza", 
      details: e instanceof Error ? e.message : String(e),
      correlationId 
    });
  }
});

/** DELETE /api/piazza/disconnect — Remove Piazza credentials */
router.delete("/piazza/disconnect", async (req: Request, res: Response) => {
  const userId = req.userId!;
  try {
    const { error } = await supabase
      .from("user_credentials")
      .delete()
      .eq("user_id", userId)
      .eq("service", "piazza");

    if (error) {
      console.error("[API] piazza/disconnect error:", error);
      res.status(500).json({ error: "Failed to disconnect Piazza" });
      return;
    }

    res.json({
      status: "disconnected",
      message: "Piazza disconnected successfully"
    });
  } catch (e) {
    console.error("[API] piazza/disconnect error:", e);
    res.status(500).json({ error: "Failed to disconnect", details: e instanceof Error ? e.message : String(e) });
  }
});

/** GET /api/piazza/status — Get Piazza connection status */
router.get("/piazza/status", async (req: Request, res: Response) => {
  const userId = req.userId!;
  try {
    // Check if credentials exist in database
    const { data: credsData, error: credError } = await supabase
      .from("user_credentials")
      .select("email, token, updated_at")
      .eq("user_id", userId)
      .eq("service", "piazza")
      .limit(1);

    const creds = Array.isArray(credsData) ? credsData[0] : credsData;

    // Check if we have valid cookies/token (not just credentials)
    let cookieHeader: string | null = null;
    let hasValidAuth = false;
    
    // First check if token exists in database (cookies stored via WebView)
    if (creds?.token && typeof creds.token === "string") {
      const tokenValue = creds.token;
      // Verify cookies contain session_id (Piazza's main auth cookie)
      if (tokenValue.includes("session_id=")) {
        cookieHeader = tokenValue;
        hasValidAuth = true;
        console.error("[API] piazza/status - found valid cookies in DB");
      } else {
        console.error("[API] piazza/status - cookies in DB but missing session_id");
      }
    }
    
    // Fallback: try getPiazzaCookieHeader (for browser-based auth)
    if (!hasValidAuth) {
      try {
        const retrievedCookies = await getPiazzaCookieHeader(userId);
        // If we got cookies, verify they're valid by checking for session_id
        if (retrievedCookies && retrievedCookies.includes("session_id=")) {
          cookieHeader = retrievedCookies;
          hasValidAuth = true;
        }
      } catch (e) {
        // Not authenticated - that's fine
        console.error("[API] piazza/status - no valid auth:", e instanceof Error ? e.message : String(e));
      }
    }

    // Connected only if we have valid cookies/token (not just stored credentials)
    // This ensures we only show "connected" if actually authenticated
    const connected = hasValidAuth && cookieHeader !== null && cookieHeader.length > 0;

    // Get last sync time from piazza_posts table
    const { data: lastPostData } = await supabase
      .from("piazza_posts")
      .select("updated_at")
      .eq("user_id", req.userId!)
      .order("updated_at", { ascending: false })
      .limit(1);

    const lastPost = Array.isArray(lastPostData) ? lastPostData[0] : lastPostData;

    // Get classes count
    const { data: classes, count } = await supabase
      .from("piazza_posts")
      .select("course_id", { count: "exact", head: false })
      .eq("user_id", req.userId!);

    const uniqueClasses = new Set((classes || []).map((c: any) => c.course_id));
    const classesCount = uniqueClasses.size;

    res.json({
      connected,
      lastSync: lastPost?.updated_at || null,
      classesCount,
    });
  } catch (e) {
    console.error("[API] piazza/status error:", e);
    res.json({
      connected: false,
      lastSync: null,
      classesCount: 0,
    });
  }
});

/** POST /api/piazza/sync — Sync Piazza posts */
router.post("/piazza/sync", async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { courseId, sinceDays, maxPosts, highSignalOnly } = req.body || {};

  try {
    const result = await PiazzaTools.piazza_sync.handler({
      userId,
      courseId: courseId || undefined,
      sinceDays: sinceDays || 21,
      maxPosts: maxPosts || 40,
      highSignalOnly: highSignalOnly !== undefined ? highSignalOnly : true,
    });

    const parsed = JSON.parse(result);

    if (parsed.success) {
      res.json({
        status: "completed",
        message: "Piazza sync completed successfully",
        result: parsed,
      });
    } else {
      res.status(500).json({
        status: "failed",
        message: parsed.error || "Piazza sync failed",
        result: parsed,
      });
    }
  } catch (e) {
    console.error("[API] piazza/sync error:", e);
    const errorMessage = e instanceof Error ? e.message : String(e);
    
    // Check if it's a browser launch error (production/AWS issue)
    if (errorMessage.includes("Failed to launch") || errorMessage.includes("browserType.launchPersistentContext")) {
      res.status(503).json({
        status: "failed",
        error: "Piazza sync is not available in this environment. Browser automation requires a local environment or manual authentication via the mobile app.",
        message: "Piazza sync requires browser automation which is not available in AWS ECS. Please use the mobile app to authenticate Piazza.",
      });
    } else {
      res.status(500).json({
        status: "failed",
        error: errorMessage,
      });
    }
  }
});

/** POST /api/piazza/embed-missing — Embed missing Piazza posts */
router.post("/piazza/embed-missing", async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { courseId, limit, minChars } = req.body || {};

  try {
    const result = await PiazzaTools.piazza_embed_missing.handler({
      userId,
      courseId: courseId || undefined,
      limit: limit || 100,
      minChars: minChars || 200,
    });

    const parsed = JSON.parse(result);

    if (parsed.success) {
      res.json({
        status: "completed",
        message: "Piazza embedding completed",
        result: parsed,
      });
    } else {
      res.status(500).json({
        status: "failed",
        message: parsed.error || "Piazza embedding failed",
        result: parsed,
      });
    }
  } catch (e) {
    console.error("[API] piazza/embed-missing error:", e);
    res.status(500).json({
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/piazza/search — Search Piazza posts */
router.get("/piazza/search", async (req: Request, res: Response) => {
  const userId = req.userId!;
  const q = (req.query.q as string)?.trim();
  const courseId = (req.query.courseId as string) || undefined;
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

  if (!q) {
    res.status(400).json({ error: "query q required" });
    return;
  }

  try {
    const result = await PiazzaTools.piazza_semantic_search.handler({
      userId,
      query: q,
      courseId,
      topK: limit,
    });

    const parsed = JSON.parse(result);

    if (parsed.success && parsed.results) {
      // Transform results to match expected format
      const hits = (parsed.results || []).map((r: any) => ({
        postId: r.post_id || r.id,
        title: r.title,
        snippet: r.body || r.preview || "",
        url: r.url,
        score: r.similarity || 0,
        courseId: r.course_id,
      }));

      res.json({ hits });
    } else {
      res.status(500).json({ error: parsed.error || "Search failed" });
    }
  } catch (e) {
    console.error("[API] piazza/search error:", e);
    res.status(500).json({ error: "Search failed", details: e instanceof Error ? e.message : String(e) });
  }
});

/** POST /api/push/register — Register device token for push notifications */
router.post("/push/register", async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { deviceToken, platform } = req.body || {};

  if (!deviceToken || !platform) {
    res.status(400).json({ error: "deviceToken and platform required" });
    return;
  }

  if (platform !== "ios" && platform !== "android") {
    res.status(400).json({ error: "platform must be 'ios' or 'android'" });
    return;
  }

  try {
    await registerDeviceToken(userId, deviceToken, platform);
    res.json({ status: "registered" });
  } catch (e) {
    console.error("[API] push/register error:", e);
    res.status(500).json({ error: "Failed to register device token", details: e instanceof Error ? e.message : String(e) });
  }
});

/** POST /api/push/sync — Check for updates and send notifications (can be called by cron) */
router.post("/push/sync", async (req: Request, res: Response) => {
  const userId = req.userId!;

  try {
    const results = await checkAndNotifyUpdates(userId);
    res.json({
      status: "completed",
      results,
    });
  } catch (e) {
    console.error("[API] push/sync error:", e);
    res.status(500).json({ error: "Failed to check updates", details: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
