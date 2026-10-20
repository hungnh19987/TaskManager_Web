import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { AuthUser, Role } from '../auth/service';
import type { QueryExecutor, TransactionalDatabase } from '../db/transactional';
import { createTaskService, TaskError } from './service';

const migrationDirectory = resolve(process.cwd(), 'supabase/migrations');
const migrationFiles = (await readdir(migrationDirectory))
  .filter((file) => file.endsWith('.sql'))
  .sort();
const migrations = await Promise.all(
  migrationFiles.map((file) =>
    readFile(resolve(migrationDirectory, file), 'utf8')
  )
);

const createFixture = async () => {
  const db = new PGlite();
  for (const migration of migrations) await db.exec(migration);
  const database: TransactionalDatabase = {
    query: async <Row extends Record<string, unknown>>(
      statement: string,
      parameters: readonly unknown[] = []
    ) => ({ rows: (await db.query(statement, [...parameters])).rows as Row[] }),
    transaction: async <Result>(
      callback: (transaction: QueryExecutor) => Promise<Result>
    ) =>
      db.transaction((transaction) =>
        callback({
          query: async <Row extends Record<string, unknown>>(
            statement: string,
            parameters: readonly unknown[] = []
          ) => ({
            rows: (await transaction.query(statement, [...parameters]))
              .rows as Row[]
          })
        })
      )
  };
  const service = createTaskService(
    database,
    () => new Date('2026-10-20T03:00:00.000Z')
  );
  const { rows } = await db.query<{ id: string; username: string }>(
    `INSERT INTO users (username, full_name, password_hash, role) VALUES
      ('manager.one', 'Manager One', 'hash', 'MANAGER'),
      ('manager.two', 'Manager Two', 'hash', 'MANAGER'),
      ('staff.one', 'Staff One', 'hash', 'STAFF'),
      ('staff.two', 'Staff Two', 'hash', 'STAFF')
     RETURNING id, username`
  );
  const ids = Object.fromEntries(
    rows.map((row) => [row.username, String(row.id)])
  );
  const user = (username: string, role: Role): AuthUser => ({
    id: ids[username],
    username,
    fullName: username,
    role,
    isActive: true,
    authVersion: 0
  });
  return {
    db,
    service,
    ids,
    manager: user('manager.one', 'MANAGER'),
    managerTwo: user('manager.two', 'MANAGER'),
    staff: user('staff.one', 'STAFF'),
    staffTwo: user('staff.two', 'STAFF')
  };
};

const makeTeam = async (fixture: Awaited<ReturnType<typeof createFixture>>) => {
  const taskId = await fixture.service.createTask(fixture.staff, {
    taskType: 'TEAM',
    title: 'Quarterly review',
    deadline: '2026-10-30',
    leadId: fixture.staff.id,
    members: [
      {
        userId: fixture.staff.id,
        content: 'Prepare figures',
        quantity: 10,
        unit: 'items'
      },
      { userId: fixture.staffTwo.id, content: 'Review figures' }
    ]
  });
  return taskId;
};

const memberIdFor = async (
  db: PGlite,
  taskId: string,
  username: string
): Promise<string> => {
  const { rows } = await db.query<{ id: string }>(
    `SELECT m.id FROM task_members m JOIN users u ON u.id = m.user_id
     WHERE m.task_id = $1 AND u.username = $2`,
    [taskId, username]
  );
  return String(rows[0].id);
};

const expectTaskError = async (
  promise: Promise<unknown>,
  code: TaskError['code']
) => {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof TaskError);
    assert.equal(error.code, code);
    return true;
  });
};

