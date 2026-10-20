import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDatabaseUrl } from './url';

test('database URL validation accepts PostgreSQL URLs and rejects invalid schemes or missing database', () => {
  assert.doesNotThrow(() =>
    validateDatabaseUrl('postgresql://user:pass@localhost:5432/appdb')
  );
  assert.doesNotThrow(() => validateDatabaseUrl('postgres://localhost/test'));
  assert.throws(() => validateDatabaseUrl('mysql://localhost/appdb'));
  assert.throws(() => validateDatabaseUrl('not a url'));
  assert.throws(() => validateDatabaseUrl('postgres://localhost/'));
});
