<script lang="ts">
	import { onMount } from 'svelte';
	import OwnerView from '#lib/components/OwnerView.svelte';
	import WebsiteWidget from '#lib/components/WebsiteWidget.svelte';
	import { counts } from '#lib/format.ts';
	import type { CafeState } from '#lib/types.ts';

	let { initial }: { initial: CafeState } = $props();

	type Section = 'seats' | 'customer' | 'website';
	const SECTIONS: { id: Section; label: string; short: string; hint: string }[] = [
		{ id: 'seats', label: 'Update seats', short: 'Seats', hint: 'Click a seat when someone sits down or leaves' },
		{ id: 'customer', label: 'Customer view', short: 'Customer', hint: 'Exactly what customers see right now' },
		{ id: 'website', label: 'Website widget', short: 'Website', hint: 'Show live seats on your WordPress site' }
	];

	let section = $state<Section>('seats');
	// svelte-ignore state_referenced_locally
	const start = counts(initial.pcs).zones.pc;
	let free = $state(start.free);
	let total = $state(start.total);
	let preview: HTMLIFrameElement | undefined = $state();

	function go(id: Section) {
		section = id;
		history.replaceState(history.state, '', `#${id}`);
	}

	// after a save: refresh the customer preview and the website widget preview straight away
	function onsaved() {
		preview?.contentWindow?.postMessage('gg:refresh', location.origin);
		(window as unknown as { GGSeats?: { refresh: () => void } }).GGSeats?.refresh();
	}

	onMount(() => {
		const h = location.hash.slice(1);
		if (SECTIONS.some((s) => s.id === h)) section = h as Section;
	});
</script>

