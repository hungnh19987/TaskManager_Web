CREATE TABLE IF NOT EXISTS login_rate_limits (
    key_hash bytea PRIMARY KEY,
    window_started_at timestamptz NOT NULL,
    attempts integer NOT NULL CHECK (attempts > 0),
    blocked_until timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_rate_limits_updated_idx
    ON login_rate_limits (updated_at);
