import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { resolve } from 'node:path';
import argon2 from 'argon2';
import { PGlite } from '@electric-sql/pglite';
import type {
  QueryExecutor,
  TransactionalDatabase
} from '../src/lib/server/db/transactional';
import { bootstrapFirstAdmin } from '../src/lib/server/auth/bootstrap-admin';

const migrationDirectory = resolve(process.cwd(), 'supabase/migrations');
const migrationFiles = (await readdir(migrationDirectory))
  .filter((file) => file.endsWith('.sql'))
  .sort();
const migrations = await Promise.all(
  migrationFiles.map((file) =>
    readFile(resolve(migrationDirectory, file), 'utf8')
  )
);

test(
  'bootstrap first administrator stores Argon2id and guard prevents a second active admin',
  { timeout: 60_000 },
  async () => {
    const db = new PGlite();
    try {
      for (const migration of migrations) await db.exec(migration);
      const database: TransactionalDatabase = {
        query: async <Row extends Record<string, unknown>>(
          statement: string,
          parameters: readonly unknown[] = []
        ) => ({
          rows: (await db.query(statement, [...parameters])).rows as Row[]
        }),
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
      const passwordCodec = {
        hash: (password: string) =>
          argon2.hash(password, { type: argon2.argon2id }),
        verify: (hash: string, password: string) =>
          argon2.verify(hash, password)
      };
      await bootstrapFirstAdmin(database, passwordCodec, {
        username: 'First.Admin',
        fullName: 'First Admin',
        password: 'one-time-bootstrap-password'
      });
      const row = await db.query<{ password_hash: string }>(
        "SELECT password_hash FROM users WHERE username = 'first.admin'"
      );
      assert.equal(
        await argon2.verify(
          row.rows[0].password_hash,
          'one-time-bootstrap-password'
        ),
        true
      );
      const account = await db.query<{ id: number }>(
        "SELECT id FROM users WHERE username = 'first.admin'"
      );
      const logs = await db.query<{ action: string }>(
        'SELECT action FROM account_logs WHERE target_user_id = $1',
        [account.rows[0].id]
      );
      assert.deepEqual(
        logs.rows.map((entry) => entry.action),
        ['ACCOUNT_CREATED']
      );
      await assert.rejects(
        bootstrapFirstAdmin(database, passwordCodec, {
          username: 'second.admin',
          fullName: 'Second Admin',
          password: 'another-bootstrap-password'
        }),
        /An active ADMIN already exists/
      );
      const admins = await db.query(
        "SELECT id FROM users WHERE role = 'ADMIN' AND is_active = true"
      );
      assert.equal(admins.rows.length, 1);
    } finally {
      await db.close();
    }
  }
);
