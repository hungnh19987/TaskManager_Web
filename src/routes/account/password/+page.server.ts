import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  actionErrorMessage,
  requireSameOrigin
} from '$lib/server/auth/action-guards';
import { authService, SESSION_COOKIE } from '$lib/server/auth/runtime';

export const load: PageServerLoad = ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  return {};
};

export const actions: Actions = {
  default: async ({ cookies, locals, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    const form = await request.formData();
    const newPassword = String(form.get('newPassword') ?? '');
    if (newPassword !== String(form.get('confirmPassword') ?? '')) {
      return fail(400, {
        message: 'Mật khẩu mới và xác nhận mật khẩu không khớp.'
      });
    }
    try {
      await authService.changePassword(
        locals.user.id,
        String(form.get('currentPassword') ?? ''),
        newPassword
      );
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
    cookies.delete(SESSION_COOKIE, { path: '/' });
    redirect(303, '/login?changed=1');
  }
};
