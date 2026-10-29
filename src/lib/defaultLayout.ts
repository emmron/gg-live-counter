import type { CafeState, PC, Zone } from './types';

/**
 * Starter floor plan, editable later from /admin → Layout.
 * Main floor: rows A–D, 3 + aisle + 3 like cinema seating.
 * Console lounge down the right wall, pro/streaming booth along the back.
 */
export function defaultState(): CafeState {
	const now = new Date().toISOString();
	const pcs: PC[] = [];
	const add = (label: string, zone: Zone, x: number, y: number) =>
		pcs.push({ id: label.toLowerCase(), label, zone, x, y, status: 'free', freeAt: null, updatedAt: now });

	const cols = [0, 1, 2, 4, 5, 6];
	['A', 'B', 'C', 'D'].forEach((row, r) => cols.forEach((x, i) => add(`${row}${i + 1}`, 'standard', x, r)));
	[0, 1, 2].forEach((y, i) => add(`X${i + 1}`, 'console', 9, y));
	cols.forEach((x, i) => add(`P${i + 1}`, 'pro', x, 6));

	return { pcs, announcement: '', updatedAt: now };
}
