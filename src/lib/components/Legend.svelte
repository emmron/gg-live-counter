<script lang="ts">
	import { STATUSES, STATUS_META } from '#lib/types.ts';

	let { showKeys = false }: { showKeys?: boolean } = $props();
</script>

<ul class="legend">
	{#each STATUSES as s (s)}
		<li>
			<span class="chip s-{s}">{s === 'offline' ? '✕' : ''}</span>
			{STATUS_META[s].label}
			{#if showKeys}<kbd>{STATUS_META[s].key}</kbd>{/if}
		</li>
	{/each}
	<li><span class="chip ring sim"></span>Racing sim</li>
	<li><span class="chip ring console"></span>Console</li>
	<li><span class="bench"></span>Screens</li>
</ul>

<style>
	.legend {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem 1.1rem;
		list-style: none;
		margin: 0;
		padding: 0;
		font-size: 0.9rem;
		color: var(--muted);
	}
	li {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.chip {
		width: 18px;
		height: 16px;
		border-radius: 6px 6px 3px 3px;
		display: grid;
		place-items: center;
		font-size: 10px;
		color: var(--muted);
	}
	.s-free {
		background: var(--free);
		box-shadow: 0 0 10px var(--free-glow);
	}
	.s-in_use {
		background: var(--in-use);
	}
	.s-reserved {
		background: var(--reserved);
	}
	.s-offline {
		border: 1.5px dashed var(--line);
	}
	.ring {
		background: transparent;
		border: 2px solid;
	}
	.sim {
		border-color: var(--sim);
	}
	.console {
		border-color: var(--console);
	}
	.bench {
		width: 18px;
		height: 4px;
		border-radius: 2px;
		background: var(--screen);
		box-shadow: 0 0 6px var(--screen);
	}
</style>
