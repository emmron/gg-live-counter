import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { checkPassword, COOKIE, createToken, MAX_AGE } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.admin) redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const password = String((await request.formData()).get('password') ?? '');
		if (!checkPassword(password)) {
			await new Promise((r) => setTimeout(r, 600)); // slow down guessing
			return fail(401, { wrong: true });
		}
		cookies.set(COOKIE, createToken(), {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: !dev,
			maxAge: MAX_AGE
		});
		redirect(303, '/');
	}
};
