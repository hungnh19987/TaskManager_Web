import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { requireSameOrigin } from '$lib/server/auth/action-guards';
import { authService, SESSION_COOKIE } from '$lib/server/auth/runtime';
import { reportService } from '$lib/server/reports/runtime';

export const load = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  return {
    overview: await reportService.overview(locals.user),
    currentUser: locals.user
  };
};

export const actions: Actions = {
  logout: async ({ cookies, request, url }) => {
    requireSameOrigin(request, url);
    const token = cookies.get(SESSION_COOKIE);
    if (token) await authService.revokeSession(token);
    cookies.delete(SESSION_COOKIE, { path: '/' });
    redirect(303, '/login');
  }
};
