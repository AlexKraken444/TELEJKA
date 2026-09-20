ALTER TABLE users ADD COLUMN IF NOT EXISTS ad_block boolean NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS baton_amount integer CHECK(baton_amount BETWEEN 1 AND 1000);
CREATE TABLE IF NOT EXISTS baton_transfers (
 sender_id uuid NOT NULL REFERENCES users(id), request_id uuid NOT NULL,
 recipient_id uuid NOT NULL REFERENCES users(id), conversation_id uuid NOT NULL REFERENCES conversations(id),
 amount integer NOT NULL CHECK(amount BETWEEN 1 AND 1000), message_id uuid NOT NULL REFERENCES messages(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(sender_id,request_id), CHECK(sender_id<>recipient_id)
);
CREATE TABLE IF NOT EXISTS advertisements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id), request_id uuid NOT NULL,
 slot integer NOT NULL CHECK(slot BETWEEN 1 AND 5), image text NOT NULL, link text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','rejected','expired')),
 paid integer NOT NULL CHECK(paid IN (0,15)), created_at timestamptz NOT NULL DEFAULT now(),
 starts_at timestamptz, ends_at timestamptz, UNIQUE(owner_id,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS advertisement_reserved_slot ON advertisements(slot) WHERE status IN ('pending','active');
CREATE TABLE IF NOT EXISTS telejka_auth.ad_settings(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),password_hash text NOT NULL);
INSERT INTO telejka_auth.ad_settings(singleton,password_hash) VALUES(true,'$2b$12$SArh0tyxQH3jgxzy69Q00ur.uZbt8FqsRY0QRtE5lkYWcqg1YXV3G') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS telejka_auth.ad_sessions(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),expires_at timestamptz NOT NULL);
