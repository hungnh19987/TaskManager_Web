import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { reportService } from '$lib/server/reports/runtime';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  return { work: await reportService.myWork(locals.user) };
};
