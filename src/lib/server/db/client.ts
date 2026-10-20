import { env } from '$env/dynamic/private';
import postgres, { type Sql } from 'postgres';
import { validateDatabaseUrl } from './url';

let client: Sql | undefined;

export const getDatabase = (): Sql => {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  validateDatabaseUrl(env.DATABASE_URL);
  client ??= postgres(env.DATABASE_URL, {
    max: 5,
    connect_timeout: 5,
    idle_timeout: 20
  });
  return client;
};

export const closeDatabase = async (): Promise<void> => {
  if (!client) return;
  const current = client;
  client = undefined;
  await current.end();
};
