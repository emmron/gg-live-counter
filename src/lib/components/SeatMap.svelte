<script lang="ts">
	import { etaMinutes } from '#lib/format.ts';
	import { MAX_GRID, STATUS_META, ZONE_META, type PC } from '#lib/types.ts';

	type Mode = 'public' | 'admin' | 'layout';
	interface Props {
		pcs: PC[];
		mode?: Mode;
		selected?: string[];
		cursor?: string | null;
		now?: number;
		onseat?: (id: string, e: MouseEvent) => void;
		oncontext?: (id: string, e: MouseEvent) => void;
		onseatdbl?: (id: string) => void;
		/** Drag-box selection finished. Empty ids + !additive = clicked empty floor. */
		onbox?: (ids: string[], additive: boolean) => void;
		/** Layout mode: seat dropped on a cell */
		onmove?: (id: string, x: number, y: number) => void;
	}

	let {
		pcs,
		mode = 'public',
		selected = [],
		cursor = null,
		now = Date.now(),
		onseat,
		oncontext,
		onseatdbl,
		onbox,
		onmove
	}: Props = $props();

	const layout = $derived(mode === 'layout');
	const pad = $derived(layout ? 2 : 0);
	const cols = $derived(
		Math.min(MAX_GRID + 1, Math.max(layout ? 12 : 1, ...pcs.map((p) => p.x + 1 + pad)))
	);
	const rows = $derived(
		Math.min(MAX_GRID + 1, Math.max(layout ? 9 : 1, ...pcs.map((p) => p.y + 1 + pad)))
	);
	/** Column offset: in view modes, column 1 and the last column hold cinema-style row letters. */
	const off = $derived(layout ? 0 : 1);

	const selSet = $derived(new Set(selected));
	const occupied = $derived(new Set(pcs.map((p) => `${p.x},${p.y}`)));
	const emptyCells = $derived.by(() => {
		if (!layout) return [];
		const out: { x: number; y: number }[] = [];
		for (let y = 0; y < rows; y++)
			for (let x = 0; x < cols; x++) if (!occupied.has(`${x},${y}`)) out.push({ x, y });
		return out;
	});

	/** Rows where every PC label shares a letter prefix (A1…A10 → "A") get a row letter. */
	const rowLetters = $derived.by(() => {
		if (layout) return [];
		const byRow = new Map<number, string | null>();
		for (const p of pcs) {
			const m = p.zone === 'pc' ? /^([A-Z]+)\d+$/i.exec(p.label) : null;
			const letter = m ? m[1].toUpperCase() : null;
			const prev = byRow.get(p.y);
			byRow.set(p.y, prev === undefined ? letter : prev === letter ? letter : null);
		}
		return [...byRow].filter((e): e is [number, string] => !!e[1]).map(([y, letter]) => ({ y, letter }));
	});

	const letterRows = $derived(new Set(rowLetters.map((r) => r.y)));

	let wrapEl: HTMLDivElement;
	let gridEl: HTMLDivElement;
	let box = $state<{ x0: number; y0: number; x1: number; y1: number; additive: boolean } | null>(null);
	let dragId = $state<string | null>(null);
	let dropCell = $state<{ x: number; y: number } | null>(null);

	function cellAt(cx: number, cy: number) {
		const r = gridEl.getBoundingClientRect();
		const x = Math.floor(((cx - r.left) / r.width) * cols);
		const y = Math.floor(((cy - r.top) / r.height) * rows);
		if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
		return { x, y };
	}

	function floorDown(e: PointerEvent) {
		if (mode === 'public' || e.button !== 0) return;
		if ((e.target as HTMLElement).closest('[data-id]')) return;
		e.preventDefault();
		box = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, additive: e.shiftKey || e.ctrlKey || e.metaKey };
		wrapEl.setPointerCapture(e.pointerId);
	}

	function seatDown(e: PointerEvent, pc: PC) {
		if (!layout || e.button !== 0) return;
		e.preventDefault();
		onseat?.(pc.id, e);
		dragId = pc.id;
		wrapEl.setPointerCapture(e.pointerId);
	}

	function pointerMove(e: PointerEvent) {
		if (box) {
			box.x1 = e.clientX;
			box.y1 = e.clientY;
		} else if (dragId) dropCell = cellAt(e.clientX, e.clientY);
	}

	function pointerUp(e: PointerEvent) {
		if (box) {
			const { x0, y0, x1, y1, additive } = box;
			box = null;
			const [l, r, t, b] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];
			if (r - l < 4 && b - t < 4) return onbox?.([], additive);
			const ids: string[] = [];
			for (const el of gridEl.querySelectorAll<HTMLElement>('[data-id]')) {
				const s = el.getBoundingClientRect();
				if (s.right > l && s.left < r && s.bottom > t && s.top < b) ids.push(el.dataset.id!);
			}
			onbox?.(ids, additive);
		} else if (dragId) {
			const c = cellAt(e.clientX, e.clientY);
			const id = dragId;
			dragId = null;
			dropCell = null;
			if (c) onmove?.(id, c.x, c.y);
		}
	}

	const boxStyle = $derived.by(() => {
		if (!box || !wrapEl) return '';
		const w = wrapEl.getBoundingClientRect();
		return `left:${Math.min(box.x0, box.x1) - w.left}px;top:${Math.min(box.y0, box.y1) - w.top}px;width:${Math.abs(box.x1 - box.x0)}px;height:${Math.abs(box.y1 - box.y0)}px`;
	});

	function title(pc: PC) {
		const m = etaMinutes(pc, now);
		return `${pc.label} · ${ZONE_META[pc.zone].name} · ${STATUS_META[pc.status].label}${m !== null ? ` (free in ~${m} min)` : ''}`;
	}

	const maxW = $derived((cols + off * 2) * 64);
	const colTemplate = $derived(
		layout
			? `repeat(${cols},minmax(0,1fr))`
			: `minmax(0,0.55fr) repeat(${cols},minmax(0,1fr)) minmax(0,0.55fr)`
	);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="wrap mode-{mode}"
	bind:this={wrapEl}
	onpointerdown={floorDown}
	onpointermove={pointerMove}
	onpointerup={pointerUp}
	onpointercancel={() => ((box = null), (dragId = null), (dropCell = null))}
