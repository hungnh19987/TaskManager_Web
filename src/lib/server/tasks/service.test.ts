import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { basename, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { AuthUser, Role } from '../auth/service';
import type { QueryExecutor, TransactionalDatabase } from '../db/transactional';
import { createTaskService, TaskError } from './service';

const migrationDirectory = resolve(process.cwd(), 'supabase/migrations');
const migrationFiles = (await readdir(migrationDirectory))
  .filter((file) => file.endsWith('.sql'))
  .sort();
const migrations = await Promise.all(
  migrationFiles.map(async (file) => ({
    version: basename(file, '.sql'),
    sql: await readFile(resolve(migrationDirectory, file), 'utf8')
  }))
);

const createFixture = async () => {
  const db = new PGlite();
  for (const migration of migrations) await db.exec(migration.sql);
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
  const ids = await db.query<{ id: string; username: string }>(
    `INSERT INTO users (username, full_name, password_hash, role) VALUES
      ('admin.only', 'Admin Only', 'hash', 'ADMIN'),
      ('manager.one', 'Manager One', 'hash', 'MANAGER'),
      ('staff.one', 'Staff One', 'hash', 'STAFF'),
      ('staff.two', 'Staff Two', 'hash', 'STAFF'),
      ('staff.three', 'Staff Three', 'hash', 'STAFF')
     RETURNING id, username`
  );
  const byName = Object.fromEntries(
    ids.rows.map((row) => [row.username, row.id])
  );
  const actor = (username: string, role: Role): AuthUser => ({
    id: String(byName[username]),
    username,
    fullName: username,
    role,
    isActive: true,
    authVersion: 0
  });
  return {
    db,
    service,
    ids: byName,
    admin: actor('admin.only', 'ADMIN'),
    manager: actor('manager.one', 'MANAGER'),
    staff: actor('staff.one', 'STAFF'),
    staffTwo: actor('staff.two', 'STAFF'),
    staffThree: actor('staff.three', 'STAFF')
  };
};

const teamInput = (
  leadId: string,
  overrides: Record<string, unknown> = {}
) => ({
  taskType: 'TEAM' as const,
  title: 'Prepare monthly report',
  description: 'Collect and review figures',
  deadline: '2026-10-30',
  leadId,
  ...overrides
});

const createTeamWithMembers = async (
  fixture: Awaited<ReturnType<typeof createFixture>>
) =>
  fixture.service.createTask(fixture.staff, {
    ...teamInput(fixture.staff.id),
    members: [
      {
        userId: fixture.staff.id,
        content: 'Collect source data',
        quantity: 10,
        unit: 'files'
      },
      { userId: fixture.staffTwo.id, content: 'Review source data' }
    ]
  });

test('role/type matrix creates TEAM draft, DIRECT in progress, and PERSONAL pending approval', async () => {
  const fixture = await createFixture();
  try {
    const teamId = await fixture.service.createTask(
      fixture.staff,
      teamInput(fixture.staff.id)
    );
    const directId = await fixture.service.createTask(fixture.manager, {
      taskType: 'DIRECT',
      title: 'Direct assignment',
      deadline: '2026-10-30',
      leadId: fixture.staffTwo.id,
      members: [
        { content: 'Complete assigned brief', quantity: 2, unit: 'briefs' }
      ]
    });
    const personalId = await fixture.service.createTask(fixture.staff, {
      taskType: 'PERSONAL',
      title: 'Personal development plan',
      deadline: '2026-10-30',
      leadId: fixture.staff.id,
      members: [{ content: 'Write development plan' }]
    });

    assert.equal(
      (await fixture.service.getTask(fixture.staff, teamId)).status,
      'DRAFT'
    );
    const direct = await fixture.service.getTask(fixture.staffTwo, directId);
    assert.equal(direct.status, 'IN_PROGRESS');
    assert.equal(direct.approver_id, fixture.manager.id);
    assert.equal(direct.members.length, 1);
    assert.equal(String(direct.members[0].user_id), fixture.staffTwo.id);
    assert.equal(
      (await fixture.service.getTask(fixture.staff, personalId)).status,
      'PENDING_APPROVAL'
    );

    await assert.rejects(
      fixture.service.createTask(fixture.admin, teamInput(fixture.staff.id)),
      (error: unknown) =>
        error instanceof TaskError && error.code === 'FORBIDDEN'
    );
    await assert.rejects(
      fixture.service.createTask(fixture.staff, {
        taskType: 'DIRECT',
        title: 'Unauthorized direct task',
        deadline: '2026-10-30',
        leadId: fixture.staffTwo.id,
        members: [{ content: 'Do the work' }]
      }),
      (error: unknown) =>
        error instanceof TaskError && error.code === 'FORBIDDEN'
    );
    await assert.rejects(
      fixture.service.createTask(fixture.manager, {
        taskType: 'PERSONAL',
        title: 'Unauthorized personal task',
        deadline: '2026-10-30',
        leadId: fixture.manager.id,
        members: [{ content: 'Do the work' }]
      }),
      (error: unknown) =>
        error instanceof TaskError && error.code === 'FORBIDDEN'
    );
  } finally {
    await fixture.db.close();
  }
});

test('single assignee constraints and Vietnam-local deadline validation are enforced', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      fixture.service.createTask(fixture.manager, {
        taskType: 'DIRECT',
        title: 'Wrong member',
        deadline: '2026-10-30',
        leadId: fixture.staffTwo.id,
        members: [{ userId: fixture.staff.id, content: 'Do work' }]
      }),
      (error: unknown) =>
        error instanceof TaskError && error.code === 'VALIDATION'
    );
    await assert.rejects(
      fixture.service.createTask(fixture.staff, {
        taskType: 'PERSONAL',
        title: 'Wrong personal member',
        deadline: '2026-10-30',
        leadId: fixture.staff.id,
        members: [
          { userId: fixture.staff.id, content: 'Part one' },
          { userId: fixture.staffTwo.id, content: 'Part two' }
        ]
      }),
      (error: unknown) =>
        error instanceof TaskError && error.code === 'VALIDATION'
    );
    const dueToday = await fixture.service.createTask(
      fixture.staff,
      teamInput(fixture.staff.id, { deadline: '2026-10-20' })
    );
    assert.equal(
      (await fixture.service.getTask(fixture.staff, dueToday)).deadline,
      '2026-10-20'
    );
    await assert.rejects(
      fixture.service.createTask(
        fixture.staff,
        teamInput(fixture.staff.id, { deadline: '2026-10-19' })
      ),
      (error: unknown) =>
        error instanceof TaskError && error.code === 'VALIDATION'
    );
  } finally {
    await fixture.db.close();
  }
});

