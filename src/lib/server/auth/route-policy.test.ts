import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizePath } from './route-policy';

test('anonymous users can reach login and health but protected routes redirect', () => {
  assert.deepEqual(authorizePath('/login', null), { allow: true });
  assert.deepEqual(authorizePath('/api/health', null), { allow: true });
  assert.deepEqual(authorizePath('/', null), { redirectTo: '/login' });
  assert.deepEqual(authorizePath('/tasks', null), { redirectTo: '/login' });
  assert.deepEqual(authorizePath('/account/password', null), {
    redirectTo: '/login'
  });
  assert.deepEqual(authorizePath('/admin/accounts', null), {
    redirectTo: '/login'
  });
});

test('only ADMIN can reach account management and signed-in users skip login', () => {
  assert.deepEqual(authorizePath('/login', { role: 'STAFF' }), {
    redirectTo: '/'
  });
  assert.deepEqual(authorizePath('/admin/accounts', { role: 'STAFF' }), {
    redirectTo: '/'
  });
  assert.deepEqual(authorizePath('/admin/accounts', { role: 'MANAGER' }), {
    redirectTo: '/'
  });
  assert.deepEqual(authorizePath('/admin/accounts', { role: 'ADMIN' }), {
    allow: true
  });
  assert.deepEqual(authorizePath('/account/password', { role: 'STAFF' }), {
    allow: true
  });
});
