/**
 * REST API routes for app-first MVP.
 * Mount at /api. All routes use authMiddleware (req.userId).
 */

import { Router, Request, Response } from "express";
import { supabase } from "../utils/supabase.js";
import { ingestPdfBuffer, embedNoteSections, generateEmbedding } from "../study/src/notes.js";
import { isS3Configured, presignUpload, getObjectBuffer, getBucket } from "./s3.js";

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

    const { chunkCount, pageCount } = await ingestPdfBuffer(userId, buffer, {
      courseId: course,
      title: noteTitle,
      noteId: note.id,
      url,
    });
    const embedded = await embedNoteSections(userId, note.id);

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
    console.error("[API] process error:", e);
    if (noteId) {
      await supabase.from("notes").update({ status: "error" }).eq("id", noteId).eq("user_id", userId);
    }
    res.status(500).json({ error: "Failed to process PDF", noteId: noteId ?? undefined });
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

  const recentNotes = notesRes.data ?? [];
  const totalChunks = sectionsRes.count ?? 0;
  const notesCount = notesCountRes.count ?? 0;

  res.json({
    recentNotes,
    usage: { totalChunks },
    stats: { notesCount },
  });
});

export default router;
