-- Enable Row Level Security on all user-scoped tables.
-- The backend uses service_role_key (bypasses RLS), so no existing functionality breaks.
-- This protects against direct anon-key access to other users' data.

-- ── api_keys (user_id UUID) ──────────────────────────────────────────────────
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_select" ON api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "api_keys_insert" ON api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "api_keys_update" ON api_keys
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "api_keys_delete" ON api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- ── user_credentials (user_id text) ─────────────────────────────────────────
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_credentials_select" ON user_credentials
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "user_credentials_insert" ON user_credentials
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "user_credentials_update" ON user_credentials
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "user_credentials_delete" ON user_credentials
  FOR DELETE USING (auth.uid()::text = user_id);

-- ── tasks (user_id text) ─────────────────────────────────────────────────────
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select" ON tasks
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "tasks_delete" ON tasks
  FOR DELETE USING (auth.uid()::text = user_id);

-- ── sync_state (user_id text) ────────────────────────────────────────────────
ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_state_select" ON sync_state
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "sync_state_insert" ON sync_state
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "sync_state_update" ON sync_state
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "sync_state_delete" ON sync_state
  FOR DELETE USING (auth.uid()::text = user_id);

-- ── notes (user_id text) ─────────────────────────────────────────────────────
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_select" ON notes
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "notes_insert" ON notes
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "notes_update" ON notes
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "notes_delete" ON notes
  FOR DELETE USING (auth.uid()::text = user_id);

-- ── note_sections (user_id text) ─────────────────────────────────────────────
ALTER TABLE note_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "note_sections_select" ON note_sections
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "note_sections_insert" ON note_sections
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "note_sections_update" ON note_sections
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "note_sections_delete" ON note_sections
  FOR DELETE USING (auth.uid()::text = user_id);

-- ── office_hours (user_id text) ──────────────────────────────────────────────
ALTER TABLE office_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "office_hours_select" ON office_hours
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "office_hours_insert" ON office_hours
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "office_hours_update" ON office_hours
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "office_hours_delete" ON office_hours
  FOR DELETE USING (auth.uid()::text = user_id);

-- ── piazza_posts (user_id text) ──────────────────────────────────────────────
ALTER TABLE piazza_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "piazza_posts_select" ON piazza_posts
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "piazza_posts_insert" ON piazza_posts
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "piazza_posts_update" ON piazza_posts
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "piazza_posts_delete" ON piazza_posts
  FOR DELETE USING (auth.uid()::text = user_id);

-- ── device_tokens (user_id text) ─────────────────────────────────────────────
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_tokens_select" ON device_tokens
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "device_tokens_insert" ON device_tokens
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "device_tokens_delete" ON device_tokens
  FOR DELETE USING (auth.uid()::text = user_id);
