<script lang="ts">
	import { MOTE_GRADES, TIER_LABELS, expForTier, formatLevel, mergedTotal } from '$lib/upgrade/mechanics';
	import {
		PYRAMID_GRADE,
		pyramidBuilds,
		pyramidFrontier,
		pyramidPlan
	} from '$lib/upgrade/pyramid';

	const GRADE = PYRAMID_GRADE;
	const GRADE_NAME = MOTE_GRADES[GRADE].short;
	const STORAGE_KEY = 'eql-tools.copy-pyramid.v1';
	const MAX_FRONTIER_COPIES = 160;
	const MAX_TABLE_ROWS = 40;

	const builds = pyramidBuilds(GRADE);
	const tierForMotes = (motes: number) =>
		builds.find((build) => build.motes === motes)?.tier ?? 0;

	let copies = $state(40);
	let motes = $state(40);
	let targetTier = $state(10);
	let voids = $state(3);
	let loaded = $state(false);

	const preTier = $derived(Math.max(0, targetTier - voids));
	const plan = $derived(pyramidPlan(GRADE, copies, motes, preTier));
	const frontier = $derived(
		pyramidFrontier(GRADE, preTier, Math.min(MAX_FRONTIER_COPIES, Math.max(copies + 40, 140)))
	);

	const moteTable = $derived.by(() => {
		const rows: { motes: number; copies: number | null; highlight: boolean }[] = [];
		const floorRow = frontier.find((row) => row.maxExp >= expForTier(preTier));
		const floorMotes = floorRow && floorRow.minMotes !== null ? floorRow.minMotes : MAX_TABLE_ROWS;
		const limit = Math.min(MAX_TABLE_ROWS, Math.max(8, Math.min(motes, floorMotes)));
		const highlight = Math.min(motes, limit);
		for (let m = 0; m <= limit; m++) {
			let minCopies: number | null = null;
			for (const row of frontier) {
				if (row.minMotes !== null && row.minMotes <= m) {
					minCopies = row.copies;
					break;
				}
			}
			rows.push({ motes: m, copies: minCopies, highlight: m === highlight });
		}
		return rows;
	});

	const oneEachExp = $derived(mergedTotal(new Array(Math.floor(copies)).fill(5)));
	const oneEachLevel = $derived(oneEachExp > 0 ? formatLevel(oneEachExp) : '+0');

	const instruction = $derived.by(() => {
		const moted = plan.allocation.filter((entry) => entry.motesPerCopy > 0);
		const spare = plan.allocation.find((entry) => entry.motesPerCopy === 0);
		const parts = moted.map((entry) => {
			const noun = entry.copies === 1 ? 'copy' : 'copies';
			return `mote ${entry.copies} ${noun} to +${tierForMotes(entry.motesPerCopy)}`;
		});
		const head = parts.length > 0 ? parts.join(' and ') : 'use no motes';
		const sentence = head.charAt(0).toUpperCase() + head.slice(1);
		const middle = spare ? `, leave the other ${spare.copies} at +0` : '';
		const total = plan.copies === 1 ? 'copy' : 'copies';
		return `${sentence}${middle}, then merge all ${plan.copies} ${total} together.`;
	});

	function targetDescription(tier: number): string {
		const label = TIER_LABELS[tier];
		return label ? `+${tier} (${label})` : `+${tier}`;
	}

	$effect(() => {
		// Debounced persistence so typing a big copy count does not thrash storage.
		void JSON.stringify({ copies, motes, targetTier, voids });
		if (!loaded) return;
		const timer = setTimeout(() => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ copies, motes, targetTier, voids }));
		}, 200);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			try {
				const saved = JSON.parse(raw);
				if (typeof saved.copies === 'number') copies = saved.copies;
				if (typeof saved.motes === 'number') motes = saved.motes;
				if (typeof saved.targetTier === 'number') targetTier = saved.targetTier;
				if (typeof saved.voids === 'number') voids = saved.voids;
			} catch {
				// Ignore malformed saved state and keep the defaults.
			}
		}
		loaded = true;
	});
