import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  actionErrorMessage,
  requireSameOrigin
} from '$lib/server/auth/action-guards';
import { taskService } from '$lib/server/tasks/runtime';
import { TaskError, type EvaluationResult } from '$lib/server/tasks/service';

const value = (form: FormData, key: string): string => {
  const field = form.get(key);
  return typeof field === 'string' ? field : '';
};

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) redirect(303, '/login');
  const [task, people, logs] = await Promise.all([
    taskService.getTask(locals.user, params.taskId),
    taskService.listAssignableUsers(locals.user),
    taskService.getTaskLogs(locals.user, params.taskId)
  ]);
  return { task, people, logs, currentUser: locals.user };
};

export const actions: Actions = {
  update: async ({ locals, params, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    const form = await request.formData();
    try {
      await taskService.updateTask(locals.user, params.taskId, {
        title: value(form, 'title'),
        description: value(form, 'description') || null,
        deadline: value(form, 'deadline'),
        leadId: value(form, 'leadId') || null
      });
      return { success: 'Đã lưu thông tin công việc.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  addMember: async ({ locals, params, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    const form = await request.formData();
    try {
      await taskService.addMember(locals.user, params.taskId, {
        userId: value(form, 'userId'),
        content: value(form, 'content'),
        quantity: value(form, 'quantity') || null,
        unit: value(form, 'unit') || null
      });
      return { success: 'Đã thêm phần việc.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  addMembersBulk: async ({ locals, params, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    const form = await request.formData();
    try {
      const rawRows = value(form, 'rows');
      const rows = JSON.parse(rawRows) as Array<{
        userId: string;
        quantity?: number | null;
      }>;
      if (!Array.isArray(rows) || rows.length > 500)
        throw new TaskError('VALIDATION', 'Bảng phân công không hợp lệ.');
      await taskService.addMembersBulk(
        locals.user,
        params.taskId,
        { content: value(form, 'content'), unit: value(form, 'unit') || null },
        rows
      );
      return { success: 'Đã phân công hàng loạt.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  updateMember: async ({ locals, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    const form = await request.formData();
    try {
      await taskService.updateMember(locals.user, value(form, 'memberId'), {
        content: value(form, 'content'),
        quantity: value(form, 'quantity') || null,
        unit: value(form, 'unit') || null
      });
      return { success: 'Đã cập nhật phần việc.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  removeMember: async ({ locals, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    const form = await request.formData();
    try {
      await taskService.removeMember(locals.user, value(form, 'memberId'));
      return { success: 'Đã xóa phần việc.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  submit: async ({ locals, params, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    try {
      await taskService.submitTask(locals.user, params.taskId);
      return { success: 'Đã gửi công việc chờ duyệt.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  approve: async ({ locals, params, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    try {
      await taskService.approveTask(locals.user, params.taskId);
      return { success: 'Đã duyệt công việc.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  reject: async ({ locals, params, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    const form = await request.formData();
    try {
      await taskService.rejectTask(
        locals.user,
        params.taskId,
        value(form, 'reason')
      );
      return { success: 'Đã từ chối công việc.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  updateProgress: async ({ locals, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    const form = await request.formData();
    try {
      await taskService.updateProgress(locals.user, value(form, 'memberId'), {
        value: value(form, 'value'),
        resultReport: value(form, 'resultReport') || null
      });
      return { success: 'Đã cập nhật tiến độ.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  commentMember: async ({ locals, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    const form = await request.formData();
    try {
      await taskService.commentMember(
        locals.user,
        value(form, 'memberId'),
        value(form, 'comment') || null
      );
      return { success: 'Đã lưu nhận xét.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  reportCompletion: async ({ locals, params, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    const form = await request.formData();
    try {
      await taskService.reportCompletion(
        locals.user,
        params.taskId,
        value(form, 'summary')
      );
      return { success: 'Đã báo cáo hoàn thành, chờ đánh giá.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  evaluate: async ({ locals, params, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    const form = await request.formData();
    try {
      await taskService.evaluateTask(
        locals.user,
        params.taskId,
        value(form, 'result') as EvaluationResult,
        value(form, 'comment') || null
      );
      return { success: 'Đã lưu kết quả đánh giá.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  reopen: async ({ locals, params, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    const form = await request.formData();
    try {
      await taskService.reopenTask(
        locals.user,
        params.taskId,
        value(form, 'reason')
      );
      return { success: 'Đã mở lại công việc.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  }
};
