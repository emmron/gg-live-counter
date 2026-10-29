<script lang="ts">
	import { onMount } from 'svelte';
	import SeatMap from '#lib/components/SeatMap.svelte';
	import { counts, etaLabel, etaMinutes } from '#lib/format.ts';
	import {
		FLOORS,
		FLOOR_META,
		MAX_GRID,
		STATUSES,
		STATUS_META,
		ZONES,
		ZONE_META,
		type CafeState,
		type Floor,
		type PC,
		type Status,
		type Zone
	} from '#lib/types.ts';

	interface Props {
		initial: CafeState;
		/** Floor-plan editor page: no status controls, no mode switch */
		layoutOnly?: boolean;
		/** Called after every successful save, e.g. to refresh the live preview. */
		onsaved?: () => void;
	}
	let { initial, onsaved, layoutOnly = false }: Props = $props();

	// svelte-ignore state_referenced_locally
	let pcs = $state<PC[]>(initial.pcs);
	// svelte-ignore state_referenced_locally
	let announcement = $state(initial.announcement);
	// svelte-ignore state_referenced_locally
	let savedAnnouncement = $state(initial.announcement);

	// svelte-ignore state_referenced_locally
	let mode = $state<'status' | 'layout'>(layoutOnly ? 'layout' : 'status');
	let selected = $state<string[]>([]);
	let cursor = $state<string | null>(null);
	let history = $state.raw<PC[][]>([]);
	let dirty = $state(false);
	let menu = $state<{ x: number; y: number } | null>(null);
	let help = $state(false);
	let jump = $state<string | null>(null);
	let toast = $state<{ msg: string; err: boolean } | null>(null);
	let now = $state(Date.now());
	let saving = $state(0);
	let toastTimer: ReturnType<typeof setTimeout>;

	const gridCols = $derived(Math.max(...pcs.map((p) => p.x + 1)));
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
		saving++;
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
			if (saving === 1 && mode === 'status') pcs = s.pcs;
			onsaved?.();
			return true;
		} catch (e) {
			flash(`Save failed: ${(e as Error).message}`, true);
			if (mode === 'status') await refresh(true);
			return false;
		} finally {
			saving--;
		}
	}

	async function refresh(force = false) {
		if (!force && (saving > 0 || mode === 'layout')) return;
		try {
			const r = await fetch('/api/status', { cache: 'no-store' });
			if (!r.ok) return;
			const s = await r.json();
			if (force || (saving === 0 && mode === 'status')) {
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
		if (!ids.length) flash('Click a seat first (or drag across several)');
		return ids.length > 0;
	}

	function describe(ids: string[]) {
		return ids.length === 1 ? byId.get(ids[0])?.label : `${ids.length} seats`;
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
		flash(`${describe(ids)} → ${STATUS_META[status].label}`);
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
		flash(mins ? `${describe(ids)} free in ~${mins} min` : 'Time estimate cleared');
	}

	function allFree() {
		if (!confirm('Set every seat to Free? (e.g. at opening or closing time)')) return;
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
			flash(announcement ? 'Banner posted' : 'Banner removed');
		}
	}

	// ---------- selection ----------
	function onseat(id: string, e: MouseEvent) {
		menu = null;
		if (e.shiftKey || e.ctrlKey || e.metaKey)
			selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
		else if (mode === 'status' && selected.length === 1 && selected[0] === id) selected = [];
		else if (!(mode === 'layout' && selected.includes(id))) selected = [id];
		cursor = id;
	}

	function oncontext(id: string, e: MouseEvent) {
		if (!selected.includes(id)) selected = [id];
		cursor = id;
		menu = { x: Math.min(e.clientX, innerWidth - 210), y: Math.min(e.clientY, innerHeight - 330) };
	}

	function onbox(ids: string[], additive: boolean) {
		menu = null;
		selected = additive ? [...new Set([...selected, ...ids])] : ids;
		if (ids.length) cursor = ids[0];
	}

	function selectRow() {
		const cur = cursor ? byId.get(cursor) : null;
		if (!cur) return flash('Click a seat first');
		selected = pcs.filter((p) => p.floor === cur.floor && p.y === cur.y).map((p) => p.id);
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
			if (p.id === cur.id || p.floor !== cur.floor) continue;
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
		if (!pc) return flash(`No seat "${q}"`, true);
		cursor = pc.id;
		selected = [pc.id];
		jump = null;
	}

	// ---------- layout actions ----------
	function onmove(id: string, x: number, y: number) {
		const p = byId.get(id);
		if (!p || (p.x === x && p.y === y)) return;
		snapshot();
		const other = pcs.find((o) => o.floor === p.floor && o.x === x && o.y === y);
		if (other) [other.x, other.y] = [p.x, p.y];
		p.x = x;
		p.y = y;
		dirty = true;
	}

	function nudge(dx: number, dy: number) {
		const sel = new Set(selected);
		if (!sel.size) return;
		const taken = new Set(pcs.filter((p) => !sel.has(p.id)).map((p) => `${p.floor}:${p.x},${p.y}`));
		const moving = pcs.filter((p) => sel.has(p.id));
		const blocked = moving.some((p) => {
			const nx = p.x + dx;
			const ny = p.y + dy;
			return nx < 0 || ny < 0 || nx > MAX_GRID || ny > MAX_GRID || taken.has(`${p.floor}:${nx},${ny}`);
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

	function freeSpot(floor: Floor) {
		const taken = new Set(pcs.filter((p) => p.floor === floor).map((p) => `${p.x},${p.y}`));
		const width = Math.max(12, ...pcs.map((p) => p.x + 1));
		for (let y = 0; y <= MAX_GRID; y++)
			for (let x = 0; x < width; x++) if (!taken.has(`${x},${y}`)) return { x, y };
		return null;
	}

	function switchFloor() {
		if (!need(selected)) return;
		snapshot();
		for (const p of selPcs) {
			const to: Floor = p.floor === 'ground' ? 'upstairs' : 'ground';
			const spot = freeSpot(to);
			if (!spot) return flash('No room on the other floor', true);
			Object.assign(p, { floor: to, ...spot });
		}
		dirty = true;
		flash('Moved to the other floor. Drag to place');
	}

	function addPc() {
		const floor: Floor = (cursor && byId.get(cursor)?.floor) || 'ground';
		const spot = freeSpot(floor);
		if (!spot) return flash('Grid is full', true);
		const label = prompt('Name for the new seat (max 6 characters)', nextLabel(newZone))?.trim();
		if (!label) return;
		if (label.length > 6) return flash('Name too long', true);
		if (pcs.some((p) => p.label.toUpperCase() === label.toUpperCase())) return flash('Name already used', true);
		snapshot();
		const id = `pc-${crypto.randomUUID().slice(0, 8)}`;
		pcs.push({
			id,
			label,
			zone: newZone,
			floor,
			...spot,
			facing: 'up',
			status: 'free',
			freeAt: null,
			updatedAt: new Date().toISOString()
		});
		selected = [id];
		cursor = id;
		dirty = true;
		flash(`Added ${label}. Drag it into place`);
	}

	function rename(id = selected.length === 1 ? selected[0] : null) {
		const p = id ? byId.get(id) : null;
		if (!p) return flash('Select one seat to rename');
		const label = prompt('Rename seat (max 6 characters)', p.label)?.trim();
		if (!label || label === p.label) return;
		if (label.length > 6) return flash('Name too long', true);
		if (pcs.some((o) => o.id !== p.id && o.label.toUpperCase() === label.toUpperCase()))
			return flash('Name already used', true);
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
		if (layoutOnly) return;
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
			if (l === 'a') return selectRow();
			if (/^[1-9]$/.test(k)) return setEta(Number(k) * 10);
			if (k === '0') return setEta(null);
		} else {
			if (k === 'Delete' || k === 'Backspace') return e.preventDefault(), removeSelected();
			if (k === 'Enter') return e.preventDefault(), rename();
			if (l === 'n') return addPc();
			if (k === '1' || k === '2' || k === '3') return setZone(ZONES[Number(k) - 1]);
			if (l === 't') return flip();
			if (l === 'g') return switchFloor();
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

	const ETAS = [15, 30, 60, 90];
</script>

<svelte:window
	onkeydown={onkey}
	onpointerdown={(e) => {
		if (menu && !(e.target as HTMLElement).closest('.menu')) menu = null;
	}}
/>

<div class="panel" class:layout={mode === 'layout'}>
	<header class="top">
		<div class="who">
			<img src="/brand/helmet.png" alt="" class="helmet" />
			<div>
				<h1>{layoutOnly ? 'Edit floor plan' : 'Owner controls'}</h1>
				<p class="sub">
					{#if layoutOnly}
						Drag seats to where they really are, then press Save. Right-click a seat to rename it, flip it or move it to the other floor.
					{:else}
						{#if saving}<span class="saving">Saving…</span>{:else}<span class="ok">● Live</span>{/if}
						· changes show on the public page instantly
					{/if}
				</p>
			</div>
		</div>
		<div class="top-actions">
			<button class="btn" onclick={() => (help = true)} title="Keyboard shortcuts (?)">?</button>
			{#if layoutOnly}
				<a class="btn" href="/" onclick={(e) => dirty && !confirm('Leave without saving?') && e.preventDefault()}>← Back</a>
			{:else}
				<button class="btn" class:primary={mode === 'layout'} onclick={toggleMode} title="Edit the floor plan (L)">
					{mode === 'layout' ? 'Done editing' : 'Edit floor plan'}
				</button>
			{/if}
			<form method="POST" action="/admin/logout"><button class="btn" title="Log out">⏻</button></form>
		</div>
	</header>

	{#if !layoutOnly}
	<div class="stats">
		<div class="stat cut"><b>{c.zones.pc.free}</b><span>/ {c.zones.pc.total} PCs free</span></div>
		<div class="stat cut"><b>{c.zones.sim.free}</b><span>/ {c.zones.sim.total} sims</span></div>
		<div class="stat cut"><b>{c.zones.console.free}</b><span>/ {c.zones.console.total} consoles</span></div>
	</div>
	{/if}

	<!-- the one bar the owner uses all night -->
	<div class="dock cut">
		{#if mode === 'status'}
			<div class="selection">
				{#if selPcs.length === 0}
					<span class="hint"><b>1.</b> Click seats (or drag across a row) &nbsp; <b>2.</b> Pick a status</span>
				{:else if selPcs.length === 1}
					{@const p = selPcs[0]}
					{@const m = etaMinutes(p, now)}
					<span class="chosen">{p.label}</span>
					<span class="muted">{ZONE_META[p.zone].name} · {STATUS_META[p.status].label}{m !== null ? ` · free in ${etaLabel(m)}` : ''}</span>
				{:else}
					<span class="chosen">{selPcs.length} seats</span>
					<span class="muted list">{selPcs.map((p) => p.label).join(', ')}</span>
				{/if}
				{#if selected.length}<button class="clear" onclick={() => (selected = [])}>Clear ✕</button>{/if}
			</div>
			<div class="statuses">
				{#each STATUSES as s (s)}
					<button class="sbtn s-{s}" onclick={() => setStatus(s)} disabled={!selected.length}>
						<i></i>
						<span>{STATUS_META[s].label}</span>
						<kbd>{STATUS_META[s].key}</kbd>
					</button>
				{/each}
			</div>
			<div class="row2">
				<span class="lab">Free in</span>
				{#each ETAS as m (m)}
					<button class="chip" onclick={() => setEta(m)} disabled={!selected.length}>{m < 60 ? `${m}m` : `${m / 60}h`.replace('1.5h', '1½h')}</button>
				{/each}
				<span class="grow"></span>
				<button class="btn small" onclick={undo} disabled={!history.length} title="Ctrl+Z">↶ Undo</button>
				<button class="btn small" onclick={allFree} title="Set every seat to Free">Reset all</button>
			</div>
		{:else}
			<div class="selection">
				<span class="hint">
					Drag seats to move them (drop on another seat to swap). {dirty ? '' : 'Nothing changed yet.'}
				</span>
				{#if dirty}<span class="unsaved">● Unsaved</span>{/if}
			</div>
			<div class="layout-tools">
				<select bind:value={newZone} aria-label="Type of new seat">
					{#each ZONES as z (z)}<option value={z}>{ZONE_META[z].name}</option>{/each}
				</select>
				<button class="btn small" onclick={addPc}>+ Add seat</button>
				<button class="btn small" onclick={() => rename()} disabled={selected.length !== 1}>Rename</button>
				<button class="btn small" onclick={flip} disabled={!selected.length} title="Flip which side the screen is on">Flip</button>
				<button class="btn small" onclick={switchFloor} disabled={!selected.length}>Other floor</button>
				<button class="btn small" onclick={removeSelected} disabled={!selected.length}>Remove</button>
				<span class="grow"></span>
				<button class="btn small" onclick={undo} disabled={!history.length}>↶</button>
				<button class="btn small primary" onclick={saveLayout} disabled={!dirty}>Save</button>
			</div>
		{/if}
	</div>

	{#each FLOORS as fl (fl)}
		<section class="floor-sec">
			<h2>{FLOOR_META[fl].name}</h2>
			<div class="scroll">
				<SeatMap
					pcs={pcs.filter((p) => p.floor === fl)}
					floor={fl}
					minCols={gridCols}
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
			</div>
		</section>
	{/each}

	{#if !layoutOnly}
	<form
		class="announce cut"
		onsubmit={(e) => {
			e.preventDefault();
			saveAnnouncement();
		}}
	>
		<label for="ann">Banner message</label>
		<div class="ann-row">
			<input
				id="ann"
				bind:value={announcement}
				maxlength="200"
				placeholder="e.g. Half price racing sims tonight 🏁"
			/>
			<button class="btn small" class:primary={announcement.trim() !== savedAnnouncement} disabled={announcement.trim() === savedAnnouncement}>
				{announcement.trim() ? 'Post' : 'Remove'}
			</button>
		</div>
	</form>

	{/if}

	<p class="tips" class:hide={layoutOnly}>
		Shortcuts: <kbd>F</kbd> free · <kbd>U</kbd> in use · <kbd>R</kbd> reserved · <kbd>O</kbd> offline ·
		<kbd>1</kbd>–<kbd>9</kbd> free in 10–90 min · <kbd>A</kbd> whole row · <kbd>/</kbd> find seat · <kbd>?</kbd> all
	</p>
</div>

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
				Free in
				{#each [15, 30, 60] as m (m)}
					<button onclick={() => (setEta(m), (menu = null))}>{m}m</button>
				{/each}
			</div>
			<button role="menuitem" onclick={() => (setEta(null), (menu = null))}>Clear time<kbd>0</kbd></button>
		{:else}
			<button role="menuitem" onclick={() => ((menu = null), rename())}>Rename<kbd>↵</kbd></button>
			<button role="menuitem" onclick={() => (flip(), (menu = null))}>Flip screen side<kbd>T</kbd></button>
			<button role="menuitem" onclick={() => (switchFloor(), (menu = null))}>Move to other floor<kbd>G</kbd></button>
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
		<form class="jump cut" onsubmit={doJump}>
			<label for="jump">Find seat</label>
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
		<div class="help cut" role="dialog" aria-label="Keyboard shortcuts">
			<h2>Keyboard shortcuts</h2>
			<div class="cols">
				<dl>
					<dt>Seats</dt>
					<dd><kbd>F</kbd> Free · <kbd>U</kbd> In use · <kbd>R</kbd> Reserved · <kbd>O</kbd> Offline</dd>
					<dd><kbd>1</kbd>–<kbd>9</kbd> Free in 10–90 min · <kbd>0</kbd> clear time</dd>
					<dd><kbd>←↑↓→</kbd> move · <kbd>Shift</kbd>+arrow add to selection</dd>
					<dd><kbd>A</kbd> whole row · <kbd>Ctrl</kbd>+<kbd>A</kbd> everything</dd>
					<dd><kbd>/</kbd> find a seat by name</dd>
				</dl>
				<dl>
					<dt>Floor plan (<kbd>L</kbd>)</dt>
					<dd><kbd>N</kbd> add · <kbd>↵</kbd> rename · <kbd>Del</kbd> remove</dd>
					<dd><kbd>T</kbd> flip screen side · <kbd>G</kbd> other floor</dd>
					<dd><kbd>←↑↓→</kbd> nudge · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> PC / sim / console</dd>
					<dd><kbd>Ctrl</kbd>+<kbd>S</kbd> save</dd>
					<dt>Anywhere</dt>
					<dd><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Esc</kbd> deselect</dd>
				</dl>
			</div>
			<button class="btn primary" onclick={() => (help = false)}>Got it</button>
		</div>
	</div>
{/if}

{#if toast}
	<div class="toast cut" class:err={toast.err} role="status">{toast.msg}</div>
{/if}

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		padding: 1rem clamp(12px, 2vw, 22px) 2rem;
	}

	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
	.helmet {
		height: 44px;
		filter: drop-shadow(0 0 8px rgba(26, 238, 255, 0.5));
	}
	h1 {
		margin: 0;
		font-size: 1.7rem;
	}
	.sub {
		margin: 0.2rem 0 0;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.ok {
		color: var(--cyan);
	}
	.saving {
		color: var(--reserved);
	}
	.top-actions {
		display: flex;
		gap: 0.4rem;
	}
	.top-actions form {
		margin: 0;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
	}
	.stat {
		--cut: 10px;
		background: var(--panel-2);
		padding: 0.6rem 0.8rem;
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		font-family: var(--display);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.stat b {
		font-size: 1.9rem;
		color: var(--cyan);
		line-height: 1;
	}
	.stat span {
		color: var(--muted);
		font-weight: 600;
		font-size: 0.85rem;
	}

	/* ---- action dock ---- */
	.dock {
		--cut: 16px;
		position: sticky;
		top: 0;
		z-index: 10;
		background: linear-gradient(180deg, #141a27, #0e121b);
		border-top: 2px solid var(--cyan);
		padding: 0.8rem 0.9rem 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
	}
	.layout .dock {
		border-top-color: var(--indigo);
	}
	.selection {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		min-height: 1.6rem;
		flex-wrap: wrap;
	}
	.hint {
		color: var(--muted);
		font-size: 0.92rem;
	}
	.hint b {
		color: var(--cyan);
		font-family: var(--display);
	}
	.chosen {
		font-family: var(--display);
		font-weight: 700;
		font-size: 1.35rem;
		text-transform: uppercase;
	}
	.muted {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.list {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
	}
	.clear {
		margin-left: auto;
		background: none;
		border: 0;
		color: var(--muted);
		cursor: pointer;
		font-size: 0.85rem;
	}
	.clear:hover {
		color: var(--text);
	}
	.unsaved {
		color: var(--reserved);
		margin-left: auto;
	}

	.statuses {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.45rem;
	}
	.sbtn {
		--cut: 12px;
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		padding: 0.75rem 0.4rem 0.6rem;
		border: 0;
		cursor: pointer;
		font-family: var(--display);
		font-weight: 700;
		font-size: 1.05rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		background: var(--panel-2);
		clip-path: polygon(var(--cut) 0, 100% 0, 100% calc(100% - var(--cut)), calc(100% - var(--cut)) 100%, 0 100%, 0 var(--cut));
		transition:
			background 0.15s,
			transform 0.1s;
	}
	.sbtn:not(:disabled):hover {
		background: #1d2434;
	}
	.sbtn:not(:disabled):active {
		transform: scale(0.97);
	}
	.sbtn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.sbtn i {
		width: 26px;
		height: 20px;
		border-radius: 30% 30% 12% 12%;
	}
	.sbtn kbd {
		position: absolute;
		top: 6px;
		right: 8px;
		opacity: 0.6;
	}
	.sbtn.s-free i {
		background: var(--free);
		box-shadow: 0 0 12px var(--free-glow);
	}
	.sbtn.s-in_use i {
		background: var(--in-use);
		border: 1px solid #3a4258;
	}
	.sbtn.s-reserved i {
		background: var(--reserved);
	}
	.sbtn.s-offline i {
		border: 2px dashed var(--line-2);
	}
	.sbtn.s-free:not(:disabled) {
		background: linear-gradient(180deg, rgba(26, 238, 255, 0.16), var(--panel-2));
	}

	.row2,
	.layout-tools {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.lab {
		font-family: var(--display);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.8rem;
		color: var(--muted);
		margin-right: 0.15rem;
	}
	.chip {
		border: 1px solid var(--line-2);
		background: transparent;
		border-radius: 999px;
		padding: 0.3rem 0.75rem;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.85rem;
	}
	.chip:not(:disabled):hover {
		border-color: var(--cyan);
		color: var(--cyan);
	}
	.chip:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.grow {
		flex: 1;
	}
	.btn.small {
		--cut: 8px;
		font-size: 13px;
		padding: 0.55em 1em;
	}
	.layout-tools select {
		background: var(--panel-2);
		border: 1px solid var(--line-2);
		padding: 0.45rem 0.5rem;
		border-radius: 6px;
	}

	/* ---- floors ---- */
	.floor-sec h2 {
		margin: 0.4rem 0 0.5rem;
		font-size: 1rem;
		letter-spacing: 0.12em;
		color: var(--muted);
	}
	.scroll {
		overflow-x: auto;
		padding-bottom: 4px;
	}

	.announce {
		--cut: 12px;
		background: var(--panel-2);
		padding: 0.75rem 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.announce label {
		font-family: var(--display);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.ann-row {
		display: flex;
		gap: 0.5rem;
	}
	.announce input,
	.jump input {
		flex: 1;
		min-width: 0;
		background: #000;
		border: 1px solid var(--line-2);
		border-radius: 6px;
		padding: 0.55rem 0.75rem;
	}
	.announce input:focus,
	.jump input:focus {
		outline: 2px solid var(--cyan);
		border-color: transparent;
	}
	.hide {
		display: none;
	}
	.tips {
		margin: 0;
		color: var(--faded);
		font-size: 0.78rem;
		line-height: 1.9;
	}

	/* ---- popovers ---- */
	.menu {
		position: fixed;
		z-index: 50;
		width: 200px;
		background: #121722;
		border: 1px solid var(--line-2);
		border-radius: 10px;
		padding: 0.35rem;
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
	}
	.menu > button {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.55rem;
		background: none;
		border: 0;
		border-radius: 6px;
		padding: 0.5rem 0.55rem;
		cursor: pointer;
		text-align: left;
	}
	.menu > button:hover {
		background: #1d2434;
	}
	.menu kbd {
		margin-left: auto;
	}
	.menu i {
		width: 12px;
		height: 12px;
		border-radius: 3px;
	}
	.menu .s-free i {
		background: var(--free);
	}
	.menu .s-in_use i {
		background: var(--in-use);
		border: 1px solid #3a4258;
	}
	.menu .s-reserved i {
		background: var(--reserved);
	}
	.menu .s-offline i {
		border: 1px dashed var(--muted);
	}
	.menu .danger {
		color: #ff6b81;
	}
	.menu hr {
		border: 0;
		border-top: 1px solid var(--line);
		margin: 0.3rem 0;
	}
	.eta-row {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.25rem 0.55rem;
		font-size: 0.82rem;
		color: var(--muted);
	}
	.eta-row button {
		background: #000;
		border: 1px solid var(--line-2);
		border-radius: 999px;
		padding: 0.12rem 0.45rem;
		cursor: pointer;
		font-size: 0.78rem;
	}

	.overlay {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: rgba(0, 0, 0, 0.7);
		display: grid;
		place-items: center;
		padding: 16px;
	}
	.jump,
	.help {
		--cut: 18px;
		background: #121722;
		border-top: 2px solid var(--cyan);
		padding: 1.25rem;
		width: min(560px, 100%);
	}
	.jump {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: min(340px, 100%);
	}
	.jump label {
		font-family: var(--display);
		font-weight: 700;
		text-transform: uppercase;
	}
	.help h2 {
		margin: 0 0 0.75rem;
		font-size: 1.5rem;
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}
	dl {
		margin: 0;
	}
	dt {
		font-family: var(--display);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 0.5rem 0 0.35rem;
		color: var(--cyan);
	}
	dd {
		margin: 0 0 0.4rem;
		color: var(--muted);
		font-size: 0.88rem;
		line-height: 1.8;
	}

	.toast {
		--cut: 10px;
		position: fixed;
		left: 50%;
		bottom: 1.25rem;
		transform: translateX(-50%);
		z-index: 70;
		background: var(--cyan);
		color: #000;
		font-family: var(--display);
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 0.65rem 1.3rem;
		max-width: calc(100vw - 32px);
	}
	.toast.err {
		background: #ff4d6d;
		color: #fff;
	}

	@media (max-width: 560px) {
		.statuses {
			grid-template-columns: repeat(2, 1fr);
		}
		.stat b {
			font-size: 1.5rem;
		}
	}
</style>
