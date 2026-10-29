import { getState } from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders, locals, url }) => {
	setHeaders({ 'cache-control': 'no-store' });
	return {
		state: await getState(),
		/** The owner's PC gets the half-and-half view; `?preview` is the customer half inside it. */
		owner: locals.admin && !url.searchParams.has('preview')
	};
};
