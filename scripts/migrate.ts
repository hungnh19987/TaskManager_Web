import { readdir, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
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
    process.exit();
  }
  const sql = postgres(url, { max: 1, connect_timeout: 5 });
  try {
    await sql`
			CREATE TABLE IF NOT EXISTS schema_migrations (
				version text PRIMARY KEY,
				applied_at timestamptz NOT NULL DEFAULT now()
			)
		`;
    const directory = resolve(process.cwd(), 'supabase/migrations');
    const files = (await readdir(directory))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const version = basename(file, '.sql');
      const [applied] = await sql<{ version: string }[]>`
				SELECT version FROM schema_migrations WHERE version = ${version}
			`;
      if (applied) continue;

      const migration = await readFile(resolve(directory, file), 'utf8');
      await sql.begin(async (transaction) => {
        await transaction.unsafe(migration);
        await transaction`
					INSERT INTO schema_migrations (version) VALUES (${version})
					ON CONFLICT (version) DO NOTHING
				`;
      });
      console.log(`Applied ${version}`);
    }
    console.log('Migrations are up to date.');
  } catch {
    console.error('Migration failed. Check database access and migration SQL.');
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
