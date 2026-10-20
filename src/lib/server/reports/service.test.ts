import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { AuthUser, Role } from '../auth/service';
import type { QueryExecutor, TransactionalDatabase } from '../db/transactional';
import { createTaskService, type TaskStatus } from '../tasks/service';
import { buildPeopleCsv, buildTaskCsv, createReportService } from './service';

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
  const now = () => new Date('2026-10-20T03:00:00.000Z');
  const tasks = createTaskService(database, now);
  const reports = createReportService(database, now);
  const { rows } = await db.query<{ id: string; username: string }>(
    `INSERT INTO users (username, full_name, password_hash, role) VALUES
      ('admin.rep', 'Admin Reports', 'hash', 'ADMIN'),
      ('manager.rep', 'Manager Reports', 'hash', 'MANAGER'),
      ('staff.one', 'Staff One', 'hash', 'STAFF'),
      ('staff.two', 'Staff Two', 'hash', 'STAFF') RETURNING id, username`
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
    tasks,
    reports,
    ids,
    admin: user('admin.rep', 'ADMIN'),
    manager: user('manager.rep', 'MANAGER'),
    staff: user('staff.one', 'STAFF'),
    staffTwo: user('staff.two', 'STAFF')
  };
};

const createTeam = async (
  fixture: Awaited<ReturnType<typeof createFixture>>,
  options: { title: string; deadline: string; memberIds?: string[] }
) =>
  fixture.tasks.createTask(fixture.staff, {
    taskType: 'TEAM',
    title: options.title,
    deadline: options.deadline,
    leadId: fixture.staff.id,
    members: (options.memberIds ?? [fixture.staff.id]).map((userId) => ({
      userId,
      content: `Work for ${options.title}`
    }))
  });

const setStatus = async (db: PGlite, taskId: string, status: TaskStatus) => {
  await db.query('UPDATE tasks SET status = $2 WHERE id = $1', [
    taskId,
    status
  ]);
};

test('overview reports status counts, Vietnam overdue, due soon, workload, and manager queues', async () => {
  const fixture = await createFixture();
  try {
    const overdueId = await createTeam(fixture, {
      title: 'Overdue report',
      deadline: '2026-10-19'
    }).catch(async () => {
      const id = await createTeam(fixture, {
        title: 'Overdue report',
        deadline: '2026-10-21'
      });
      await fixture.db.query('UPDATE tasks SET deadline = $2 WHERE id = $1', [
        id,
        '2026-10-19'
      ]);
      return id;
    });
    const dueSoonId = await createTeam(fixture, {
      title: 'Due soon report',
      deadline: '2026-10-25'
    });
    await setStatus(fixture.db, dueSoonId, 'IN_PROGRESS');
    await setStatus(fixture.db, overdueId, 'PENDING_APPROVAL');
    const queueEvaluationId = await createTeam(fixture, {
      title: 'Reported item',
      deadline: '2026-10-25'
    });
    await setStatus(fixture.db, queueEvaluationId, 'REPORTED');

    const overview = await fixture.reports.overview(fixture.manager);
    assert.equal(overview.statusCounts.PENDING_APPROVAL, 1);
    assert.equal(overview.statusCounts.IN_PROGRESS, 1);
    assert.equal(overview.statusCounts.REPORTED, 1);
    assert.equal(overview.overdue.length, 1);
    assert.equal(String(overview.overdue[0].id), overdueId);
    assert.equal(overview.dueSoon.length, 1);
    assert.equal(String(overview.dueSoon[0].id), dueSoonId);
    assert.equal(overview.pendingApprovals, 1);
    assert.equal(overview.pendingEvaluations, 1);
    assert.equal(
      overview.workload.some((row) => row.full_name === 'Staff One'),
      true
    );
    assert.equal(
      overview.needsAttention.some(
        (row) => String(row.id) === queueEvaluationId
      ),
      true
    );

    const staffOverview = await fixture.reports.overview(fixture.staff);
    assert.equal(staffOverview.pendingApprovals, 0);
    assert.equal(staffOverview.pendingEvaluations, 0);
  } finally {
    await fixture.db.close();
  }
});

test('my-work separates assigned parts, TEAM leadership, and proposed tasks', async () => {
  const fixture = await createFixture();
  try {
    const taskId = await createTeam(fixture, {
      title: 'Mine and lead',
      deadline: '2026-10-30',
      memberIds: [fixture.staff.id, fixture.staffTwo.id]
    });
    await setStatus(fixture.db, taskId, 'IN_PROGRESS');
    const draftId = await createTeam(fixture, {
      title: 'Proposed draft',
      deadline: '2026-10-30'
    });
    const myWork = await fixture.reports.myWork(fixture.staff);
    assert.equal(myWork.parts.length, 1);
    assert.equal(myWork.leading.length, 1);
    assert.equal(
      myWork.proposed.some((item) => item.id === draftId),
      true
    );
    assert.equal(myWork.leading[0].id, taskId);
  } finally {
    await fixture.db.close();
  }
});

