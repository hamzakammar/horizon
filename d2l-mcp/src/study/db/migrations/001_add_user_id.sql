-- =========================================================
-- Migration 001: Multi-user support
-- Add user_id to all tenant-scoped tables. Use 'legacy' for existing rows.
-- Run after schema.sql on existing DBs.
-- =========================================================

-- ---------- TASKS ----------
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS user_id text NOT NULL DEFAULT 'legacy';

CREATE INDEX IF NOT EXISTS idx_tasks_user ON public.tasks (user_id);

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_source_ref_unique;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_user_source_ref_unique UNIQUE (user_id, source, source_ref);


-- ---------- SYNC_STATE ----------
ALTER TABLE public.sync_state
  ADD COLUMN IF NOT EXISTS user_id text NOT NULL DEFAULT 'legacy';

CREATE INDEX IF NOT EXISTS idx_sync_state_user ON public.sync_state (user_id);

ALTER TABLE public.sync_state
  DROP CONSTRAINT IF EXISTS sync_state_unique;

ALTER TABLE public.sync_state
  ADD CONSTRAINT sync_state_user_unique UNIQUE (user_id, source, course_id);


-- ---------- NOTE_SECTIONS ----------
ALTER TABLE public.note_sections
  ADD COLUMN IF NOT EXISTS user_id text NOT NULL DEFAULT 'legacy';

CREATE INDEX IF NOT EXISTS idx_note_sections_user ON public.note_sections (user_id);

-- Upsert currently uses (course_id, anchor). Add composite unique including user_id.
-- Drop legacy unique if it exists (some DBs may have added it manually).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.note_sections'::regclass
      AND conname = 'note_sections_course_anchor_unique'
  ) THEN
    ALTER TABLE public.note_sections DROP CONSTRAINT note_sections_course_anchor_unique;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS note_sections_user_course_anchor_unique
  ON public.note_sections (user_id, course_id, anchor);


-- ---------- OFFICE_HOURS ----------
ALTER TABLE public.office_hours
  ADD COLUMN IF NOT EXISTS user_id text NOT NULL DEFAULT 'legacy';

CREATE INDEX IF NOT EXISTS idx_office_hours_user ON public.office_hours (user_id);


-- ---------- PIAZZA_POSTS ----------
ALTER TABLE public.piazza_posts
  ADD COLUMN IF NOT EXISTS user_id text NOT NULL DEFAULT 'legacy';

CREATE INDEX IF NOT EXISTS idx_piazza_posts_user ON public.piazza_posts (user_id);

ALTER TABLE public.piazza_posts
  DROP CONSTRAINT IF EXISTS piazza_posts_unique;

ALTER TABLE public.piazza_posts
  ADD CONSTRAINT piazza_posts_user_unique UNIQUE (user_id, course_id, post_id);


-- ---------- NOTES (app uploads: S3 key, title, status) ----------
CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  s3_key text NOT NULL,
  title text NOT NULL,
  course_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  page_count int,
  status text NOT NULL DEFAULT 'processing'
);

CREATE INDEX IF NOT EXISTS idx_notes_user ON public.notes (user_id);
CREATE INDEX IF NOT EXISTS idx_notes_course ON public.notes (course_id);
CREATE INDEX IF NOT EXISTS idx_notes_status ON public.notes (status);

DROP TRIGGER IF EXISTS set_notes_updated_at ON public.notes;
CREATE TRIGGER set_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------- NOTE_SECTIONS.note_id (optional FK to notes) ----------
ALTER TABLE public.note_sections
  ADD COLUMN IF NOT EXISTS note_id uuid REFERENCES public.notes (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_note_sections_note ON public.note_sections (note_id);


-- ---------- RPC: match_note_sections (add user_filter, note_id) ----------
CREATE OR REPLACE FUNCTION public.match_note_sections (
  query_embedding vector(1536),
  match_count int DEFAULT 10,
  course_filter text DEFAULT NULL,
  user_filter text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  note_id uuid,
  course_id text,
  title text,
  url text,
  anchor text,
  preview text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ns.id,
    ns.note_id,
    ns.course_id,
    ns.title,
    ns.url,
    ns.anchor,
    ns.preview,
    1 - (ns.embedding <=> query_embedding) AS similarity
  FROM public.note_sections ns
  WHERE ns.embedding IS NOT NULL
    AND (user_filter IS NULL OR ns.user_id = user_filter)
    AND (course_filter IS NULL OR ns.course_id = course_filter)
  ORDER BY ns.embedding <=> query_embedding
  LIMIT match_count;
$$;


-- ---------- RPC: match_piazza_posts (add user_filter) ----------
CREATE OR REPLACE FUNCTION public.match_piazza_posts (
  query_embedding vector(1536),
  match_count int DEFAULT 10,
  course_filter text DEFAULT NULL,
  user_filter text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  course_id text,
  post_id text,
  title text,
  url text,
  created_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id,
    p.course_id,
    p.post_id,
    p.title,
    p.url,
    p.created_at,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM public.piazza_posts p
  WHERE p.embedding IS NOT NULL
    AND (user_filter IS NULL OR p.user_id = user_filter)
    AND (course_filter IS NULL OR p.course_id = course_filter)
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- =========================================================
-- End migration 001
-- =========================================================
