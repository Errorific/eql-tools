<script lang="ts">
	import {
		MOTE_GRADES,
		VOID_TOUCHED,
		MAX_TIER,
		TIER_LABELS,
		expForTier,
		expToNextTier,
		formatLevel
	} from '$lib/upgrade/mechanics';
	import {
		solve,
		extraMotesNeeded,
		savingsFromExtraCopies,
		type CopySaving,
		type ExtraMoteNeed,
		type PlannerInput,
		type SolveOutcome
	} from '$lib/upgrade/planner';

	interface CopyInput {
		level: number;
		exp: number;
	}

	interface WeightState {
		values: number[];
		voidValue: number;
	}

	const STORAGE_KEY = 'eql-tools.gear-upgrade.v1';

	const LEVELS = Array.from({ length: MAX_TIER + 1 }, (_, i) => i);

	function defaultWeights(): WeightState {
		return {
			values: MOTE_GRADES.map((g) => g.defaultWeight),
			voidValue: VOID_TOUCHED.defaultWeight
		};
	}

	let copies = $state<CopyInput[]>([{ level: 0, exp: 0 }]);
	let motes = $state<number[]>(new Array(MOTE_GRADES.length).fill(0));
	let voidTouched = $state(3);
	let targetTier = $state(7);
	let dropTier = $state(4);
	let weights = $state<WeightState>(defaultWeights());

	let outcome = $state<SolveOutcome | null>(null);
	let savings = $state<CopySaving[]>([]);
	let extraMote = $state<ExtraMoteNeed | null>(null);
	let extraMoteBlocked = $state(false);
	let busy = $state(false);
	let loaded = $state(false);

	function maxExpInLevel(level: number): number {
		return level >= MAX_TIER ? 0 : expToNextTier(level) - 1;
	}

	function totalExp(copy: CopyInput): number {
		return expForTier(copy.level) + copy.exp;
	}

	function copyLabel(index: number): string {
		return String.fromCharCode(65 + index);
	}

	function gradeName(grade: number): string {
		return MOTE_GRADES[grade].short;
	}

	function targetDescription(tier: number): string {
		const label = TIER_LABELS[tier];
		return label ? `+${tier} (${label})` : `+${tier}`;
	}

	function clampCopies(): void {
		for (const copy of copies) {
			const max = maxExpInLevel(copy.level);
			if (copy.exp < 0) copy.exp = 0;
			if (copy.exp > max) copy.exp = max;
		}
	}

	function buildInput(): PlannerInput {
		clampCopies();
		return {
			copies: copies.map(totalExp),
			motes: [...motes],
			voidTouched,
			targetTier,
			weights: [...weights.values],
			voidWeight: weights.voidValue
		};
	}

	function formatMotes(uses: { grade: number; count: number }[]): string {
		if (uses.length === 0) return 'none';
		return uses
			.map((use) => `${use.count}x ${gradeName(use.grade)}`)
			.join(', ');
	}

	$effect(() => {
		// Read the reactive inputs so this effect reruns on any change, then debounce
		// before running the solver so typing does not block on every keystroke.
		void JSON.stringify({ copies, motes, voidTouched, targetTier, dropTier, weights });
		if (!loaded) return;
		busy = true;
		const timer = setTimeout(() => {
			const input = buildInput();
			const result = solve(input);
			let needs: ExtraMoteNeed | null = null;
			let blocked = false;
			if (!result.feasible) {
				needs = extraMotesNeeded(input, 4, 200);
				blocked = needs === null;
			}
			outcome = result;
			extraMote = needs;
			extraMoteBlocked = blocked;
			savings = savingsFromExtraCopies(input, dropTier, 2);
			busy = false;
		}, 200);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (!loaded) return;
		const payload = JSON.stringify({ copies, motes, voidTouched, targetTier, dropTier, weights });
		localStorage.setItem(STORAGE_KEY, payload);
	});

	$effect(() => {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			try {
				const saved = JSON.parse(raw);
				if (Array.isArray(saved.copies) && saved.copies.length) copies = saved.copies;
				if (Array.isArray(saved.motes) && saved.motes.length === MOTE_GRADES.length) {
					motes = saved.motes;
				}
				if (typeof saved.voidTouched === 'number') voidTouched = saved.voidTouched;
				if (typeof saved.targetTier === 'number') targetTier = saved.targetTier;
				if (typeof saved.dropTier === 'number') dropTier = saved.dropTier;
				if (saved.weights?.values?.length === MOTE_GRADES.length) weights = saved.weights;
			} catch {
				// Ignore malformed saved state and fall back to defaults.
			}
		}
		loaded = true;
	});
</script>

<svelte:head>
	<title>Gear Upgrade Planner - EverQuest Legends Tools</title>
