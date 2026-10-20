import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { resolve } from 'node:path';
import argon2 from 'argon2';
import { PGlite } from '@electric-sql/pglite';
import type { QueryExecutor, TransactionalDatabase } from '../db/transactional';
import { AuthError, createAuthService } from './service';

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
      db.transaction(async (transaction) =>
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
  const passwords = {
    hash: (password: string) =>
      argon2.hash(password, { type: argon2.argon2id }),
    verify: (hash: string, password: string) => argon2.verify(hash, password)
  };
  let currentTime = new Date('2026-10-20T03:00:00.000Z');
  let tokenSequence = 0;
  const service = createAuthService({
    database,
    passwords,
    now: () => currentTime,
    createToken: () => `test-token-${++tokenSequence}`
  });
  const passwordHash = await passwords.hash('initial-password-123');
  await db.query(
    `INSERT INTO users (username, full_name, password_hash, role)
     VALUES ('admin.one', 'Admin One', $1, 'ADMIN'),
            ('staff.one', 'Staff One', $1, 'STAFF'),
            ('admin.two', 'Admin Two', $1, 'ADMIN')`,
    [passwordHash]
  );
  return { db, service, setCurrentTime: (time: Date) => (currentTime = time) };
};

const userId = async (db: PGlite, username: string): Promise<string> => {
  const result = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE username = $1',
    [username]
  );
  return result.rows[0].id;
};

test('login rejects wrong credentials and returns a sanitized user with opaque session', async () => {
  const { db, service } = await createFixture();
  try {
    await assert.rejects(
      service.login('admin.one', 'incorrect-password'),
      (error: unknown) => {
        assert.ok(error instanceof AuthError);
        assert.equal(error.code, 'INVALID_CREDENTIALS');
        return true;
      }
    );
    await assert.rejects(
      service.login('missing.user', 'incorrect-password'),
      (error: unknown) => {
        assert.ok(error instanceof AuthError);
        assert.equal(error.code, 'INVALID_CREDENTIALS');
        return true;
      }
    );

    const result = await service.login(' ADMIN.ONE ', 'initial-password-123');
    assert.equal(result.user.username, 'admin.one');
    assert.equal('password_hash' in result.user, false);
    assert.equal(result.token.startsWith('test-token-'), true);
    assert.deepEqual(await service.getCurrentUser(result.token), result.user);

    const rows = await db.query<{ token_hash: Uint8Array }>(
      'SELECT token_hash FROM sessions'
    );
    assert.notEqual(
      Buffer.from(rows.rows[0].token_hash).toString('hex'),
      result.token
    );
  } finally {
    await db.close();
  }
});

test('inactive accounts and auth_version changes invalidate existing sessions', async () => {
  const { db, service } = await createFixture();
  try {
    const staffId = await userId(db, 'staff.one');
    const login = await service.login('staff.one', 'initial-password-123');
    assert.ok(await service.getCurrentUser(login.token));

    await service.setActive(await userId(db, 'admin.one'), staffId, false);
    assert.equal(await service.getCurrentUser(login.token), null);
    await assert.rejects(service.login('staff.one', 'initial-password-123'));

    await service.setActive(await userId(db, 'admin.one'), staffId, true);
    await db.query(
      'UPDATE users SET auth_version = auth_version + 1 WHERE id = $1',
      [staffId]
    );
    assert.equal(await service.getCurrentUser(login.token), null);
  } finally {
    await db.close();
  }
});

test('logout revokes the token and expired sessions are rejected', async () => {
  const { db, service, setCurrentTime } = await createFixture();
  try {
    const revoked = await service.login('staff.one', 'initial-password-123');
    await service.revokeSession(revoked.token);
    assert.equal(await service.getCurrentUser(revoked.token), null);

    const expires = await service.login('staff.one', 'initial-password-123');
    setCurrentTime(new Date('2026-10-20T15:00:01.000Z'));
    assert.equal(await service.getCurrentUser(expires.token), null);
  } finally {
    await db.close();
  }
});

test('password change verifies current password and revokes all sessions', async () => {
  const { db, service } = await createFixture();
  try {
    const staffId = await userId(db, 'staff.one');
    const first = await service.login('staff.one', 'initial-password-123');
    const second = await service.login('staff.one', 'initial-password-123');

    await assert.rejects(
      service.changePassword(
        staffId,
        'wrong-current-password',
        'new-password-456'
      )
    );
    assert.ok(await service.getCurrentUser(first.token));

    await service.changePassword(
      staffId,
      'initial-password-123',
      'new-password-456'
    );
    assert.equal(await service.getCurrentUser(first.token), null);
    assert.equal(await service.getCurrentUser(second.token), null);
    await assert.rejects(service.login('staff.one', 'initial-password-123'));
    assert.equal(
      (await service.login('staff.one', 'new-password-456')).user.id,
      staffId
    );

    const logs = await db.query<{ action: string }>(
      'SELECT action FROM account_logs WHERE target_user_id = $1',
      [staffId]
    );
    assert.deepEqual(
      logs.rows.map((row) => row.action),
      ['PASSWORD_CHANGED']
    );
  } finally {
    await db.close();
  }
});

