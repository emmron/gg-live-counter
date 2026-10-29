import { error, redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { dev } from '$app/env';
import { COOKIE, verifyToken } from '#lib/server/auth.ts';

/** Comma-separated public IPs that get the owner view without logging in (e.g. the front-desk PC). */
const ADMIN_IPS = new Set(
	(process.env.ADMIN_IPS ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
);
const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function clientIp(event: Parameters<Handle>[0]['event']) {
	try {
		return event.getClientAddress();
	} catch {
		return '';
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	const ip = clientIp(event);
	event.locals.admin =
		verifyToken(event.cookies.get(COOKIE)) || ADMIN_IPS.has(ip) || (dev && LOCAL.has(ip));

	const path = event.url.pathname;

	// Writes must come from this site (blocks other sites driving the owner's browser).
	if (event.request.method !== 'GET' && event.request.method !== 'HEAD') {
		const origin = event.request.headers.get('origin');
		if (origin && origin !== event.url.origin) error(403, 'Cross-site request blocked');
	}

	if (path === '/admin' || path === '/admin/') redirect(303, event.locals.admin ? '/' : '/admin/login');

	const res = await resolve(event);
	if (path.startsWith('/admin')) res.headers.set('x-robots-tag', 'noindex');
	return res;
};
