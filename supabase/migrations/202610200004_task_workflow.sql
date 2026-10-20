DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'task_members_completed_requires_report'
    ) THEN
        ALTER TABLE task_members
            ADD CONSTRAINT task_members_completed_requires_report
            CHECK (progress < 100 OR length(trim(coalesce(result_report, ''))) > 0);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS tasks_pending_approval_idx
    ON tasks (submitted_at, id) WHERE status = 'PENDING_APPROVAL';

CREATE INDEX IF NOT EXISTS tasks_pending_evaluation_idx
    ON tasks (completed_at, id) WHERE status = 'REPORTED';
