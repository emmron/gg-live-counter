<script lang="ts">
	import { onMount } from 'svelte';
	import SeatMap from '#lib/components/SeatMap.svelte';
	import { ago, counts } from '#lib/format.ts';
	import { openStatus } from '#lib/hours.ts';
	import { FLOORS, FLOOR_META, ZONE_META, type CafeState } from '#lib/types.ts';

	let { initial }: { initial: CafeState } = $props();

	// svelte-ignore state_referenced_locally
	let cafe = $state<CafeState>(initial);
	let now = $state(Date.now());
	let offline = $state(false);
	let picked = $state<string | null>(null);

	const c = $derived(counts(cafe.pcs));
	const pcsFree = $derived(c.zones.pc);
	const hours = $derived(openStatus(now));
	const gridCols = $derived(Math.max(...cafe.pcs.map((p) => p.x + 1)));
	const pickedPc = $derived(cafe.pcs.find((p) => p.id === picked) ?? null);
	const floorFree = (fl: string) => {
		const list = cafe.pcs.filter((p) => p.floor === fl && p.zone === 'pc');
		return { free: list.filter((p) => p.status === 'free').length, total: list.length };
	};

	async function poll() {
		try {
			const r = await fetch('/api/status', { cache: 'no-store' });
			if (!r.ok) throw new Error();
			cafe = await r.json();
			offline = false;
		} catch {
			offline = true;
		}
		now = Date.now();
	}

	onMount(() => {
		const p = setInterval(() => document.visibilityState === 'visible' && poll(), 5000);
		const t = setInterval(() => (now = Date.now()), 15000);
		const vis = () => document.visibilityState === 'visible' && poll();
		// the owner's screen pings the preview to refresh instantly after a change
		const msg = (e: MessageEvent) => e.origin === location.origin && e.data === 'gg:refresh' && poll();
		document.addEventListener('visibilitychange', vis);
		addEventListener('message', msg);
		return () => {
			clearInterval(p);
			clearInterval(t);
			document.removeEventListener('visibilitychange', vis);
			removeEventListener('message', msg);
		};
	});
</script>

