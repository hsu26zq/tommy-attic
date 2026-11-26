-- One-time passkey setup: a short-lived code that lets the owner log in once to register a new passkey.
alter table public.settings
  add column if not exists setup_code_hash text,
  add column if not exists setup_expires_at timestamptz;