>
	<div class="screen" style="max-width:{maxW}px"><span>FRONT DESK</span></div>

	<div
		class="grid"
		bind:this={gridEl}
		style="grid-template-columns:{colTemplate};grid-template-rows:repeat({rows},auto);max-width:{maxW}px"
	>
		{#each rowLetters as r (r.y)}
			<span class="rowl" style="grid-column:1;grid-row:{r.y + 1}">{r.letter}</span>
			<span class="rowl" style="grid-column:{cols + 2};grid-row:{r.y + 1}">{r.letter}</span>
		{/each}

		{#each emptyCells as c (`${c.x},${c.y}`)}
			<div
				class="cell"
				class:drop={dropCell && dropCell.x === c.x && dropCell.y === c.y}
				style="grid-column:{c.x + 1};grid-row:{c.y + 1}"
			></div>
		{/each}

		{#each pcs as pc (pc.id)}
			{@const mins = etaMinutes(pc, now)}
			<button
				type="button"
				class="seat s-{pc.status} z-{pc.zone} f-{pc.facing}"
				class:sel={selSet.has(pc.id)}
				class:cursor={cursor === pc.id && mode !== 'public'}
				class:dragging={dragId === pc.id}
				class:drop={dropCell && dragId !== pc.id && dropCell.x === pc.x && dropCell.y === pc.y}
				class:long={pc.label.length > 3}
				style="grid-column:{pc.x + 1 + off};grid-row:{pc.y + 1}"
				data-id={pc.id}
				title={title(pc)}
				aria-label={title(pc)}
				aria-pressed={mode === 'public' ? undefined : selSet.has(pc.id)}
				tabindex={mode === 'public' ? 0 : -1}
				onpointerdown={(e) => seatDown(e, pc)}
				onclick={(e) => !layout && onseat?.(pc.id, e)}
				ondblclick={() => onseatdbl?.(pc.id)}
				oncontextmenu={(e) => {
					if (mode === 'public') return;
					e.preventDefault();
					oncontext?.(pc.id, e);
				}}
			>
				<span class="lbl">{letterRows.has(pc.y) ? pc.label.replace(/^[A-Z]+/i, '') : pc.label}</span>
				{#if pc.status === 'offline'}<span class="x" aria-hidden="true">✕</span>{/if}
				{#if mins !== null}<span class="eta">{mins}m</span>{/if}
			</button>
		{/each}
	</div>

	{#if box}<div class="box" style={boxStyle}></div>{/if}
</div>

<style>
	.wrap {
		position: relative;
		width: 100%;
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
	}
	.mode-admin,
	.mode-layout {
		touch-action: none;
		padding: 0.5rem;
	}

	/* Curved cinema-style "screen" bar */
	.screen {
		margin: 0 auto 1.5rem;
		height: 30px;
		border-top: 3px solid var(--accent-2);
		border-radius: 50% 50% 0 0 / 100% 100% 0 0;
		box-shadow: 0 -10px 30px -8px color-mix(in srgb, var(--accent-2) 60%, transparent);
		text-align: center;
	}
	.screen span {
		position: relative;
		top: 6px;
		font-family: var(--display);
		font-weight: 700;
		letter-spacing: 0.4em;
		font-size: 0.75rem;
		color: var(--accent-2);
	}

	.grid {
		display: grid;
		column-gap: clamp(3px, 0.9vw, 8px);
		row-gap: clamp(8px, 1.8vw, 14px);
		margin: 0 auto;
	}

	.rowl {
		align-self: center;
		text-align: center;
		font-family: var(--display);
		font-weight: 700;
		font-size: clamp(10px, 2.4vw, 14px);
		color: var(--muted);
	}

	.cell {
		aspect-ratio: 1;
		border: 1px dashed var(--line);
		border-radius: 8px;
	}
	.cell.drop {
		border-color: var(--accent-2);
		background: color-mix(in srgb, var(--accent-2) 15%, transparent);
	}

	/* ---- seats ---- */
	.seat {
		aspect-ratio: 1;
		position: relative;
		padding: 0;
		border: 2px solid transparent;
		display: grid;
		place-items: center;
		cursor: pointer;
		font-family: var(--display);
		font-weight: 700;
		font-size: clamp(10px, 2.5vw, 15px);
		transition:
			transform 0.12s,
			box-shadow 0.15s,
			background 0.2s;
	}
	/* Chair back on the side away from the screen */
	.f-down {
		border-radius: 40% 40% 14% 14%;
	}
	.f-up {
		border-radius: 14% 14% 40% 40%;
	}
	/* Screen bar on the bench side; paired rows' screens meet to read as one bench */
	.z-pc::before {
		content: '';
		position: absolute;
		left: 10%;
		right: 10%;
		height: 4px;
		border-radius: 2px;
		background: var(--screen);
		box-shadow: 0 0 6px var(--screen);
	}
	.z-pc.f-down::before {
		bottom: calc(-1 * clamp(6px, 1.3vw, 10px));
	}
	.z-pc.f-up::before {
		top: calc(-1 * clamp(6px, 1.3vw, 10px));
	}

	.z-sim {
		border-radius: 30% 30% 10% 10%;
		border-color: var(--sim);
	}
	.z-console {
		border-radius: 22%;
		border-color: var(--console);
	}
	.long {
		font-size: clamp(7px, 1.6vw, 11px);
		letter-spacing: -0.02em;
	}

	.seat:hover {
		transform: translateY(-2px);
	}
	.seat:focus-visible {
		outline: 2px solid white;
		outline-offset: 2px;
	}

	.s-free {
		background: var(--free);
		color: var(--free-ink);
		box-shadow: 0 0 14px var(--free-glow);
	}
	.s-in_use {
		background: var(--in-use);
		color: var(--in-use-ink);
	}
	.s-reserved {
		background: var(--reserved);
		color: #2a1a02;
	}
	.s-offline {
		background: transparent;
		border-color: var(--line);
		border-style: dashed;
		color: var(--muted);
	}

	.lbl {
		line-height: 1;
	}
	.x {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: 1.5em;
		opacity: 0.4;
	}
	.eta {
		position: absolute;
		bottom: 2px;
		font-size: 0.62em;
		font-weight: 600;
		opacity: 0.9;
	}

	.sel {
		outline: 3px solid white;
		outline-offset: 2px;
		transform: translateY(-2px);
	}
	.cursor::after {
		content: '';
		position: absolute;
		right: -3px;
		top: -3px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: white;
		box-shadow: 0 0 6px white;
	}
	.dragging {
		opacity: 0.5;
	}
	.seat.drop {
		outline: 2px dashed var(--accent-2);
		outline-offset: 2px;
	}
	.mode-layout .seat {
		cursor: grab;
	}

	.box {
		position: absolute;
		border: 1px solid var(--accent-2);
		background: color-mix(in srgb, var(--accent-2) 15%, transparent);
		border-radius: 4px;
		pointer-events: none;
	}

	@media (max-width: 520px) {
		.eta {
			display: none;
		}
	}
</style>
