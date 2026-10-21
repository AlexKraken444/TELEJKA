CREATE TABLE IF NOT EXISTS subscription_discounts (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 percent integer NOT NULL CHECK(percent IN (10,20,30,40,50)),
 created_at timestamptz NOT NULL DEFAULT now(),
 used_at timestamptz
);
