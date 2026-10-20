import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  actionErrorMessage,
  requireSameOrigin
} from '$lib/server/auth/action-guards';
import { taskService } from '$lib/server/tasks/runtime';
import { TaskError, type TaskType } from '$lib/server/tasks/service';

const asString = (value: FormDataEntryValue | null): string =>
  typeof value === 'string' ? value : '';

const parseMemberRows = (value: FormDataEntryValue | null) => {
  if (typeof value !== 'string')
    throw new TaskError('VALIDATION', 'Bảng phân công không hợp lệ.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TaskError('VALIDATION', 'Bảng phân công không hợp lệ.');
  }
  if (!Array.isArray(parsed) || parsed.length > 500) {
    throw new TaskError('VALIDATION', 'Bảng phân công không hợp lệ.');
  }
  return parsed as Array<{ userId: string; quantity?: string | null }>;
};

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, '/login');
  const tasks = await taskService.listTasks(locals.user, {
    search: url.searchParams.get('q') ?? undefined,
    taskType: (url.searchParams.get('type') as TaskType | null) ?? undefined,
    statuses: url.searchParams.getAll('status') as never,
    involvedOnly: url.searchParams.get('mine') === '1',
    overdueOnly: url.searchParams.get('overdue') === '1'
  });
  return {
    tasks,
    people: await taskService.listAssignableUsers(locals.user),
    filters: {
      search: url.searchParams.get('q') ?? '',
      taskType: url.searchParams.get('type') ?? '',
      statuses: url.searchParams.getAll('status'),
      involvedOnly: url.searchParams.get('mine') === '1',
      overdueOnly: url.searchParams.get('overdue') === '1'
    },
    currentUser: locals.user
  };
};

export const actions: Actions = {
  create: async ({ locals, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    const form = await request.formData();
    try {
      const type = asString(form.get('taskType')) as TaskType;
      const members =
        type === 'TEAM'
          ? []
          : [
              {
                userId:
                  type === 'PERSONAL'
                    ? locals.user.id
                    : asString(form.get('leadId')),
                content: asString(form.get('memberContent')),
                quantity: asString(form.get('quantity')) || null,
                unit: asString(form.get('unit')) || null
              }
            ];
      const taskId = await taskService.createTask(locals.user, {
        taskType: type,
        title: asString(form.get('title')),
        description: asString(form.get('description')) || null,
        deadline: asString(form.get('deadline')),
        leadId:
          type === 'PERSONAL'
            ? locals.user.id
            : asString(form.get('leadId')) || null,
        members
      });
      redirect(303, `/tasks/${taskId}`);
    } catch (error) {
      if (error instanceof TaskError)
        return fail(400, { createError: actionErrorMessage(error) });
      throw error;
    }
  },
  update: async ({ locals, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    const form = await request.formData();
    try {
      await taskService.updateTask(locals.user, asString(form.get('taskId')), {
        title: asString(form.get('title')),
        description: asString(form.get('description')) || null,
        deadline: asString(form.get('deadline')),
        leadId: asString(form.get('leadId')) || null
      });
      return { success: 'Đã cập nhật công việc.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  addMember: async ({ locals, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    const form = await request.formData();
    try {
      await taskService.addMember(locals.user, asString(form.get('taskId')), {
        userId: asString(form.get('userId')),
        content: asString(form.get('content')),
        quantity: asString(form.get('quantity')) || null,
        unit: asString(form.get('unit')) || null
      });
      return { success: 'Đã thêm phần việc.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  addMembersBulk: async ({ locals, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    const form = await request.formData();
    try {
      await taskService.addMembersBulk(
        locals.user,
        asString(form.get('taskId')),
        {
          content: asString(form.get('content')),
          unit: asString(form.get('unit')) || null
        },
        parseMemberRows(form.get('rows'))
      );
      return { success: 'Đã phân công đồng thời.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  },
  updateMember: async ({ locals, request, url }) => {
    requireSameOrigin(request, url);
    if (!locals.user) redirect(303, '/login');
    const form = await request.formData();
    try {
      await taskService.updateMember(
        locals.user,
        asString(form.get('memberId')),
        {
          content: asString(form.get('content')),
          quantity: asString(form.get('quantity')) || null,
          unit: asString(form.get('unit')) || null
        }
      );
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
      await taskService.removeMember(
        locals.user,
        asString(form.get('memberId'))
      );
      return { success: 'Đã xóa phần việc.' };
    } catch (error) {
      return fail(400, { message: actionErrorMessage(error) });
    }
  }
};
