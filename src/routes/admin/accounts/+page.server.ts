import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  actionErrorMessage,
  requireSameOrigin
} from '$lib/server/auth/action-guards';
import { authService } from '$lib/server/auth/runtime';
import type { Role } from '$lib/server/auth/service';

const requireAdmin = (role: string | undefined): void => {
  if (role !== 'ADMIN') redirect(303, '/');
};

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  requireAdmin(locals.user.role);
  return {
    accounts: await authService.listAccounts(locals.user.id),
    currentUserId: locals.user.id
  };
};

export const actions: Actions = {
  create: async ({ locals, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    requireAdmin(locals.user.role);
    const form = await request.formData();
    try {
      await authService.createAccount(locals.user.id, {
        username: String(form.get('username') ?? ''),
        fullName: String(form.get('fullName') ?? ''),
        password: String(form.get('password') ?? ''),
        role: String(form.get('role') ?? '') as Role
      });
      return { success: 'Đã tạo tài khoản.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  resetPassword: async ({ locals, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    requireAdmin(locals.user.role);
    const form = await request.formData();
    try {
      await authService.resetPassword(
        locals.user.id,
        String(form.get('targetId') ?? ''),
        String(form.get('password') ?? '')
      );
      return { success: 'Đã đặt lại mật khẩu và thu hồi các phiên cũ.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  setRole: async ({ locals, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    requireAdmin(locals.user.role);
    const form = await request.formData();
    try {
      await authService.setRole(
        locals.user.id,
        String(form.get('targetId') ?? ''),
        String(form.get('role') ?? '') as Role
      );
      return {
        success: 'Đã cập nhật vai trò; phiên cũ của tài khoản đã bị thu hồi.'
      };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  setActive: async ({ locals, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    requireAdmin(locals.user.role);
    const form = await request.formData();
    const activeValue = form.get('active');
    if (activeValue !== 'true' && activeValue !== 'false') {
      return fail(400, { message: 'Trạng thái tài khoản không hợp lệ.' });
    }
    try {
      await authService.setActive(
        locals.user.id,
        String(form.get('targetId') ?? ''),
        activeValue === 'true'
      );
      return { success: 'Đã cập nhật trạng thái tài khoản.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  }
};
