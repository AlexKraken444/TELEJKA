CREATE TABLE IF NOT EXISTS live_streams (
 id uuid PRIMARY KEY, host_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 host_key uuid NOT NULL, title text NOT NULL CHECK(length(title) BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(), seen_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS live_streams_recent ON live_streams(seen_at DESC) WHERE ended_at IS NULL;
CREATE TABLE IF NOT EXISTS live_stream_peers (
 id uuid PRIMARY KEY, stream_id uuid NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 offer jsonb NOT NULL, answer jsonb, ready boolean NOT NULL DEFAULT false,
 seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_stream_peers_stream ON live_stream_peers(stream_id,seen_at);
CREATE TABLE IF NOT EXISTS live_stream_messages (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, request_id uuid NOT NULL UNIQUE,
 stream_id uuid NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 500), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_stream_messages_stream ON live_stream_messages(stream_id,id DESC);
