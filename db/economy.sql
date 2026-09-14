ALTER TABLE comments ADD COLUMN IF NOT EXISTS edited_at timestamptz;
ALTER TABLE wallets ALTER COLUMN balance TYPE numeric USING balance::numeric;
ALTER TABLE baton_ledger ALTER COLUMN amount TYPE numeric USING amount::numeric;
CREATE TABLE reward_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('week','month','year','forever','bronze','silver','gold','time')),
 seconds bigint,consumed boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(kind<>'time' OR seconds>0)
);
CREATE INDEX reward_items_owner ON reward_items(owner_id);
CREATE TABLE reward_spins(user_id uuid REFERENCES users(id) ON DELETE CASCADE,request_id uuid NOT NULL,stake int NOT NULL CHECK(stake BETWEEN 10 AND 1000),prize text NOT NULL,item_id uuid REFERENCES reward_items(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,request_id));
CREATE TABLE market_listings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_id uuid NOT NULL REFERENCES reward_items(id),seller_id uuid NOT NULL REFERENCES users(id),request_id uuid NOT NULL,price numeric NOT NULL CHECK(price BETWEEN 1 AND 1000000000000),buyer_id uuid REFERENCES users(id),status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','sold','cancelled')),created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX market_request ON market_listings(seller_id,request_id);
CREATE UNIQUE INDEX market_one_open ON market_listings(item_id) WHERE status='open';
CREATE INDEX market_open ON market_listings(created_at DESC) WHERE status='open';
CREATE OR REPLACE FUNCTION telejka_medals(uid uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT COALESCE(jsonb_agg(kind ORDER BY kind),'[]'::jsonb) FROM (SELECT DISTINCT kind FROM reward_items WHERE owner_id=uid AND NOT consumed AND kind IN ('bronze','silver','gold')) m
$$;
CREATE OR REPLACE FUNCTION telejka_user(uid uuid,viewer uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('medals',telejka_medals(uid),'follower_count',(SELECT count(*)::int FROM follows WHERE followed=uid),'id',u.id,'name',u.name,'color',u.color,'verified',u.verified,
 'avatar',CASE WHEN telejka_can_view(uid,viewer) THEN u.avatar ELSE NULL END,
 'bio',CASE WHEN telejka_can_view(uid,viewer) THEN u.bio ELSE '' END,
 'name_color',CASE WHEN u.plus_until>now() THEN u.name_color ELSE NULL END,
 'plus_active',COALESCE(u.plus_until>now(),false),'is_private',u.is_private,
 'can_view',telejka_can_view(uid,viewer),
 'blocked',EXISTS(SELECT 1 FROM user_blocks b WHERE b.user_id=viewer AND b.blocked_id=uid)) FROM users u WHERE u.id=uid
$$;
