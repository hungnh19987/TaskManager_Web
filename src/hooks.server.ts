import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { authService, SESSION_COOKIE } from '$lib/server/auth/runtime';
import { authorizePath } from '$lib/server/auth/route-policy';
import { securityHeaders } from '$lib/server/security/headers';

export const handle: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get(SESSION_COOKIE);
  event.locals.user = null;
  let sessionLookupSucceeded = false;

  if (token) {
    try {
      event.locals.user = await authService.getCurrentUser(token);
      sessionLookupSucceeded = true;
    } catch {
      // Preserve the cookie during a database outage; protected routes still fail closed.
    }
  }

  if (token && sessionLookupSucceeded && !event.locals.user) {
    event.cookies.delete(SESSION_COOKIE, { path: '/' });
  }

  const decision = authorizePath(event.url.pathname, event.locals.user);
  if ('redirectTo' in decision) redirect(303, decision.redirectTo);
  const response = await resolve(event);
  for (const [name, value] of Object.entries(
    securityHeaders(process.env.NODE_ENV === 'production')
  )) {
    response.headers.set(name, value);
  }
  return response;
};
