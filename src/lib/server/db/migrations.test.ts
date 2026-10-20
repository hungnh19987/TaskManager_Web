import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { basename, resolve } from 'node:path';
import argon2 from 'argon2';
import { PGlite } from '@electric-sql/pglite';
import { seedDemoAdmin } from './demo-seed';

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

const applyMigrations = async (db: PGlite) => {
  for (const migration of migrations) await db.exec(migration.sql);
};

test(
  'foundation migration applies repeatedly and enforces constraints',
  { timeout: 20_000 },
  async () => {
    const db = new PGlite();
    try {
      await applyMigrations(db);
      await applyMigrations(db);
      const tables = await db.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
      );
      assert.deepEqual(tables.rows.map((row) => row.table_name).sort(), [
        'account_admin_guard',
        'account_logs',
        'login_rate_limits',
        'schema_migrations',
        'sessions',
        'task_logs',
        'task_members',
        'tasks',
        'users'
      ]);
      const { rows: admins } = await db.query<{ id: number }>(
        "INSERT INTO users (username, full_name, password_hash, role) VALUES ('admin.one', 'Admin', 'hash', 'ADMIN') RETURNING id"
      );
      await db.query(
        "INSERT INTO account_logs (actor_id, target_user_id, action) VALUES ($1, $1, 'PASSWORD_CHANGED')",
        [admins[0].id]
      );
      await assert.rejects(
        db.query("UPDATE account_logs SET action = 'PASSWORD_RESET'")
      );
      await db.query(
        "INSERT INTO users (username, full_name, password_hash, role) VALUES ('demo.admin', 'Admin', 'hash', 'ADMIN')"
      );
      await assert.rejects(
        db.query(
          "INSERT INTO users (username, full_name, password_hash, role) VALUES ('Demo.Admin', 'Admin', 'hash', 'ADMIN')"
        )
      );
    } finally {
      await db.close();
    }
  }
);

test(
  'task migration is repeatable and keeps task logs append-only',
  { timeout: 20_000 },
  async () => {
    const db = new PGlite();
    try {
      await applyMigrations(db);
      await applyMigrations(db);
      const { rows: userRows } = await db.query<{ id: number }>(
        "INSERT INTO users (username, full_name, password_hash, role) VALUES ('manager.test', 'Manager Test', 'hash', 'MANAGER') RETURNING id"
      );
      const { rows: taskRows } = await db.query<{ id: number }>(
        `INSERT INTO tasks (title, task_type, status, proposer_id, lead_id, deadline)
       VALUES ('Migration check', 'TEAM', 'DRAFT', $1, $1, '2026-10-30') RETURNING id`,
        [userRows[0].id]
      );
      await db.query(
        "INSERT INTO task_logs (task_id, actor_id, action) VALUES ($1, $2, 'TASK_CREATED')",
        [taskRows[0].id, userRows[0].id]
      );
      await assert.rejects(
        db.query("UPDATE task_logs SET action = 'TAMPERED'")
      );
    } finally {
      await db.close();
    }
  }
);

test(
  'workflow migration requires a result report at 100 percent',
  { timeout: 20_000 },
  async () => {
    const db = new PGlite();
    try {
      await applyMigrations(db);
      const { rows: users } = await db.query<{ id: number }>(
        `INSERT INTO users (username, full_name, password_hash, role)
         VALUES ('lead.test', 'Lead Test', 'hash', 'STAFF') RETURNING id`
      );
      const { rows: tasks } = await db.query<{ id: number }>(
        `INSERT INTO tasks (title, task_type, status, proposer_id, lead_id, deadline)
         VALUES ('Workflow check', 'TEAM', 'IN_PROGRESS', $1, $1, '2026-10-30') RETURNING id`,
        [users[0].id]
      );
      const { rows: members } = await db.query<{ id: number }>(
        `INSERT INTO task_members (task_id, user_id, content, progress)
         VALUES ($1, $2, 'Task part', 0) RETURNING id`,
        [tasks[0].id, users[0].id]
      );
      await assert.rejects(
        db.query('UPDATE task_members SET progress = 100 WHERE id = $1', [
          members[0].id
        ])
      );
      await db.query(
        "UPDATE task_members SET progress = 100, result_report = 'Completed' WHERE id = $1",
        [members[0].id]
      );
    } finally {
      await db.close();
    }
  }
);

test(
  'demo seed hashes the provided password and is idempotent',
  { timeout: 20_000 },
  async () => {
    const db = new PGlite();
    try {
      await applyMigrations(db);
      const insertIfAbsent = async (passwordHash: string) => {
        await db.query(
          `INSERT INTO users (username, full_name, password_hash, role)
					 VALUES ('demo.admin', 'Demo Administrator', $1, 'ADMIN')
					 ON CONFLICT (username) DO NOTHING`,
          [passwordHash]
        );
      };
      await seedDemoAdmin(insertIfAbsent, 'local-demo-password-123');
      const first = await db.query<{ password_hash: string }>(
        "SELECT password_hash FROM users WHERE username = 'demo.admin'"
      );
      assert.notEqual(first.rows[0].password_hash, 'local-demo-password-123');
      assert.equal(
        await argon2.verify(
          first.rows[0].password_hash,
          'local-demo-password-123'
        ),
        true
      );

      await seedDemoAdmin(insertIfAbsent, 'another-local-password-456');
      const second = await db.query<{ password_hash: string }>(
        "SELECT password_hash FROM users WHERE username = 'demo.admin'"
      );
      assert.equal(second.rows[0].password_hash, first.rows[0].password_hash);
    } finally {
      await db.close();
    }
  }
);
