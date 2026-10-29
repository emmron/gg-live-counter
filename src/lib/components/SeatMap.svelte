<script lang="ts">
	import { etaMinutes } from '#lib/format.ts';
	import { FLOOR_META, MAX_GRID, STATUS_META, ZONE_META, type Floor, type PC } from '#lib/types.ts';

	type Mode = 'public' | 'owner' | 'admin' | 'layout';
	interface Props {
		pcs: PC[];
		floor: Floor;
		mode?: Mode;
		selected?: string[];
		cursor?: string | null;
		now?: number;
		/** Keep both floors the same width so they line up */
		minCols?: number;
		onseat?: (id: string, e: MouseEvent) => void;
		oncontext?: (id: string, e: MouseEvent) => void;
		onseatdbl?: (id: string) => void;
		/** Drag-box selection finished. Empty ids + !additive = clicked empty floor. */
		onbox?: (ids: string[], additive: boolean) => void;
		/** Layout mode: seat dropped on a cell */
		onmove?: (id: string, x: number, y: number) => void;
		/** Owner mode: a seat was tapped (first) or dragged over while painting. */
		onpaint?: (id: string, first: boolean) => void;
		/** Owner mode: tap/drag finished */
		onpaintend?: () => void;
	}

	let {
		pcs,
		floor,
		mode = 'public',
		selected = [],
		cursor = null,
		now = Date.now(),
		minCols = 1,
		onseat,
		oncontext,
		onseatdbl,
		onbox,
		onmove,
		onpaint,
		onpaintend
	}: Props = $props();
	const owner = $derived(mode === 'owner');

	const meta = $derived(FLOOR_META[floor]);
	const layout = $derived(mode === 'layout');
	const pad = $derived(layout ? 2 : 0);
	const cols = $derived(
		Math.min(MAX_GRID + 1, Math.max(minCols, layout ? 12 : 1, ...pcs.map((p) => p.x + 1 + pad)))
	);
	const rows = $derived(Math.min(MAX_GRID + 1, Math.max(layout ? 5 : 1, ...pcs.map((p) => p.y + 1 + pad))));
	/** In view modes, column 1 and the last column hold cinema-style row letters. */
	const off = $derived(layout ? 0 : 1);

	const selSet = $derived(new Set(selected));
	const occupied = $derived(new Set(pcs.map((p) => `${p.x},${p.y}`)));
	const usedRows = $derived(new Set(pcs.map((p) => p.y)));

	const emptyCells = $derived.by(() => {
		if (!layout) return [];
		const out: { x: number; y: number }[] = [];
		for (let y = 0; y < rows; y++)
			for (let x = 0; x < cols; x++) if (!occupied.has(`${x},${y}`)) out.push({ x, y });
		return out;
	});

	/** Empty rows become a walkway (ground) or the open void with railings (upstairs). */
	const bands = $derived.by(() => {
		if (layout) return [];
		const out: { y: number; span: number }[] = [];
		for (let y = 0; y < rows; y++) {
			if (usedRows.has(y)) continue;
			const last = out.at(-1);
			if (last && last.y + last.span === y) last.span++;
			else out.push({ y, span: 1 });
		}
		return out;
	});
	/** Room for desks/towers drawn below the last row when it faces down. */
	const bottomDesk = $derived(pcs.some((p) => p.facing === 'down' && p.zone === 'pc' && p.y === rows - 1));

	/** Rows where every PC label shares a letter prefix (A1…A22 → "A") get a row letter. */
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
	let painting = false;
	let pressTimer: ReturnType<typeof setTimeout> | undefined;
	let pressed: { id: string; x: number; y: number; long: boolean } | null = null;

	/** Layout mode fills every grid slot with a seat or an empty cell, so hit-test those. */
	function cellAt(cx: number, cy: number) {
		const el = (document.elementFromPoint(cx, cy) as HTMLElement | null)?.closest<HTMLElement>('[data-x]');
		if (!el || !gridEl.contains(el)) return null;
		return { x: Number(el.dataset.x), y: Number(el.dataset.y) };
	}

	function floorDown(e: PointerEvent) {
		if (mode === 'public' || owner || e.button !== 0) return;
		if ((e.target as HTMLElement).closest('[data-id]')) return;
		e.preventDefault();
		box = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, additive: e.shiftKey || e.ctrlKey || e.metaKey };
		wrapEl.setPointerCapture(e.pointerId);
	}

	function seatDown(e: PointerEvent, pc: PC) {
		if (owner && e.button === 0) {
			if (e.pointerType === 'mouse') {
				// mouse: switch now, keep switching seats the pointer drags over
				e.preventDefault();
				painting = true;
				wrapEl.setPointerCapture(e.pointerId);
				onpaint?.(pc.id, true);
			} else {
				// touch: tap switches on release; holding opens the menu
				pressed = { id: pc.id, x: e.clientX, y: e.clientY, long: false };
				clearTimeout(pressTimer);
				pressTimer = setTimeout(() => {
					if (!pressed) return;
					pressed.long = true;
					oncontext?.(pc.id, new MouseEvent('contextmenu', { clientX: pressed.x, clientY: pressed.y }));
				}, 480);
			}
			return;
		}
		if (!layout || e.button !== 0) return;
		e.preventDefault();
		onseat?.(pc.id, e);
		dragId = pc.id;
		wrapEl.setPointerCapture(e.pointerId);
	}

	function pointerMove(e: PointerEvent) {
		if (painting) {
			const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-id]');
			if (el && gridEl.contains(el)) onpaint?.(el.dataset.id!, false);
			return;
		}
		if (pressed && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > 10) {
			clearTimeout(pressTimer);
			pressed = null;
		}
		if (box) {
			box.x1 = e.clientX;
			box.y1 = e.clientY;
		} else if (dragId) dropCell = cellAt(e.clientX, e.clientY);
	}

	function pointerUp(e: PointerEvent) {
		if (painting) {
			painting = false;
			onpaintend?.();
			return;
		}
		if (pressed) {
			clearTimeout(pressTimer);
			const p = pressed;
			pressed = null;
			if (!p.long) {
				onpaint?.(p.id, true);
				onpaintend?.();
			}
			return;
		}
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
		return `${pc.label} · ${ZONE_META[pc.zone].name} · ${pc.status === 'free' ? 'Free' : 'Taken'}`;
	}

	/** Seat text: number only in lettered rows; sims show their number; consoles their type. */
	function shortLabel(pc: PC) {
		if (letterRows.has(pc.y)) return pc.label.replace(/^[A-Z]+/i, '');
		if (pc.zone === 'sim') return 'SIM ' + (pc.label.replace(/^SIM-?/i, '') || '');
		if (pc.zone === 'console') return (pc.label.replace(/-?\d+$/, '') || pc.label).replace(/^XBX$/i, 'XBOX');
		return pc.label;
	}

	const colTemplate = $derived(
		layout ? `repeat(${cols},minmax(0,1fr))` : `24px repeat(${cols},minmax(0,1fr))`
	);
	const gridCols = $derived(cols + off);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="wrap mode-{mode} floor-{floor}"
	bind:this={wrapEl}
	style="--cols:{cols}"
	onpointerdown={floorDown}
	onpointermove={pointerMove}
	onpointerup={pointerUp}
	onpointercancel={() => {
		box = null;
		dragId = null;
		dropCell = null;
		clearTimeout(pressTimer);
		pressed = null;
		if (painting) (painting = false), onpaintend?.();
	}}
