<script lang="ts">
	import { onMount } from 'svelte';
	import SeatMap from '#lib/components/SeatMap.svelte';
	import { counts } from '#lib/format.ts';
	import { FLOORS, FLOOR_META, type CafeState, type PC, type Status } from '#lib/types.ts';

	interface Props {
		initial: CafeState;
		/** Called after every successful save, e.g. to refresh the live preview. */
		onsaved?: () => void;
	}
	let { initial, onsaved }: Props = $props();

	// svelte-ignore state_referenced_locally
	let pcs = $state<PC[]>(initial.pcs);
	let saving = $state(0);
	let failed = $state(false);
	let typed = $state('');
	let typedError = $state(false);
	let toast = $state<string | null>(null);
	let toastTimer: ReturnType<typeof setTimeout>;
	let inputEl: HTMLInputElement;

	/** Each change remembers what the seats were, so Undo can put them back. */
	let undoStack: { ids: string[]; was: Status[] }[] = [];

	const byId = $derived(new Map(pcs.map((p) => [p.id, p])));
	const c = $derived(counts(pcs));
	const gridCols = $derived(Math.max(...pcs.map((p) => p.x + 1)));
	const taken = (s: Status) => s !== 'free';

	async function send(body: unknown) {
		saving++;
		try {
			const r = await fetch('/api/status', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (r.status === 401) return void (location.href = '/admin/login');
			if (!r.ok) throw new Error();
			failed = false;
			const s = await r.json();
			if (saving === 1 && !painting) pcs = s.pcs;
			onsaved?.();
		} catch {
			failed = true;
		} finally {
			saving--;
		}
	}

	async function refresh() {
		if (saving > 0 || painting) return;
		try {
			const r = await fetch('/api/status', { cache: 'no-store' });
			if (r.ok) pcs = (await r.json()).pcs;
		} catch {
			/* offline: next tick */
		}
	}

	function flash(msg: string) {
		toast = msg;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = null), 3500);
	}

	/** Set seats to free or taken, save, and offer Undo. */
	function setSeats(ids: string[], status: Status) {
		const changed = ids.filter((id) => byId.get(id)?.status !== status);
		if (!changed.length) return;
		const was = changed.map((id) => byId.get(id)!.status);
		for (const id of changed) {
			const p = byId.get(id)!;
			p.status = status;
			p.freeAt = null;
		}
		undoStack = [...undoStack.slice(-30), { ids: changed, was }];
		send({ ids: changed, status });
		const who = changed.length === 1 ? byId.get(changed[0])!.label : `${changed.length} seats`;
		flash(`${who} ${status === 'free' ? 'now free' : 'now taken'}`);
	}

	function toggle(id: string) {
		const p = byId.get(id);
		if (p) setSeats([id], taken(p.status) ? 'free' : 'in_use');
	}

	function undo() {
		const last = undoStack.at(-1);
		if (!last) return;
		undoStack = undoStack.slice(0, -1);
		const groups = new Map<Status, string[]>();
		last.ids.forEach((id, i) => {
			const p = byId.get(id);
			if (p) p.status = last.was[i];
			groups.set(last.was[i], [...(groups.get(last.was[i]) ?? []), id]);
		});
		for (const [status, ids] of groups) send({ ids, status });
		flash('Undone');
	}

	// ---- click, or hold and drag across a row ----
	let painting = false;
	let target: Status = 'in_use';
	/** seats touched during this click/drag → what they were before */
	let painted = new Map<string, Status>();

	function onpaint(id: string, first: boolean) {
		const p = byId.get(id);
		if (!p) return;
		if (first) {
			painting = true;
			target = taken(p.status) ? 'free' : 'in_use';
			painted = new Map();
		}
		if (painted.has(id) || p.status === target) return;
		painted.set(id, p.status);
		p.status = target; // instant feedback while dragging
	}

	function onpaintend() {
		painting = false;
		const touched = painted;
		painted = new Map();
		// restore, then apply once properly so it saves in one go and Undo works
		for (const [id, was] of touched) byId.get(id)!.status = was;
		setSeats([...touched.keys()], target);
	}

	// ---- type a seat number + Enter ----
	function submitTyped(e: SubmitEvent) {
		e.preventDefault();
		const q = typed.trim().toUpperCase().replace(/\s+/g, '');
		if (!q) return;
		const p = pcs.find((s) => s.label.toUpperCase() === q);
		if (!p) {
			typedError = true;
			setTimeout(() => (typedError = false), 900);
			return;
		}
		toggle(p.id);
		typed = '';
	}

	function clearAll() {
		if (!confirm('Mark every seat as free?')) return;
		setSeats(
			pcs.map((p) => p.id),
			'free'
		);
	}

	onMount(() => {
		const poll = setInterval(() => document.visibilityState === 'visible' && refresh(), 8000);
		const key = (e: KeyboardEvent) => {
			const inInput = (e.target as HTMLElement).closest('input');
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !inInput) {
				e.preventDefault();
				return undo();
			}
			// start typing a seat number from anywhere
			if (!inInput && !e.ctrlKey && !e.metaKey && !e.altKey && /^[a-z0-9]$/i.test(e.key)) inputEl?.focus();
		};
		addEventListener('keydown', key);
		return () => {
			clearInterval(poll);
			removeEventListener('keydown', key);
		};
	});
