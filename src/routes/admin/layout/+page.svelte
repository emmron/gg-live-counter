<script lang="ts">
	import AdminPanel from '#lib/components/AdminPanel.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Edit floor plan · GG Status</title></svelte:head>

<div class="wrap">
	<AdminPanel initial={data.state} layoutOnly />
</div>

<style>
	.wrap {
		max-width: 1400px;
		margin: 0 auto;
	}
</style>
