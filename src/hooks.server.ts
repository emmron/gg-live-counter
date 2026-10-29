import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { COOKIE, verifyToken } from '#lib/server/auth.ts';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.admin = verifyToken(event.cookies.get(COOKIE));

	const path = event.url.pathname;
	if (path.startsWith('/admin') && !path.startsWith('/admin/login') && !event.locals.admin) {
		redirect(303, '/admin/login');
	}

	const res = await resolve(event);
	if (path.startsWith('/admin')) res.headers.set('x-robots-tag', 'noindex');
	return res;
};
