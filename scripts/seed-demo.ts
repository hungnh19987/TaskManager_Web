import postgres from 'postgres';
import { seedDemoAdmin } from '../src/lib/server/db/demo-seed';
import { validateDatabaseUrl } from '../src/lib/server/db/url';

const url = process.env.DATABASE_URL;
const password = process.env.DEMO_ADMIN_PASSWORD;
if (!url || !password) {
  console.error(
    'DATABASE_URL and DEMO_ADMIN_PASSWORD are required; no default password is provided.'
  );
  process.exitCode = 1;
} else if (password.length < 12) {
  console.error('DEMO_ADMIN_PASSWORD must contain at least 12 characters.');
  process.exitCode = 1;
} else {
  try {
    validateDatabaseUrl(url);
  } catch {
    console.error('DATABASE_URL must be a valid PostgreSQL connection URL.');
    process.exitCode = 1;
    process.exit();
  }
  const sql = postgres(url, { max: 1, connect_timeout: 5 });
  try {
    await seedDemoAdmin(async (passwordHash) => {
      await sql`
				INSERT INTO users (username, full_name, password_hash, role)
				VALUES ('demo.admin', 'Demo Administrator', ${passwordHash}, 'ADMIN')
				ON CONFLICT (username) DO NOTHING
			`;
    }, password);
    console.log(
      'Demo admin seed complete (existing account was left unchanged).'
    );
  } catch {
    console.error(
      'Seed failed. Confirm migrations are applied and database is reachable.'
    );
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
