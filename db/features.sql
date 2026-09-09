CREATE SCHEMA IF NOT EXISTS telejka_auth;
CREATE TABLE IF NOT EXISTS telejka_auth.credentials (
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 password_hash text NOT NULL
);
INSERT INTO telejka_auth.credentials(user_id,password_hash)
 SELECT id,password_hash FROM public.users WHERE password_hash IS NOT NULL
 ON CONFLICT(user_id) DO NOTHING;
ALTER TABLE public.users ALTER COLUMN password_hash DROP NOT NULL;
UPDATE public.users SET password_hash = NULL WHERE password_hash IS NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_since timestamptz NOT NULL DEFAULT now();
ALTER TABLE messages ADD COLUMN IF NOT EXISTS envelope jsonb;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS message_dedup ON messages(user_id,client_id) WHERE client_id IS NOT NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]';
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_body_check;
ALTER TABLE posts ADD CONSTRAINT posts_body_check CHECK (char_length(body) BETWEEN 0 AND 2000);
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_body_check;
ALTER TABLE comments ADD CONSTRAINT comments_body_check CHECK (char_length(body) BETWEEN 0 AND 1000);
CREATE TABLE IF NOT EXISTS device_keys (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 public_key jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS device_keys_user ON device_keys(user_id);
CREATE TABLE IF NOT EXISTS notification_deliveries (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,message_id)
);
CREATE TABLE IF NOT EXISTS uploads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 chat_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
 name text NOT NULL, mime text NOT NULL, size integer NOT NULL CHECK(size BETWEEN 1 AND 26214416),
 chunks integer NOT NULL CHECK(chunks BETWEEN 1 AND 101), ready boolean NOT NULL DEFAULT false,
 published boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS uploads_owner ON uploads(owner_id,created_at);
CREATE TABLE IF NOT EXISTS upload_chunks (
 upload_id uuid NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
 idx integer NOT NULL, data bytea NOT NULL, PRIMARY KEY(upload_id,idx)
);