</script>

<svelte:head>
	<title>Copy Pyramid - EverQuest Legends Tools</title>
</svelte:head>

<h1>Copy Pyramid</h1>
<p class="lede">
	For quest items you can farm in bulk: treat every copy as fresh at +0, feed them
	{GRADE_NAME} motes, merge them down, then finish the last tiers with Void-Touched
	Potentials. This works out how many copies and how many motes each target really needs.
</p>

<section class="panel">
	<h2>What you have</h2>
	<div class="fields">
		<label>
			Copies (all +0)
			<input type="number" name="copies" min="0" bind:value={copies} />
		</label>
		<label>
			{GRADE_NAME} motes
			<input type="number" name="motes" min="0" bind:value={motes} />
		</label>
		<label>
			Final target tier
			<select name="target-tier" bind:value={targetTier}>
				{#each Array.from({ length: 11 }, (_, i) => i) as tier}
					<option value={tier}>{targetDescription(tier)}</option>
				{/each}
			</select>
		</label>
		<label>
			Void-Touched to finish
			<input type="number" name="voids" min="0" max="10" bind:value={voids} />
		</label>
	</div>
	<p class="hint">
		The pyramid only has to reach +{preTier}; the {voids} Void-Touched take it the rest of
		the way to {targetDescription(targetTier)}.
	</p>
</section>

{#if plan}
	<section class="panel result">
		<h2>
			{#if preTier <= 0}
				Already at the target
			{:else if plan.reached}
				+{preTier}: reachable with {plan.motesUsed} {GRADE_NAME} motes
			{:else}
				+{preTier}: not reachable with these
			{/if}
		</h2>

		{#if preTier <= 0}
			<p class="summary">No copies or motes needed; the Voids cover it on their own.</p>
		{:else if plan.reached}
			<p class="summary">{instruction}</p>
			<p class="summary">
				That reaches <strong>{formatLevel(plan.exp)}</strong> using
				<strong>{plan.motesUsed} {GRADE_NAME}</strong> motes, before the Voids.
			</p>
		{:else}
			<p class="summary">
				{plan.copies} copies and {plan.motesUsed} {GRADE_NAME} motes top out at
				<strong>{formatLevel(plan.exp)}</strong>, short of +{preTier}. Add more copies, more
				motes, or another Void.
			</p>
		{/if}

		{#if copies > 0 && preTier > 0}
			<p class="hint">
				One {GRADE_NAME} on every copy would land around {oneEachLevel}. Focusing the motes on
				fewer copies is usually cheaper: the table below shows the fewest motes for each copy
				count.
			</p>
		{/if}
	</section>
{/if}

<section class="panel">
	<h2>Copies vs {GRADE_NAME} motes for +{preTier}</h2>
	<p class="hint">
		Fewest copies needed for a given number of motes. More copies means fewer motes, because
		every merged copy carries a free point of experience.
	</p>
	<table>
		<thead>
			<tr><th>{GRADE_NAME} motes</th><th>Copies needed</th></tr>
		</thead>
		<tbody>
			{#each moteTable as row (row.motes)}
				<tr class:current={row.highlight}>
					<td>{row.motes}</td>
					<td>
						{#if row.copies === null}
							more than {frontier.length}
						{:else}
							{row.copies}
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</section>

<style>
	.lede {
		max-width: 46rem;
	}

	.hint {
		color: var(--muted);
		font-size: 0.9rem;
	}

	.panel {
		background: #ffffff;
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 1rem 1.25rem;
		margin: 1rem 0;
	}

	.panel h2 {
		margin-top: 0;
		font-size: 1.05rem;
	}

	.fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 0.75rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.9rem;
	}

	input[type='number'],
	select {
		padding: 0.25rem 0.4rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		font: inherit;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th,
	td {
		text-align: left;
		padding: 0.25rem 0.5rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.9rem;
	}

	tr.current {
		background: #eef3fa;
		font-weight: 600;
	}

	.summary {
		font-size: 1rem;
	}
</style>