test('task edit policy follows role, proposer, task type, and status', async () => {
  const fixture = await createFixture();
  try {
    const taskId = await createTeamWithMembers(fixture);
    assert.equal(
      await fixture.service.updateTask(fixture.staff, taskId, {
        title: 'Edited by proposer',
        deadline: '2026-10-30',
        leadId: fixture.staff.id
      }),
      true
    );
    await assert.rejects(
      fixture.service.updateTask(fixture.staffTwo, taskId, {
        title: 'Not proposer',
        deadline: '2026-10-30',
        leadId: fixture.staff.id
      }),
      (error: unknown) =>
        error instanceof TaskError && error.code === 'FORBIDDEN'
    );
    await assert.rejects(
      fixture.service.updateTask(fixture.admin, taskId, {
        title: 'Admin cannot edit',
        deadline: '2026-10-30',
        leadId: fixture.staff.id
      }),
      (error: unknown) =>
        error instanceof TaskError && error.code === 'FORBIDDEN'
    );

    await fixture.db.query(
      "UPDATE tasks SET status = 'IN_PROGRESS' WHERE id = $1",
      [taskId]
    );
    await assert.rejects(
      fixture.service.updateTask(fixture.staff, taskId, {
        title: 'Staff cannot edit active task',
        deadline: '2026-10-30',
        leadId: fixture.staff.id
      }),
      (error: unknown) =>
        error instanceof TaskError && error.code === 'FORBIDDEN'
    );
    assert.equal(
      await fixture.service.updateTask(fixture.manager, taskId, {
        title: 'Manager can edit active task',
        deadline: '2026-10-30',
        leadId: fixture.staffTwo.id
      }),
      true
    );
  } finally {
    await fixture.db.close();
  }
});

test('TEAM allocation is authorized by status and relation; DIRECT allocation is manager-only', async () => {
  const fixture = await createFixture();
  try {
    const taskId = await createTeamWithMembers(fixture);
    await assert.rejects(
      fixture.service.addMember(fixture.staffTwo, taskId, {
        userId: fixture.staffThree.id,
        content: 'Unauthorized part'
      }),
      (error: unknown) =>
        error instanceof TaskError && error.code === 'FORBIDDEN'
    );

    await fixture.db.query(
      "UPDATE tasks SET status = 'IN_PROGRESS' WHERE id = $1",
      [taskId]
    );
    await assert.rejects(
      fixture.service.addMember(fixture.staffTwo, taskId, {
        userId: fixture.staffThree.id,
        content: 'Not lead'
      }),
      (error: unknown) =>
        error instanceof TaskError && error.code === 'FORBIDDEN'
    );
    await fixture.service.addMember(fixture.manager, taskId, {
      userId: fixture.staffThree.id,
      content: 'Manager adds part'
    });

    const directId = await fixture.service.createTask(fixture.manager, {
      taskType: 'DIRECT',
      title: 'Direct assignment',
      deadline: '2026-10-30',
      leadId: fixture.staffTwo.id,
      members: [{ content: 'Assigned work' }]
    });
    await assert.rejects(
      fixture.service.updateMember(
        fixture.staffTwo,
        (await fixture.service.getTask(fixture.staffTwo, directId)).members[0]
          .id,
        {
          content: 'Recipient cannot edit allocation'
        }
      ),
      (error: unknown) =>
        error instanceof TaskError && error.code === 'FORBIDDEN'
    );
    await fixture.service.updateMember(
      fixture.manager,
      (await fixture.service.getTask(fixture.manager, directId)).members[0].id,
      {
        content: 'Manager updates allocation'
      }
    );
  } finally {
    await fixture.db.close();
  }
});