>
	<div class="hall">
		<!-- the long wall every row faces -->
		<div class="wall top"></div>

		<div class="grid" bind:this={gridEl} style="grid-template-columns:{colTemplate};grid-template-rows:repeat({rows},auto)">
			{#each bands as b (b.y)}
				<div class="band" style="grid-column:{1 + off} / span {cols};grid-row:{b.y + 1} / span {b.span}">
					{#if meta.side && b.y + b.span === rows - 1}<span class="entrance-label">{meta.side} →</span>{/if}
				</div>
			{/each}

			{#each rowLetters as r (r.y)}
				<span class="rowl" style="grid-column:1;grid-row:{r.y + 1}">{r.letter}</span>
			{/each}

			{#each emptyCells as c (`${c.x},${c.y}`)}
				<div
					class="cell"
					class:drop={dropCell && dropCell.x === c.x && dropCell.y === c.y}
					data-x={c.x}
					data-y={c.y}
					style="grid-column:{c.x + 1};grid-row:{c.y + 1}"
				></div>
			{/each}

			{#each pcs as pc (pc.id)}
				<button
					type="button"
					class="seat {pc.status === 'free' ? 's-free' : 's-in_use'} z-{pc.zone} f-{pc.facing}"
					class:sel={selSet.has(pc.id)}
					class:cursor={cursor === pc.id && mode !== 'public'}
					class:dragging={dragId === pc.id}
					class:drop={dropCell && dragId !== pc.id && dropCell.x === pc.x && dropCell.y === pc.y}
					style="grid-column:{pc.x + 1 + off};grid-row:{pc.y + 1}"
					data-id={pc.id}
					data-x={pc.x}
					data-y={pc.y}
					title={title(pc)}
					aria-label={title(pc)}
					aria-pressed={mode === 'public' ? undefined : selSet.has(pc.id)}
					tabindex={mode === 'public' || owner ? 0 : -1}
					onpointerdown={(e) => seatDown(e, pc)}
					onclick={(e) => {
						if (owner) {
							// keyboard (Enter/Space) on a focused seat
							if (e.detail === 0) onpaint?.(pc.id, true), onpaintend?.();
							return;
						}
						if (!layout) onseat?.(pc.id, e);
					}}
					ondblclick={() => onseatdbl?.(pc.id)}
					oncontextmenu={(e) => {
						if (mode === 'public') return;
						e.preventDefault();
						oncontext?.(pc.id, e);
					}}
				>
					<span class="lbl">{shortLabel(pc)}</span>
				</button>
			{/each}
		</div>

		{#if meta.bottom}<div class="wall bottom"><span>{meta.bottom}</span></div>{/if}
	</div>


	{#if box}<div class="box" style={boxStyle}></div>{/if}
</div>

<style>
	.wrap {
		--gap-x: clamp(3px, 0.45vw, 6px);
		--gap-y: 10px;
		position: relative;
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
	}
	.mode-admin,
	.mode-layout {
		touch-action: none;
	}
	.mode-owner .seat {
		-webkit-touch-callout: none;
	}
	.mode-owner .seat:active {
		transform: scale(0.94);
	}

	/* the room: a plain card; the wall the rows face is a thin line at the top */
	.hall {
		position: relative;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--bg-2);
		padding: 0 12px 6px;
	}
	.wall.top {
		height: 0;
		margin: 0 -12px;
		border-top: 3px solid var(--line-2);
		border-radius: 12px 12px 0 0;
	}
	.wall.bottom {
		margin: 6px -12px -6px;
		border-top: 3px solid var(--line-2);
	}
	.wall.bottom span {
		display: none;
	}

	.grid {
		display: grid;
		column-gap: var(--gap-x);
		row-gap: var(--gap-y);
		padding: 14px 0 8px;
		margin: 0 auto;
	}
	.mode-layout .grid {
		padding-top: 10px;
	}

	.rowl {
		align-self: center;
		text-align: left;
		font-weight: 600;
		font-size: 14px;
		color: var(--muted);
	}

	/* empty rows (walkway / open void): just space */
	.band {
		min-height: 26px;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		position: relative;
	}
	.entrance-label {
		font-size: 0.85rem;
		color: var(--faded);
	}

	.cell {
		aspect-ratio: 1;
		border: 1px dashed var(--line-2);
		border-radius: 7px;
	}
	.cell.drop {
		border-color: var(--free-edge);
	}

	/* ---- seats ---- */
	.seat {
		aspect-ratio: 1;
		position: relative;
		padding: 0;
		border: 1.5px solid transparent;
		border-radius: 7px;
		display: grid;
		place-items: center;
		cursor: pointer;
		font-family: 'Inter', system-ui, sans-serif;
		font-weight: 600;
		font-size: clamp(12px, 1.15vw, 16px);
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	/* free: outline only */
	.s-free {
		background: transparent;
		border-color: var(--free-edge);
		color: var(--free-ink);
	}
	/* taken: flat and quiet */
	.s-in_use {
		background: var(--in-use);
		color: var(--in-use-ink);
	}
	.z-sim .lbl,
	.z-console .lbl {
		font-size: 0.66em;
		letter-spacing: -0.01em;
	}
	.lbl {
		line-height: 1;
	}

	.seat:hover {
		filter: brightness(1.3);
	}
	.seat:focus-visible {
		outline: 2px solid var(--text);
		outline-offset: 2px;
	}
	.sel {
		outline: 2px solid var(--text);
		outline-offset: 2px;
		z-index: 2;
	}
	.cursor {
		box-shadow: inset 0 0 0 2px var(--text);
	}
	.dragging {
		opacity: 0.45;
	}
	.seat.drop {
		outline: 2px dashed var(--free-edge);
		outline-offset: 2px;
	}
	.mode-layout .seat {
		cursor: grab;
	}

	.box {
		position: absolute;
		border: 1px solid var(--free-edge);
		background: rgba(76, 201, 212, 0.1);
		border-radius: 4px;
		pointer-events: none;
		z-index: 5;
	}

	@media (max-width: 640px) {
		.wrap {
			--gap-y: 8px;
		}
		/* phones: keep seats tappable, the map scrolls sideways inside its card */
		.mode-public {
			min-width: calc(var(--cols) * 26px + 60px);
		}
	}
</style>
