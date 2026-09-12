CREATE TABLE follows(follower uuid REFERENCES users(id) ON DELETE CASCADE,followed uuid REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(follower,followed),CHECK(follower<>followed));
CREATE INDEX follows_target ON follows(followed);
CREATE TABLE polls(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,chat_id uuid REFERENCES conversations(id) ON DELETE CASCADE,payload jsonb NOT NULL,option_count int NOT NULL CHECK(option_count BETWEEN 2 AND 10),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE poll_votes(poll_id uuid REFERENCES polls(id) ON DELETE CASCADE,user_id uuid REFERENCES users(id) ON DELETE CASCADE,choice int NOT NULL,PRIMARY KEY(poll_id,user_id));
CREATE TABLE studio_settings(id int PRIMARY KEY CHECK(id=1),revision int NOT NULL DEFAULT 0,config jsonb NOT NULL DEFAULT '{"overrides":[],"blocks":[],"pages":[]}');
INSERT INTO studio_settings(id) VALUES(1);
CREATE TABLE studio_history(revision int PRIMARY KEY,config jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE telejka_auth.studio_credentials(id int PRIMARY KEY CHECK(id=1),password_hash text NOT NULL);
CREATE TABLE studio_unlocks(session_hash text PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,expires_at timestamptz NOT NULL);
CREATE TABLE studio_attempts(user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,attempts int NOT NULL DEFAULT 0,window_start timestamptz NOT NULL DEFAULT now());

INSERT INTO telejka_auth.studio_credentials VALUES(1,'$2b$12$8zO.nVeIige.N3C1x3s7BuDyZeo12KoFO0kcaObSUmY4T7Z4dN0pm');

CREATE OR REPLACE FUNCTION telejka_user(uid uuid,viewer uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('follower_count',(SELECT count(*)::int FROM follows WHERE followed=uid),'id',u.id,'name',u.name,'color',u.color,'verified',u.verified,
 'avatar',CASE WHEN telejka_can_view(uid,viewer) THEN u.avatar ELSE NULL END,
 'bio',CASE WHEN telejka_can_view(uid,viewer) THEN u.bio ELSE '' END,
 'name_color',CASE WHEN u.plus_until>now() THEN u.name_color ELSE NULL END,
 'plus_active',COALESCE(u.plus_until>now(),false),'is_private',u.is_private,
 'can_view',telejka_can_view(uid,viewer),
 'blocked',EXISTS(SELECT 1 FROM user_blocks b WHERE b.user_id=viewer AND b.blocked_id=uid)) FROM users u WHERE u.id=uid
$$;
