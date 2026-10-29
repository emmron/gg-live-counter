import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { dev } from '$app/env';

export const COOKIE = 'gg_admin';
export const MAX_AGE = 60 * 60 * 24 * 365; // stay logged in on the front-desk PC for a year

function adminPassword(): string | undefined {
	// Dev convenience only: production never falls back.
	return process.env.ADMIN_PASSWORD || (dev ? 'admin' : undefined);
}

function secret(): string {
	const s = process.env.SESSION_SECRET || adminPassword();
	if (!s) throw new Error('Set ADMIN_PASSWORD and SESSION_SECRET');
	return s;
}

const sign = (v: string) => createHmac('sha256', secret()).update(v).digest('base64url');

const safeEq = (a: string, b: string) =>
	timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

export function createToken(): string {
	const exp = String(Date.now() + MAX_AGE * 1000);
	return `${exp}.${sign(exp)}`;
}

export function verifyToken(token: string | undefined): boolean {
	if (!token || !adminPassword()) return false;
	const [exp, sig] = token.split('.');
	if (!exp || !sig || Number(exp) < Date.now()) return false;
	return safeEq(sig, sign(exp));
}

export function checkPassword(input: string): boolean {
	const real = adminPassword();
	return !!real && safeEq(input, real);
}
