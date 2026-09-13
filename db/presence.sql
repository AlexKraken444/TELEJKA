CREATE TABLE user_presence(user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,seen_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE chat_presence(chat_id uuid REFERENCES conversations(id) ON DELETE CASCADE,user_id uuid REFERENCES users(id) ON DELETE CASCADE,state text NOT NULL,expires_at timestamptz NOT NULL,PRIMARY KEY(chat_id,user_id));
