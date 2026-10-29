import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** The floor plan editor now lives in the owner menu. */
export const load: PageServerLoad = () => {
	redirect(303, '/#floor');
};
