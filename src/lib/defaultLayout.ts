import type { CafeState, Facing, PC, Zone } from './types';

/**
 * Starter floor plan based on GG Gaming Lounge's published photos and specs:
 * 80 PCs on long back-to-back benches (towers on a shared middle shelf, screens facing
 * each other), 3 racing sims, and PS5 / Xbox Series X consoles.
 *
 * Exact bench lengths, sim/console positions and console count aren't published,
 * so the owner can fix them in /admin → Edit layout.
 *
 *   A1 … A10   ← row A faces down onto bench 1
 *   ═════════  (bench 1: towers + screens)
 *   B1 … B10   ← row B faces up onto bench 1
 *   (aisle)
 *   C/D = bench 2, E/F = bench 3, G/H = bench 4
 *   (aisle)
 *   SIM1–3          PS5-1 PS5-2 XBX-1 XBX-2
 */
export function defaultState(): CafeState {
	const now = new Date().toISOString();
	const pcs: PC[] = [];
	const add = (label: string, zone: Zone, x: number, y: number, facing: Facing) =>
		pcs.push({ id: label.toLowerCase(), label, zone, x, y, facing, status: 'free', freeAt: null, updatedAt: now });

	const PER_SIDE = 10;
	['AB', 'CD', 'EF', 'GH'].forEach((pair, bench) => {
		const top = bench * 3; // two seat rows + one aisle row per bench
		for (let i = 0; i < PER_SIDE; i++) {
			add(`${pair[0]}${i + 1}`, 'pc', i, top, 'down');
			add(`${pair[1]}${i + 1}`, 'pc', i, top + 1, 'up');
		}
	});

	const extrasRow = 4 * 3;
	[0, 1, 2].forEach((x, i) => add(`SIM${i + 1}`, 'sim', x, extrasRow, 'up'));
	['PS5-1', 'PS5-2', 'XBX-1', 'XBX-2'].forEach((label, i) => add(label, 'console', 6 + i, extrasRow, 'up'));

	return { pcs, announcement: '', updatedAt: now };
}
