-- Add duo reauth tracking columns to user_credentials
-- Also make password nullable (users may not store credentials)

alter table public.user_credentials
  add column if not exists duo_required_at timestamptz,
  add column if not exists notification_sent_at timestamptz,
  alter column password drop not null;
