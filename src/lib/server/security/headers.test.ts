import assert from 'node:assert/strict';
import test from 'node:test';
import { securityHeaders } from './headers';

test('security headers include baseline protections and production-only HSTS', () => {
  const development = securityHeaders(false);
  assert.equal(development['x-content-type-options'], 'nosniff');
  assert.equal(development['x-frame-options'], 'DENY');
  assert.equal(
    development['referrer-policy'],
    'strict-origin-when-cross-origin'
  );
  assert.equal('strict-transport-security' in development, false);

  const production = securityHeaders(true);
  assert.equal(
    production['strict-transport-security'],
    'max-age=31536000; includeSubDomains'
  );
});