</svelte:head>

<h1>Gear Upgrade Planner</h1>
<p class="lede">
	Work out the cheapest way to take a piece of gear to a target tier. Enter the copies you have
	and the motes in your bags; the planner suggests which copies to level, which motes to spend,
	and where a Void-Touched Potential is worth using.
</p>

<section class="panel">
	<h2>Copies</h2>
	<p class="hint">
		One row per copy of the item you own. Give each its current tier and progress within that
		tier.
	</p>
	<div class="copies">
		{#each copies as copy, i (i)}
			<div class="copy-row">
				<span class="copy-name">Copy {copyLabel(i)}</span>
				<label>
					Tier
					<select name={`copy-${i}-tier`} bind:value={copy.level}>
						{#each LEVELS as level}
							<option value={level}>+{level}</option>
						{/each}
					</select>
				</label>
				<label>
					Exp
					<input
						type="number"
						name={`copy-${i}-exp`}
						min="0"
						max={maxExpInLevel(copy.level)}
						bind:value={copy.exp}
						disabled={copy.level >= MAX_TIER}
					/>
				</label>
				<span class="copy-total">{formatLevel(totalExp(copy))}</span>
				<button
					class="ghost"
					onclick={() => copies.splice(i, 1)}
					disabled={copies.length <= 1}
				>
					Remove
				</button>
			</div>
		{/each}
	</div>
	<button onclick={() => copies.push({ level: 0, exp: 0 })}>Add copy</button>
</section>

<section class="panel">
	<h2>Motes</h2>
	<p class="hint">Counts of each mote of potential you hold. Void-Touched is tracked separately.</p>
	<div class="motes">
		{#each MOTE_GRADES as grade, i (grade.key)}
			<label class="mote">
				<span>{grade.short}</span>
				<input type="number" name={`mote-${grade.key}`} min="0" bind:value={motes[i]} />
				<span class="mote-exp">{grade.exp} exp, up to +{grade.maxTier}</span>
			</label>
		{/each}
		<label class="mote void">
			<span>{VOID_TOUCHED.short}</span>
			<input type="number" name="void-touched" min="0" bind:value={voidTouched} />
			<span class="mote-exp">+1 whole tier</span>
		</label>
	</div>
</section>

<section class="panel">
	<h2>Goal</h2>
	<div class="goal">
		<label>
			Target tier
			<select name="target-tier" bind:value={targetTier}>
				{#each LEVELS as level}
					<option value={level}>{targetDescription(level)}</option>
				{/each}
			</select>
		</label>
		<label>
			Extra copies arrive at
			<select name="drop-tier" bind:value={dropTier}>
				{#each LEVELS as level}
					<option value={level}>+{level}</option>
				{/each}
			</select>
		</label>
	</div>
</section>

<details class="panel">
	<summary>Mote scarcity weights</summary>
	<p class="hint">
		Higher means rarer, so the planner avoids it. Used to rank plans, not shown in the steps.
	</p>
	<div class="motes">
		{#each MOTE_GRADES as grade, i (grade.key)}
			<label class="mote">
				<span>{grade.short}</span>
				<input type="number" name={`weight-${grade.key}`} min="1" bind:value={weights.values[i]} />
			</label>
		{/each}
		<label class="mote void">
			<span>{VOID_TOUCHED.short}</span>
			<input type="number" name="weight-void-touched" min="1" bind:value={weights.voidValue} />
		</label>
	</div>
</details>

<hr />

{#if busy}
	<p class="status">Calculating&hellip;</p>
{:else if outcome}
	{#if outcome.feasible && outcome.plan}
		{@const plan = outcome.plan}
		<section class="panel result">
			<h2>{targetDescription(plan.targetTier)}: reachable</h2>
			<p class="summary">
				Spend <strong>{formatMotes(plan.moteUses)}</strong>
				{#if plan.voidCount > 0}
					and <strong>{plan.voidCount}x {VOID_TOUCHED.short}</strong>
				{/if}
				to finish at <strong>{formatLevel(plan.exp)}</strong>.
			</p>

			<h3>Copies</h3>
			<table>
				<thead>
					<tr><th>Copy</th><th>Starts</th><th>Motes</th><th>Before merging</th></tr>
				</thead>
				<tbody>
					{#each plan.builds as build (build.copy)}
						<tr>
							<td>{build.copy}</td>
							<td>{formatLevel(build.startExp)}</td>
							<td>{formatMotes(build.motes)}</td>
							<td>{formatLevel(build.endExp)}</td>
						</tr>
					{/each}
				</tbody>
			</table>

			<h3>Steps</h3>
			<ol class="steps">
				{#each plan.builds as build (build.copy)}
					{#if build.motes.length > 0}
						<li>
							Level copy {build.copy} from {formatLevel(build.startExp)} to
							{formatLevel(build.endExp)} with {formatMotes(build.motes)}.
						</li>
					{/if}
				{/each}
				{#if plan.merges.length > 0}
					<li>Merge {plan.merges.join(', ')} into copy {plan.base}.</li>
				{/if}
				{#if plan.voidCount > 0}
					<li>
						Use {plan.voidCount}x {VOID_TOUCHED.short} on copy {plan.base} to finish at
						{formatLevel(plan.exp)}.
					</li>
				{:else}
					<li>Copy {plan.base} is the finished item at {formatLevel(plan.exp)}.</li>
				{/if}
			</ol>

			{#if plan.wastedExp > 0}
				<p class="hint">
					{plan.wastedExp} experience is discarded by this plan, from partial levels on merged
					copies or from overshooting the target.
				</p>
			{/if}
		</section>

		{#if savings.length > 0}
			<section class="panel">
				<h2>What another copy is worth</h2>
				<p class="hint">
					With the same motes, copies arriving at +{dropTier} change the picture like this.
				</p>
				<table>
					<thead>
						<tr><th>Extra copies</th><th>Effect</th><th>Voids saved</th></tr>
					</thead>
					<tbody>
						{#each savings as saving (saving.count)}
							<tr>
								<td>{saving.count}</td>
								<td>
									{#if saving.reachesTarget}
										{#if !outcome.feasible}
											makes the target reachable
										{:else if saving.motesSaved.length > 0}
											saves {formatMotes(saving.motesSaved)}
										{:else}
											no mote change
										{/if}
									{:else}
										still not enough
									{/if}
								</td>
								<td>{saving.voidSaved > 0 ? saving.voidSaved : '-'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/if}
	{:else}
		<section class="panel result short">
			<h2>{targetDescription(targetTier)}: not yet reachable</h2>
			<p class="summary">
				With the copies and motes entered, the highest you can reach is
				<strong>{formatLevel(outcome.maxExp)}</strong>. That leaves
				<strong>{outcome.targetExp - outcome.maxExp}</strong> experience to find.
			</p>
			{#if extraMote}
				<p class="summary">
					Farming <strong>{extraMote.count} more {gradeName(extraMote.grade)} motes</strong> would
					close the gap on its own.
				</p>
			{:else if extraMoteBlocked}
				<p class="summary">
					More Major motes will not close the gap; the item has outgrown them. You need Greater
					or better, or more copies.
				</p>
			{/if}
		</section>
		{#if savings.length > 0}
			<section class="panel">
				<h2>What another copy is worth</h2>
				<p class="hint">
					With the same motes, copies arriving at +{dropTier} change the picture like this.
				</p>
				<table>
					<thead>
						<tr><th>Extra copies</th><th>Effect</th></tr>
					</thead>
					<tbody>
						{#each savings as saving (saving.count)}
							<tr>
								<td>{saving.count}</td>
								<td>{saving.reachesTarget ? 'makes the target reachable' : 'still not enough'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/if}
	{/if}
{/if}

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

	.panel h3 {
		margin-bottom: 0.25rem;
		font-size: 0.95rem;
	}

	.copies {
		display: grid;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.copy-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.copy-name {
		min-width: 5rem;
		font-weight: 600;
	}

	.copy-total {
		color: var(--muted);
		min-width: 8rem;
	}

	label {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.9rem;
	}

	input[type='number'] {
		width: 4.5rem;
		padding: 0.2rem 0.35rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		font: inherit;
	}

	select {
		padding: 0.2rem 0.35rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		font: inherit;
	}

	button {
		padding: 0.3rem 0.7rem;
		border: 1px solid var(--accent);
		background: var(--accent);
		color: #ffffff;
		border-radius: 4px;
		font: inherit;
		cursor: pointer;
	}

	button.ghost {
		background: transparent;
		color: var(--accent);
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.motes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.5rem;
	}

	.mote {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-rows: auto auto;
		align-items: center;
		gap: 0.15rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.4rem 0.5rem;
	}

	.mote-exp {
		grid-column: 1 / -1;
		color: var(--muted);
		font-size: 0.75rem;
	}

	.mote.void {
		border-color: var(--accent);
	}

	.goal {
		display: flex;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		margin-bottom: 0.75rem;
	}

	th,
	td {
		text-align: left;
		padding: 0.25rem 0.5rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.9rem;
	}

	.steps {
		margin: 0.25rem 0 0.75rem;
		padding-left: 1.25rem;
	}

	.steps li {
		margin-bottom: 0.25rem;
	}

	.summary {
		font-size: 1rem;
	}

	.status {
		color: var(--muted);
	}

	.result.short h2 {
		color: #9d4b4b;
	}
</style>