test('TEAM submit, reject, resubmit, and approve enforce actor and state transitions', async () => {
  const fixture = await createFixture();
  try {
    const taskId = await makeTeam(fixture);
    await expectTaskError(
      fixture.service.approveTask(fixture.manager, taskId),
      'INVALID_STATE'
    );
    await expectTaskError(
      fixture.service.submitTask(fixture.staffTwo, taskId),
      'FORBIDDEN'
    );

    await fixture.service.submitTask(fixture.staff, taskId);
    assert.equal(
      (await fixture.service.getTask(fixture.staff, taskId)).status,
      'PENDING_APPROVAL'
    );
    await expectTaskError(
      fixture.service.submitTask(fixture.staff, taskId),
      'INVALID_STATE'
    );
    await expectTaskError(
      fixture.service.approveTask(fixture.staff, taskId),
      'FORBIDDEN'
    );

    await expectTaskError(
      fixture.service.rejectTask(fixture.manager, taskId, '   '),
      'VALIDATION'
    );
    await fixture.service.rejectTask(
      fixture.manager,
      taskId,
      'Thiếu căn cứ báo cáo.'
    );
    const rejected = await fixture.service.getTask(fixture.staff, taskId);
    assert.equal(rejected.status, 'REJECTED');
    assert.equal(rejected.reject_reason, 'Thiếu căn cứ báo cáo.');

    await fixture.service.updateTask(fixture.staff, taskId, {
      title: 'Quarterly review revised',
      deadline: '2026-10-30',
      leadId: fixture.staff.id
    });
    await fixture.service.submitTask(fixture.staff, taskId);
    await fixture.service.approveTask(fixture.manager, taskId);
    const approved = await fixture.service.getTask(fixture.staff, taskId);
    assert.equal(approved.status, 'IN_PROGRESS');
    assert.equal(String(approved.approver_id), fixture.manager.id);
    assert.ok(approved.approved_at);

    const events = await fixture.service.getTaskLogs(fixture.staff, taskId);
    assert.deepEqual(
      events.map((event) => event.action),
      [
        'TASK_CREATED',
        'MEMBER_ADDED',
        'MEMBER_ADDED',
        'TASK_SUBMITTED',
        'TASK_REJECTED',
        'TASK_UPDATED',
        'TASK_SUBMITTED',
        'TASK_APPROVED'
      ]
    );
  } finally {
    await fixture.db.close();
  }
});

test('quantity progress rounds but never reaches 100 before assigned quantity; direct auto-reports only at completion', async () => {
  const fixture = await createFixture();
  try {
    const directId = await fixture.service.createTask(fixture.manager, {
      taskType: 'DIRECT',
      title: 'Deliver 100 units',
      deadline: '2026-10-30',
      leadId: fixture.staff.id,
      members: [{ content: 'Deliver units', quantity: 100, unit: 'units' }]
    });
    const memberId = await memberIdFor(fixture.db, directId, 'staff.one');

    await fixture.service.updateProgress(fixture.staff, memberId, {
      value: 99.6,
      resultReport: 'Almost complete'
    });
    let task = await fixture.service.getTask(fixture.staff, directId);
    assert.equal(task.members[0].progress, 99);
    assert.equal(task.status, 'IN_PROGRESS');

    await expectTaskError(
      fixture.service.updateProgress(fixture.staff, memberId, { value: 100 }),
      'VALIDATION'
    );
    await fixture.service.updateProgress(fixture.staff, memberId, {
      value: 100.001,
      resultReport: 'Completed 100 units.'
    });
    task = await fixture.service.getTask(fixture.staff, directId);
    assert.equal(task.members[0].progress, 100);
    assert.equal(task.status, 'REPORTED');
    assert.equal(task.members[0].result_report, 'Completed 100 units.');
    assert.ok(task.completed_at);

    await expectTaskError(
      fixture.service.updateProgress(fixture.staff, memberId, {
        value: 100,
        resultReport: 'Late update'
      }),
      'INVALID_STATE'
    );
    await expectTaskError(
      fixture.service.evaluateTask(fixture.staff, directId, 'PASS'),
      'FORBIDDEN'
    );
  } finally {
    await fixture.db.close();
  }
});

