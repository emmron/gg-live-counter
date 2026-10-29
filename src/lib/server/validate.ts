import { error } from '@sveltejs/kit';
import { MAX_GRID, STATUSES, ZONES, type PC, type Status, type Zone } from '#lib/types.ts';

const isCoord = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_GRID;

export function isStatus(s: unknown): s is Status {
	return STATUSES.includes(s as Status);
}

/** Validates a full PC list sent by the admin page (layout save / undo). */
export function parsePcs(input: unknown): PC[] {
	if (!Array.isArray(input) || input.length > 300) error(400, 'pcs must be an array (max 300)');
	const ids = new Set<string>();
	const labels = new Set<string>();
	const cells = new Set<string>();
	const now = new Date().toISOString();

	return input.map((raw): PC => {
		const r = (raw ?? {}) as Record<string, unknown>;
		const label = typeof r.label === 'string' ? r.label.trim() : '';
		const { id, zone, status, x, y } = r;
		if (typeof id !== 'string' || !/^[\w-]{1,40}$/.test(id)) error(400, 'Bad id');
		if (!label || label.length > 6) error(400, `Bad label "${label}" (1–6 chars)`);
		if (!ZONES.includes(zone as Zone)) error(400, 'Bad zone');
		if (!isStatus(status)) error(400, 'Bad status');
		if (!isCoord(x) || !isCoord(y)) error(400, 'Bad position');
		const cell = `${x},${y}`;
		const key = label.toUpperCase();
		if (ids.has(id) || labels.has(key) || cells.has(cell)) error(400, `Duplicate PC or position (${label})`);
		ids.add(id);
		labels.add(key);
		cells.add(cell);
		const freeAt =
			status === 'in_use' && typeof r.freeAt === 'string' && !isNaN(Date.parse(r.freeAt)) ? r.freeAt : null;
		return {
			id,
			label,
			zone: zone as Zone,
			x,
			y,
			status,
			freeAt,
			updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : now
		};
	});
}
