import { ZONES, type PC, type Zone } from './types';

/** Minutes until an in-use PC frees up, or null if no estimate. */
export function etaMinutes(pc: PC, now: number): number | null {
	if (pc.status !== 'in_use' || !pc.freeAt) return null;
	return Math.max(0, Math.ceil((Date.parse(pc.freeAt) - now) / 60000));
}

export function etaLabel(mins: number): string {
	return mins === 0 ? 'any minute' : `~${mins} min`;
}

export function ago(iso: string, now: number): string {
	const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
	if (s < 45) return 'just now';
	const m = Math.round(s / 60);
	if (m < 60) return `${m} min ago`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h} hr ago`;
	return `${Math.round(h / 24)} days ago`;
}

export function counts(pcs: PC[]) {
	const zones = Object.fromEntries(ZONES.map((z) => [z, { free: 0, total: 0 }])) as Record<
		Zone,
		{ free: number; total: number }
	>;
	let free = 0;
	for (const p of pcs) {
		zones[p.zone].total++;
		if (p.status === 'free') {
			zones[p.zone].free++;
			free++;
		}
	}
	return { free, total: pcs.length, zones };
}