<div class="page">
	<header class="nav">
		<a href="https://gggaminglounge.com.au/" class="logo" aria-label="GG Gaming Lounge home">
			<img src="/brand/logo.png" alt="GG Gaming Lounge, No retreat, no surrender" />
		</a>
		<div class="nav-right">
			<span class="open" class:closed={!hours.open}><i></i>{hours.text}</span>
			<a class="btn primary" href="https://gggaminglounge.com.au/contact-us/">Contact us</a>
		</div>
	</header>

	<section class="hero">
		<div class="hero-text">
			<p class="eyebrow"><span class="live"></span> Live right now</p>
			<h1>
				<span class="num" class:none={pcsFree.free === 0}>{pcsFree.free}</span>
				<span class="of">/ {pcsFree.total}</span><br />
				PCs free.
			</h1>
			<p class="sub">
				{#if pcsFree.free === 0}
					Every PC is taken right now. Check back soon.
				{:else}
					Walk in and play. 3/24 Mercer Ln, Joondalup.
				{/if}
			</p>
			<div class="tiles">
				{#each FLOORS as fl (fl)}
					{@const f = floorFree(fl)}
					{#if f.total}
						<div class="tile">
							<span class="ic cut">{fl === 'ground' ? 'G' : '↑'}</span>
							<span><b>{f.free}</b> free {FLOOR_META[fl].name.toLowerCase()}</span>
						</div>
					{/if}
				{/each}
				{#each ['sim', 'console'] as const as z (z)}
					{#if c.zones[z].total}
						<div class="tile">
							<span class="ic cut">{z === 'sim' ? '🏁' : '🎮'}</span>
							<span><b>{c.zones[z].free}/{c.zones[z].total}</b> {ZONE_META[z].name.toLowerCase()} free</span>
						</div>
					{/if}
				{/each}
			</div>
		</div>
		<img class="spartan" src="/brand/spartan.png" alt="" />
	</section>

	{#if cafe.announcement}
		<p class="announce cut">{cafe.announcement}</p>
	{/if}

	{#each FLOORS as fl (fl)}
		{@const floorPcs = cafe.pcs.filter((p) => p.floor === fl)}
		{#if floorPcs.length}
			<section class="floor">
				<h2>{FLOOR_META[fl].name}</h2>
				<div class="scroll">
					<SeatMap pcs={floorPcs} floor={fl} {now} minCols={gridCols} onseat={(id) => (picked = picked === id ? null : id)} />
				</div>
			</section>
		{/if}
	{/each}

	<div class="below">
		<ul class="legend">
			<li><i class="free"></i>Free</li>
			<li><i class="taken"></i>Taken</li>
			<li><i class="ring sim"></i>Racing sim</li>
			<li><i class="ring console"></i>Console</li>
		</ul>
		<p class="picked" aria-live="polite">
			{#if pickedPc}
				<b>{pickedPc.label}</b> is {pickedPc.status === 'free' ? 'free' : 'taken'}
			{:else}
				<span class="muted">{offline ? 'Reconnecting…' : `Updated ${ago(cafe.updatedAt, now)}`}</span>
			{/if}
		</p>
	</div>

	<footer>
		<div class="detail"><span class="ic cut">🕑</span><span>Mon–Thu 12PM–12AM · Fri 12PM–1AM<br />Sat 10AM–1AM · Sun 10AM–12AM</span></div>
		<div class="detail"><span class="ic cut">📍</span><span>3/24 Mercer Ln, Joondalup WA 6027</span></div>
		<div class="detail"><span class="ic cut">✉</span><a href="mailto:info@gggaminglounge.com.au">info@gggaminglounge.com.au</a></div>
	</footer>
</div>

<style>
	.page {
		max-width: 1280px;
		margin: 0 auto;
		padding: 0 clamp(16px, 2.5vw, 28px) 2.5rem;
		position: relative;
	}
	.page::before {
		/* their blue mesh-gradient glow */
		content: '';
		position: absolute;
		inset: 0 -20vw auto;
		height: 640px;
		background: url('/brand/mesh.png') center top / cover no-repeat;
		opacity: 0.35;
		z-index: -1;
		pointer-events: none;
		mask-image: linear-gradient(180deg, #000 40%, transparent);
	}

	.nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 0;
	}
	.logo img {
		height: 52px;
		display: block;
	}
	.nav-right {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.open {
		font-family: var(--display);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.9rem;
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.open i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--cyan);
	}
	.open.closed i {
		background: #ff4d6d;
		box-shadow: none;
	}

	.hero {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.5rem 0 1rem;
	}
	.eyebrow {
		margin: 0 0 0.8rem;
		font-family: var(--display);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: var(--cyan);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.live {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--cyan);
		animation: pulse 2.4s infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.3;
		}
	}
	h1 {
		margin: 0;
		font-size: clamp(2.8rem, 7vw, 5.4rem);
		line-height: 0.92;
	}
	.num {
		color: var(--cyan);
	}
	.num.none {
		color: #fff;
		text-shadow: none;
	}
	.of {
		color: var(--faded);
		font-size: 0.55em;
	}
	.sub {
		margin: 1rem 0 1.4rem;
		font-size: 1rem;
		max-width: 34rem;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 15rem));
		gap: 0.75rem 1.5rem;
	}
	.tile,
	.detail {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		font-size: 0.95rem;
	}
	.tile b {
		font-family: var(--display);
		font-size: 1.25rem;
	}
	.ic {
		--cut: 9px;
		width: 42px;
		height: 38px;
		display: grid;
		place-items: center;
		background: #fff;
		color: #000;
		font-family: var(--display);
		font-weight: 700;
		font-size: 1.1rem;
		flex-shrink: 0;
	}
	.spartan {
		height: clamp(220px, 30vw, 380px);
		opacity: 0.9;
		margin-right: 2%;
	}

	.announce {
		--cut: 14px;
		margin: 0.5rem 0 1.25rem;
		background: #10151f;
		border-left: 4px solid var(--cyan);
		color: #fff;
		font-family: var(--display);
		font-weight: 600;
		font-size: 1.2rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.8rem 1.2rem;
	}

	.floor {
		margin-top: 1.4rem;
	}
	.floor h2 {
		margin: 0 0 0.6rem;
		font-size: clamp(1.3rem, 2.2vw, 1.7rem);
	}
	.scroll {
		overflow-x: auto;
		padding-bottom: 4px;
	}

	.below {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.8rem;
		margin-top: 1rem;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.2rem;
		list-style: none;
		margin: 0;
		padding: 0;
		font-family: var(--display);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.legend i {
		width: 20px;
		height: 17px;
		border-radius: 16% 16% 40% 40%;
	}
	.legend .free {
		background: var(--free);
		border: 1.5px solid var(--free-edge);
	}
	.legend .taken {
		background: var(--in-use);
		border: 1.5px solid var(--in-use-edge);
	}
	.legend .ring {
		border: 2.5px solid;
		border-radius: 30%;
	}
	.legend .sim {
		border-color: var(--sim);
	}
	.legend .console {
		border-color: var(--console);
	}
	.picked {
		margin: 0;
	}
	.muted {
		color: var(--muted);
	}

	footer {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem 2.5rem;
		margin-top: 2.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--line);
	}
	.detail a {
		color: var(--text);
	}

	@media (max-width: 760px) {
		.spartan {
			display: none;
		}
		.nav .btn {
			display: none;
		}
		.logo img {
			height: 42px;
		}
	}
</style>
