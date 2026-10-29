import { redirect } from '@sveltejs/kit';
import { getState } from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.admin) redirect(303, '/admin/login');
	return { state: await getState() };
};
