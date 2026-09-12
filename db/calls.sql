CREATE TABLE IF NOT EXISTS voice_calls (
 id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 caller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, callee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 caller_device uuid NOT NULL REFERENCES device_keys(id), callee_device uuid REFERENCES device_keys(id),
 state text NOT NULL DEFAULT 'ringing' CHECK(state IN ('ringing','connecting','active','ended','declined','missed','failed')),
 offer jsonb,answer jsonb,created_at timestamptz NOT NULL DEFAULT now(),answered_at timestamptz,ended_at timestamptz,
 caller_seen timestamptz NOT NULL DEFAULT now(),callee_seen timestamptz NOT NULL DEFAULT now(),
 CHECK(caller_id<>callee_id)
);
CREATE INDEX IF NOT EXISTS voice_calls_caller ON voice_calls(caller_id,created_at DESC);
CREATE INDEX IF NOT EXISTS voice_calls_callee ON voice_calls(callee_id,created_at DESC);
