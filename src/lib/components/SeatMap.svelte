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
		if (pc.zone === 'sim') return pc.label.replace(/^SIM-?/i, '') || pc.label;
		if (pc.zone === 'console') return pc.label.replace(/-?d+$/, '') || pc.label;
		return pc.label;
	}

	const colTemplate = $derived(
		layout ? `repeat(${cols},minmax(0,1fr))` : `22px repeat(${cols},minmax(0,1fr)) 22px`
	);
	const gridCols = $derived(cols + off * 2);
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
		<!-- the long wall every row faces, with the venue's blue LED strip -->
		<div class="wall top"><span>{meta.top}</span></div>

		<div class="grid" class:bottom-desk={bottomDesk} bind:this={gridEl} style="grid-template-columns:{colTemplate};grid-template-rows:repeat({rows},auto)">
			{#each bands as b (b.y)}
				<div class="band" style="grid-column:{1 + off} / span {cols};grid-row:{b.y + 1} / span {b.span}">
					{#if floor === 'upstairs'}
						<span class="void-label">Open to ground floor</span>
					{:else}
						<span class="walk-label">Walkway</span>
					{/if}
				</div>
			{/each}

			{#each rowLetters as r (r.y)}
				<span class="rowl" style="grid-column:1;grid-row:{r.y + 1}">{r.letter}</span>
				<span class="rowl" style="grid-column:{gridCols};grid-row:{r.y + 1}">{r.letter}</span>
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
					class:long={!letterRows.has(pc.y) && pc.label.length > 3}
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
					{#if pc.zone === 'pc'}
						<!-- desk, screen and tower on the shelf, drawn on the screen side -->
						<span class="desk" aria-hidden="true"><i class="mon"></i><i class="tower"></i></span>
					{:else if pc.zone === 'sim'}
						<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
							<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.4" />
							<path d="M3.8 11h16.4M12 12.5v7.8" stroke="currentColor" stroke-width="2.4" fill="none" />
							<circle cx="12" cy="12" r="2.2" fill="currentColor" />
						</svg>
					{:else}
						<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
							<path
								d="M7 7h10a5 5 0 0 1 4.9 6l-.8 3.6a2.4 2.4 0 0 1-4.1 1.1L14.6 15H9.4L7 17.7a2.4 2.4 0 0 1-4.1-1.1L2.1 13A5 5 0 0 1 7 7z"
								fill="currentColor"
							/>
							<path d="M6 11h3M7.5 9.5v3" stroke="var(--seat-bg)" stroke-width="1.6" />
							<circle cx="16" cy="10.4" r="1" fill="var(--seat-bg)" /><circle cx="17.8" cy="12.2" r="1" fill="var(--seat-bg)" />
						</svg>
					{/if}
					<span class="lbl">{shortLabel(pc)}</span>
				</button>
			{/each}
		</div>

		{#if floor === 'ground' && !layout}
			<div class="gg-floor" aria-hidden="true">GG</div>
		{/if}
		{#if meta.bottom}<div class="wall bottom"><span>{meta.bottom}</span></div>{/if}
	</div>

	{#if meta.side}<div class="entrance" aria-label="Entrance"><span>{meta.side}</span></div>{/if}
	{#if !layout && floor === 'ground'}<div class="stairs" aria-hidden="true"><i></i><i></i><i></i><i></i><span>Stairs</span></div>{/if}

	{#if box}<div class="box" style={boxStyle}></div>{/if}
</div>

<style>
	.wrap {
		--gap-x: clamp(3px, 0.55vw, 7px);
		--gap-y: 30px;
		position: relative;
		padding-right: 26px;
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
	}
	.mode-admin,
	.mode-layout {
		touch-action: none;
	}
	.mode-owner .seat {
		cursor: pointer;
		-webkit-touch-callout: none;
	}
	.mode-owner .seat:active {
		transform: scale(0.94);
	}
	.mode-layout {
		padding-right: 0;
	}

	/* ---- the room ---- */
	.hall {
		position: relative;
		border: 1px solid var(--line);
		border-radius: 14px;
		background:
			radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.035) 1px, transparent 0) 0 0 / 18px 18px,
			linear-gradient(180deg, #0d1119, #0a0d14);
		padding: 0 10px 8px;
		overflow: hidden;
	}
	.wall {
		position: relative;
		height: 26px;
		display: grid;
		place-items: center;
		margin: 0 -10px;
	}
	.wall.top {
		border-bottom: 2px solid #2f6bff;
		box-shadow: 0 8px 24px -10px #2f6bff;
		background: linear-gradient(180deg, #161c2b, #0f1420);
	}
	.wall.bottom {
		border-top: 2px solid var(--line);
		background: #0f1420;
		margin-top: 8px;
		margin-bottom: -8px;
	}
	.wall span {
		font-family: var(--display);
		font-weight: 700;
		letter-spacing: 0.32em;
		font-size: 0.66rem;
		color: #7f9cff;
		white-space: nowrap;
	}
	.wall.bottom span {
		color: var(--muted);
	}

	.grid {
		display: grid;
		column-gap: var(--gap-x);
		row-gap: var(--gap-y);
		padding-top: 30px;
		margin: 0 auto;
	}
	.grid.bottom-desk {
		padding-bottom: 30px;
	}
	.mode-layout .grid {
		row-gap: 10px;
		padding-top: 10px;
	}

	.rowl {
		align-self: center;
		text-align: center;
		font-family: var(--display);
		font-weight: 700;
		font-size: 13px;
		color: var(--muted);
	}

	/* empty rows: walkway / void */
	.band {
		min-height: 34px;
		margin: -14px 0;
		border-radius: 6px;
		display: grid;
		place-items: center;
		position: relative;
		z-index: 0;
	}
	.floor-ground .band {
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.025) 15%, rgba(255, 255, 255, 0.025) 85%, transparent);
	}
	.floor-upstairs .band {
		background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0 2px, transparent 2px 9px);
		/* railings either side of the void */
		border-top: 3px solid transparent;
		border-bottom: 3px solid transparent;
		border-image: repeating-linear-gradient(90deg, #6b7486 0 3px, #333a48 3px 14px) 3;
	}
	.walk-label,
	.void-label {
		font-family: var(--display);
		font-size: 0.65rem;
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: rgba(138, 149, 179, 0.45);
	}

	/* projected GG logo on the floor by the entrance */
	.gg-floor {
		position: absolute;
		right: 6%;
		bottom: 34px;
		font-family: var(--display);
		font-weight: 700;
		font-size: 2.4rem;
		color: rgba(255, 255, 255, 0.06);
		text-shadow: 0 0 30px rgba(255, 255, 255, 0.08);
		pointer-events: none;
	}

	.entrance {
		position: absolute;
		right: 0;
		bottom: 30px;
		height: 90px;
		width: 22px;
		display: grid;
		place-items: center;
		border-left: 3px solid var(--reserved);
		border-radius: 2px;
	}
	.entrance span {
		writing-mode: vertical-rl;
		font-family: var(--display);
		font-weight: 700;
		letter-spacing: 0.28em;
		font-size: 0.62rem;
		color: var(--reserved);
	}
	.stairs {
		position: absolute;
		left: 34px;
		bottom: 6px;
		display: flex;
		align-items: center;
		gap: 2px;
		opacity: 0.55;
		pointer-events: none;
	}
	.stairs i {
		width: 4px;
		height: 12px;
		background: var(--muted);
		border-radius: 1px;
	}
	.stairs span {
		margin-left: 5px;
		font-family: var(--display);
		font-size: 0.6rem;
		letter-spacing: 0.25em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.mode-layout .stairs,
	.mode-layout .entrance {
		display: none;
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

	/* ---- seats (chairs seen from above) ---- */
	.seat {
		--seat-bg: var(--free);
		aspect-ratio: 1;
		position: relative;
		z-index: 1;
		padding: 0;
		border: 2px solid transparent;
		display: grid;
		place-items: center;
		align-content: center;
		cursor: pointer;
		font-family: var(--display);
		font-weight: 700;
		font-size: clamp(11px, 1.05vw, 15px);
		background: var(--seat-bg);
		transition:
			transform 0.12s,
			box-shadow 0.15s,
			background 0.2s;
	}
	.f-down {
		border-radius: 42% 42% 16% 16%;
	}
	.f-up {
		border-radius: 16% 16% 42% 42%;
	}

	/* Desk strip in front of the chair: adjacent desks merge into one long bench */
	.desk {
		position: absolute;
		left: calc(-1 * var(--gap-x) / 2 - 2px);
		right: calc(-1 * var(--gap-x) / 2 - 2px);
		height: 9px;
		background: linear-gradient(180deg, #3a2c22, #2a2019);
		pointer-events: none;
	}
	.f-up .desk {
		top: -15px;
	}
	.f-down .desk {
		bottom: -15px;
	}
	.mon {
		position: absolute;
		left: 20%;
		right: 20%;
		height: 3px;
		border-radius: 1px;
		background: #4a5368;
	}
	.f-up .mon {
		top: 1px;
	}
	.f-down .mon {
		bottom: 1px;
	}
	/* screen lights up while someone's playing */
	.s-in_use .mon {
		background: #cfe9ff;
		box-shadow: 0 0 6px #8fd3ff;
	}
	.tower {
		position: absolute;
		left: 50%;
		width: 9px;
		height: 11px;
		margin-left: -4.5px;
		border-radius: 2px;
		background:
			radial-gradient(circle at 50% 35%, #ff6ad5 0 1.6px, transparent 2.2px),
			radial-gradient(circle at 50% 72%, #6ae3ff 0 1.6px, transparent 2.2px),
			#e9edf5;
		box-shadow: 0 0 6px rgba(186, 120, 255, 0.55);
	}
	.f-up .tower {
		top: -12px;
	}
	.f-down .tower {
		bottom: -12px;
	}
	.mode-layout .tower {
		display: none;
	}

	.z-sim {
		border-radius: 30%;
		border-color: var(--sim);
	}
	.z-console {
		border-radius: 30%;
		border-color: var(--console);
	}
	.ico {
		width: 56%;
		height: 56%;
		margin-bottom: -1px;
	}
	.z-sim .lbl,
	.z-console .lbl {
		font-size: 0.68em;
		font-weight: 700;
		letter-spacing: 0.03em;
	}
	.z-sim,
	.z-console {
		border-width: 2.5px;
	}
	.long {
		font-size: clamp(7px, 0.75vw, 11px);
	}

	.seat:hover {
		transform: translateY(-1px);
		filter: brightness(1.12);
	}
	.seat:focus-visible {
		outline: 2px solid white;
		outline-offset: 2px;
	}

	.s-free {
		--seat-bg: var(--free);
		color: var(--free-ink);
		box-shadow: 0 0 12px var(--free-glow);
	}
	.s-in_use {
		--seat-bg: var(--in-use);
		color: var(--in-use-ink);
	}
	.s-reserved {
		--seat-bg: var(--reserved);
		color: #2a1a02;
	}
	.s-offline {
		--seat-bg: #121722;
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
		opacity: 0.35;
	}
	.eta {
		position: absolute;
		bottom: 1px;
		font-size: 0.6em;
		font-weight: 600;
	}

	.sel {
		outline: 3px solid white;
		outline-offset: 2px;
		z-index: 2;
	}
	.cursor::after {
		content: '';
		position: absolute;
		right: -4px;
		top: -4px;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: white;
		box-shadow: 0 0 6px white;
	}
	.dragging {
		opacity: 0.45;
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
		z-index: 5;
	}

	@media (max-width: 640px) {
		.wrap {
			--gap-y: 26px;
		}
		/* phones: keep seats tappable, the map scrolls sideways inside its card */
		.mode-public {
			min-width: calc(var(--cols) * 26px + 70px);
		}
		.eta {
			display: none;
		}
	}
</style>
