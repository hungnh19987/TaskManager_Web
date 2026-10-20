CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username text NOT NULL UNIQUE,
    full_name text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'STAFF')),
    is_active boolean NOT NULL DEFAULT true,
    auth_version integer NOT NULL DEFAULT 0 CHECK (auth_version >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_username_lowercase CHECK (username = lower(username)),
    CONSTRAINT users_username_format CHECK (username ~ '^[a-z0-9._-]{3,32}$'),
    CONSTRAINT users_full_name_nonempty CHECK (length(trim(full_name)) > 0)
);

CREATE TABLE IF NOT EXISTS users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username text NOT NULL UNIQUE,
    full_name text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'STAFF')),
    is_active boolean NOT NULL DEFAULT true,
    auth_version integer NOT NULL DEFAULT 0 CHECK (auth_version >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_username_lowercase CHECK (username = lower(username)),
    CONSTRAINT users_username_format CHECK (username ~ '^[a-z0-9._-]{3,32}$'),
    CONSTRAINT users_full_name_nonempty CHECK (length(trim(full_name)) > 0)
);

CREATE TABLE IF NOT EXISTS sessions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash bytea NOT NULL UNIQUE,
    auth_version integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CONSTRAINT sessions_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS sessions_user_active_idx
    ON sessions (user_id, expires_at) WHERE revoked_at IS NULL;
