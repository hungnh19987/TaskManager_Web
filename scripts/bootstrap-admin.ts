import postgres from 'postgres';
import { passwords } from '../src/lib/server/auth/passwords';
import { bootstrapFirstAdmin } from '../src/lib/server/auth/bootstrap-admin';
import { createPostgresDatabase } from '../src/lib/server/db/postgres-adapter';
import { validateDatabaseUrl } from '../src/lib/server/db/url';

const databaseUrl = process.env.DATABASE_URL;
const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
const fullName = process.env.BOOTSTRAP_ADMIN_FULL_NAME;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!databaseUrl || !username || !fullName || !password) {
  console.error(
    'DATABASE_URL, BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_FULL_NAME and BOOTSTRAP_ADMIN_PASSWORD are required.'
  );
  process.exitCode = 1;
} else {
  try {
    validateDatabaseUrl(databaseUrl);
  } catch {
    console.error('DATABASE_URL must be a valid PostgreSQL connection URL.');
    process.exitCode = 1;
    process.exit();
  }
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5 });
  try {
    await bootstrapFirstAdmin(createPostgresDatabase(sql), passwords, {
      username,
      fullName,
      password
    });
    console.log(
      `Bootstrap ADMIN created for username: ${username.trim().toLowerCase()}`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Bootstrap failed.');
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
