<script lang="ts">
	import { onMount } from 'svelte';
	import SeatMap from '#lib/components/SeatMap.svelte';
	import { ago, counts } from '#lib/format.ts';
	import { openStatus } from '#lib/hours.ts';
	import { FLOORS, FLOOR_META, type CafeState } from '#lib/types.ts';

	let { initial }: { initial: CafeState } = $props();

	// svelte-ignore state_referenced_locally
	let cafe = $state<CafeState>(initial);
	let now = $state(Date.now());
	let offline = $state(false);
	let picked = $state<string | null>(null);

	const c = $derived(counts(cafe.pcs));
	const pcs = $derived(c.zones.pc);
	const hours = $derived(openStatus(now));
	const gridCols = $derived(Math.max(...cafe.pcs.map((p) => p.x + 1)));
	const pickedPc = $derived(cafe.pcs.find((p) => p.id === picked) ?? null);
	const floorFree = (fl: string) => {
		const list = cafe.pcs.filter((p) => p.floor === fl && p.zone === 'pc');
		return { free: list.filter((p) => p.status === 'free').length, total: list.length };
	};

	async function poll() {
		try {
			const r = await fetch('/api/status', { cache: 'no-store' });
			if (!r.ok) throw new Error();
			cafe = await r.json();
			offline = false;
		} catch {
			offline = true;
		}
		now = Date.now();
	}

	onMount(() => {
		const p = setInterval(() => document.visibilityState === 'visible' && poll(), 5000);
		const t = setInterval(() => (now = Date.now()), 15000);
		const vis = () => document.visibilityState === 'visible' && poll();
		// the owner's screen pings the preview to refresh instantly after a change
		const msg = (e: MessageEvent) => e.origin === location.origin && e.data === 'gg:refresh' && poll();
		document.addEventListener('visibilitychange', vis);
		addEventListener('message', msg);
		return () => {
			clearInterval(p);
			clearInterval(t);
			document.removeEventListener('visibilitychange', vis);
			removeEventListener('message', msg);
		};
	});
</script>

<div class="page">
	<header>
		<a href="https://gggaminglounge.com.au/" aria-label="GG Gaming Lounge home">
			<img class="logo" src="/brand/logo.png" alt="GG Gaming Lounge" />
		</a>
		<span class="open">{hours.text}</span>
	</header>

	<section class="summary">
		<h1>
			{#if pcs.free === 0}All PCs are taken{:else}{pcs.free} of {pcs.total} PCs free{/if}
		</h1>
		<p>
			{#each FLOORS as fl, i (fl)}
				{@const f = floorFree(fl)}
				{#if f.total}{i ? ' · ' : ''}{FLOOR_META[fl].name}: {f.free} free{/if}
			{/each}
			{#if c.zones.sim.total} · Racing sims: {c.zones.sim.free} of {c.zones.sim.total}{/if}
			{#if c.zones.console.total} · Consoles: {c.zones.console.free} of {c.zones.console.total}{/if}
		</p>
		{#if cafe.announcement}<p class="announce">{cafe.announcement}</p>{/if}
	</section>

	{#each FLOORS as fl (fl)}
		{@const floorPcs = cafe.pcs.filter((p) => p.floor === fl)}
		{#if floorPcs.length}
			<section class="floor">
				<h2>{FLOOR_META[fl].name}</h2>
				<div class="scroll">
					<SeatMap
						pcs={floorPcs}
						floor={fl}
						{now}
						minCols={gridCols}
						onseat={(id) => (picked = picked === id ? null : id)}
					/>
				</div>
			</section>
		{/if}
	{/each}

	<div class="below">
		<span class="key"><i class="free"></i>Free</span>
		<span class="key"><i class="taken"></i>Taken</span>
		<span class="status" aria-live="polite">
			{#if pickedPc}
				{pickedPc.label} is {pickedPc.status === 'free' ? 'free' : 'taken'}
			{:else}
				{offline ? 'Reconnecting…' : `Updated ${ago(cafe.updatedAt, now)}`}
			{/if}
		</span>
	</div>

	<footer>
		<p>3/24 Mercer Ln, Joondalup · <a href="mailto:info@gggaminglounge.com.au">info@gggaminglounge.com.au</a></p>
		<p>Mon–Thu 12pm–12am · Fri 12pm–1am · Sat 10am–1am · Sun 10am–12am</p>
	</footer>
</div>

<style>
	.page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 clamp(16px, 3vw, 32px) 2.5rem;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.25rem 0;
		border-bottom: 1px solid var(--line);
	}
	.logo {
		height: 44px;
		display: block;
	}
	.open {
		color: var(--muted);
		font-size: 0.95rem;
	}

	.summary {
		padding: 2rem 0 0.5rem;
	}
	h1 {
		margin: 0;
		font-size: clamp(2rem, 4.5vw, 3rem);
		line-height: 1.1;
	}
	.summary p {
		margin: 0.6rem 0 0;
		color: var(--muted);
		font-size: 1rem;
	}
	.summary .announce {
		margin-top: 1rem;
		color: var(--text);
		padding-left: 0.8rem;
		border-left: 3px solid var(--line-2);
	}

	.floor {
		margin-top: 2rem;
	}
	h2 {
		margin: 0 0 0.6rem;
		font-family: 'Inter', system-ui, sans-serif;
		font-size: 1.05rem;
		font-weight: 600;
		text-transform: none;
		letter-spacing: 0;
	}
	.scroll {
		overflow-x: auto;
		padding-bottom: 4px;
	}

	.below {
		display: flex;
		align-items: center;
		gap: 1.4rem;
		flex-wrap: wrap;
		margin-top: 1rem;
		font-size: 0.95rem;
	}
	.key {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.key i {
		width: 18px;
		height: 16px;
		border-radius: 5px;
	}
	.key .free {
		border: 1.5px solid var(--free-edge);
	}
	.key .taken {
		background: var(--in-use);
	}
	.status {
		margin-left: auto;
		color: var(--muted);
	}

	footer {
		margin-top: 2.5rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--line);
		color: var(--muted);
		font-size: 0.9rem;
	}
	footer p {
		margin: 0.25rem 0;
	}
	footer a {
		color: var(--muted);
	}
</style>
