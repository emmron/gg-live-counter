<script lang="ts">
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<svelte:head><title>Owner login · GG Status</title></svelte:head>

<main>
	<form method="POST">
		<h1 class="display"><span class="logo">GG</span> Owner login</h1>
		<label>
			<span class="visually-hidden">Password</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input name="password" type="password" placeholder="Password" autocomplete="current-password" required autofocus />
		</label>
		{#if form?.wrong}<p class="err">Wrong password</p>{/if}
		<button class="btn primary">Log in</button>
		<a href="/">← Back to status page</a>
	</form>
</main>

<style>
	main {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 16px;
	}
	form {
		width: min(340px, 100%);
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 18px;
		padding: 1.75rem;
	}
	h1 {
		margin: 0 0 0.5rem;
		font-size: 1.6rem;
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.logo {
		background: var(--accent);
		border-radius: 8px;
		padding: 0 0.4rem;
	}
	input {
		width: 100%;
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 0.7rem 0.85rem;
	}
	input:focus {
		outline: 2px solid var(--accent);
		border-color: transparent;
	}
	.err {
		color: var(--in-use);
		margin: 0;
	}
	a {
		color: var(--muted);
		font-size: 0.85rem;
		text-align: center;
	}
</style>
