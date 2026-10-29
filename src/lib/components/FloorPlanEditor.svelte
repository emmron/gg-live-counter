<script lang="ts">
	import SeatMap from '#lib/components/SeatMap.svelte';
	import { FLOORS, FLOOR_META, MAX_GRID, type CafeState, type Floor, type PC, type Zone } from '#lib/types.ts';

	/**
	 * The owner thinks in rows ("row A has 22 PCs"), not in grid cells, so the floor plan
	 * is edited as a list of rows per floor plus counts of sims and consoles.
	 * Seats are generated from that and keep their current free/taken state.
	 */
	interface Row {
		key: string;
		letter: string;
		count: number;
		/** empty spots before the first seat (e.g. where a bench starts further along) */
		indent: number;
		/** leave a walkway / open space above this row */
		gap: boolean;
	}
	interface Plan {
		ground: Row[];
		upstairs: Row[];
		sims: number;
		ps5: number;
		xbox: number;
	}

	let { initial, onsaved }: { initial: CafeState; onsaved?: (s: CafeState) => void } = $props();

	const uid = () => Math.random().toString(36).slice(2, 9);

	function readPlan(pcs: PC[]): Plan {
		const plan: Plan = { ground: [], upstairs: [], sims: 0, ps5: 0, xbox: 0 };
		for (const fl of FLOORS) {
			const seatsOn = pcs.filter((p) => p.floor === fl && p.zone === 'pc');
			const ys = [...new Set(seatsOn.map((p) => p.y))].sort((a, b) => a - b);
			ys.forEach((y, i) => {
				const row = seatsOn.filter((p) => p.y === y);
				const letter = /^([A-Z]+)/i.exec(row[0].label)?.[1]?.toUpperCase() ?? '?';
				plan[fl].push({
					key: uid(),
					letter,
					count: row.length,
					indent: Math.min(...row.map((p) => p.x)),
					gap: i > 0 && y - ys[i - 1] > 1
				});
			});
		}
		plan.sims = pcs.filter((p) => p.zone === 'sim').length;
		plan.ps5 = pcs.filter((p) => p.zone === 'console' && /^PS/i.test(p.label)).length;
		plan.xbox = pcs.filter((p) => p.zone === 'console' && !/^PS/i.test(p.label)).length;
		return plan;
	}

	function build(plan: Plan, old: PC[]): PC[] {
		const was = new Map(old.map((p) => [p.id, p]));
		const now = new Date().toISOString();
		const out: PC[] = [];
		const ids = new Set<string>();
		const add = (label: string, zone: Zone, floor: Floor, x: number, y: number) => {
			const id = label.toLowerCase();
			// two rows can share a letter mid-edit; skip the repeats so the preview never breaks
			// (the plan's problem check explains it and blocks saving)
			if (ids.has(id)) return;
			ids.add(id);
			const o = was.get(id);
			out.push({
				id,
				label,
				zone,
				floor,
				x,
				y,
				facing: 'up',
				status: o?.status ?? 'free',
				freeAt: o?.freeAt ?? null,
				updatedAt: o?.updatedAt ?? now
			});
		};
		for (const fl of FLOORS) {
			let y = 0;
			plan[fl].forEach((r, i) => {
				if (i > 0 && r.gap) y++;
				for (let k = 0; k < r.count; k++) add(`${r.letter}${k + 1}`, 'pc', fl, r.indent + k, y);
				y++;
			});
			if (fl === 'ground' && plan.sims + plan.ps5 + plan.xbox > 0) {
				if (plan.ground.length) y++; // walkway between the PC rows and the sims/consoles
				let x = 0;
				for (let k = 0; k < plan.sims; k++) add(`SIM${k + 1}`, 'sim', 'ground', x++, y);
				if (plan.sims && plan.ps5 + plan.xbox) x++;
				for (let k = 0; k < plan.ps5; k++) add(`PS5-${k + 1}`, 'console', 'ground', x++, y);
				for (let k = 0; k < plan.xbox; k++) add(`XBX-${k + 1}`, 'console', 'ground', x++, y);
			}
		}
		return out;
	}

	// svelte-ignore state_referenced_locally
	let base = $state<CafeState>(initial);
	// svelte-ignore state_referenced_locally
	let plan = $state<Plan>(readPlan(initial.pcs));
	// svelte-ignore state_referenced_locally
	let saved = $state(JSON.stringify(stripKeys(readPlan(initial.pcs))));
	let saving = $state(false);
	let message = $state<{ text: string; ok: boolean } | null>(null);

	function stripKeys(p: Plan) {
		return { ...p, ground: p.ground.map(({ key, ...r }) => r), upstairs: p.upstairs.map(({ key, ...r }) => r) };
	}

	const pcs = $derived(build(plan, base.pcs));
	const dirty = $derived(JSON.stringify(stripKeys(plan)) !== saved);
	const totals = $derived({
		pcs: pcs.filter((p) => p.zone === 'pc').length,
		sims: plan.sims,
		consoles: plan.ps5 + plan.xbox
	});
	const gridCols = $derived(Math.max(1, ...pcs.map((p) => p.x + 1)));

	/** First problem with the plan, in plain words, or null. */
	const problem = $derived.by(() => {
		const seen = new Set<string>();
		for (const fl of FLOORS)
			for (const r of plan[fl]) {
				if (!/^[A-Z]{1,2}$/.test(r.letter)) return `Row names must be 1–2 letters (check “${r.letter || 'blank'}”).`;
				if (seen.has(r.letter)) return `Two rows are called ${r.letter}. Give each row its own letter.`;
				seen.add(r.letter);
				if (r.indent + r.count - 1 > MAX_GRID) return `Row ${r.letter} is too long.`;
			}
		return null;
	});

	function nextLetter() {
		const used = new Set(FLOORS.flatMap((f) => plan[f].map((r) => r.letter)));
		for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.has(c)) return c;
		return '';
	}

	function addRow(fl: Floor) {
		const last = plan[fl].at(-1);
		plan[fl].push({ key: uid(), letter: nextLetter(), count: last?.count ?? 10, indent: 0, gap: false });
	}
	function removeRow(fl: Floor, i: number) {
		const r = plan[fl][i];
		if (!confirm(`Remove row ${r.letter} (${r.count} PCs)?`)) return;
		plan[fl].splice(i, 1);
	}
	function move(fl: Floor, i: number, d: -1 | 1) {
		const rows = plan[fl];
		const j = i + d;
		if (j < 0 || j >= rows.length) return;
		[rows[i], rows[j]] = [rows[j], rows[i]];
	}
	const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

	function discard() {
		plan = readPlan(base.pcs);
		message = null;
	}

	async function save() {
		if (problem || !dirty) return;
		saving = true;
		message = null;
		try {
			const r = await fetch('/api/status', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ pcs: $state.snapshot(pcs) })
			});
			if (r.status === 401) return void (location.href = '/admin/login');
			if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? r.statusText);
			base = await r.json();
			plan = readPlan(base.pcs);
			saved = JSON.stringify(stripKeys(plan));
			message = { text: 'Floor plan saved. It’s live now.', ok: true };
			onsaved?.(base);
		} catch (e) {
			message = { text: `Couldn’t save: ${(e as Error).message}`, ok: false };
		} finally {
			saving = false;
		}
	}
