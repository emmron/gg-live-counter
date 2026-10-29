<script lang="ts">
	import { onMount } from 'svelte';
	import OwnerView from '#lib/components/OwnerView.svelte';
	import FloorPlanEditor from '#lib/components/FloorPlanEditor.svelte';
	import WebsiteWidget from '#lib/components/WebsiteWidget.svelte';
	import { counts } from '#lib/format.ts';
	import { openStatus } from '#lib/hours.ts';
	import type { CafeState } from '#lib/types.ts';

	let { initial, storageMissing = false }: { initial: CafeState; storageMissing?: boolean } = $props();

	type Section = 'seats' | 'customer' | 'floor' | 'website';
	interface Item {
		id: Section;
		label: string;
		short: string;
		hint: string;
	}
	const GROUPS: { title: string; items: Item[] }[] = [
		{
			title: 'Run the floor',
			items: [
				{ id: 'seats', label: 'Update seats', short: 'Seats', hint: 'Click a seat when someone sits down or leaves.' },
				{ id: 'customer', label: 'Customer view', short: 'Customer', hint: 'Exactly what customers see right now.' }
			]
		},
		{
			title: 'Setup',
			items: [
				{
					id: 'floor',
					label: 'Floor plan',
					short: 'Floor plan',
					hint: 'Set how many PCs are in each row, plus sims and consoles. Nothing changes until you press Save.'
				},
				{ id: 'website', label: 'Website widget', short: 'Website', hint: 'Show live seats on your WordPress site.' }
			]
		}
	];
	const ITEMS = GROUPS.flatMap((g) => g.items);

	let section = $state<Section>('seats');
	// svelte-ignore state_referenced_locally
	let cafe = $state<CafeState>(initial);
	// svelte-ignore state_referenced_locally
	let c = $state(counts(initial.pcs));
	let now = $state(Date.now());
	/** bumps when the floor plan is saved so the seat board reloads with the new layout */
	let layoutVersion = $state(0);
	let preview: HTMLIFrameElement | undefined = $state();

	const current = $derived(ITEMS.find((i) => i.id === section)!);
	const hours = $derived(openStatus(now));
	const taken = $derived(c.zones.pc.total - c.zones.pc.free);
	const pct = $derived(c.zones.pc.total ? Math.round((taken / c.zones.pc.total) * 100) : 0);

	function go(id: Section) {
		section = id;
		history.replaceState(history.state, '', `#${id}`);
		window.scrollTo({ top: 0 });
	}

	// after a save: refresh the customer preview and the website-widget preview straight away
	function refreshPreviews() {
		preview?.contentWindow?.postMessage('gg:refresh', location.origin);
		(window as unknown as { GGSeats?: { refresh: () => void } }).GGSeats?.refresh();
	}

	function onFloorSaved(s: CafeState) {
		cafe = s;
		c = counts(s.pcs);
		layoutVersion++;
		refreshPreviews();
	}

	onMount(() => {
		const h = location.hash.slice(1);
		if (ITEMS.some((i) => i.id === h)) section = h as Section;
		const t = setInterval(() => (now = Date.now()), 30000);
		return () => clearInterval(t);
	});
</script>

