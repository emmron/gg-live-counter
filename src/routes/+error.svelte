<script lang="ts">
	import { page } from '$app/state';

	const notFound = $derived(page.status === 404);
</script>

<svelte:head><title>{notFound ? 'Page not found' : 'Something went wrong'} · GG Gaming Lounge</title></svelte:head>

<main>
	<img class="logo" src="/brand/logo.png" alt="GG Gaming Lounge" />
	<p class="code">{page.status}</p>
	<h1>{notFound ? 'This page doesn’t exist' : 'Something went wrong'}</h1>
	<p class="msg">
		{notFound
			? 'The link may be old or mistyped. The live seat map is one click away.'
			: 'Please try again in a moment. If it keeps happening, let the front desk know.'}
	</p>
	<a class="btn primary" href="/">See live seats</a>
</main>

<style>
	main {
		min-height: 100vh;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		padding: 24px 16px;
		text-align: center;
		background:
			radial-gradient(700px 380px at 50% 0%, rgba(80, 120, 255, 0.12), transparent 70%),
			var(--bg);
	}
	.logo {
		width: 170px;
		margin-bottom: 2rem;
	}
	.code {
		margin: 0;
		font-family: var(--display);
		font-weight: 700;
		font-size: 4.5rem;
		line-height: 1;
		color: var(--faded);
	}
	h1 {
		margin: 0.5rem 0 0;
		font-family: 'Inter', system-ui, sans-serif;
		text-transform: none;
		letter-spacing: -0.01em;
		font-size: 1.6rem;
	}
	.msg {
		margin: 0.5rem 0 1.5rem;
		max-width: 26rem;
		color: var(--muted);
	}
</style>
