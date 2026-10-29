export const STATUSES = ['free', 'in_use', 'reserved', 'offline'] as const;
export type Status = (typeof STATUSES)[number];

export const ZONES = ['standard', 'pro', 'console'] as const;
export type Zone = (typeof ZONES)[number];

export interface PC {
	id: string;
	label: string;
	zone: Zone;
	/** Grid column, 0-based */
	x: number;
	/** Grid row, 0-based */
	y: number;
	status: Status;
	/** When an in-use PC is expected to free up (ISO time) */
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

export const ZONE_META: Record<Zone, { name: string; prefix: string }> = {
	standard: { name: 'Main floor', prefix: 'S' },
	pro: { name: 'Pro booth', prefix: 'P' },
	console: { name: 'Console lounge', prefix: 'C' }
};

/** Largest grid coordinate allowed (0..MAX_GRID) */
export const MAX_GRID = 39;