</script>

{#snippet stepper(value: number, set: (n: number) => void, min: number, max: number, label: string)}
	<div class="stepper" role="group" aria-label={label}>
		<button type="button" onclick={() => set(clamp(value - 1, min, max))} disabled={value <= min} aria-label="Fewer">−</button>
		<input
			type="number"
			inputmode="numeric"
			{min}
			{max}
			value={value}
			aria-label={label}
			onchange={(e) => set(clamp(Number((e.target as HTMLInputElement).value) || min, min, max))}
		/>
		<button type="button" onclick={() => set(clamp(value + 1, min, max))} disabled={value >= max} aria-label="More">+</button>
	</div>
{/snippet}

<div class="editor">
	<div class="controls">
		{#each FLOORS as fl (fl)}
			<section class="card">
				<header>
					<h2>{FLOOR_META[fl].name}</h2>
					<span>{plan[fl].reduce((n, r) => n + r.count, 0)} PCs</span>
				</header>

				{#if plan[fl].length}
					<div class="table" role="table" aria-label="{FLOOR_META[fl].name} rows">
						<div class="tr th" role="row">
							<span role="columnheader">Row</span>
							<span role="columnheader">PCs</span>
							<span role="columnheader" title="Empty spots before the first PC, e.g. where a bench starts further along">Starts after</span>
							<span role="columnheader" title="Leave a walkway or open space above this row">Gap above</span>
							<span></span>
						</div>
						{#each plan[fl] as row, i (row.key)}
							<div class="tr" role="row">
								<input
									class="letter"
									value={row.letter}
									maxlength="2"
									aria-label="Row name"
									oninput={(e) => (row.letter = (e.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z]/g, ''))}
								/>
								{@render stepper(row.count, (n) => (row.count = n), 1, 30, `PCs in row ${row.letter}`)}
								{@render stepper(row.indent, (n) => (row.indent = n), 0, 12, `Empty spots before row ${row.letter}`)}
								<label class="toggle" class:disabled={i === 0}>
									<input type="checkbox" bind:checked={row.gap} disabled={i === 0} />
									<span>{row.gap ? 'Yes' : 'No'}</span>
								</label>
								<div class="row-actions">
									<button type="button" onclick={() => move(fl, i, -1)} disabled={i === 0} aria-label="Move row {row.letter} up" title="Move up">↑</button>
									<button type="button" onclick={() => move(fl, i, 1)} disabled={i === plan[fl].length - 1} aria-label="Move row {row.letter} down" title="Move down">↓</button>
									<button type="button" class="danger" onclick={() => removeRow(fl, i)} aria-label="Remove row {row.letter}" title="Remove row">✕</button>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="empty">No rows on this floor yet.</p>
				{/if}
				<button type="button" class="add" onclick={() => addRow(fl)}>+ Add a row</button>
			</section>
		{/each}

		<section class="card">
			<header>
				<h2>Racing sims & consoles</h2>
				<span>Ground floor</span>
			</header>
			<div class="extras">
				<div>
					<span>Racing sims</span>
					{@render stepper(plan.sims, (n) => (plan.sims = n), 0, 12, 'Racing sims')}
				</div>
				<div>
					<span>PS5</span>
					{@render stepper(plan.ps5, (n) => (plan.ps5 = n), 0, 12, 'PS5 consoles')}
				</div>
				<div>
					<span>Xbox</span>
					{@render stepper(plan.xbox, (n) => (plan.xbox = n), 0, 12, 'Xbox consoles')}
				</div>
			</div>
		</section>
	</div>

	<aside class="preview">
		<p class="label">Preview</p>
		{#each FLOORS as fl (fl)}
			{@const floorPcs = pcs.filter((p) => p.floor === fl)}
			{#if floorPcs.length}
				<h3>{FLOOR_META[fl].name}</h3>
				<SeatMap pcs={floorPcs} floor={fl} minCols={gridCols} />
			{/if}
		{/each}
	</aside>
</div>

<div class="savebar" class:dirty>
	<span class="sum">
		<b>{totals.pcs}</b> PCs · <b>{totals.sims}</b> sims · <b>{totals.consoles}</b> consoles
		{#if problem}<em class="bad">{problem}</em>{:else if message}<em class:bad={!message.ok}>{message.text}</em>{:else if dirty}<em>Unsaved changes</em>{/if}
	</span>
	<span class="grow"></span>
	<button type="button" class="btn ghost" onclick={discard} disabled={!dirty || saving}>Discard</button>
	<button type="button" class="btn primary" onclick={save} disabled={!dirty || !!problem || saving}>
		{saving ? 'Saving…' : 'Save floor plan'}
	</button>
</div>

<style>
	.editor {
		display: grid;
		grid-template-columns: minmax(0, 560px) minmax(0, 1fr);
		gap: 1.75rem;
		align-items: start;
		margin-top: 1rem;
		padding-bottom: 5rem;
	}
	.controls {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.card {
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--bg-2);
		padding: 1rem 1.1rem 1.1rem;
	}
	.card header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}
	h2 {
		margin: 0;
		font-family: 'Inter', system-ui, sans-serif;
		text-transform: none;
		letter-spacing: 0;
		font-size: 1.05rem;
	}
	.card header span {
		color: var(--muted);
		font-size: 0.9rem;
	}

	.table {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.tr {
		display: grid;
		grid-template-columns: 3.2rem 7.2rem 7.2rem 1fr auto;
		align-items: center;
		gap: 0.6rem;
	}
	.th {
		font-size: 0.78rem;
		color: var(--muted);
	}
	.letter {
		width: 100%;
		text-align: center;
		font-weight: 700;
		font-size: 1rem;
		padding: 0.45rem 0;
		background: var(--bg);
		border: 1px solid var(--line-2);
		border-radius: 6px;
	}
	.letter:focus,
	.stepper input:focus {
		outline: 2px solid var(--text);
		border-color: transparent;
	}

	.stepper {
		display: grid;
		grid-template-columns: 2rem 1fr 2rem;
		border: 1px solid var(--line-2);
		border-radius: 6px;
		overflow: hidden;
		background: var(--bg);
	}
	.stepper button {
		border: 0;
		background: transparent;
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		color: var(--text);
	}
	.stepper button:hover:not(:disabled) {
		background: var(--panel-2);
	}
	.stepper button:disabled {
		color: var(--faded);
		opacity: 0.4;
		cursor: default;
	}
	.stepper input {
		width: 100%;
		min-width: 0;
		border: 0;
		border-left: 1px solid var(--line);
		border-right: 1px solid var(--line);
		background: transparent;
		text-align: center;
		font-weight: 600;
		padding: 0.4rem 0;
		-moz-appearance: textfield;
		appearance: textfield;
	}
	.stepper input::-webkit-inner-spin-button,
	.stepper input::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.9rem;
		color: var(--muted);
		cursor: pointer;
	}
	.toggle input {
		width: 1rem;
		height: 1rem;
		accent-color: var(--text);
	}
	.toggle.disabled {
		visibility: hidden;
	}

	.row-actions {
		display: flex;
		gap: 0.2rem;
	}
	.row-actions button {
		width: 2rem;
		height: 2rem;
		border: 1px solid transparent;
		border-radius: 6px;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	.row-actions button:hover:not(:disabled) {
		border-color: var(--line-2);
		color: var(--text);
	}
	.row-actions button:disabled {
		opacity: 0.25;
		cursor: default;
	}
	.row-actions .danger:hover:not(:disabled) {
		color: #ff8a9b;
		border-color: rgba(255, 138, 155, 0.4);
	}

	.add {
		margin-top: 0.75rem;
		width: 100%;
		padding: 0.6rem;
		border: 1px dashed var(--line-2);
		border-radius: 8px;
		background: transparent;
		color: var(--muted);
		font-weight: 600;
		cursor: pointer;
	}
	.add:hover {
		color: var(--text);
		border-color: var(--text);
	}
	.empty {
		margin: 0;
		color: var(--muted);
	}

	.extras {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.9rem;
	}
	.extras > div {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.9rem;
		color: var(--muted);
	}

	.preview {
		position: sticky;
		top: 1rem;
	}
	.preview .label {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.preview h3 {
		margin: 0.9rem 0 0.4rem;
		font-family: 'Inter', system-ui, sans-serif;
		text-transform: none;
		letter-spacing: 0;
		font-size: 0.95rem;
		font-weight: 600;
	}

	.savebar {
		position: fixed;
		left: var(--sidebar-w, 0px);
		right: 0;
		bottom: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.8rem clamp(16px, 2.5vw, 36px);
		background: rgba(11, 13, 17, 0.96);
		border-top: 1px solid var(--line);
		backdrop-filter: blur(8px);
	}
	.sum {
		color: var(--muted);
		font-size: 0.95rem;
	}
	.sum b {
		color: var(--text);
	}
	.sum em {
		margin-left: 0.9rem;
		font-style: normal;
		color: var(--text);
	}
	.sum em.bad {
		color: #ff8a9b;
	}
	.grow {
		flex: 1;
	}
	.btn.ghost {
		background: transparent;
		border: 1px solid var(--line-2);
	}

	@media (max-width: 1100px) {
		.editor {
			grid-template-columns: 1fr;
		}
		.preview {
			position: static;
			order: -1;
		}
	}
	@media (max-width: 560px) {
		.tr {
			grid-template-columns: 2.6rem 1fr 1fr;
		}
		.th span:nth-child(4),
		.th span:nth-child(5) {
			display: none;
		}
		.toggle,
		.row-actions {
			grid-column: span 1;
		}
		.extras {
			grid-template-columns: 1fr;
		}
		.sum em {
			display: block;
			margin: 0.2rem 0 0;
		}
	}
</style>
