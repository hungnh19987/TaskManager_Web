import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  actionErrorMessage,
  requireSameOrigin
} from '$lib/server/auth/action-guards';
import {
  authService,
  loginRateLimiter,
  SESSION_COOKIE,
  sessionCookieOptions
} from '$lib/server/auth/runtime';

export const load: PageServerLoad = ({ locals, url }) => {
  if (locals.user) redirect(303, '/');
  return { passwordChanged: url.searchParams.get('changed') === '1' };
};

export const actions: Actions = {
  default: async ({ cookies, request, url, getClientAddress, setHeaders }) => {
    requireSameOrigin(request, url);
    const form = await request.formData();
    const username = String(form.get('username') ?? '');
    const password = String(form.get('password') ?? '');
    let clientAddress = 'unknown';
    try {
      clientAddress = getClientAddress();
    } catch {
      clientAddress = 'unknown';
    }
    try {
      const limit = await loginRateLimiter.recordAttempt(
        username,
        clientAddress
      );
      if (limit.blocked) {
        setHeaders({ 'retry-after': String(limit.retryAfterSeconds) });
        return fail(429, {
          message:
            'Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa.'
        });
      }
      const result = await authService.login(username, password);
      await loginRateLimiter.clear(username, clientAddress);
      cookies.set(SESSION_COOKIE, result.token, {
        ...sessionCookieOptions,
        expires: result.expiresAt
      });
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
    redirect(303, '/');
  }
};
