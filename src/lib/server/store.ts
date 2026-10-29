import { Redis } from '@upstash/redis';
import { defaultState } from '#lib/defaultLayout.ts';
import type { CafeState } from '#lib/types.ts';

const KEY = 'gg:state:v4';

// Vercel's Upstash integration sets KV_REST_API_*; a direct Upstash DB uses UPSTASH_REDIS_REST_*.
const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

if (!redis) console.warn('[gg-status] No Redis env vars set – using in-memory store (resets on restart).');

const mem = globalThis as unknown as { __ggState?: CafeState };

export async function getState(): Promise<CafeState> {
	if (!redis) return (mem.__ggState ??= defaultState());
	let s = await redis.get<CafeState>(KEY);
	if (!s) {
		s = defaultState();
		await redis.set(KEY, s);
	}
	return s;
}

export async function saveState(s: CafeState): Promise<CafeState> {
	s.updatedAt = new Date().toISOString();
	if (redis) await redis.set(KEY, s);
	else mem.__ggState = s;
	return s;
}

export async function updateState(fn: (s: CafeState) => void): Promise<CafeState> {
	const s = await getState();
	fn(s);
	return saveState(s);
}
