import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { taskService } from '$lib/server/tasks/runtime';
import type { TaskStatus } from '$lib/server/tasks/service';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  const [pending, reported] = await Promise.all([
    taskService.listTasks(locals.user, {
      statuses: ['PENDING_APPROVAL'] as TaskStatus[]
    }),
    taskService.listTasks(locals.user, {
      statuses: ['REPORTED'] as TaskStatus[]
    })
  ]);
  return { pending, reported, isManager: locals.user.role === 'MANAGER' };
};
