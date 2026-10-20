import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { QueryExecutor, TransactionalDatabase } from '../db/transactional';
import { createLoginRateLimiter } from './login-rate-limit';

const migrationDirectory = resolve(process.cwd(), 'supabase/migrations');
const migrationFiles = (await readdir(migrationDirectory))
  .filter((file) => file.endsWith('.sql'))
  .sort();
const migrations = await Promise.all(
  migrationFiles.map((file) =>
    readFile(resolve(migrationDirectory, file), 'utf8')
  )
);

const fixture = async () => {
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
  let currentTime = new Date('2026-10-20T03:00:00.000Z');
  const limiter = createLoginRateLimiter(
    database,
    'test-only-secret-key-at-least-32-bytes',
    {
      maxAttempts: 3,
      windowSeconds: 60,
      blockSeconds: 120,
      now: () => currentTime
    }
  );
  return {
    db,
    limiter,
    advance: (seconds: number) => {
      currentTime = new Date(currentTime.getTime() + seconds * 1000);
    }
  };
};

test('rate limiter blocks after threshold, keeps independent client keys, expires blocks, and clears success', async () => {
  const { db, limiter, advance } = await fixture();
  try {
    assert.deepEqual(await limiter.status('person.one', '192.0.2.1'), {
      blocked: false,
      retryAfterSeconds: 0
    });
    assert.equal(
      (await limiter.recordAttempt('Person.One', '192.0.2.1')).blocked,
      false
    );
    assert.equal(
      (await limiter.recordAttempt('person.one', '192.0.2.1')).blocked,
      false
    );
    const blocked = await limiter.recordAttempt('person.one', '192.0.2.1');
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.retryAfterSeconds, 120);
    assert.equal(
      (await limiter.status('person.one', '192.0.2.1')).blocked,
      true
    );
    assert.equal(
      (await limiter.status('person.one', '192.0.2.2')).blocked,
      false
    );
    assert.equal(
      (await limiter.status('another.user', '192.0.2.1')).blocked,
      false
    );

    const stored = await db.query<{ key_hash: Uint8Array }>(
      'SELECT key_hash FROM login_rate_limits'
    );
    assert.equal(
      Buffer.from(stored.rows[0].key_hash).toString().includes('person.one'),
      false
    );

    advance(121);
    assert.equal(
      (await limiter.status('person.one', '192.0.2.1')).blocked,
      false
    );
    await limiter.recordAttempt('person.one', '192.0.2.1');
    await limiter.clear('person.one', '192.0.2.1');
    assert.equal(
      (await limiter.status('person.one', '192.0.2.1')).blocked,
      false
    );
  } finally {
    await db.close();
  }
});

test('rate limiter rejects weak HMAC secrets', async () => {
  const { db } = await fixture();
  try {
    assert.throws(() =>
      createLoginRateLimiter(
        {
          query: async () => ({ rows: [] }),
          transaction: async <Result>(
            callback: (tx: QueryExecutor) => Promise<Result>
          ) => callback({ query: async () => ({ rows: [] }) })
        },
        'short'
      )
    );
  } finally {
    await db.close();
  }
});

test('per-IP bucket blocks attempts that rotate usernames without blocking another IP', async () => {
  const { db, limiter } = await fixture();
  try {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await limiter.recordAttempt(`guessed-${attempt}`, '198.51.100.10');
    }
    assert.equal(
      (await limiter.status('new-guess', '198.51.100.10')).blocked,
      true
    );
    assert.equal(
      (await limiter.status('new-guess', '198.51.100.11')).blocked,
      false
    );
  } finally {
    await db.close();
  }
});

test('concurrent login attempts cannot pass the same stale rate-limit check', async () => {
  const { db, limiter } = await fixture();
  try {
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () =>
        limiter.recordAttempt('parallel.user', '203.0.113.20')
      )
    );
    assert.equal(outcomes.filter((result) => result.blocked).length, 3);
    assert.equal(
      (await limiter.status('parallel.user', '203.0.113.20')).blocked,
      true
    );
  } finally {
    await db.close();
  }
});
