CREATE TABLE IF NOT EXISTS tasks (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
    description text,
    task_type text NOT NULL CHECK (task_type IN ('DIRECT', 'TEAM', 'PERSONAL')),
    status text NOT NULL CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'REJECTED', 'IN_PROGRESS', 'REPORTED', 'PASSED', 'FAILED')),
    proposer_id bigint NOT NULL REFERENCES users(id),
    lead_id bigint REFERENCES users(id),
    approver_id bigint REFERENCES users(id),
    deadline date NOT NULL,
    submitted_at timestamptz,
    approved_at timestamptz,
    reject_reason text,
    report_summary text,
    completed_at timestamptz,
    eval_result text CHECK (eval_result IS NULL OR eval_result IN ('PASS', 'FAIL')),
    eval_comment text,
    evaluated_by bigint REFERENCES users(id),
    evaluated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tasks_eval_status CHECK (eval_result IS NULL OR status IN ('PASSED', 'FAILED'))
);

CREATE TABLE IF NOT EXISTS task_members (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id bigint NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id bigint NOT NULL REFERENCES users(id),
    content text NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 2000),
    quantity numeric(14, 3) CHECK (quantity IS NULL OR quantity > 0),
    unit text CHECK (unit IS NULL OR length(unit) <= 80),
    done_quantity numeric(14, 3),
    progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    result_report text,
    lead_comment text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (task_id, user_id),
    CONSTRAINT task_members_done_nonnegative CHECK (done_quantity IS NULL OR done_quantity >= 0)
);

CREATE TABLE IF NOT EXISTS task_logs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id bigint NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    member_id bigint,
    actor_id bigint NOT NULL REFERENCES users(id),
    action text NOT NULL,
    detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_status_updated_idx ON tasks (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS tasks_type_status_idx ON tasks (task_type, status);
CREATE INDEX IF NOT EXISTS tasks_deadline_idx ON tasks (deadline);
CREATE INDEX IF NOT EXISTS tasks_proposer_idx ON tasks (proposer_id);
CREATE INDEX IF NOT EXISTS tasks_lead_idx ON tasks (lead_id);
CREATE INDEX IF NOT EXISTS task_members_user_task_idx ON task_members (user_id, task_id);
CREATE INDEX IF NOT EXISTS task_logs_task_created_idx ON task_logs (task_id, created_at, id);

CREATE OR REPLACE FUNCTION prevent_task_logs_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'task_logs is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_task_logs_immutable ON task_logs;
CREATE TRIGGER trg_task_logs_immutable
BEFORE UPDATE OR DELETE ON task_logs
FOR EACH ROW EXECUTE FUNCTION prevent_task_logs_mutation();
