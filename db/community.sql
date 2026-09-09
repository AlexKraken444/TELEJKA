ALTER TABLE users ADD COLUMN IF NOT EXISTS plus_until timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name_color text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
ALTER TABLE members ADD COLUMN IF NOT EXISTS hidden_at timestamptz;
ALTER TABLE members ADD COLUMN IF NOT EXISTS cleared_at timestamptz;
CREATE TABLE IF NOT EXISTS user_blocks (
 user_id uuid REFERENCES users(id) ON DELETE CASCADE, blocked_id uuid REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,blocked_id), CHECK(user_id<>blocked_id)
);
CREATE INDEX IF NOT EXISTS user_blocks_reverse ON user_blocks(blocked_id,user_id);
CREATE TABLE IF NOT EXISTS profile_access (
 owner_id uuid REFERENCES users(id) ON DELETE CASCADE, viewer_id uuid REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(owner_id,viewer_id)
);
CREATE TABLE IF NOT EXISTS wallets (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 balance bigint NOT NULL DEFAULT 0 CHECK(balance>=0), streak integer NOT NULL DEFAULT 0,
 last_visit date
);
CREATE TABLE IF NOT EXISTS baton_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 ref text NOT NULL,amount bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,ref)
);
CREATE TABLE IF NOT EXISTS daily_quests (
 user_id uuid REFERENCES users(id) ON DELETE CASCADE,day date NOT NULL,
 kind text NOT NULL CHECK(kind IN ('messages','posts','comments')),
 target integer NOT NULL,progress integer NOT NULL DEFAULT 0,claimed boolean NOT NULL DEFAULT false,
 PRIMARY KEY(user_id,day),CHECK(progress BETWEEN 0 AND target)
);
CREATE TABLE IF NOT EXISTS post_reactions (
 post_id uuid REFERENCES posts(id) ON DELETE CASCADE,user_id uuid REFERENCES users(id) ON DELETE CASCADE,
 emoji text NOT NULL CHECK(emoji IN ('😁','😳','🥺','🤮','😮','😱','🤬','😎','👎','👍')),
 PRIMARY KEY(post_id,user_id,emoji)
);
CREATE TABLE IF NOT EXISTS message_reactions (
 message_id uuid REFERENCES messages(id) ON DELETE CASCADE,user_id uuid REFERENCES users(id) ON DELETE CASCADE,
 emoji text NOT NULL CHECK(emoji IN ('😁','😳','🥺','🤮','😮','😱','🤬','😎','👎','👍')),
 PRIMARY KEY(message_id,user_id,emoji)
);
CREATE OR REPLACE FUNCTION telejka_can_view(owner uuid,viewer uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT owner=viewer OR (
 NOT EXISTS(SELECT 1 FROM user_blocks WHERE (user_id=owner AND blocked_id=viewer) OR (user_id=viewer AND blocked_id=owner))
 AND EXISTS(SELECT 1 FROM users u WHERE u.id=owner AND (NOT u.is_private OR EXISTS(SELECT 1 FROM profile_access a WHERE a.owner_id=owner AND a.viewer_id=viewer))))
$$;
CREATE OR REPLACE FUNCTION telejka_user(uid uuid,viewer uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('id',u.id,'name',u.name,'color',u.color,'verified',u.verified,
 'avatar',CASE WHEN telejka_can_view(uid,viewer) THEN u.avatar ELSE NULL END,
 'bio',CASE WHEN telejka_can_view(uid,viewer) THEN u.bio ELSE '' END,
 'name_color',CASE WHEN u.plus_until>now() THEN u.name_color ELSE NULL END,
 'plus_active',COALESCE(u.plus_until>now(),false),'is_private',u.is_private,
 'can_view',telejka_can_view(uid,viewer),
 'blocked',EXISTS(SELECT 1 FROM user_blocks b WHERE b.user_id=viewer AND b.blocked_id=uid)) FROM users u WHERE u.id=uid
$$;
CREATE OR REPLACE FUNCTION telejka_quest(uid uuid) RETURNS void LANGUAGE plpgsql AS $$
 DECLARE choice integer:=floor(random()*3)::int;
 BEGIN
 INSERT INTO daily_quests(user_id,day,kind,target) VALUES(uid,(now() AT TIME ZONE 'Europe/Moscow')::date,
 CASE choice WHEN 0 THEN 'messages' WHEN 1 THEN 'posts' ELSE 'comments' END,
 CASE choice WHEN 0 THEN 10 WHEN 1 THEN 3 ELSE 1 END) ON CONFLICT DO NOTHING;
 END
$$;
CREATE OR REPLACE FUNCTION telejka_quest_progress() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 PERFORM telejka_quest(NEW.user_id);
 UPDATE daily_quests SET progress=least(target,progress+1)
 WHERE user_id=NEW.user_id AND day=(now() AT TIME ZONE 'Europe/Moscow')::date AND kind=TG_TABLE_NAME;
 RETURN NEW;
 END
$$;
CREATE TRIGGER quest_posts AFTER INSERT ON posts FOR EACH ROW EXECUTE FUNCTION telejka_quest_progress();
CREATE TRIGGER quest_comments AFTER INSERT ON comments FOR EACH ROW EXECUTE FUNCTION telejka_quest_progress();
CREATE TRIGGER quest_messages AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION telejka_quest_progress();

CREATE OR REPLACE FUNCTION telejka_post_reactions(target uuid,viewer uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(jsonb_agg(r),'[]'::jsonb) FROM (SELECT emoji,count(*)::int count,bool_or(user_id=viewer) mine FROM post_reactions WHERE post_id=target GROUP BY emoji ORDER BY emoji) r $$;
CREATE OR REPLACE FUNCTION telejka_message_reactions(target uuid,viewer uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(jsonb_agg(r),'[]'::jsonb) FROM (SELECT emoji,count(*)::int count,bool_or(user_id=viewer) mine FROM message_reactions WHERE message_id=target GROUP BY emoji ORDER BY emoji) r $$;
