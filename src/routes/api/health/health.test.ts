import assert from 'node:assert/strict';
import test from 'node:test';
import { createHealthResponse } from '../../../lib/server/db/health-response';

test('health response returns a safe healthy response', async () => {
  const response = await createHealthResponse(async () => ({ ok: true }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', database: 'ok' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('health response does not disclose database errors', async () => {
  const response = await createHealthResponse(async () => ({
    ok: false,
    message: 'private connection detail'
  }));
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.deepEqual(JSON.parse(body), {
    status: 'degraded',
    database: 'unavailable'
  });
  assert.equal(body.includes('private connection detail'), false);
});
