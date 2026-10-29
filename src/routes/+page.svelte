<script lang="ts">
	import { onMount } from 'svelte';
	import SeatMap from '#lib/components/SeatMap.svelte';
	import Legend from '#lib/components/Legend.svelte';
	import { ago, counts, etaLabel, etaMinutes } from '#lib/format.ts';
	import { STATUS_META, ZONES, ZONE_META, type CafeState } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	let cafe = $state<CafeState>(data.state);
	let now = $state(Date.now());
	let offline = $state(false);
	let picked = $state<string | null>(null);

	const c = $derived(counts(cafe.pcs));
	const pickedPc = $derived(cafe.pcs.find((p) => p.id === picked) ?? null);

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
	<title>{c.free} PCs free · GG Gaming Joondalup</title>
	<meta name="description" content="Live PC availability at GG Gaming Cafe, Joondalup." />
</svelte:head>

<main>
	<header>
		<div class="brand display"><span class="logo">GG</span> Gaming Cafe <small>Joondalup</small></div>
		<h1 class="display">
			<span class="big" class:none={c.free === 0}>{c.free}</span>
			<span class="of">/ {c.total} PCs free</span>
		</h1>
		<div class="zones">
			{#each ZONES as z (z)}
				{#if c.zones[z].total}
					<span class="zone z-{z}">{ZONE_META[z].name} <b>{c.zones[z].free}/{c.zones[z].total}</b></span>
				{/if}
			{/each}
		</div>
	</header>

	{#if cafe.announcement}
		<p class="announce">📣 {cafe.announcement}</p>
	{/if}

	<section class="map" aria-label="PC seat map">
		<SeatMap pcs={cafe.pcs} {now} onseat={(id) => (picked = picked === id ? null : id)} />
	</section>

	<div class="detail" aria-live="polite">
		{#if pickedPc}
			{@const m = etaMinutes(pickedPc, now)}
			<strong>{pickedPc.label}</strong> · {ZONE_META[pickedPc.zone].name} ·
			<span class="st s-{pickedPc.status}">{STATUS_META[pickedPc.status].label}</span>
			{#if m !== null}· free in {etaLabel(m)}{/if}
		{:else}
			<span class="hint">Tap a PC for details</span>
		{/if}
	</div>

	<Legend />

	<footer>
		{#if offline}
			<span class="warn">Connection lost, retrying…</span>
		{:else}
			<span class="dot"></span> Live · updated {ago(cafe.updatedAt, now)}
		{/if}
		<p class="small">Refreshes automatically. PCs can fill up fast.</p>
	</footer>
</main>

<style>
	main {
		max-width: 900px;
		margin: 0 auto;
		padding: 1.25rem 16px 2.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}
	header {
		text-align: center;
	}
	.brand {
		font-size: 1.15rem;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--muted);
	}
	.brand small {
		font-weight: 600;
		color: var(--accent-2);
		letter-spacing: 0.15em;
		text-transform: uppercase;
		font-size: 0.75rem;
	}
	.logo {
		background: var(--accent);
		color: white;
		border-radius: 8px;
		padding: 0.05rem 0.45rem;
	}
	h1 {
		margin: 0.4rem 0 0.6rem;
		font-weight: 700;
		line-height: 1;
	}
	.big {
		font-size: clamp(3.5rem, 14vw, 5.5rem);
		color: var(--free);
		text-shadow: 0 0 30px var(--free-glow);
	}
	.big.none {
		color: var(--in-use);
		text-shadow: none;
	}
	.of {
		font-size: clamp(1.3rem, 5vw, 1.9rem);
		color: var(--muted);
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
	.z-pro {
		border-color: color-mix(in srgb, var(--pro) 50%, var(--line));
	}
	.z-console {
		border-color: color-mix(in srgb, var(--console) 50%, var(--line));
	}
	.announce {
		margin: 0;
		background: linear-gradient(90deg, rgba(124, 92, 255, 0.25), rgba(34, 211, 238, 0.15));
		border: 1px solid rgba(124, 92, 255, 0.5);
		border-radius: var(--radius);
		padding: 0.75rem 1rem;
		text-align: center;
	}
	.map {
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: 20px;
		padding: 1.25rem clamp(10px, 3vw, 28px) 1.75rem;
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
		color: var(--in-use);
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
	.dot {
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
		font-size: 0.78rem;
		opacity: 0.8;
	}
</style>