test('PERSONAL auto-reports after approval-style in-progress completion and member comments are role-checked', async () => {
  const fixture = await createFixture();
  try {
    const taskId = await fixture.service.createTask(fixture.staff, {
      taskType: 'PERSONAL',
      title: 'Personal plan',
      deadline: '2026-10-30',
      leadId: fixture.staff.id,
      members: [{ content: 'Write plan' }]
    });
    await fixture.db.query(
      "UPDATE tasks SET status = 'IN_PROGRESS' WHERE id = $1",
      [taskId]
    );
    const memberId = await memberIdFor(fixture.db, taskId, 'staff.one');
    await fixture.service.updateProgress(fixture.staff, memberId, {
      value: 100,
      resultReport: 'Plan is ready.'
    });
    assert.equal(
      (await fixture.service.getTask(fixture.staff, taskId)).status,
      'REPORTED'
    );

    await expectTaskError(
      fixture.service.commentMember(fixture.staff, memberId, 'Self comment'),
      'FORBIDDEN'
    );
    assert.equal(
      await fixture.service.commentMember(
        fixture.manager,
        memberId,
        'Reviewed.'
      ),
      true
    );
    const detail = await fixture.service.getTask(fixture.staff, taskId);
    assert.equal(detail.members[0].lead_comment, 'Reviewed.');
  } finally {
    await fixture.db.close();
  }
});

test('TEAM cannot report until all parts are 100% with reports; lead comments and report permissions are enforced', async () => {
  const fixture = await createFixture();
  try {
    const taskId = await makeTeam(fixture);
    await fixture.db.query(
      "UPDATE tasks SET status = 'IN_PROGRESS' WHERE id = $1",
      [taskId]
    );
    const firstMember = await memberIdFor(fixture.db, taskId, 'staff.one');
    const secondMember = await memberIdFor(fixture.db, taskId, 'staff.two');

    await expectTaskError(
      fixture.service.reportCompletion(fixture.staff, taskId, 'Done'),
      'VALIDATION'
    );
    await expectTaskError(
      fixture.service.updateProgress(fixture.staffTwo, firstMember, {
        value: 100,
        resultReport: 'Wrong updater'
      }),
      'FORBIDDEN'
    );
    await fixture.service.updateProgress(fixture.staff, firstMember, {
      value: 100,
      resultReport: 'Figures prepared.'
    });
    await fixture.service.updateProgress(fixture.staff, secondMember, {
      value: 70,
      resultReport: 'Review in progress.'
    });
    await expectTaskError(
      fixture.service.reportCompletion(fixture.staff, taskId, 'Done'),
      'VALIDATION'
    );
    await fixture.service.updateProgress(fixture.staff, secondMember, {
      value: 100,
      resultReport: 'Review complete.'
    });
    await expectTaskError(
      fixture.service.reportCompletion(fixture.staffTwo, taskId, 'Done'),
      'FORBIDDEN'
    );
    await fixture.service.reportCompletion(
      fixture.staff,
      taskId,
      'All team deliverables complete.'
    );
    const task = await fixture.service.getTask(fixture.staff, taskId);
    assert.equal(task.status, 'REPORTED');
    assert.equal(task.report_summary, 'All team deliverables complete.');
  } finally {
    await fixture.db.close();
  }
});

