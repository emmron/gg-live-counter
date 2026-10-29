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

	const pad = $derived(mode === 'layout' ? 2 : 0);
	const cols = $derived(
		Math.min(MAX_GRID + 1, Math.max(mode === 'layout' ? 12 : 1, ...pcs.map((p) => p.x + 1 + pad)))
	);
	const rows = $derived(
		Math.min(MAX_GRID + 1, Math.max(mode === 'layout' ? 9 : 1, ...pcs.map((p) => p.y + 1 + pad)))
	);
	const selSet = $derived(new Set(selected));
	const occupied = $derived(new Set(pcs.map((p) => `${p.x},${p.y}`)));
	const emptyCells = $derived.by(() => {
		if (mode !== 'layout') return [];
		const out: { x: number; y: number }[] = [];
		for (let y = 0; y < rows; y++)
			for (let x = 0; x < cols; x++) if (!occupied.has(`${x},${y}`)) out.push({ x, y });
		return out;
	});

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
		if (mode !== 'layout' || e.button !== 0) return;
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
	<div class="screen" style="max-width:{cols * 72}px"><span>FRONT DESK</span></div>

	<div
		class="grid"
		bind:this={gridEl}
		style="grid-template-columns:repeat({cols},minmax(0,1fr));grid-template-rows:repeat({rows},auto);max-width:{cols * 72}px"
	>
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
				class="seat s-{pc.status} z-{pc.zone}"
				class:sel={selSet.has(pc.id)}
				class:cursor={cursor === pc.id && mode !== 'public'}
				class:dragging={dragId === pc.id}
				class:drop={dropCell && dragId !== pc.id && dropCell.x === pc.x && dropCell.y === pc.y}
				style="grid-column:{pc.x + 1};grid-row:{pc.y + 1}"
				data-id={pc.id}
				title={title(pc)}
				aria-label={title(pc)}
				aria-pressed={mode === 'public' ? undefined : selSet.has(pc.id)}
				tabindex={mode === 'public' ? 0 : -1}
				onpointerdown={(e) => seatDown(e, pc)}
				onclick={(e) => mode !== 'layout' && onseat?.(pc.id, e)}
				ondblclick={() => onseatdbl?.(pc.id)}
				oncontextmenu={(e) => {
					if (mode === 'public') return;
					e.preventDefault();
					oncontext?.(pc.id, e);
				}}
			>
				<span class="lbl">{pc.label}</span>
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

	/* Curved cinema-style "screen" */
	.screen {
		margin: 0 auto 1.75rem;
		height: 34px;
		border-top: 3px solid var(--accent-2);
		border-radius: 50% 50% 0 0 / 100% 100% 0 0;
		box-shadow: 0 -10px 30px -8px rgba(34, 211, 238, 0.55);
		text-align: center;
		position: relative;
	}
	.screen span {
		position: relative;
		top: 8px;
		font-family: 'Rajdhani', sans-serif;
		font-weight: 700;
		letter-spacing: 0.4em;
		font-size: 0.8rem;
		color: var(--accent-2);
	}

	.grid {
		display: grid;
		gap: clamp(4px, 1.2vw, 10px);
		margin: 0 auto;
	}

	.cell {
		aspect-ratio: 1;
		border: 1px dashed var(--line);
		border-radius: 8px;
	}
	.cell.drop {
		border-color: var(--accent);
		background: rgba(124, 92, 255, 0.15);
	}

	.seat {
		aspect-ratio: 1;
		position: relative;
		padding: 0;
		border: 2px solid transparent;
		border-radius: 30% 30% 12% 12%;
		display: grid;
		place-items: center;
		cursor: pointer;
		font-weight: 600;
		font-size: clamp(9px, 2.4vw, 14px);
		color: #08130c;
		transition:
			transform 0.12s,
			box-shadow 0.15s,
			background 0.2s;
	}
	/* armrest / seat base like the cinema kiosk */
	.seat::after {
		content: '';
		position: absolute;
		left: 12%;
		right: 12%;
		bottom: -5px;
		height: 4px;
		border-radius: 3px;
		background: currentColor;
		opacity: 0.35;
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
		box-shadow: 0 0 14px var(--free-glow);
	}
	.s-in_use {
		background: var(--in-use);
		color: #2a0606;
	}
	.s-reserved {
		background: var(--reserved);
		color: #2a1a02;
	}
	.s-offline {
		background: var(--offline);
		color: #8a90a6;
	}

	.z-pro {
		border-color: var(--pro);
	}
	.z-console {
		border-color: var(--console);
		border-radius: 18%;
	}

	.lbl {
		line-height: 1;
	}
	.x {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: 1.6em;
		opacity: 0.35;
	}
	.eta {
		position: absolute;
		bottom: 3px;
		font-size: 0.7em;
		font-weight: 500;
		opacity: 0.85;
	}

	.sel {
		outline: 3px solid white;
		outline-offset: 2px;
		transform: translateY(-2px);
	}
	.cursor::before {
		content: '';
		position: absolute;
		top: -9px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: white;
	}
	.dragging {
		opacity: 0.5;
	}
	.seat.drop {
		outline: 2px dashed var(--accent);
		outline-offset: 2px;
	}
	.mode-layout .seat {
		cursor: grab;
	}

	.box {
		position: absolute;
		border: 1px solid var(--accent);
		background: rgba(124, 92, 255, 0.15);
		border-radius: 4px;
		pointer-events: none;
	}

	@media (max-width: 520px) {
		.eta {
			display: none;
		}
	}
</style>
