CREATE TABLE IF NOT EXISTS telejka_auth.push_keys (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),public_key text NOT NULL,private_key text NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_hash text NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
 endpoint text NOT NULL UNIQUE, p256dh text NOT NULL,auth text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscription_user ON push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS push_deliveries (
 message_id uuid REFERENCES messages(id) ON DELETE CASCADE,subscription_id uuid REFERENCES push_subscriptions(id) ON DELETE CASCADE,
 sent_at timestamptz,attempts integer NOT NULL DEFAULT 0,leased_until timestamptz,PRIMARY KEY(message_id,subscription_id)
);
