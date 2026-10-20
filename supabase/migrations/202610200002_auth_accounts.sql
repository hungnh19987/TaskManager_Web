CREATE TABLE IF NOT EXISTS account_admin_guard (
    id smallint PRIMARY KEY CHECK (id = 1)
);

INSERT INTO account_admin_guard (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS account_logs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id bigint NOT NULL REFERENCES users(id),
    target_user_id bigint NOT NULL REFERENCES users(id),
    action text NOT NULL CHECK (action IN ('ACCOUNT_CREATED', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'ROLE_CHANGED', 'ACCOUNT_ACTIVATED', 'ACCOUNT_DEACTIVATED')),
    detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_logs_target_created_idx
    ON account_logs (target_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_account_logs_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'account_logs is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_account_logs_immutable ON account_logs;
CREATE TRIGGER trg_account_logs_immutable
BEFORE UPDATE OR DELETE ON account_logs
FOR EACH ROW EXECUTE FUNCTION prevent_account_logs_mutation();
