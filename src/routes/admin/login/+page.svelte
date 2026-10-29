<script lang="ts">
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	let show = $state(false);
	let busy = $state(false);
</script>

<svelte:head>
	<title>Owner login · GG Status</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main>
	<form method="POST" onsubmit={() => (busy = true)}>
		<img class="logo" src="/brand/logo.png" alt="GG Gaming Lounge" />

		<div class="head">
			<h1>Owner login</h1>
			<p>Log in once on the front-desk PC. It stays logged in on this device for a year.</p>
		</div>

		<label for="pw">Password</label>
		<div class="pw" class:bad={form?.wrong}>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				id="pw"
				name="password"
				type={show ? 'text' : 'password'}
				autocomplete="current-password"
				required
				autofocus
				aria-invalid={form?.wrong ? 'true' : undefined}
				aria-describedby={form?.wrong ? 'pw-err' : undefined}
			/>
			<button type="button" class="eye" onclick={() => (show = !show)} aria-label={show ? 'Hide password' : 'Show password'}>
				{show ? 'Hide' : 'Show'}
			</button>
		</div>
		{#if form?.wrong}
			<p class="err" id="pw-err" role="alert">That password isn’t right. Try again.</p>
		{/if}

		<button class="btn primary submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>

		<a class="back" href="/">← Back to the live seat map</a>
	</form>
</main>

<style>
	main {
		min-height: 100vh;
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 24px 16px;
		background:
			radial-gradient(700px 380px at 50% 0%, rgba(80, 120, 255, 0.12), transparent 70%),
			var(--bg);
	}
	form {
		width: min(400px, 100%);
		display: flex;
		flex-direction: column;
		padding: 2.25rem 2rem 1.75rem;
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: 16px;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
	}
	.logo {
		width: 170px;
		align-self: center;
		margin-bottom: 1.75rem;
	}
	.head {
		margin-bottom: 1.5rem;
		text-align: center;
	}
	h1 {
		margin: 0;
		font-family: 'Inter', system-ui, sans-serif;
		text-transform: none;
		letter-spacing: -0.01em;
		font-size: 1.5rem;
	}
	.head p {
		margin: 0.45rem 0 0;
		color: var(--muted);
		font-size: 0.92rem;
	}
	label {
		font-size: 0.88rem;
		font-weight: 600;
		margin-bottom: 0.4rem;
	}
	.pw {
		display: flex;
		border: 1px solid var(--line-2);
		border-radius: 10px;
		background: var(--bg);
		overflow: hidden;
	}
	.pw:focus-within {
		outline: 2px solid var(--text);
		border-color: transparent;
	}
	.pw.bad {
		border-color: #ff8a9b;
	}
	.pw input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: 0.8rem 0.9rem;
		font-size: 1rem;
		outline: none;
	}
	.eye {
		border: 0;
		background: transparent;
		color: var(--muted);
		padding: 0 0.9rem;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}
	.eye:hover {
		color: var(--text);
	}
	.err {
		margin: 0.55rem 0 0;
		color: #ff9aa9;
		font-size: 0.9rem;
	}
	.submit {
		margin-top: 1.25rem;
		width: 100%;
		padding: 0.85em 1em;
		font-size: 16px;
	}
	.back {
		margin-top: 1.25rem;
		text-align: center;
		color: var(--muted);
		font-size: 0.88rem;
		text-decoration: none;
	}
	.back:hover {
		color: var(--text);
	}
</style>
