<script lang="ts">
	import { onMount } from 'svelte';
	import SeatMap from '#lib/components/SeatMap.svelte';
	import Legend from '#lib/components/Legend.svelte';
	import { counts, etaLabel, etaMinutes } from '#lib/format.ts';
	import { MAX_GRID, STATUSES, STATUS_META, ZONES, ZONE_META, type PC, type Status, type Zone } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	let pcs = $state<PC[]>(data.state.pcs);
	// svelte-ignore state_referenced_locally
	let announcement = $state(data.state.announcement);
	// svelte-ignore state_referenced_locally
	let savedAnnouncement = $state(data.state.announcement);

	let mode = $state<'status' | 'layout'>('status');
	let selected = $state<string[]>([]);
	let cursor = $state<string | null>(null);
	let history = $state.raw<PC[][]>([]);
	let dirty = $state(false);
	let menu = $state<{ x: number; y: number } | null>(null);
	let help = $state(false);
	let jump = $state<string | null>(null);
	let toast = $state<{ msg: string; err: boolean } | null>(null);
	let now = $state(Date.now());
	let inflight = 0;
	let toastTimer: ReturnType<typeof setTimeout>;

	const byId = $derived(new Map(pcs.map((p) => [p.id, p])));
	const c = $derived(counts(pcs));
	const selPcs = $derived(selected.map((id) => byId.get(id)).filter((p): p is PC => !!p));

	// ---------- helpers ----------
	function flash(msg: string, err = false) {
		toast = { msg, err };
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = null), err ? 4000 : 1800);
	}

	function snapshot() {
		history = [...history.slice(-49), $state.snapshot(pcs) as PC[]];
	}

	async function api(method: 'PATCH' | 'PUT', body: unknown): Promise<boolean> {
		inflight++;
		try {
			const r = await fetch('/api/status', {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (r.status === 401) {
				location.href = '/admin/login';
				return false;
			}
			if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? r.statusText);
			const s = await r.json();
			// Only take the server copy when nothing else is pending, to avoid flicker.
			if (inflight === 1 && mode === 'status') pcs = s.pcs;
			return true;
		} catch (e) {
			flash(`Save failed: ${(e as Error).message}`, true);
			if (mode === 'status') await refresh(true);
			return false;
		} finally {
			inflight--;
		}
	}

	async function refresh(force = false) {
		if (!force && (inflight > 0 || mode === 'layout')) return;
		try {
			const r = await fetch('/api/status', { cache: 'no-store' });
			if (!r.ok) return;
			const s = await r.json();
			if (force || (inflight === 0 && mode === 'status')) {
				pcs = s.pcs;
				if (announcement === savedAnnouncement) announcement = s.announcement;
				savedAnnouncement = s.announcement;
				dirty = false;
			}
		} catch {
			/* offline – try again next tick */
		}
	}

	// ---------- status actions ----------
	function need(ids: string[]) {
		if (!ids.length) flash('Select a PC first (click, drag, or press / to jump)');
		return ids.length > 0;
	}

	function setStatus(status: Status, ids = selected) {
		if (!need(ids)) return;
		snapshot();
		const want = new Set(ids);
		const t = new Date().toISOString();
		for (const p of pcs)
			if (want.has(p.id)) {
				p.status = status;
				if (status !== 'in_use') p.freeAt = null;
				p.updatedAt = t;
			}
		api('PATCH', { ids, status });
		flash(`${ids.length === 1 ? byId.get(ids[0])?.label : ids.length + ' PCs'} → ${STATUS_META[status].label}`);
	}

	function setEta(mins: number | null, ids = selected) {
		if (!need(ids)) return;
		snapshot();
		const want = new Set(ids);
		const freeAt = mins ? new Date(Date.now() + mins * 60000).toISOString() : null;
		for (const p of pcs)
			if (want.has(p.id)) {
				if (mins) p.status = 'in_use';
				p.freeAt = p.status === 'in_use' ? freeAt : null;
			}
		api('PATCH', { ids, freeInMin: mins });
		flash(mins ? `Free in ~${mins} min` : 'Time estimate cleared');
	}

	function allFree() {
		if (!confirm('Set every PC to Free?')) return;
		setStatus(
			'free',
			pcs.map((p) => p.id)
		);
	}

	async function undo() {
		const prev = history.at(-1);
		if (!prev) return flash('Nothing to undo');
		history = history.slice(0, -1);
		pcs = prev;
		if (mode === 'status') {
			if (await api('PUT', { pcs: prev })) flash('Undone');
		} else {
			dirty = true;
			flash('Undone');
		}
	}

	async function saveAnnouncement() {
		if (await api('PUT', { announcement })) {
			savedAnnouncement = announcement.trim();
			announcement = savedAnnouncement;
			flash(announcement ? 'Announcement posted' : 'Announcement cleared');
		}
	}

	// ---------- selection ----------
	function onseat(id: string, e: MouseEvent) {
		menu = null;
		if (e.shiftKey || e.ctrlKey || e.metaKey)
			selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
		else if (!(mode === 'layout' && selected.includes(id))) selected = [id];
		cursor = id;
	}

	function oncontext(id: string, e: MouseEvent) {
		if (!selected.includes(id)) selected = [id];
		cursor = id;
		menu = { x: Math.min(e.clientX, innerWidth - 200), y: Math.min(e.clientY, innerHeight - 320) };
	}

	function onbox(ids: string[], additive: boolean) {
		menu = null;
		selected = additive ? [...new Set([...selected, ...ids])] : ids;
		if (ids.length) cursor = ids[0];
	}

	function selectZone() {
		const cur = cursor ? byId.get(cursor) : null;
		const zone = cur?.zone ?? 'pc';
		selected = pcs.filter((p) => p.zone === zone).map((p) => p.id);
		flash(`Selected ${ZONE_META[zone].name}`);
	}

	function step(dx: number, dy: number, extend: boolean) {
		const cur = cursor ? byId.get(cursor) : null;
		if (!cur) {
			const first = [...pcs].sort((a, b) => a.y - b.y || a.x - b.x)[0];
			if (first) (cursor = first.id), (selected = [first.id]);
			return;
		}
		let best: PC | null = null;
		let bestScore = Infinity;
		for (const p of pcs) {
			if (p.id === cur.id) continue;
			const px = p.x - cur.x;
			const py = p.y - cur.y;
			const primary = dx ? px * dx : py * dy;
			if (primary <= 0) continue;
			const score = primary + Math.abs(dx ? py : px) * 3;
			if (score < bestScore) (bestScore = score), (best = p);
		}
		if (!best) return;
		cursor = best.id;
		selected = extend ? [...new Set([...selected, best.id])] : [best.id];
	}

	function doJump(e: SubmitEvent) {
		e.preventDefault();
		const q = (jump ?? '').trim().toUpperCase();
		const pc = pcs.find((p) => p.label.toUpperCase() === q);
		if (!pc) return flash(`No PC "${q}"`, true);
		cursor = pc.id;
		selected = [pc.id];
		jump = null;
	}

	// ---------- layout actions ----------
	function onmove(id: string, x: number, y: number) {
		const p = byId.get(id);
		if (!p || (p.x === x && p.y === y)) return;
		snapshot();
		const other = pcs.find((o) => o.x === x && o.y === y);
		if (other) [other.x, other.y] = [p.x, p.y];
		p.x = x;
		p.y = y;
		dirty = true;
	}

	function nudge(dx: number, dy: number) {
		const sel = new Set(selected);
		if (!sel.size) return;
		const taken = new Set(pcs.filter((p) => !sel.has(p.id)).map((p) => `${p.x},${p.y}`));
		const moving = pcs.filter((p) => sel.has(p.id));
		const blocked = moving.some((p) => {
			const nx = p.x + dx;
			const ny = p.y + dy;
			return nx < 0 || ny < 0 || nx > MAX_GRID || ny > MAX_GRID || taken.has(`${nx},${ny}`);
		});
		if (blocked) return flash('Can’t move there');
		snapshot();
		for (const p of moving) (p.x += dx), (p.y += dy);
		dirty = true;
	}

	let newZone = $state<Zone>('pc');

	function nextLabel(zone: Zone) {
		const prefix = ZONE_META[zone].prefix;
		const used = new Set(pcs.map((p) => p.label.toUpperCase()));
		let n = 1;
		while (used.has(`${prefix}${n}`)) n++;
		return `${prefix}${n}`;
	}

	function addPc() {
		const taken = new Set(pcs.map((p) => `${p.x},${p.y}`));
		const width = Math.max(12, ...pcs.map((p) => p.x + 1));
		let spot: { x: number; y: number } | null = null;
		outer: for (let y = 0; y <= MAX_GRID; y++)
			for (let x = 0; x < width; x++)
				if (!taken.has(`${x},${y}`)) {
					spot = { x, y };
					break outer;
				}
		if (!spot) return flash('Grid is full', true);
		const label = prompt('Label for the new PC (max 6 chars)', nextLabel(newZone))?.trim();
		if (!label) return;
		if (label.length > 6) return flash('Label too long', true);
		if (pcs.some((p) => p.label.toUpperCase() === label.toUpperCase())) return flash('Label already used', true);
		snapshot();
		const id = `pc-${crypto.randomUUID().slice(0, 8)}`;
		pcs.push({ id, label, zone: newZone, ...spot, facing: 'up', status: 'free', freeAt: null, updatedAt: new Date().toISOString() });
		selected = [id];
		cursor = id;
		dirty = true;
		flash(`Added ${label}. Drag it or use the arrow keys to place it`);
	}

	function rename(id = selected.length === 1 ? selected[0] : null) {
		const p = id ? byId.get(id) : null;
		if (!p) return flash('Select one PC to rename');
		const label = prompt('Rename PC (max 6 chars)', p.label)?.trim();
		if (!label || label === p.label) return;
		if (label.length > 6) return flash('Label too long', true);
		if (pcs.some((o) => o.id !== p.id && o.label.toUpperCase() === label.toUpperCase()))
			return flash('Label already used', true);
		snapshot();
		p.label = label;
		dirty = true;
	}

	function removeSelected() {
		if (!need(selected)) return;
		if (!confirm(`Remove ${selPcs.map((p) => p.label).join(', ')}?`)) return;
		snapshot();
		const del = new Set(selected);
		pcs = pcs.filter((p) => !del.has(p.id));
		selected = [];
		dirty = true;
	}

	function flip() {
		if (!need(selected)) return;
		snapshot();
		for (const p of selPcs) p.facing = p.facing === 'up' ? 'down' : 'up';
		dirty = true;
	}

	function setZone(zone: Zone) {
		if (!need(selected)) return;
		snapshot();
		for (const p of selPcs) p.zone = zone;
		dirty = true;
		flash(`→ ${ZONE_META[zone].name}`);
	}

	async function saveLayout() {
		if (await api('PUT', { pcs: $state.snapshot(pcs) })) {
			dirty = false;
			flash('Layout saved');
		}
	}

	async function toggleMode() {
		menu = null;
		if (mode === 'layout') {
			if (dirty && !confirm('Discard unsaved layout changes?')) return;
			mode = 'status';
			history = [];
			await refresh(true);
		} else {
			mode = 'layout';
			history = [];
		}
	}

	// ---------- keyboard ----------
	const ARROWS: Record<string, [number, number]> = {
		ArrowLeft: [-1, 0],
		ArrowRight: [1, 0],
		ArrowUp: [0, -1],
		ArrowDown: [0, 1]
	};
	const STATUS_KEYS: Record<string, Status> = { f: 'free', u: 'in_use', r: 'reserved', o: 'offline' };

	function onkey(e: KeyboardEvent) {
		if ((e.target as HTMLElement).closest('input, textarea, select')) return;
		const k = e.key;
		const l = k.toLowerCase();
		const mod = e.ctrlKey || e.metaKey;

		if (k === 'Escape') return void ((selected = []), (menu = null), (help = false), (jump = null));
		if (k === '?') return void (help = !help);
		if (mod && l === 'z') return e.preventDefault(), void undo();
		if (mod && l === 'a') return e.preventDefault(), void (selected = pcs.map((p) => p.id));
		if (mod && l === 's' && mode === 'layout') return e.preventDefault(), void saveLayout();
		if (mod || e.altKey) return;

		if (ARROWS[k]) {
			e.preventDefault();
			const [dx, dy] = ARROWS[k];
			return mode === 'layout' ? nudge(dx, dy) : step(dx, dy, e.shiftKey);
		}
		if (k === '/') return e.preventDefault(), void (jump = '');
		if (l === 'l') return void toggleMode();

		if (mode === 'status') {
			if (STATUS_KEYS[l]) return e.preventDefault(), setStatus(STATUS_KEYS[l]);
			if (l === 'a') return selectZone();
			if (/^[1-9]$/.test(k)) return setEta(Number(k) * 10);
			if (k === '0') return setEta(null);
		} else {
			if (k === 'Delete' || k === 'Backspace') return e.preventDefault(), removeSelected();
			if (k === 'Enter') return e.preventDefault(), rename();
			if (l === 'n') return addPc();
			if (k === '1' || k === '2' || k === '3') return setZone(ZONES[Number(k) - 1]);
			if (l === 't') return flip();
		}
	}

	function focusOnMount(el: HTMLInputElement) {
		el.focus();
	}

	onMount(() => {
		const poll = setInterval(() => document.visibilityState === 'visible' && refresh(), 8000);
		const tick = setInterval(() => (now = Date.now()), 15000);
		const beforeUnload = (e: BeforeUnloadEvent) => {
			if (dirty) e.preventDefault();
		};
		addEventListener('beforeunload', beforeUnload);
		return () => {
			clearInterval(poll);
			clearInterval(tick);
			removeEventListener('beforeunload', beforeUnload);
		};
	});
</script>

<svelte:head><title>Admin · GG Status</title></svelte:head>
<svelte:window
	onkeydown={onkey}
	onpointerdown={(e) => {
		if (menu && !(e.target as HTMLElement).closest('.menu')) menu = null;
	}}
/>

<main class:layout={mode === 'layout'}>
	<header>
		<div class="title">
			<h1 class="display"><span class="logo">GG</span> Admin</h1>
			<span class="count"><b>{c.zones.pc.free}</b>/{c.zones.pc.total} PCs free · {c.zones.sim.free}/{c.zones.sim.total} sims · {c.zones.console.free}/{c.zones.console.total} consoles</span>
		</div>
		<div class="actions">
			<button class="btn" class:primary={mode === 'layout'} onclick={toggleMode} title="Toggle layout mode (L)">
				{mode === 'layout' ? '✓ Done editing' : '✎ Edit layout'}
			</button>
			<a class="btn" href="/" target="_blank" rel="noopener">View public ↗</a>
			<button class="btn" onclick={() => (help = !help)} title="Keyboard shortcuts (?)">?</button>
			<form method="POST" action="/admin/logout"><button class="btn">Log out</button></form>
		</div>
	</header>

	{#if mode === 'status'}
		<div class="toolbar">
			{#each STATUSES as s (s)}
				<button class="btn st s-{s}" onclick={() => setStatus(s)} disabled={!selected.length}>
					<kbd>{STATUS_META[s].key}</kbd>
					{STATUS_META[s].label}
				</button>
			{/each}
			<span class="sep"></span>
			<button class="btn" onclick={undo} disabled={!history.length} title="Ctrl+Z">↶ Undo</button>
			<button class="btn" onclick={allFree} title="Set every PC to Free">All free</button>
		</div>
	{:else}
		<div class="toolbar">
			<select bind:value={newZone} aria-label="Zone for new PCs">
				{#each ZONES as z (z)}<option value={z}>{ZONE_META[z].name}</option>{/each}
			</select>
			<button class="btn" onclick={addPc}><kbd>N</kbd> Add PC</button>
			<button class="btn" onclick={() => rename()} disabled={selected.length !== 1}><kbd>↵</kbd> Rename</button>
			<button class="btn" onclick={flip} disabled={!selected.length} title="Flip which side the screen is on"><kbd>T</kbd> Flip</button>
			<button class="btn" onclick={removeSelected} disabled={!selected.length}><kbd>Del</kbd> Remove</button>
			{#each ZONES as z, i (z)}
				<button class="btn" onclick={() => setZone(z)} disabled={!selected.length}><kbd>{i + 1}</kbd> {ZONE_META[z].name}</button>
			{/each}
			<span class="sep"></span>
			<button class="btn" onclick={undo} disabled={!history.length}>↶ Undo</button>
			<button class="btn primary" onclick={saveLayout} disabled={!dirty}>Save layout</button>
		</div>
	{/if}

	<section class="map">
		<SeatMap
			{pcs}
			{now}
			mode={mode === 'layout' ? 'layout' : 'admin'}
			{selected}
			{cursor}
			{onseat}
			{oncontext}
			{onbox}
			{onmove}
			onseatdbl={(id) => mode === 'layout' && rename(id)}
		/>
	</section>

	<div class="statusline">
		{#if selPcs.length === 0}
			<span class="muted">
				{mode === 'layout'
					? 'Drag PCs to move them (drop on another to swap). Arrow keys nudge the selection.'
					: 'Click a PC, or drag a box to select several. Shift/Ctrl-click adds to the selection. Right-click for a menu.'}
			</span>
		{:else if selPcs.length === 1}
			{@const p = selPcs[0]}
			{@const m = etaMinutes(p, now)}
			<b>{p.label}</b> · {ZONE_META[p.zone].name} · {STATUS_META[p.status].label}
			{#if m !== null}· free in {etaLabel(m)}{/if}
		{:else}
			<b>{selPcs.length} selected</b>: {selPcs.map((p) => p.label).join(', ')}
		{/if}
		{#if dirty}<span class="unsaved">● Unsaved layout</span>{/if}
	</div>

	<Legend showKeys />

	<form
		class="announce"
		onsubmit={(e) => {
			e.preventDefault();
			saveAnnouncement();
		}}
	>
		<label for="ann">📣 Announcement banner</label>
		<input id="ann" bind:value={announcement} maxlength="200" placeholder="e.g. LAN tourney Saturday, pro booth booked from 6pm" />
		<button class="btn" disabled={announcement.trim() === savedAnnouncement}>
			{announcement.trim() ? 'Post' : 'Clear'}
		</button>
	</form>
</main>

{#if menu}
	<div class="menu" style="left:{menu.x}px;top:{menu.y}px" role="menu">
		{#if mode === 'status'}
			{#each STATUSES as s (s)}
				<button role="menuitem" class="s-{s}" onclick={() => (setStatus(s), (menu = null))}>
					<i></i>{STATUS_META[s].label}<kbd>{STATUS_META[s].key}</kbd>
				</button>
			{/each}
			<hr />
			<div class="eta-row">
				Free in:
				{#each [10, 20, 30, 60] as m (m)}
					<button onclick={() => (setEta(m), (menu = null))}>{m}m</button>
				{/each}
			</div>
			<button role="menuitem" onclick={() => (setEta(null), (menu = null))}>Clear estimate<kbd>0</kbd></button>
		{:else}
			<button role="menuitem" onclick={() => ((menu = null), rename())}>Rename<kbd>↵</kbd></button>
			<button role="menuitem" onclick={() => (flip(), (menu = null))}>Flip screen side<kbd>T</kbd></button>
			{#each ZONES as z, i (z)}
				<button role="menuitem" onclick={() => (setZone(z), (menu = null))}>{ZONE_META[z].name}<kbd>{i + 1}</kbd></button>
			{/each}
			<hr />
			<button role="menuitem" class="danger" onclick={() => ((menu = null), removeSelected())}>Remove<kbd>Del</kbd></button>
		{/if}
	</div>
{/if}

{#if jump !== null}
	<div class="overlay" role="presentation" onpointerdown={(e) => e.target === e.currentTarget && (jump = null)}>
		<form class="jump" onsubmit={doJump}>
			<label for="jump">Go to PC</label>
			<input
				id="jump"
				bind:value={jump}
				placeholder="e.g. B4"
				autocomplete="off"
				onkeydown={(e) => e.key === 'Escape' && (jump = null)}
				{@attach focusOnMount}
			/>
		</form>
	</div>
{/if}

{#if help}
	<div class="overlay" role="presentation" onpointerdown={(e) => e.target === e.currentTarget && (help = false)}>
		<div class="help" role="dialog" aria-label="Keyboard shortcuts">
			<h2 class="display">Keyboard shortcuts</h2>
			<div class="cols">
				<dl>
					<dt>Status mode</dt>
					<dd><kbd>F</kbd> Free · <kbd>U</kbd> In use · <kbd>R</kbd> Reserved · <kbd>O</kbd> Offline</dd>
					<dd><kbd>1</kbd>–<kbd>9</kbd> Free in 10–90 min · <kbd>0</kbd> clear</dd>
					<dd><kbd>←↑↓→</kbd> move · <kbd>Shift</kbd>+arrow add to selection</dd>
					<dd><kbd>A</kbd> select whole zone · <kbd>Ctrl</kbd>+<kbd>A</kbd> select all</dd>
					<dd><kbd>/</kbd> jump to PC by label</dd>
				</dl>
				<dl>
					<dt>Layout mode (<kbd>L</kbd>)</dt>
					<dd><kbd>N</kbd> add · <kbd>↵</kbd> rename · <kbd>Del</kbd> remove · <kbd>T</kbd> flip screen side</dd>
					<dd><kbd>←↑↓→</kbd> nudge selected PCs</dd>
					<dd><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> set zone</dd>
					<dd><kbd>Ctrl</kbd>+<kbd>S</kbd> save layout</dd>
					<dt>Anywhere</dt>
					<dd><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Esc</kbd> clear · <kbd>?</kbd> this help</dd>
				</dl>
			</div>
			<button class="btn" onclick={() => (help = false)}>Close</button>
		</div>
	</div>
{/if}

{#if toast}
	<div class="toast" class:err={toast.err} role="status">{toast.msg}</div>
{/if}

<style>
	main {
		max-width: 1100px;
		margin: 0 auto;
		padding: 1rem 16px 3rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
	}
	.title {
		display: flex;
		align-items: baseline;
		gap: 1rem;
	}
	h1 {
		margin: 0;
		font-size: 1.6rem;
	}
	.logo {
		background: var(--accent);
		border-radius: 8px;
		padding: 0 0.4rem;
	}
	.count {
		color: var(--muted);
	}
	.count b {
		color: var(--free);
		font-size: 1.3rem;
	}
	.actions,
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}
	.actions form {
		margin: 0;
	}
	a.btn {
		text-decoration: none;
	}
	.toolbar {
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 0.6rem;
	}
	.toolbar select {
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 0.5rem;
	}
	.sep {
		flex: 1;
	}
	.btn.st {
		border-left-width: 4px;
	}
	.btn.s-free {
		border-left-color: var(--free);
	}
	.btn.s-in_use {
		border-left-color: var(--in-use);
	}
	.btn.s-reserved {
		border-left-color: var(--reserved);
	}
	.btn.s-offline {
		border-left-color: var(--offline);
	}
	.map {
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: 20px;
		padding: 1rem clamp(6px, 2vw, 20px) 1.5rem;
	}
	.layout .map {
		border-color: var(--accent);
		border-style: dashed;
	}
	.statusline {
		min-height: 1.5em;
		text-align: center;
		font-size: 0.95rem;
	}
	.muted {
		color: var(--muted);
	}
	.unsaved {
		color: var(--reserved);
		margin-left: 0.75rem;
	}
	.announce {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 0.75rem;
	}
	.announce label {
		font-size: 0.9rem;
		color: var(--muted);
	}
	.announce input,
	.jump input {
		flex: 1;
		min-width: 200px;
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 0.55rem 0.75rem;
	}

	.menu {
		position: fixed;
		z-index: 20;
		width: 190px;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 12px;
		padding: 0.35rem;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
	}
	.menu > button {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: none;
		border: 0;
		border-radius: 8px;
		padding: 0.45rem 0.55rem;
		cursor: pointer;
		text-align: left;
	}
	.menu > button:hover {
		background: var(--bg-2);
	}
	.menu kbd {
		margin-left: auto;
	}
	.menu i {
		width: 12px;
		height: 12px;
		border-radius: 4px;
	}
	.menu .s-free i {
		background: var(--free);
	}
	.menu .s-in_use i {
		background: var(--in-use);
	}
	.menu .s-reserved i {
		background: var(--reserved);
	}
	.menu .s-offline i {
		background: var(--offline);
	}
	.menu .danger {
		color: var(--in-use);
	}
	.menu hr {
		border: 0;
		border-top: 1px solid var(--line);
		margin: 0.3rem 0;
	}
	.eta-row {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.55rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.eta-row button {
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 0.15rem 0.35rem;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.overlay {
		position: fixed;
		inset: 0;
		z-index: 30;
		background: rgba(0, 0, 0, 0.6);
		display: grid;
		place-items: center;
		padding: 16px;
	}
	.jump,
	.help {
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 16px;
		padding: 1.25rem;
		width: min(560px, 100%);
	}
	.jump {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: min(340px, 100%);
	}
	.help h2 {
		margin: 0 0 0.75rem;
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
		gap: 1rem;
	}
	dl {
		margin: 0;
	}
	dt {
		font-weight: 600;
		margin: 0.5rem 0 0.35rem;
	}
	dd {
		margin: 0 0 0.4rem;
		color: var(--muted);
		font-size: 0.9rem;
		line-height: 1.7;
	}

	.toast {
		position: fixed;
		left: 50%;
		bottom: 1.25rem;
		transform: translateX(-50%);
		z-index: 40;
		background: var(--panel);
		border: 1px solid var(--accent);
		border-radius: 999px;
		padding: 0.55rem 1.1rem;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
		max-width: calc(100vw - 32px);
	}
	.toast.err {
		border-color: var(--in-use);
		color: #fecaca;
	}
</style>