{#snippet icon(id: Section)}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		{#if id === 'seats'}
			<rect x="3" y="4.5" width="5" height="5" rx="1.3" /><rect x="9.5" y="4.5" width="5" height="5" rx="1.3" class="fill" /><rect x="16" y="4.5" width="5" height="5" rx="1.3" />
			<rect x="3" y="12" width="5" height="5" rx="1.3" class="fill" /><rect x="9.5" y="12" width="5" height="5" rx="1.3" /><rect x="16" y="12" width="5" height="5" rx="1.3" />
			<path d="M3 20.5h18" />
		{:else if id === 'customer'}
			<rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" />
		{:else if id === 'floor'}
			<path d="M3 5.5h18v13H3z" /><path d="M3 11h9M12 5.5v5.5M16 11v7.5" />
		{:else}
			<rect x="2.5" y="4" width="19" height="16" rx="2" /><path d="M2.5 8.5h19M5.8 6.3h.01M8.3 6.3h.01" /><rect x="6" y="11.5" width="7" height="5" rx="1" />
		{/if}
	</svg>
{/snippet}

<div class="shell">
	<nav class="side" aria-label="Owner menu">
		<div class="brand">
			<img src="/brand/logo.png" alt="GG Gaming Lounge" />
			<span>Owner dashboard</span>
		</div>

		<!-- live status at a glance -->
		<div class="status">
			<div class="status-top">
				<span class="live" class:closed={!hours.open}><i></i>{hours.open ? 'Live' : 'Closed'}</span>
				<span class="hrs">{hours.text}</span>
			</div>
			<div class="status-num">
				<b>{c.zones.pc.free}</b>
				<span>of {c.zones.pc.total}<br />PCs free</span>
			</div>
			<div class="bar" role="img" aria-label="{pct}% of PCs in use"><i style="width:{pct}%"></i></div>
			<div class="status-extra">
				<span>Sims <b>{c.zones.sim.free}/{c.zones.sim.total}</b></span>
				<span>Consoles <b>{c.zones.console.free}/{c.zones.console.total}</b></span>
			</div>
		</div>

		{#each GROUPS as g (g.title)}
			<div class="group">
				<p class="group-title">{g.title}</p>
				<ul>
					{#each g.items as it (it.id)}
						<li>
							<button class:on={section === it.id} aria-current={section === it.id ? 'page' : undefined} onclick={() => go(it.id)}>
								<span class="tile">{@render icon(it.id)}</span>
								<span class="long">{it.label}</span><span class="short">{it.short}</span>
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/each}

		<div class="side-foot">
			<a class="foot-btn" href="/?preview" target="_blank" rel="noopener">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
				Open public page
			</a>
			<form method="POST" action="/admin/logout">
				<button class="foot-btn quiet">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" /></svg>
					Log out
				</button>
			</form>
		</div>
	</nav>

	<main>
		{#if storageMissing}
			<div class="alert" role="alert">
				<b>Database not connected.</b> Seat changes won’t stick until Upstash Redis is connected in Vercel
				(Storage → Upstash → Connect), then redeploy.
			</div>
		{/if}
		<header class="page-head">
			<h1>{current.label}</h1>
			<p>{current.hint}</p>
		</header>

		<!-- sections stay mounted so undo history and previews survive switching -->
		<div hidden={section !== 'seats'}>
			{#key layoutVersion}
				<OwnerView initial={cafe} active={section === 'seats'} onsaved={refreshPreviews} oncounts={(x) => (c = x)} />
			{/key}
		</div>
		<div class="customer" hidden={section !== 'customer'}>
			<iframe bind:this={preview} src="/?preview" title="Customer view"></iframe>
		</div>
		{#if section === 'floor'}
			<FloorPlanEditor initial={cafe} onsaved={onFloorSaved} />
		{/if}
		<div hidden={section !== 'website'}>
			<WebsiteWidget />
		</div>
	</main>
</div>

<style>
	.shell {
		--sidebar-w: 272px;
		display: grid;
		grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
		min-height: 100vh;
		min-height: 100dvh;
	}

	/* ---------------- side menu ---------------- */
	.side {
		position: sticky;
		top: 0;
		height: 100vh;
		height: 100dvh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1.4rem;
		padding: 1.4rem 1rem 1.1rem;
		background: linear-gradient(180deg, #0d1015 0%, #08090c 100%);
		border-right: 1px solid var(--line);
	}

	.brand {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding: 0 0.4rem;
	}
	.brand img {
		width: 150px;
		height: auto;
		display: block;
	}
	.brand span {
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--faded);
	}

	.status {
		padding: 0.95rem 1rem 1rem;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.025);
	}
	.status-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.78rem;
	}
	.live {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.live i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #2fd48b;
		box-shadow: 0 0 0 3px rgba(47, 212, 139, 0.18);
	}
	.live.closed i {
		background: var(--faded);
		box-shadow: none;
	}
	.hrs {
		color: var(--muted);
	}
	.status-num {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0.7rem 0 0.75rem;
	}
	.status-num b {
		font-family: var(--display);
		font-size: 3.1rem;
		line-height: 0.85;
	}
	.status-num span {
		font-size: 0.85rem;
		line-height: 1.25;
		color: var(--muted);
	}
	.bar {
		height: 5px;
		border-radius: 99px;
		background: rgba(255, 255, 255, 0.08);
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
		border-radius: 99px;
		background: var(--text);
		transition: width 0.6s ease;
	}
	.status-extra {
		display: flex;
		justify-content: space-between;
		margin-top: 0.7rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.status-extra b {
		color: var(--text);
	}

	.group-title {
		margin: 0 0 0.4rem;
		padding: 0 0.6rem;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--faded);
	}
	.group ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.group button {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.45rem 0.55rem;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--muted);
		font-size: 0.95rem;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}
	.group button:hover {
		background: rgba(255, 255, 255, 0.04);
		color: var(--text);
	}
	.tile {
		width: 34px;
		height: 34px;
		flex-shrink: 0;
		display: grid;
		place-items: center;
		border-radius: 9px;
		border: 1px solid var(--line);
		background: rgba(255, 255, 255, 0.03);
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	.tile svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.tile svg :global(.fill) {
		fill: currentColor;
	}
	.group button.on {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text);
		font-weight: 600;
	}
	.group button.on .tile {
		background: var(--text);
		border-color: var(--text);
		color: var(--bg);
	}
	.short {
		display: none;
	}

	.side-foot {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding-top: 1rem;
		border-top: 1px solid var(--line);
	}
	.side-foot form {
		margin: 0;
	}
	.foot-btn {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--line-2);
		border-radius: 10px;
		background: transparent;
		color: var(--text);
		font-size: 0.9rem;
		font-weight: 500;
		text-decoration: none;
		cursor: pointer;
	}
	.foot-btn:hover {
		background: rgba(255, 255, 255, 0.05);
	}
	.foot-btn.quiet {
		border-color: transparent;
		color: var(--muted);
	}
	.foot-btn.quiet:hover {
		color: var(--text);
	}
	.foot-btn svg {
		width: 17px;
		height: 17px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* ---------------- content ---------------- */
	main {
		min-width: 0;
		padding: 1.75rem clamp(16px, 2.6vw, 40px) 2rem;
	}
	.alert {
		margin-bottom: 1.25rem;
		padding: 0.8rem 1rem;
		border: 1px solid rgba(255, 99, 120, 0.5);
		border-radius: 10px;
		background: rgba(255, 99, 120, 0.1);
		color: #ffd6dc;
	}
	.page-head h1 {
		margin: 0;
		font-family: 'Inter', system-ui, sans-serif;
		text-transform: none;
		letter-spacing: -0.015em;
		font-size: 1.7rem;
		line-height: 1.2;
	}
	.page-head p {
		margin: 0.35rem 0 0;
		color: var(--muted);
	}
	.customer {
		margin-top: 1.25rem;
		border: 1px solid var(--line);
		border-radius: 12px;
		overflow: hidden;
	}
	.customer iframe {
		display: block;
		width: 100%;
		height: calc(100dvh - 10rem);
		min-height: 520px;
		border: 0;
		background: var(--bg);
	}

	/* ---------------- phones / small tablets: tabs across the top ---------------- */
	@media (max-width: 860px) {
		.shell {
			--sidebar-w: 0px;
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
		}
		.side {
			position: sticky;
			top: 0;
			z-index: 25;
			height: auto;
			overflow: visible;
			flex-direction: row;
			gap: 0;
			padding: 0.45rem 0.5rem;
			border-right: 0;
			border-bottom: 1px solid var(--line);
		}
		.brand,
		.status,
		.side-foot,
		.group-title,
		.tile,
		.long {
			display: none;
		}
		.short {
			display: inline;
		}
		.group,
		.group ul {
			display: contents;
		}
		.group li {
			flex: 1;
		}
		.group button {
			justify-content: center;
			padding: 0.55rem 0.3rem;
			font-size: 0.88rem;
			white-space: nowrap;
		}
		main {
			padding-top: 1.1rem;
		}
	}
</style>