<div class="shell">
	<nav class="side" aria-label="Owner menu">
		<div class="brand">
			<img src="/brand/helmet.png" alt="" />
			<div>
				<b>GG Status</b>
				<span>Owner</span>
			</div>
		</div>

		<ul class="menu">
			{#each SECTIONS as s (s.id)}
				<li>
					<button class:on={section === s.id} aria-current={section === s.id ? 'page' : undefined} onclick={() => go(s.id)}>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							{#if s.id === 'seats'}
								<rect x="3" y="4" width="5" height="5" rx="1.2" /><rect x="9.5" y="4" width="5" height="5" rx="1.2" /><rect x="16" y="4" width="5" height="5" rx="1.2" />
								<rect x="3" y="11" width="5" height="5" rx="1.2" /><rect x="9.5" y="11" width="5" height="5" rx="1.2" class="fill" /><rect x="16" y="11" width="5" height="5" rx="1.2" />
								<path d="M3 20h18" />
							{:else if s.id === 'customer'}
								<rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M10.5 18.5h3" />
							{:else}
								<rect x="2.5" y="4" width="19" height="16" rx="2" /><path d="M2.5 8.5h19M6 6.3h.01M8.5 6.3h.01" /><rect x="6" y="11.5" width="7" height="5" rx="1" />
							{/if}
						</svg>
						<span class="long">{s.label}</span><span class="short">{s.short}</span>
					</button>
				</li>
			{/each}
			<li>
				<a href="/admin/layout">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4zM14 6l3 3" /></svg>
					<span class="long">Edit floor plan</span><span class="short">Floor plan</span>
				</a>
			</li>
		</ul>

		<div class="side-foot">
			<div class="count">
				<b>{free}</b><span>of {total}<br />PCs free</span>
			</div>
			<a class="sub-link" href="/?preview" target="_blank" rel="noopener">Open public page ↗</a>
			<form method="POST" action="/admin/logout"><button class="sub-link">Log out</button></form>
		</div>
	</nav>

	<main>
		{#each SECTIONS as s (s.id)}
			{#if section === s.id}
				<header class="page-head">
					<h1>{s.label}</h1>
					<p>{s.hint}</p>
				</header>
			{/if}
		{/each}

		<!-- sections stay mounted so undo history and previews survive switching -->
		<div hidden={section !== 'seats'}>
			<OwnerView {initial} active={section === 'seats'} {onsaved} oncounts={(f, t) => ((free = f), (total = t))} />
		</div>
		<div class="customer" hidden={section !== 'customer'}>
			<iframe bind:this={preview} src="/?preview" title="Customer view"></iframe>
		</div>
		<div hidden={section !== 'website'}>
			<WebsiteWidget />
		</div>
	</main>
</div>

<style>
	.shell {
		display: grid;
		grid-template-columns: 240px minmax(0, 1fr);
		min-height: 100vh;
		min-height: 100dvh;
	}

	/* ---- side menu ---- */
	.side {
		position: sticky;
		top: 0;
		height: 100vh;
		height: 100dvh;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1.25rem 0.9rem;
		background: var(--bg-2);
		border-right: 1px solid var(--line);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0 0.5rem;
	}
	.brand img {
		height: 38px;
	}
	.brand b {
		display: block;
		font-size: 1.05rem;
	}
	.brand span {
		display: block;
		font-size: 0.8rem;
		color: var(--muted);
	}

	.menu {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.menu button,
	.menu a {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.65rem 0.75rem;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--muted);
		font-size: 0.95rem;
		font-weight: 500;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		position: relative;
	}
	.menu button:hover,
	.menu a:hover {
		background: var(--panel-2);
		color: var(--text);
	}
	.menu .on {
		background: var(--panel-2);
		color: var(--text);
		font-weight: 600;
	}
	.menu .on::before {
		content: '';
		position: absolute;
		left: -0.9rem;
		top: 0.5rem;
		bottom: 0.5rem;
		width: 3px;
		border-radius: 0 3px 3px 0;
		background: var(--text);
	}
	.menu svg {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.menu svg .fill {
		fill: currentColor;
	}
	.short {
		display: none;
	}

	.side-foot {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 1rem 0.5rem 0;
		border-top: 1px solid var(--line);
	}
	.count {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.3rem;
	}
	.count b {
		font-family: var(--display);
		font-size: 2.6rem;
		line-height: 0.9;
	}
	.count span {
		font-size: 0.85rem;
		color: var(--muted);
		line-height: 1.25;
	}
	.side-foot form {
		margin: 0;
	}
	.sub-link {
		background: none;
		border: 0;
		padding: 0;
		color: var(--muted);
		font-size: 0.9rem;
		text-decoration: none;
		text-align: left;
		cursor: pointer;
	}
	.sub-link:hover {
		color: var(--text);
	}

	/* ---- content ---- */
	main {
		min-width: 0;
		padding: 1.5rem clamp(16px, 2.5vw, 36px) 2rem;
	}
	.page-head {
		margin-bottom: 0.5rem;
	}
	.page-head h1 {
		margin: 0;
		font-family: 'Inter', system-ui, sans-serif;
		text-transform: none;
		letter-spacing: -0.01em;
		font-size: 1.6rem;
		line-height: 1.2;
	}
	.page-head p {
		margin: 0.3rem 0 0;
		color: var(--muted);
	}
	.customer {
		margin-top: 1rem;
		border: 1px solid var(--line);
		border-radius: 12px;
		overflow: hidden;
	}
	.customer iframe {
		display: block;
		width: 100%;
		height: calc(100dvh - 9rem);
		min-height: 520px;
		border: 0;
		background: var(--bg);
	}

	/* ---- phones / small tablets: menu becomes tabs across the top ---- */
	@media (max-width: 820px) {
		.shell {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
		}
		.long {
			display: none;
		}
		.short {
			display: inline;
		}
		.side {
			position: sticky;
			top: 0;
			z-index: 20;
			height: auto;
			flex-direction: row;
			align-items: center;
			gap: 0.5rem;
			padding: 0.5rem 0.75rem;
			border-right: 0;
			border-bottom: 1px solid var(--line);
			overflow-x: auto;
		}
		.brand div,
		.side-foot {
			display: none;
		}
		.brand img {
			height: 30px;
		}
		.menu {
			flex-direction: row;
		}
		.menu {
			gap: 0.1rem;
		}
		.menu button,
		.menu a {
			white-space: nowrap;
			padding: 0.5rem 0.6rem;
			gap: 0.4rem;
			font-size: 0.9rem;
		}
		/* phones: text-only tabs so all four fit */
		.menu svg,
		.brand {
			display: none;
		}
		.menu {
			width: 100%;
			justify-content: space-between;
		}
		main {
			padding-top: 1rem;
		}
		.menu .on::before {
			display: none;
		}
	}
</style>
