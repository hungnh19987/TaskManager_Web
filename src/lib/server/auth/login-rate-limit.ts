import { createHmac } from 'node:crypto';
import type { QueryExecutor, TransactionalDatabase } from '../db/transactional';

export type LoginLimitStatus = { blocked: boolean; retryAfterSeconds: number };

type LimitRow = { attempts: number; blocked_until: Date | string | null };
type Bucket = { digest: Buffer; maxAttempts: number };

export const createLoginRateLimiter = (
  database: TransactionalDatabase,
  secret: string,
  options: {
    maxAttempts?: number;
    ipMaxAttempts?: number;
    windowSeconds?: number;
    blockSeconds?: number;
    now?: () => Date;
  } = {}
) => {
  if (Buffer.byteLength(secret) < 32) {
    throw new Error('Login rate limit key must be at least 32 bytes.');
  }
  const maxAttempts = options.maxAttempts ?? 5;
  const ipMaxAttempts = options.ipMaxAttempts ?? 20;
  const windowSeconds = options.windowSeconds ?? 15 * 60;
  const blockSeconds = options.blockSeconds ?? 15 * 60;
  const now = options.now ?? (() => new Date());
  if (
    maxAttempts < 1 ||
    ipMaxAttempts < maxAttempts ||
    windowSeconds < 1 ||
    blockSeconds < 1
  ) {
    throw new Error('Login rate limit options are invalid.');
  }

  const digest = (scope: string, value: string): Buffer =>
    createHmac('sha256', secret).update(`${scope}\0${value}`).digest();

  const bucketsFor = (username: string, clientAddress: string): Bucket[] => {
    const normalized = username.trim().toLowerCase().slice(0, 128);
    const address = clientAddress.trim().slice(0, 128) || 'unknown';
    return [
      {
        digest: digest('identity-ip', `${address}\0${normalized}`),
        maxAttempts
      },
      { digest: digest('ip', address), maxAttempts: ipMaxAttempts }
    ];
  };

  const blockedStatus = async (
    executor: QueryExecutor,
    buckets: Bucket[]
  ): Promise<LoginLimitStatus> => {
    let retryAfterSeconds = 0;
    for (const bucket of buckets) {
      const { rows } = await executor.query<LimitRow>(
        'SELECT attempts, blocked_until FROM login_rate_limits WHERE key_hash = $1',
        [bucket.digest]
      );
      const blockedUntil = rows[0]?.blocked_until
        ? new Date(rows[0].blocked_until).getTime()
        : 0;
      retryAfterSeconds = Math.max(
        retryAfterSeconds,
        Math.ceil((blockedUntil - now().getTime()) / 1000)
      );
    }
    return {
      blocked: retryAfterSeconds > 0,
      retryAfterSeconds: Math.max(0, retryAfterSeconds)
    };
  };

  const status = async (
    username: string,
    clientAddress: string
  ): Promise<LoginLimitStatus> =>
    blockedStatus(database, bucketsFor(username, clientAddress));

  const incrementBucket = async (
    executor: QueryExecutor,
    bucket: Bucket,
    timestamp: Date
  ): Promise<void> => {
    await executor.query(
      `INSERT INTO login_rate_limits (key_hash, window_started_at, attempts, blocked_until, updated_at)
       VALUES ($1, $2, 1, NULL, $2)
       ON CONFLICT (key_hash) DO UPDATE SET
         window_started_at = CASE
           WHEN login_rate_limits.window_started_at <= $2 - make_interval(secs => $3)
           THEN $2 ELSE login_rate_limits.window_started_at END,
         attempts = CASE
           WHEN login_rate_limits.window_started_at <= $2 - make_interval(secs => $3)
           THEN 1 ELSE login_rate_limits.attempts + 1 END,
         blocked_until = CASE
           WHEN login_rate_limits.blocked_until > $2 THEN login_rate_limits.blocked_until
           WHEN (CASE
             WHEN login_rate_limits.window_started_at <= $2 - make_interval(secs => $3)
             THEN 1 ELSE login_rate_limits.attempts + 1 END) >= $4
           THEN $2 + make_interval(secs => $5) ELSE NULL END,
         updated_at = $2`,
      [
        bucket.digest,
        timestamp,
        windowSeconds,
        bucket.maxAttempts,
        blockSeconds
      ]
    );
  };

  const recordAttempt = async (
    username: string,
    clientAddress: string
  ): Promise<LoginLimitStatus> => {
    const buckets = bucketsFor(username, clientAddress);
    const timestamp = now();
    return database.transaction(async (transaction) => {
      for (const bucket of buckets)
        await incrementBucket(transaction, bucket, timestamp);
      return blockedStatus(transaction, buckets);
    });
  };

  const clear = async (
    username: string,
    clientAddress: string
  ): Promise<void> => {
    const [identityBucket] = bucketsFor(username, clientAddress);
    await database.query('DELETE FROM login_rate_limits WHERE key_hash = $1', [
      identityBucket.digest
    ]);
  };

  const prune = async (): Promise<void> => {
    await database.query(
      "DELETE FROM login_rate_limits WHERE updated_at < $1 - interval '1 day'",
      [now()]
    );
  };

  return { status, recordAttempt, clear, prune };
};
