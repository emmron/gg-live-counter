<script lang="ts">
	import { onMount } from 'svelte';
	import SeatMap from '#lib/components/SeatMap.svelte';
	import Legend from '#lib/components/Legend.svelte';
	import { ago, counts, etaLabel, etaMinutes } from '#lib/format.ts';
	import { openStatus } from '#lib/hours.ts';
	import { STATUS_META, ZONE_META, type CafeState } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	let cafe = $state<CafeState>(data.state);
	let now = $state(Date.now());
	let offline = $state(false);
	let picked = $state<string | null>(null);

	const c = $derived(counts(cafe.pcs));
	const pcs = $derived(c.zones.pc);
	const hours = $derived(openStatus(now));
	const pickedPc = $derived(cafe.pcs.find((p) => p.id === picked) ?? null);
	const soonest = $derived.by(() => {
		if (pcs.free > 0) return null;
		const mins = cafe.pcs
			.filter((p) => p.zone === 'pc')
			.map((p) => etaMinutes(p, now))
			.filter((m): m is number => m !== null);
		return mins.length ? Math.min(...mins) : null;
	});

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
		document.addEventListener('visibilitychange', vis);
		return () => {
			clearInterval(p);
			clearInterval(t);
			document.removeEventListener('visibilitychange', vis);
		};
	});
</script>

<svelte:head>
	<title>{pcs.free} PCs free · GG Gaming Lounge Joondalup</title>
	<meta name="description" content="Live PC, racing sim and console availability at GG Gaming Lounge, Joondalup." />
</svelte:head>

<main>
	<header>
		<div class="brand">
			<span class="gg display">GG</span>
			<span class="name display">Gaming Lounge</span>
			<span class="where">Joondalup</span>
		</div>
		<p class="hours" class:closed={!hours.open}><span class="dot"></span>{hours.text}</p>
		<h1 class="display">
			<span class="big" class:none={pcs.free === 0}>{pcs.free}</span>
			<span class="of">/ {pcs.total} PCs free</span>
		</h1>
		{#if soonest !== null}
			<p class="soon">Next PC free in {etaLabel(soonest)}</p>
		{/if}
		<div class="zones">
			{#each ['sim', 'console'] as const as z (z)}
				{#if c.zones[z].total}
					<span class="zone z-{z}">
						{ZONE_META[z].name} <b>{c.zones[z].free}/{c.zones[z].total}</b> free
					</span>
				{/if}
			{/each}
		</div>
	</header>

	{#if cafe.announcement}
		<p class="announce">📣 {cafe.announcement}</p>
	{/if}

	<section class="map" aria-label="Seat map">
		<SeatMap pcs={cafe.pcs} {now} onseat={(id) => (picked = picked === id ? null : id)} />
	</section>

	<div class="detail" aria-live="polite">
		{#if pickedPc}
			{@const m = etaMinutes(pickedPc, now)}
			<strong>{pickedPc.label}</strong> · {ZONE_META[pickedPc.zone].name} ·
			<span class="st s-{pickedPc.status}">{STATUS_META[pickedPc.status].label}</span>
			{#if m !== null}· free in {etaLabel(m)}{/if}
		{:else}
			<span class="hint">Tap a seat for details</span>
		{/if}
	</div>

	<Legend />

	<footer>
		{#if offline}
			<span class="warn">Connection lost, retrying…</span>
		{:else}
			<span class="live"></span> Live · updated {ago(cafe.updatedAt, now)}
		{/if}
		<p class="small">3/24 Mercer Ln, Joondalup · <a href="https://gggaminglounge.com.au/">gggaminglounge.com.au</a></p>
	</footer>
</main>

<style>
	main {
		max-width: 900px;
		margin: 0 auto;
		padding: 1.25rem 16px 2.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}
	header {
		text-align: center;
	}
	.brand {
		display: inline-flex;
		align-items: baseline;
		gap: 0.45rem;
	}
	.gg {
		font-size: 1.7rem;
		font-weight: 700;
		line-height: 1;
	}
	.name {
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		font-size: 0.95rem;
	}
	.where {
		color: var(--accent-2);
		font-size: 0.72rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	.hours {
		margin: 0.35rem 0 0;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.hours .dot {
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--free);
		margin-right: 0.4rem;
		vertical-align: 1px;
	}
	.hours.closed .dot {
		background: var(--sim);
	}
	h1 {
		margin: 0.5rem 0 0.4rem;
		font-weight: 700;
		line-height: 1;
	}
	.big {
		font-size: clamp(3.75rem, 15vw, 6rem);
		color: var(--free);
		text-shadow: 0 0 30px var(--free-glow);
	}
	.big.none {
		color: var(--muted);
		text-shadow: none;
	}
	.of {
		font-size: clamp(1.3rem, 5vw, 2rem);
		color: var(--muted);
	}
	.soon {
		margin: 0 0 0.5rem;
		color: var(--reserved);
	}
	.zones {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
	}
	.zone {
		border: 1px solid var(--line);
		background: var(--panel);
		border-radius: 999px;
		padding: 0.3rem 0.8rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.zone b {
		color: var(--text);
	}
	.z-sim {
		border-color: color-mix(in srgb, var(--sim) 55%, var(--line));
	}
	.z-console {
		border-color: color-mix(in srgb, var(--console) 55%, var(--line));
	}
	.announce {
		margin: 0;
		background: linear-gradient(90deg, rgba(100, 108, 253, 0.25), rgba(25, 195, 209, 0.15));
		border: 1px solid rgba(100, 108, 253, 0.5);
		border-radius: var(--radius);
		padding: 0.75rem 1rem;
		text-align: center;
	}
	.map {
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: 20px;
		padding: 1.1rem clamp(6px, 2.5vw, 24px) 1.5rem;
	}
	.detail {
		text-align: center;
		min-height: 1.5em;
	}
	.hint {
		color: var(--muted);
	}
	.st.s-free {
		color: var(--free);
	}
	.st.s-in_use {
		color: var(--muted);
	}
	.st.s-reserved {
		color: var(--reserved);
	}
	.st.s-offline {
		color: var(--muted);
	}
	footer {
		text-align: center;
		color: var(--muted);
		font-size: 0.85rem;
	}
	footer a {
		color: var(--accent-2);
	}
	.live {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--free);
		box-shadow: 0 0 8px var(--free);
		animation: pulse 2s infinite;
		margin-right: 0.25rem;
	}
	@keyframes pulse {
		50% {
			opacity: 0.35;
		}
	}
	.warn {
		color: var(--reserved);
	}
	.small {
		font-size: 0.8rem;
		opacity: 0.85;
	}
</style>
