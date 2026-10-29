<script lang="ts">
	import OwnerView from '#lib/components/OwnerView.svelte';
	import PublicView from '#lib/components/PublicView.svelte';
	import { counts } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let preview: HTMLIFrameElement | undefined = $state();

	const free = $derived(counts(data.state.pcs).zones.pc.free);
	const refreshPreview = () => preview?.contentWindow?.postMessage('gg:refresh', location.origin);
</script>

<svelte:head>
	<title>{data.owner ? 'Owner · GG Status' : `${free} PCs free · GG Gaming Lounge Joondalup`}</title>
	<meta name="description" content="Live PC, racing sim and console availability at GG Gaming Lounge, Joondalup." />
</svelte:head>

{#if data.owner}
	<div class="split">
		<div class="left">
			<OwnerView initial={data.state} onsaved={refreshPreview} />
		</div>
		<div class="right">
			<div class="bar"><span class="dot"></span> What customers see right now</div>
			<iframe bind:this={preview} src="/?preview" title="Customer view"></iframe>
		</div>
	</div>
{:else}
	<PublicView initial={data.state} />
{/if}

<style>
	.split {
		display: grid;
		grid-template-columns: 1fr 1fr;
		height: 100vh;
		height: 100dvh;
	}
	.left {
		overflow-y: auto;
		border-right: 1px solid var(--line-2);
		background: #000;
	}
	.right {
		display: flex;
		flex-direction: column;
		min-width: 0;
		background: #000;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.55rem 1rem;
		font-family: var(--display);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-size: 0.8rem;
		color: var(--muted);
		border-bottom: 1px solid var(--line);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--cyan);
	}
	iframe {
		flex: 1;
		width: 100%;
		border: 0;
	}

	/* small screens: controls on top, preview below */
	@media (max-width: 1000px) {
		.split {
			grid-template-columns: 1fr;
			height: auto;
		}
		.left {
			overflow: visible;
			border-right: 0;
			border-bottom: 1px solid var(--line-2);
		}
		iframe {
			height: 90vh;
		}
	}
</style>