test('ADMIN account operations enforce roles and revoke sessions after reset', async () => {
  const { db, service } = await createFixture();
  try {
    const adminId = await userId(db, 'admin.one');
    const staffId = await userId(db, 'staff.one');
    const staffSession = await service.login(
      'staff.one',
      'initial-password-123'
    );

    await assert.rejects(service.listAccounts(staffId), (error: unknown) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.code, 'FORBIDDEN');
      return true;
    });
    await assert.rejects(
      service.createAccount(staffId, {
        username: 'new.staff',
        fullName: 'New Staff',
        password: 'temporary-password-123',
        role: 'STAFF'
      })
    );

    await service.createAccount(adminId, {
      username: 'new.staff',
      fullName: 'New Staff',
      password: 'temporary-password-123',
      role: 'STAFF'
    });
    assert.equal((await service.listAccounts(adminId)).length, 4);

    await service.resetPassword(adminId, staffId, 'reset-password-123');
    assert.equal(await service.getCurrentUser(staffSession.token), null);
    await assert.rejects(service.login('staff.one', 'initial-password-123'));
    assert.equal(
      (await service.login('staff.one', 'reset-password-123')).user.id,
      staffId
    );

    await service.setRole(adminId, staffId, 'MANAGER');
    const changedRole = await service.login('staff.one', 'reset-password-123');
    assert.equal(changedRole.user.role, 'MANAGER');
    assert.equal(
      await service
        .getCurrentUser(
          (await service.login('admin.two', 'initial-password-123')).token
        )
        .then((user) => user?.role),
      'ADMIN'
    );

    const logs = await db.query<{ action: string }>(
      'SELECT action FROM account_logs WHERE target_user_id = $1 ORDER BY id',
      [staffId]
    );
    assert.deepEqual(
      logs.rows.map((row) => row.action),
      ['PASSWORD_RESET', 'ROLE_CHANGED']
    );
  } finally {
    await db.close();
  }
});

test('cannot self-lock or deactivate the last active ADMIN, and rollback leaves account unchanged', async () => {
  const { db, service } = await createFixture();
  try {
    const adminId = await userId(db, 'admin.one');
    const secondAdminId = await userId(db, 'admin.two');

    await assert.rejects(
      service.setActive(adminId, adminId, false),
      (error: unknown) => {
        assert.ok(error instanceof AuthError);
        assert.equal(error.code, 'SELF_LOCK');
        return true;
      }
    );

    await service.setActive(adminId, secondAdminId, false);
    await assert.rejects(
      service.setRole(adminId, adminId, 'STAFF'),
      (error: unknown) => {
        assert.ok(error instanceof AuthError);
        assert.equal(error.code, 'LAST_ADMIN');
        return true;
      }
    );
    await assert.rejects(
      service.setActive(adminId, adminId, false),
      (error: unknown) => {
        assert.ok(error instanceof AuthError);
        assert.equal(error.code, 'SELF_LOCK');
        return true;
      }
    );

    const remaining = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM users WHERE role = 'ADMIN' AND is_active = true"
    );
    assert.equal(remaining.rows[0].count, 1);
    const actorStillActive = await db.query<{
      is_active: boolean;
      role: string;
    }>('SELECT is_active, role FROM users WHERE id = $1', [adminId]);
    assert.equal(actorStillActive.rows[0].is_active, true);
    assert.equal(actorStillActive.rows[0].role, 'ADMIN');
    const audit = await db.query<{ action: string }>(
      'SELECT action FROM account_logs WHERE target_user_id = $1 ORDER BY id',
      [adminId]
    );
    assert.deepEqual(
      audit.rows.map((row) => row.action),
      []
    );
  } finally {
    await db.close();
  }
});

test('concurrent demotions cannot remove every active ADMIN', async () => {
  const { db, service } = await createFixture();
  try {
    const firstAdmin = await userId(db, 'admin.one');
    const secondAdmin = await userId(db, 'admin.two');
    const outcomes = await Promise.allSettled([
      service.setRole(firstAdmin, secondAdmin, 'STAFF'),
      service.setRole(secondAdmin, firstAdmin, 'STAFF')
    ]);

    assert.equal(
      outcomes.filter((outcome) => outcome.status === 'fulfilled').length,
      1
    );
    const remaining = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM users WHERE role = 'ADMIN' AND is_active = true"
    );
    assert.equal(remaining.rows[0].count, 1);
  } finally {
    await db.close();
  }
});

test('username and password validation runs before account mutation', async () => {
  const { db, service } = await createFixture();
  try {
    const adminId = await userId(db, 'admin.one');
    await assert.rejects(
      service.createAccount(adminId, {
        username: 'Invalid Name',
        fullName: 'Invalid',
        password: 'long-enough-password',
        role: 'STAFF'
      }),
      (error: unknown) =>
        error instanceof AuthError && error.code === 'VALIDATION'
    );
    await assert.rejects(
      service.createAccount(adminId, {
        username: 'valid.user',
        fullName: 'Valid User',
        password: 'short',
        role: 'STAFF'
      }),
      (error: unknown) =>
        error instanceof AuthError && error.code === 'VALIDATION'
    );
    const count = await db.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM users'
    );
    assert.equal(count.rows[0].count, 3);
  } finally {
    await db.close();
  }
});