test('evaluation requires MANAGER; FAIL comment and reopen reason are mandatory; reopen clears current evaluation', async () => {
  const fixture = await createFixture();
  try {
    const taskId = await fixture.service.createTask(fixture.manager, {
      taskType: 'DIRECT',
      title: 'Evaluate this',
      deadline: '2026-10-30',
      leadId: fixture.staff.id,
      members: [{ content: 'Complete task' }]
    });
    const memberId = await memberIdFor(fixture.db, taskId, 'staff.one');
    await fixture.service.updateProgress(fixture.staff, memberId, {
      value: 100,
      resultReport: 'Work complete.'
    });
    await expectTaskError(
      fixture.service.evaluateTask(fixture.manager, taskId, 'FAIL'),
      'VALIDATION'
    );
    await fixture.service.evaluateTask(
      fixture.manager,
      taskId,
      'FAIL',
      'Output needs revision.'
    );
    let task = await fixture.service.getTask(fixture.staff, taskId);
    assert.equal(task.status, 'FAILED');
    assert.equal(task.eval_result, 'FAIL');
    assert.equal(task.eval_comment, 'Output needs revision.');
    await expectTaskError(
      fixture.service.reopenTask(fixture.manager, taskId, '  '),
      'VALIDATION'
    );
    await fixture.service.reopenTask(
      fixture.manager,
      taskId,
      'Revise the output.'
    );
    task = await fixture.service.getTask(fixture.staff, taskId);
    assert.equal(task.status, 'IN_PROGRESS');
    assert.equal(task.eval_result, null);
    assert.equal(task.eval_comment, null);
    assert.equal(task.completed_at, null);
    assert.equal(task.members[0].progress, 100);
    const logs = await fixture.service.getTaskLogs(fixture.staff, taskId);
    assert.deepEqual(
      logs.slice(-2).map((entry) => entry.action),
      ['TASK_EVALUATED', 'TASK_REOPENED']
    );
  } finally {
    await fixture.db.close();
  }
});

test('evaluation and reopen are serialized by task row lock', async () => {
  const fixture = await createFixture();
  try {
    const taskId = await fixture.service.createTask(fixture.manager, {
      taskType: 'DIRECT',
      title: 'Concurrent evaluate',
      deadline: '2026-10-30',
      leadId: fixture.staff.id,
      members: [{ content: 'Complete task' }]
    });
    const memberId = await memberIdFor(fixture.db, taskId, 'staff.one');
    await fixture.service.updateProgress(fixture.staff, memberId, {
      value: 100,
      resultReport: 'Completed.'
    });
    const results = await Promise.allSettled([
      fixture.service.evaluateTask(fixture.manager, taskId, 'PASS'),
      fixture.service.evaluateTask(
        fixture.managerTwo,
        taskId,
        'FAIL',
        'Needs rework.'
      )
    ]);
    assert.equal(
      results.filter((result) => result.status === 'fulfilled').length,
      1
    );
    const task = await fixture.service.getTask(fixture.staff, taskId);
    assert.ok(['PASSED', 'FAILED'].includes(task.status));
    const evaluations = (
      await fixture.service.getTaskLogs(fixture.staff, taskId)
    ).filter((entry) => entry.action === 'TASK_EVALUATED');
    assert.equal(evaluations.length, 1);
  } finally {
    await fixture.db.close();
  }
});

test('progress changes roll back when the matching audit append fails', async () => {
  const fixture = await createFixture();
  try {
    const taskId = await fixture.service.createTask(fixture.manager, {
      taskType: 'DIRECT',
      title: 'Atomic progress',
      deadline: '2026-10-30',
      leadId: fixture.staff.id,
      members: [{ content: 'Complete work', quantity: 10, unit: 'items' }]
    });
    const memberId = await memberIdFor(fixture.db, taskId, 'staff.one');
    await fixture.db.exec(`
      CREATE OR REPLACE FUNCTION fail_progress_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action = 'MEMBER_PROGRESS_UPDATED' THEN RAISE EXCEPTION 'test audit failure'; END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER fail_progress_audit BEFORE INSERT ON task_logs
      FOR EACH ROW EXECUTE FUNCTION fail_progress_audit();
    `);

    await assert.rejects(
      fixture.service.updateProgress(fixture.staff, memberId, {
        value: 5,
        resultReport: 'Halfway.'
      })
    );
    const task = await fixture.service.getTask(fixture.staff, taskId);
    assert.equal(task.status, 'IN_PROGRESS');
    assert.equal(task.members[0].progress, 0);
    assert.equal(Number(task.members[0].done_quantity), 0);
    const entries = await fixture.db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM task_logs WHERE task_id = $1 AND action = 'MEMBER_PROGRESS_UPDATED'",
      [taskId]
    );
    assert.equal(entries.rows[0].count, 0);
  } finally {
    await fixture.db.close();
  }
});
