-- Enable Row Level Security on all user-scoped tables.
-- The backend uses service_role_key (bypasses RLS), so no existing functionality breaks.
-- This protects against direct anon-key access to other users' data.
-- Uses existence checks so missing tables are silently skipped.

DO $$ BEGIN

  -- ── api_keys ────────────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'api_keys') THEN
    EXECUTE 'ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "api_keys_select" ON api_keys FOR SELECT USING (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "api_keys_insert" ON api_keys FOR INSERT WITH CHECK (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "api_keys_update" ON api_keys FOR UPDATE USING (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "api_keys_delete" ON api_keys FOR DELETE USING (auth.uid()::text = user_id::text)';
  END IF;

  -- ── user_credentials ────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_credentials') THEN
    EXECUTE 'ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "user_credentials_select" ON user_credentials FOR SELECT USING (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "user_credentials_insert" ON user_credentials FOR INSERT WITH CHECK (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "user_credentials_update" ON user_credentials FOR UPDATE USING (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "user_credentials_delete" ON user_credentials FOR DELETE USING (auth.uid()::text = user_id::text)';
  END IF;

  -- ── tasks ────────────────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
    EXECUTE 'ALTER TABLE tasks ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "tasks_select" ON tasks FOR SELECT USING (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "tasks_insert" ON tasks FOR INSERT WITH CHECK (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "tasks_update" ON tasks FOR UPDATE USING (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "tasks_delete" ON tasks FOR DELETE USING (auth.uid()::text = user_id::text)';
  END IF;

  -- ── notes ────────────────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notes') THEN
    EXECUTE 'ALTER TABLE notes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "notes_select" ON notes FOR SELECT USING (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "notes_insert" ON notes FOR INSERT WITH CHECK (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "notes_update" ON notes FOR UPDATE USING (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "notes_delete" ON notes FOR DELETE USING (auth.uid()::text = user_id::text)';
  END IF;

  -- ── note_sections ────────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'note_sections') THEN
    EXECUTE 'ALTER TABLE note_sections ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "note_sections_select" ON note_sections FOR SELECT USING (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "note_sections_insert" ON note_sections FOR INSERT WITH CHECK (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "note_sections_update" ON note_sections FOR UPDATE USING (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "note_sections_delete" ON note_sections FOR DELETE USING (auth.uid()::text = user_id::text)';
  END IF;

  -- ── piazza_posts ─────────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'piazza_posts') THEN
    EXECUTE 'ALTER TABLE piazza_posts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "piazza_posts_select" ON piazza_posts FOR SELECT USING (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "piazza_posts_insert" ON piazza_posts FOR INSERT WITH CHECK (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "piazza_posts_update" ON piazza_posts FOR UPDATE USING (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "piazza_posts_delete" ON piazza_posts FOR DELETE USING (auth.uid()::text = user_id::text)';
  END IF;

  -- ── device_tokens ────────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'device_tokens') THEN
    EXECUTE 'ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "device_tokens_select" ON device_tokens FOR SELECT USING (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "device_tokens_insert" ON device_tokens FOR INSERT WITH CHECK (auth.uid()::text = user_id::text)';
    EXECUTE 'CREATE POLICY "device_tokens_delete" ON device_tokens FOR DELETE USING (auth.uid()::text = user_id::text)';
  END IF;

END $$;
