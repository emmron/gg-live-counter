<script lang="ts">
	import OwnerShell from '#lib/components/OwnerShell.svelte';
	import PublicView from '#lib/components/PublicView.svelte';
	import { counts } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const free = $derived(counts(data.state.pcs).zones.pc.free);
</script>

<svelte:head>
	<title>{data.owner ? 'Owner · GG Status' : `${free} PCs free · GG Gaming Lounge Joondalup`}</title>
	<meta name="description" content="Live PC, racing sim and console availability at GG Gaming Lounge, Joondalup." />
</svelte:head>

{#if data.owner}
	<OwnerShell initial={data.state} />
{:else}
	<PublicView initial={data.state} />
{/if}
