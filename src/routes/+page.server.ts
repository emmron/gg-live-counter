import { getState, persistent } from '#lib/server/store.ts';
import { dev } from '$app/env';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders, locals, url }) => {
	setHeaders({ 'cache-control': 'no-store' });
	return {
		state: await getState(),
		/** The owner's PC gets the half-and-half view; `?preview` is the customer half inside it. */
		owner: locals.admin && !url.searchParams.has('preview'),
		/** shown to the owner so a missing database can't go unnoticed */
		storageMissing: !persistent && !dev
	};
};
