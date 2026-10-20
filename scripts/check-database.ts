import postgres from 'postgres';
import { validateDatabaseUrl } from '../src/lib/server/db/url';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required.');
  process.exitCode = 1;
} else {
  try {
    validateDatabaseUrl(url);
  } catch {
    console.error('DATABASE_URL must be a valid PostgreSQL connection URL.');
    process.exitCode = 1;
  }
  if (process.exitCode) process.exit();
  const sql = postgres(url, { max: 1, connect_timeout: 5 });
  try {
    await sql`SELECT 1`;
    console.log('Database connection: OK');
  } catch {
    console.error(
      'Database connection: unavailable. Check DATABASE_URL and database access.'
    );
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
