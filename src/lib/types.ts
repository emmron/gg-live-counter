export const STATUSES = ['free', 'in_use', 'reserved', 'offline'] as const;
export type Status = (typeof STATUSES)[number];

export const ZONES = ['pc', 'sim', 'console'] as const;
export type Zone = (typeof ZONES)[number];

/** Which side of the seat the screen is on (benches are back-to-back, screens in the middle). */
export const FACINGS = ['up', 'down'] as const;
export type Facing = (typeof FACINGS)[number];

export interface PC {
	id: string;
	label: string;
	zone: Zone;
	/** Grid column, 0-based */
	x: number;
	/** Grid row, 0-based */
	y: number;
	facing: Facing;
	status: Status;
	/** When an in-use station is expected to free up (ISO time) */
	freeAt: string | null;
	updatedAt: string;
}

export interface CafeState {
	pcs: PC[];
	announcement: string;
	updatedAt: string;
}

export const STATUS_META: Record<Status, { label: string; key: string }> = {
	free: { label: 'Free', key: 'F' },
	in_use: { label: 'In use', key: 'U' },
	reserved: { label: 'Reserved', key: 'R' },
	offline: { label: 'Offline', key: 'O' }
};

export const ZONE_META: Record<Zone, { name: string; unit: string; prefix: string }> = {
	pc: { name: 'Gaming PCs', unit: 'PCs', prefix: 'PC' },
	sim: { name: 'Racing sims', unit: 'sims', prefix: 'SIM' },
	console: { name: 'Consoles', unit: 'consoles', prefix: 'TV' }
};

/** Largest grid coordinate allowed (0..MAX_GRID) */
export const MAX_GRID = 39;
