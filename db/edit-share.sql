ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS repost_id uuid REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_repost boolean NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
CREATE INDEX IF NOT EXISTS posts_repost ON posts(repost_id) WHERE repost_id IS NOT NULL;
