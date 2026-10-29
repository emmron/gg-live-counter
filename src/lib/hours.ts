/**
 * GG Gaming Lounge opening hours (Perth time), from gggaminglounge.com.au.
 * Hours are [open, close) in hours after local midnight; a close past 24 runs into the next day.
 * Index 0 = Sunday.
 */
const HOURS: [number, number][] = [
	[10, 24], // Sun 10am–12am
	[12, 24], // Mon 12pm–12am
	[12, 24], // Tue
	[12, 24], // Wed
	[12, 24], // Thu
	[12, 25], // Fri 12pm–1am
	[10, 25] // Sat 10am–1am
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function perthNow(at: number) {
	const parts = new Intl.DateTimeFormat('en-AU', {
		timeZone: 'Australia/Perth',
		weekday: 'short',
		hour: 'numeric',
		minute: 'numeric',
		hourCycle: 'h23'
	}).formatToParts(at);
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
	return { day: DAYS.indexOf(get('weekday')), hour: Number(get('hour')) + Number(get('minute')) / 60 };
}

const fmt = (h: number) => {
	const hh = Math.floor(h) % 24;
	return hh === 0 ? '12am' : hh === 12 ? '12pm' : hh < 12 ? `${hh}am` : `${hh - 12}pm`;
};

export function openStatus(at = Date.now()): { open: boolean; text: string } {
	const { day, hour } = perthNow(at);
	const [o, c] = HOURS[day];
	const [, yc] = HOURS[(day + 6) % 7];
	if (hour + 24 < yc) return { open: true, text: `Open now · until ${fmt(yc)}` };
	if (hour >= o && hour < c) return { open: true, text: `Open now · until ${fmt(c)}` };
	if (hour < o) return { open: false, text: `Closed · opens ${fmt(o)} today` };
	const next = HOURS[(day + 1) % 7][0];
	return { open: false, text: `Closed · opens ${fmt(next)} tomorrow` };
}
