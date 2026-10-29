<script lang="ts">
	import { onMount, tick } from 'svelte';

	let origin = $state('');
	let copied = $state<string | null>(null);

	const codes = [
		{ code: '[gg_seats]', what: 'Full live card with mini seat map' },
		{ code: '[gg_seats style="compact"]', what: 'One-line badge for the homepage or header' },
		{ code: '[gg_seats theme="light"]', what: 'Full card for light-coloured sections' }
	];

	async function copy(code: string) {
		try {
			await navigator.clipboard.writeText(code);
		} catch {
			// clipboard blocked (e.g. not https): fall back to a selection the owner can copy
			prompt('Copy this shortcode:', code);
			return;
		}
		copied = code;
		setTimeout(() => copied === code && (copied = null), 1600);
	}

	onMount(async () => {
		origin = location.origin;
		await tick(); // preview placeholders need the origin, so render them first
		const w = window as unknown as { GGSeats?: { scan: () => void } };
		if (w.GGSeats) return w.GGSeats.scan();
		if (document.querySelector('script[data-gg-widget]')) return;
		const s = document.createElement('script');
		s.src = '/widget.js';
		s.dataset.ggWidget = '';
		document.body.appendChild(s);
	});
</script>

<section class="wp" aria-labelledby="wp-title">
	<header>
		<p class="lead" id="wp-title">
			Add a live card to any page of your WordPress site. It updates itself every 30 seconds from this board, so
			there’s nothing extra to keep up to date.
		</p>
	</header>

	<div class="grid">
		<ol class="steps">
			<li>
				<span class="n">1</span>
				<div>
					<h3>Download the plugin</h3>
					<p>A small WordPress plugin, already set up to read from this board.</p>
					<a class="btn primary" href="/wp/gg-seats.zip" download>Download gg-seats.zip</a>
				</div>
			</li>
			<li>
				<span class="n">2</span>
				<div>
					<h3>Install it</h3>
					<p>
						In WordPress: <b>Plugins → Add New → Upload Plugin</b>, choose the file, then <b>Install Now</b> and
						<b>Activate</b>.
					</p>
				</div>
			</li>
			<li>
				<span class="n">3</span>
				<div>
					<h3>Paste a shortcode</h3>
					<p>Add a <b>Shortcode</b> block wherever you want it to appear:</p>
					<div class="codes">
						{#each codes as c (c.code)}
							<div class="code">
								<div>
									<code>{c.code}</code>
									<span>{c.what}</span>
								</div>
								<button type="button" class:done={copied === c.code} onclick={() => copy(c.code)}>
									{copied === c.code ? 'Copied ✓' : 'Copy'}
								</button>
							</div>
						{/each}
					</div>
					<p class="small">More options and a live preview are under <b>Settings → GG Live Seats</b> in WordPress.</p>
				</div>
			</li>
		</ol>

		<div class="preview">
			<div class="browser" aria-label="Preview of the widget on your website">
				<div class="chrome">
					<i></i><i></i><i></i>
					<span class="addr">gggaminglounge.com.au</span>
				</div>
				<div class="site">
					<div class="nav">
						<img src="/brand/logo.png" alt="" />
						<span>Games · Leaderboards · Tournaments · Events</span>
					</div>
					{#if origin}
						<div class="slot">
							<div class="gg-seats" data-src={origin} data-style="compact"></div>
						</div>
						<div class="slot">
							<div class="gg-seats" data-src={origin}></div>
						</div>
					{/if}
				</div>
			</div>
			<p class="cap">Live preview: this is exactly what visitors to your site will see.</p>
		</div>
	</div>
</section>

<style>
	.wp {
		margin-top: 1rem;
		padding: 1.75rem;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--bg-2);
	}
	header {
		max-width: 46rem;
	}
	.lead {
		margin: 0;
		color: var(--muted);
	}

	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
		gap: 2rem;
		margin-top: 1.75rem;
		align-items: start;
	}

	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}
	.steps li {
		display: grid;
		grid-template-columns: 2rem minmax(0, 1fr);
		gap: 0.9rem;
	}
	.n {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		display: grid;
		place-items: center;
		border: 1.5px solid var(--line-2);
		font-weight: 700;
		font-size: 0.95rem;
	}
	h3 {
		margin: 0.2rem 0 0.3rem;
		font-family: 'Inter', system-ui, sans-serif;
		text-transform: none;
		letter-spacing: 0;
		font-size: 1.05rem;
		line-height: 1.3;
	}
	.steps p {
		margin: 0 0 0.75rem;
		color: var(--muted);
		font-size: 0.95rem;
	}
	.steps p b {
		color: var(--text);
		font-weight: 600;
	}
	.small {
		margin-top: 0.75rem !important;
		font-size: 0.85rem !important;
	}

	.codes {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.code {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.65rem 0.65rem 0.65rem 0.85rem;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--bg);
	}
	.code > div {
		min-width: 0;
	}
	code {
		display: block;
		font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
		font-size: 0.92rem;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.code span {
		display: block;
		margin-top: 0.15rem;
		font-size: 0.82rem;
		color: var(--muted);
	}
	.code button {
		flex-shrink: 0;
		min-width: 5.5rem;
		padding: 0.45rem 0.8rem;
		border: 1px solid var(--line-2);
		border-radius: 6px;
		background: transparent;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.85rem;
	}
	.code button:hover {
		border-color: var(--text);
	}
	.code button.done {
		border-color: transparent;
		background: var(--text);
		color: var(--bg);
	}

	/* mock browser showing their site */
	.browser {
		border: 1px solid var(--line-2);
		border-radius: 10px;
		overflow: hidden;
		background: #000;
	}
	.chrome {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0.55rem 0.75rem;
		background: #161a23;
		border-bottom: 1px solid var(--line);
	}
	.chrome i {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #3a4150;
	}
	.addr {
		margin-left: 0.6rem;
		flex: 1;
		padding: 0.2rem 0.7rem;
		border-radius: 999px;
		background: #0a0d13;
		color: var(--muted);
		font-size: 0.78rem;
	}
	.site {
		padding: 1rem 1.25rem 1.5rem;
		background: #000;
	}
	.nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 1rem;
		margin-bottom: 1.25rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	.nav img {
		height: 30px;
	}
	.nav span {
		font-family: var(--display);
		font-weight: 700;
		font-size: 0.7rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #fff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.slot + .slot {
		margin-top: 1.1rem;
	}
	.cap {
		margin: 0.6rem 0 0;
		font-size: 0.85rem;
		color: var(--muted);
	}

	@media (max-width: 1100px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