test('report filters compose by deadline, status, type, and involved user; person report aggregates outcomes', async () => {
  const fixture = await createFixture();
  try {
    const first = await createTeam(fixture, {
      title: 'First task',
      deadline: '2026-10-25',
      memberIds: [fixture.staff.id, fixture.staffTwo.id]
    });
    const second = await fixture.tasks.createTask(fixture.manager, {
      taskType: 'DIRECT',
      title: 'Direct for staff two',
      deadline: '2026-11-05',
      leadId: fixture.staffTwo.id,
      members: [{ content: 'Complete work' }]
    });
    await fixture.db.query(
      "UPDATE tasks SET status = 'PASSED', eval_result = 'PASS' WHERE id = $1",
      [first]
    );
    await fixture.db.query(
      "UPDATE tasks SET status = 'FAILED', eval_result = 'FAIL', eval_comment = 'Needs work' WHERE id = $1",
      [second]
    );

    const filtered = await fixture.reports.taskReport(fixture.manager, {
      dateFrom: '2026-10-20',
      dateTo: '2026-10-31',
      statuses: ['PASSED'],
      taskType: 'TEAM',
      userId: fixture.staffTwo.id
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, first);
    assert.equal(filtered[0].eval_result, 'PASS');

    const people = await fixture.reports.peopleReport(fixture.manager, {
      dateFrom: '2026-10-20',
      dateTo: '2026-11-30'
    });
    const staffTwo = people.find(
      (person) => person.user_id === fixture.staffTwo.id
    );
    assert.ok(staffTwo);
    assert.equal(staffTwo?.passed, 1);
    assert.equal(staffTwo?.failed, 1);
    assert.equal(staffTwo?.led_failed, 1);
    const filteredPeople = await fixture.reports.peopleReport(fixture.manager, {
      dateFrom: '2026-10-20',
      dateTo: '2026-10-31',
      statuses: ['PASSED'],
      taskType: 'TEAM',
      userId: fixture.staffTwo.id
    });
    const filteredStaffTwo = filteredPeople.find(
      (person) => person.user_id === fixture.staffTwo.id
    );
    assert.equal(filteredStaffTwo?.passed, 1);
    assert.equal(filteredStaffTwo?.failed, 0);
  } finally {
    await fixture.db.close();
  }
});

test('report validates date/type/status input and authorization', async () => {
  const fixture = await createFixture();
  try {
    await assert.rejects(
      fixture.reports.taskReport(fixture.staff, { dateFrom: '2026-02-30' })
    );
    await assert.rejects(
      fixture.reports.taskReport(fixture.staff, {
        dateFrom: '2026-11-01',
        dateTo: '2026-10-01'
      })
    );
    await assert.rejects(
      fixture.reports.taskReport(fixture.admin, {
        taskType: 'UNKNOWN' as never
      })
    );
  } finally {
    await fixture.db.close();
  }
});

test('CSV is UTF-8 BOM, preserves Vietnamese labels, and neutralizes formula/control prefixes', async () => {
  const fixture = await createFixture();
  try {
    const taskId = await createTeam(fixture, {
      title: '=HYPERLINK("https://invalid")',
      deadline: '2026-10-30'
    });
    const rows = await fixture.reports.taskReport(fixture.staff);
    assert.equal(rows[0].id, taskId);
    const csv = buildTaskCsv(rows);
    const decoded = new TextDecoder().decode(csv);
    assert.deepEqual(Array.from(csv.slice(0, 3)), [0xef, 0xbb, 0xbf]);
    assert.equal(decoded.includes('Tên công việc'), true);
    assert.equal(decoded.includes("'=HYPERLINK"), true);
    assert.equal(decoded.includes('\r\n'), true);
    assert.equal(decoded.includes('https://invalid'), true);
    assert.equal(decoded.includes("\n'=HYPERLINK"), false);
  } finally {
    await fixture.db.close();
  }
});

test('people CSV has a UTF-8 BOM and neutralizes formula-like names', () => {
  const csv = buildPeopleCsv([
    {
      user_id: '1',
      full_name: '=HYPERLINK("x")',
      parts: 1,
      completed: 0,
      avg_progress: 12.5,
      passed: 0,
      failed: 0,
      overdue_parts: 0,
      led_total: 0,
      led_passed: 0,
      led_failed: 0
    }
  ]);
  assert.deepEqual(Array.from(csv.slice(0, 3)), [0xef, 0xbb, 0xbf]);
  assert.equal(new TextDecoder().decode(csv).includes("'=HYPERLINK"), true);
});
