import { error, json } from '@sveltejs/kit';
import { getState, saveState, updateState } from '#lib/server/store.ts';
import { isStatus, parsePcs } from '#lib/server/validate.ts';
import type { RequestHandler } from './$types';

const noStore = { 'cache-control': 'no-store' };

/** Public read. Open to any origin so the WordPress widget can fetch it. */
export const GET: RequestHandler = async () =>
	json(await getState(), { headers: { ...noStore, 'access-control-allow-origin': '*' } });

function requireAdmin(locals: App.Locals) {
	if (!locals.admin) error(401, 'Not logged in');
}

/** Status change for some PCs: { ids, status?, freeInMin? } */
export const PATCH: RequestHandler = async ({ request, locals }) => {
	requireAdmin(locals);
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const ids = body?.ids;
	if (!Array.isArray(ids) || !ids.every((i) => typeof i === 'string')) error(400, 'ids required');
	const status = body?.status;
	if (status !== undefined && !isStatus(status)) error(400, 'Bad status');
	const freeInMin = body?.freeInMin;
	if (
		freeInMin !== undefined &&
		freeInMin !== null &&
		!(typeof freeInMin === 'number' && freeInMin > 0 && freeInMin <= 24 * 60)
	)
		error(400, 'Bad freeInMin');

	const want = new Set(ids);
	const now = new Date();
	const s = await updateState((s) => {
		for (const pc of s.pcs) {
			if (!want.has(pc.id)) continue;
			if (status) pc.status = status;
			if (typeof freeInMin === 'number') {
				pc.status = 'in_use';
				pc.freeAt = new Date(now.getTime() + freeInMin * 60000).toISOString();
			} else if (freeInMin === null) pc.freeAt = null;
			if (pc.status !== 'in_use') pc.freeAt = null;
			pc.updatedAt = now.toISOString();
		}
	});
	return json(s, { headers: noStore });
};

/** Replace layout and/or announcement: { pcs?, announcement? } */
export const PUT: RequestHandler = async ({ request, locals }) => {
	requireAdmin(locals);
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) error(400, 'JSON body required');
	const s = await getState();
	if (body.pcs !== undefined) s.pcs = parsePcs(body.pcs);
	if (body.announcement !== undefined) {
		if (typeof body.announcement !== 'string' || body.announcement.length > 200)
			error(400, 'Announcement max 200 chars');
		s.announcement = body.announcement.trim();
	}
	return json(await saveState(s), { headers: noStore });
};
