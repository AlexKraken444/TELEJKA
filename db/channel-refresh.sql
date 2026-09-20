ALTER TABLE channels ADD COLUMN IF NOT EXISTS avatar text;
ALTER TABLE reward_items ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'plus' CHECK(tier IN ('plus','mini'));
CREATE TABLE IF NOT EXISTS telejka_auth.owner_account(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),user_id uuid NOT NULL UNIQUE REFERENCES users(id));
-- One-time recovery: bind only an existing, unambiguous account requested by the owner.
DO $$ DECLARE target uuid; matches int; BEGIN
 SELECT count(*),min(id::text)::uuid INTO matches,target FROM users WHERE regexp_replace(lower(name),'[[:space:]]','','g')='александрпугин';
 IF EXISTS(SELECT 1 FROM users WHERE id='5158ea3a-fcb5-44cb-8f29-362b94aa1744') THEN target:='5158ea3a-fcb5-44cb-8f29-362b94aa1744'; matches:=1; END IF;
 IF matches=1 THEN
 INSERT INTO telejka_auth.owner_account(singleton,user_id) VALUES(true,target) ON CONFLICT DO NOTHING;
 UPDATE users SET verified=true,plus_until='9999-12-31T00:00:00Z',mini_until='9999-12-31T00:00:00Z' WHERE id=(SELECT user_id FROM telejka_auth.owner_account WHERE singleton);
 END IF;
END $$;
