import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { checkPassword, COOKIE, createToken, MAX_AGE } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

const logIn = (cookies: Parameters<PageServerLoad>[0]['cookies']) =>
	cookies.set(COOKIE, createToken(), {
		path: '/',
		httpOnly: true,
		// lax so the one-click link still works when opened from an email or chat app
		sameSite: 'lax',
		secure: !dev,
		maxAge: MAX_AGE
	});

export const load: PageServerLoad = ({ locals, url, cookies }) => {
	if (locals.admin) redirect(303, '/');
	// One-click login link: /admin/login?key=<password>
	const key = url.searchParams.get('key');
	if (key && checkPassword(key)) {
		logIn(cookies);
		redirect(303, '/');
	}
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const password = String((await request.formData()).get('password') ?? '');
		if (!checkPassword(password)) {
			await new Promise((r) => setTimeout(r, 600)); // slow down guessing
			return fail(401, { wrong: true });
		}
		logIn(cookies);
		redirect(303, '/');
	}
};