</script>

<div class="owner">
	<header>
		<div>
			<h1>Click a seat when someone sits down or leaves</h1>
			<p class="legend">
				<span class="key free"></span> Free <span class="key taken"></span> Taken
				<span class="dim">· click again to switch back</span>
			</p>
		</div>
		<div class="count">
			<b>{c.free}</b><span>free of<br />{c.total}</span>
		</div>
	</header>

	<form class="type" class:bad={typedError} onsubmit={submitTyped}>
		<label for="seat">Or type a seat number</label>
		<input
			id="seat"
			bind:this={inputEl}
			bind:value={typed}
			placeholder="e.g. B7"
			autocomplete="off"
			spellcheck="false"
		/>
		<button class="btn primary">Switch</button>
	</form>

	{#each FLOORS as fl (fl)}
		<section>
			<h2>{FLOOR_META[fl].name}</h2>
			<SeatMap
				pcs={pcs.filter((p) => p.floor === fl)}
				floor={fl}
				minCols={gridCols}
				mode="owner"
				{onpaint}
				{onpaintend}
			/>
		</section>
	{/each}

	<footer>
		<span class="sync" class:bad={failed}>
			{failed ? '⚠ Not saving: check the internet' : saving ? 'Saving…' : '✓ All changes are live'}
		</span>
		<span class="grow"></span>
		<button class="link" onclick={clearAll}>Mark all free</button>
		<a class="link" href="/admin/layout">Edit floor plan</a>
		<form method="POST" action="/admin/logout"><button class="link">Log out</button></form>
	</footer>
</div>

{#if toast}
	<div class="toast" role="status">
		<span>{toast}</span>
		<button onclick={undo}>Undo</button>
	</div>
{/if}

<style>
	.owner {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.2rem clamp(12px, 2vw, 24px) 1.2rem;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	h1 {
		margin: 0;
		font-size: clamp(1.4rem, 2.4vw, 2rem);
		line-height: 1.05;
	}
	.legend {
		margin: 0.45rem 0 0;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		font-size: 0.95rem;
	}
	.key {
		display: inline-block;
		width: 20px;
		height: 17px;
		border-radius: 16% 16% 40% 40%;
		margin-left: 0.3rem;
	}
	.key.free {
		background: var(--free);
		box-shadow: 0 0 10px var(--free-glow);
	}
	.key.taken {
		background: var(--in-use);
		border: 1px solid #3a4258;
	}
	.dim {
		color: var(--muted);
	}
	.count {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-family: var(--display);
		text-transform: uppercase;
		flex-shrink: 0;
	}
	.count b {
		font-size: 3.6rem;
		line-height: 0.85;
		color: var(--cyan);
		text-shadow: 0 0 24px var(--free-glow);
	}
	.count span {
		font-weight: 700;
		font-size: 0.95rem;
		letter-spacing: 0.06em;
		color: var(--muted);
		line-height: 1.1;
	}

	.type {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.type label {
		font-family: var(--display);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
		white-space: nowrap;
	}
	.type input {
		width: 9rem;
		background: var(--panel-2);
		border: 1px solid var(--line-2);
		border-radius: 6px;
		padding: 0.6rem 0.8rem;
		font-family: var(--display);
		font-weight: 700;
		font-size: 1.15rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.type input:focus {
		outline: 2px solid var(--cyan);
		border-color: transparent;
	}
	.type.bad input {
		outline: 2px solid #ff4d6d;
		animation: shake 0.3s;
	}
	@keyframes shake {
		25% {
			transform: translateX(-4px);
		}
		75% {
			transform: translateX(4px);
		}
	}

	h2 {
		margin: 0 0 0.5rem;
		font-size: 0.95rem;
		letter-spacing: 0.14em;
		color: var(--muted);
	}

	footer {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem 1.2rem;
		font-size: 0.85rem;
	}
	footer form {
		margin: 0;
	}
	.grow {
		flex: 1;
	}
	.sync {
		color: var(--cyan);
	}
	.sync.bad {
		color: #ff4d6d;
		font-weight: 600;
	}
	.link {
		background: none;
		border: 0;
		padding: 0;
		color: var(--muted);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
		font-size: inherit;
	}
	.link:hover {
		color: var(--cyan);
	}

	.toast {
		position: fixed;
		left: 25%;
		bottom: 1.25rem;
		transform: translateX(-50%);
		z-index: 70;
		display: flex;
		align-items: center;
		gap: 1rem;
		background: #fff;
		color: #000;
		padding: 0.5rem 0.55rem 0.5rem 1.1rem;
		font-family: var(--display);
		font-weight: 700;
		font-size: 1.05rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
		white-space: nowrap;
	}
	.toast button {
		background: #000;
		color: var(--cyan);
		border: 0;
		padding: 0.4rem 0.9rem;
		font: inherit;
		cursor: pointer;
		clip-path: polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px);
	}
	@media (max-width: 1000px) {
		.toast {
			left: 50%;
		}
	}
</style>