test('bulk assignment is atomic, duplicate member is rejected, and audit rows roll back', async () => {
  const fixture = await createFixture();
  try {
    const taskId = await fixture.service.createTask(
      fixture.staff,
      teamInput(fixture.staff.id)
    );
    await assert.rejects(
      fixture.service.addMembersBulk(
        fixture.staff,
        taskId,
        { content: 'Shared assignment', unit: 'items' },
        [
          { userId: fixture.staffTwo.id, quantity: 4 },
          { userId: fixture.admin.id, quantity: 5 }
        ]
      ),
      (error: unknown) =>
        error instanceof TaskError && error.code === 'VALIDATION'
    );
    const afterRollback = await fixture.db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM task_members WHERE task_id = $1',
      [taskId]
    );
    assert.equal(afterRollback.rows[0].count, 0);
    const memberLogs = await fixture.db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM task_logs WHERE task_id = $1 AND action = 'MEMBER_ADDED'",
      [taskId]
    );
    assert.equal(memberLogs.rows[0].count, 0);

    const created = await fixture.service.addMembersBulk(
      fixture.staff,
      taskId,
      { content: 'Shared assignment', unit: 'items' },
      [
        { userId: fixture.staffTwo.id, quantity: 4 },
        { userId: fixture.staffThree.id, quantity: 5 }
      ]
    );
    assert.equal(created.length, 2);
    await assert.rejects(
      fixture.service.addMembersBulk(
        fixture.staff,
        taskId,
        { content: 'Duplicate attempt' },
        [{ userId: fixture.staffTwo.id }, { userId: fixture.staffTwo.id }]
      ),
      (error: unknown) =>
        error instanceof TaskError && error.code === 'VALIDATION'
    );
    assert.equal(
      (await fixture.service.getTask(fixture.staff, taskId)).members.length,
      2
    );
  } finally {
    await fixture.db.close();
  }
});

test('single assignment rejects duplicate user and task logs are append-only', async () => {
  const fixture = await createFixture();
  try {
    const taskId = await createTeamWithMembers(fixture);
    await assert.rejects(
      fixture.service.addMember(fixture.staff, taskId, {
        userId: fixture.staff.id,
        content: 'Duplicate part'
      })
    );
    const logs = await fixture.service.getTaskLogs(fixture.staff, taskId);
    assert.ok(logs.length >= 3);
    await assert.rejects(
      fixture.db.query(
        "UPDATE task_logs SET action = 'TAMPERED' WHERE task_id = $1",
        [taskId]
      )
    );
  } finally {
    await fixture.db.close();
  }
});

test('task list search, status/type, involvement, and VN overdue filters compose', async () => {
  const fixture = await createFixture();
  try {
    const oldTaskId = await fixture.service.createTask(
      fixture.staff,
      teamInput(fixture.staff.id, {
        title: 'Old planning task',
        deadline: '2026-10-21'
      })
    );
    await fixture.db.query('UPDATE tasks SET deadline = $2 WHERE id = $1', [
      oldTaskId,
      '2026-10-19'
    ]);
    const directId = await fixture.service.createTask(fixture.manager, {
      taskType: 'DIRECT',
      title: 'Current direct brief',
      deadline: '2026-10-20',
      leadId: fixture.staffTwo.id,
      members: [{ content: 'Current direct work' }]
    });
    const overdue = await fixture.service.listTasks(fixture.staff, {
      search: 'planning',
      taskType: 'TEAM',
      involvedOnly: true,
      overdueOnly: true
    });
    assert.deepEqual(
      overdue.map((row) => String(row.id)),
      [String(oldTaskId)]
    );
    const today = await fixture.service.listTasks(fixture.staffTwo, {
      overdueOnly: true
    });
    assert.equal(
      today.some((row) => row.id === directId),
      false
    );
    assert.equal(
      (await fixture.service.getTask(fixture.staff, oldTaskId)).overdue,
      true
    );
  } finally {
    await fixture.db.close();
  }
});
