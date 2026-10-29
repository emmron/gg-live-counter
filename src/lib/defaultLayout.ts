import type { CafeState, Facing, Floor, PC, Zone } from './types';

/**
 * Starter floor plan from GG Gaming Lounge photos. The map is drawn with the
 * long left-hand wall of the hall at the TOP, and the entrance on the RIGHT.
 *
 * GROUND FLOOR: every PC faces the wall (cinema style).
 *   y0  Row A: wall desk, 22 seats. The first 4 sit in the alcove where the bench stops.
 *   y1  Row B: middle bench (towers on the raised shared shelf), 18 seats, aisle side.
 *   y2  walkway
 *   y3  racing sims + consoles on the open floor (positions are a guess)
 *
 * UPSTAIRS
 *   y0  Row C: left mezzanine, along the wall under the TVs, 22 seats.
 *   y1–2 open void over the hall
 *   y3–4 Rows D + E: right-hand mezzanine at the back end of the hall, facing the opposite wall, 9 + 9 seats.
 *
 * Total 80 PCs. Exact counts per row aren't published, so fix them in /admin → Edit layout.
 */
export function defaultState(): CafeState {
	const now = new Date().toISOString();
	const pcs: PC[] = [];
	const add = (label: string, zone: Zone, floor: Floor, x: number, y: number, facing: Facing) =>
		pcs.push({
			id: label.toLowerCase(),
			label,
			zone,
			floor,
			x,
			y,
			facing,
			status: 'free',
			freeAt: null,
			updatedAt: now
		});
	const row = (letter: string, floor: Floor, y: number, startX: number, count: number, facing: Facing) => {
		for (let i = 0; i < count; i++) add(`${letter}${i + 1}`, 'pc', floor, startX + i, y, facing);
	};

	row('A', 'ground', 0, 0, 22, 'up');
	row('B', 'ground', 1, 4, 18, 'up');
	row('C', 'upstairs', 0, 0, 22, 'up');
	row('D', 'upstairs', 3, 0, 9, 'down');
	row('E', 'upstairs', 4, 0, 9, 'down');

	[0, 1, 2].forEach((i) => add(`SIM${i + 1}`, 'sim', 'ground', 4 + i, 3, 'up'));
	['PS5-1', 'PS5-2', 'XBX-1', 'XBX-2'].forEach((label, i) => add(label, 'console', 'ground', 10 + i, 3, 'up'));

	return { pcs, announcement: '', updatedAt: now };
}
