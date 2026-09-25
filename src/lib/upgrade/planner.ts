import {
	MOTE_GRADES,
	VOID_TOUCHED,
	MAX_TIER,
	expForTier,
	tierForExp,
	mergedTotal,
	mergeValue
} from './mechanics';

const BALANCE = 0;
const CROSS = 1;
type Dist = typeof BALANCE | typeof CROSS;

export interface PlannerInput {
	/** Cumulative experience of each copy of the item, indexed from 0. */
	copies: number[];
	/** Mote counts, index aligned with {@link MOTE_GRADES}. */
	motes: number[];
	/** Void-Touched Potential available. */
	voidTouched: number;
	/** Target tier, 0 through 10. */
	targetTier: number;
	/** Cost weight per mote grade. Defaults to the grade's scarcity weight. */
	weights?: number[];
	/** Cost weight of a Void-Touched Potential. */
	voidWeight?: number;
}

export interface MoteUse {
	grade: number;
	count: number;
}

export interface BuildStep {
	copy: string;
	startExp: number;
	endExp: number;
	motes: MoteUse[];
}

export interface Plan {
	targetTier: number;
	achievedTier: number;
	exp: number;
	cost: number;
	moteUses: MoteUse[];
	voidCount: number;
	builds: BuildStep[];
	base: string;
	merges: string[];
	/** Experience that will be thrown away: fuel progress and overshoot past the target. */
	wastedExp: number;
}

export interface SolveOutcome {
	feasible: boolean;
	plan: Plan | null;
	/** Highest total experience reachable with the current resources. */
	maxExp: number;
	maxTier: number;
	targetExp: number;
}

interface TransitionMote {
	type: 'mote';
	grade: number;
	applied: number;
	dist: Dist;
}

interface Node {
	c: number[];
	cost: number;
	parent: Node | null;
	trans: TransitionMote | null;
}

const COPY_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function keyOf(c: number[]): string {
	return c.join(',');
}

/** Apply a single mote to whichever container the distribution rule prefers. */
function applyOneMote(c: number[], gradeIndex: number, dist: Dist): number[] | null {
	const grade = MOTE_GRADES[gradeIndex];
	let pick = -1;
	if (dist === BALANCE) {
		for (let i = 0; i < c.length; i++) {
			if (tierForExp(c[i]) <= grade.maxTier) {
				pick = i;
				break;
			}
		}
	} else {
		let bestScore = Infinity;
		for (let i = 0; i < c.length; i++) {
			if (tierForExp(c[i]) > grade.maxTier) continue;
			const tier = tierForExp(c[i]);
			const needed = expForTier(tier + 1) - c[i];
			const score = Math.abs(needed - grade.exp);
			if (score < bestScore) {
				bestScore = score;
				pick = i;
			}
		}
	}
	if (pick < 0) return null;
	const next = c.slice();
	next[pick] += grade.exp;
	next.sort((a, b) => a - b);
	return next;
}

function addNode(map: Map<string, Node>, node: Node): void {
	const key = keyOf(node.c);
	const prev = map.get(key);
	if (!prev || node.cost < prev.cost) map.set(key, node);
}

/** True when every container of `a` has at least as much progress as `b`. */
function dominatesExps(a: number[], b: number[]): boolean {
	for (let i = 0; i < a.length; i++) if (a[i] < b[i]) return false;
	return true;
}

/**
 * Drop states that can never beat another state. Legality depends only on a
 * container's tier, so within one tier set more progress at no extra cost is
 * always at least as good.
 */
function prune(map: Map<string, Node>, cap: number): Map<string, Node> {
	const groups = new Map<string, Node[]>();
	for (const node of map.values()) {
		const tierKey = node.c.map(tierForExp).join(',');
		const group = groups.get(tierKey);
		if (group) group.push(node);
		else groups.set(tierKey, [node]);
	}
	const result = new Map<string, Node>();
	for (const group of groups.values()) {
		if (group.length === 1) {
			result.set(keyOf(group[0].c), group[0]);
			continue;
		}
		group.sort((a, b) => a.cost - b.cost);
		const kept: Node[] = [];
		for (const node of group) {
			let dominated = false;
			for (const other of kept) {
				if (other.cost <= node.cost && dominatesExps(other.c, node.c)) {
					dominated = true;
					break;
				}
			}
			if (!dominated) kept.push(node);
		}
		for (const node of kept) result.set(keyOf(node.c), node);
	}
	if (result.size <= cap) return result;
	const entries = [...result.values()];
	entries.sort((a, b) => {
		const ta = mergedTotal(a.c);
		const tb = mergedTotal(b.c);
		if (ta !== tb) return tb - ta;
		return a.cost - b.cost;
	});
	const limited = new Map<string, Node>();
	for (let i = 0; i < cap; i++) limited.set(keyOf(entries[i].c), entries[i]);
	return limited;
}

/**
 * Search mote plans in ascending grade order. Within each grade the motes are
 * either balanced across the copies or aimed at the copy closest to its next
 * threshold, which covers both the spread and the concentrate strategies.
 */
function searchMotes(
	starts: number[],
	counts: number[],
	weights: number[],
	cap: number
): Map<string, Node> {
	const root: Node = { c: starts.slice().sort((a, b) => a - b), cost: 0, parent: null, trans: null };
	let layer = new Map<string, Node>();
	layer.set(keyOf(root.c), root);
	for (let g = 0; g < MOTE_GRADES.length; g++) {
		const next = new Map<string, Node>();
		for (const node of layer.values()) {
			addNode(next, node);
			for (const dist of [BALANCE, CROSS] as Dist[]) {
				let current = node.c;
				for (let k = 1; k <= counts[g]; k++) {
					const applied = applyOneMote(current, g, dist);
					if (!applied) break;
					current = applied;
					addNode(next, {
						c: applied,
						cost: node.cost + k * weights[g],
						parent: node,
						trans: { type: 'mote', grade: g, applied: k, dist }
					});
				}
			}
		}
		layer = prune(next, cap);
		if (layer.size === 0) break;
	}
	return layer;
}

function collectTransitions(node: Node): TransitionMote[] {
	const list: TransitionMote[] = [];
	let current: Node | null = node;
	while (current && current.parent) {
		if (current.trans) list.push(current.trans);
		current = current.parent;
	}
	return list.reverse();
}

interface ReplayContainer {
	label: string;
	exp: number;
}

function pickMoteContainer(
	containers: ReplayContainer[],
	gradeIndex: number,
	dist: Dist
): number {
	const grade = MOTE_GRADES[gradeIndex];
	let pick = -1;
	if (dist === BALANCE) {
		let lowest = Infinity;
		for (let i = 0; i < containers.length; i++) {
			if (containers[i].exp < lowest && tierForExp(containers[i].exp) <= grade.maxTier) {
				lowest = containers[i].exp;
				pick = i;
			}
		}
	} else {
		let bestScore = Infinity;
		for (let i = 0; i < containers.length; i++) {
			if (tierForExp(containers[i].exp) > grade.maxTier) continue;
			const tier = tierForExp(containers[i].exp);
			const needed = expForTier(tier + 1) - containers[i].exp;
			const score = Math.abs(needed - grade.exp);
			if (score < bestScore) {
				bestScore = score;
				pick = i;
			}
		}
	}
	return pick;
}

interface ReplayResult {
	containers: ReplayContainer[];
	moteEvents: { label: string; grade: number }[];
}

/** Rebuild the labelled copy states from the transition chain. */
function replayMotes(starts: number[], transitions: TransitionMote[]): ReplayResult {
	const sorted = starts.slice().sort((a, b) => a - b);
	const containers: ReplayContainer[] = sorted.map((exp, i) => ({
		label: COPY_LABELS[i] ?? `Copy ${i + 1}`,
		exp
	}));
	const moteEvents: { label: string; grade: number }[] = [];
	for (const transition of transitions) {
		for (let k = 0; k < transition.applied; k++) {
			const pick = pickMoteContainer(containers, transition.grade, transition.dist);
			if (pick < 0) break;
			containers[pick].exp += MOTE_GRADES[transition.grade].exp;
			moteEvents.push({ label: containers[pick].label, grade: transition.grade });
		}
	}
	return { containers, moteEvents };
}

/** Copy that should be kept as the base, so the most in-level progress survives. */
function baseIndex(containers: ReplayContainer[]): number {
	let pick = 0;
	let bestBonus = -Infinity;
	for (let i = 0; i < containers.length; i++) {
		const bonus = containers[i].exp - mergeValue(tierForExp(containers[i].exp));
		if (bonus > bestBonus) {
			bestBonus = bonus;
			pick = i;
		}
	}
	return pick;
}

function buildPlan(
	input: PlannerInput,
	node: Node,
	voidCount: number,
	achievedExp: number,
	cost: number,
	preMerged: number[] = []
): Plan {
	const transitions = collectTransitions(node);
	const { containers, moteEvents } = replayMotes(input.copies, transitions);
	const base = baseIndex(containers);
	const baseLabel = containers[base].label;

	const perCopyMotes = new Map<string, Map<number, number>>();
	for (const event of moteEvents) {
		let byGrade = perCopyMotes.get(event.label);
		if (!byGrade) {
			byGrade = new Map();
			perCopyMotes.set(event.label, byGrade);
		}
		byGrade.set(event.grade, (byGrade.get(event.grade) ?? 0) + 1);
	}
	const startByName = new Map<string, number>();
	const sortedStarts = input.copies.slice().sort((a, b) => a - b);
	sortedStarts.forEach((exp, i) => startByName.set(COPY_LABELS[i] ?? `Copy ${i + 1}`, exp));

	const builds: BuildStep[] = containers.map((c) => ({
		copy: c.label,
		startExp: startByName.get(c.label) ?? c.exp,
		endExp: c.exp,
		motes: [...(perCopyMotes.get(c.label)?.entries() ?? [])]
			.map(([grade, count]) => ({ grade, count }))
			.sort((a, b) => a.grade - b.grade)
	}));

	const baseOffset = containers.length;
	preMerged.forEach((exp, i) => {
		builds.push({
			copy: COPY_LABELS[baseOffset + i] ?? `Copy ${baseOffset + i + 1}`,
			startExp: exp,
			endExp: exp,
			motes: []
		});
	});

	const totals = new Map<number, number>();
	for (const event of moteEvents) totals.set(event.grade, (totals.get(event.grade) ?? 0) + 1);
	const moteUses: MoteUse[] = [...totals.entries()]
		.map(([grade, count]) => ({ grade, count }))
		.sort((a, b) => a.grade - b.grade);

	const fuelPartials = containers.reduce((sum, c, i) => {
		if (i === base) return sum;
		return sum + (c.exp - expForTier(tierForExp(c.exp)));
	}, 0);
	const preMergedPartials = preMerged.reduce(
		(sum, exp) => sum + (exp - expForTier(tierForExp(exp))),
		0
	);
	const overshoot = Math.max(0, achievedExp - expForTier(input.targetTier));

	return {
		targetTier: input.targetTier,
		achievedTier: tierForExp(achievedExp),
		exp: achievedExp,
		cost,
		moteUses,
		voidCount,
		builds,
		base: baseLabel,
		merges: [
			...containers.filter((_, i) => i !== base).map((c) => c.label),
			...preMerged.map((_, i) => COPY_LABELS[baseOffset + i] ?? `Copy ${baseOffset + i + 1}`)
		],
		wastedExp: fuelPartials + preMergedPartials + overshoot
	};
}

const SEARCH_CAP = 150000;
const ANALYSIS_CAP = 60000;

/**
 * Copies beyond this many are merged immediately instead of being tracked as
 * separate mote sinks. Keeps the search bounded for large farms; the extra
 * copies still contribute their full merge value.
 */
const ACTIVE_COPIES = 4;

interface SplitCopies {
	active: number[];
	preMerged: number[];
	bonus: number;
}

function splitCopies(copies: number[]): SplitCopies {
	if (copies.length <= ACTIVE_COPIES) return { active: copies, preMerged: [], bonus: 0 };
	const keep = new Set<number>();
	let bestPartialIndex = 0;
	let bestPartial = -1;
	for (let i = 0; i < copies.length; i++) {
		const partial = copies[i] - expForTier(tierForExp(copies[i]));
		if (partial > bestPartial) {
			bestPartial = partial;
			bestPartialIndex = i;
		}
	}
	keep.add(bestPartialIndex);
	const byExp = copies.map((exp, i) => ({ exp, i })).sort((a, b) => a.exp - b.exp);
	for (const { i } of byExp) {
		if (keep.size >= ACTIVE_COPIES) break;
		keep.add(i);
	}
	const active: number[] = [];
	const preMerged: number[] = [];
	copies.forEach((exp, i) => (keep.has(i) ? active : preMerged).push(exp));
	const bonus = preMerged.reduce((sum, exp) => sum + mergeValue(tierForExp(exp)), 0);
	return { active, preMerged, bonus };
}

export function solve(input: PlannerInput, cap = SEARCH_CAP): SolveOutcome {
	const weights = input.weights ?? MOTE_GRADES.map((g) => g.defaultWeight);
	const voidWeight = input.voidWeight ?? VOID_TOUCHED.defaultWeight;
	const targetExp = expForTier(input.targetTier);
	const { active, preMerged, bonus } = splitCopies(input.copies);
	const layer = searchMotes(active, input.motes, weights, cap);

	let best: { node: Node; voidCount: number; cost: number; exp: number } | null = null;
	let maxMoteExp = 0;
	for (const node of layer.values()) {
		const total = mergedTotal(node.c);
		if (total > maxMoteExp) maxMoteExp = total;
		const maxVoids = Math.min(input.voidTouched, MAX_TIER);
		for (let v = 0; v <= maxVoids; v++) {
			const needed = expForTier(Math.max(0, input.targetTier - v)) - bonus;
			if (total < needed) continue;
			const cost = node.cost + v * voidWeight;
			if (!best || cost < best.cost) {
				best = { node, voidCount: v, cost, exp: total + bonus };
			}
		}
	}

	const maxTier = Math.min(MAX_TIER, tierForExp(maxMoteExp + bonus) + Math.min(input.voidTouched, MAX_TIER));
	const reachableExp = expForTier(maxTier);

	if (!best) {
		return { feasible: false, plan: null, maxExp: reachableExp, maxTier, targetExp };
	}

	const moteTier = tierForExp(best.exp);
	const finalTier = Math.min(MAX_TIER, moteTier + best.voidCount);
	const achievedExp = best.voidCount > 0 ? expForTier(finalTier) : best.exp;
	return {
		feasible: true,
		plan: buildPlan({ ...input, copies: active }, best.node, best.voidCount, achievedExp, best.cost, preMerged),
		maxExp: Math.max(reachableExp, achievedExp),
		maxTier: Math.max(maxTier, tierForExp(achievedExp)),
		targetExp
	};
}

export interface ExtraMoteNeed {
	grade: number;
	count: number;
}

/**
 * Smallest number of extra motes of the given grade that would let the item
 * reach the target. Returns null when even a large surplus does not help.
 */
export function extraMotesNeeded(
	input: PlannerInput,
	grade: number,
	maxTry = 400
): ExtraMoteNeed | null {
	const base = solve(input, ANALYSIS_CAP);
	if (base.feasible) return { grade, count: 0 };
	let low = 1;
	let high = maxTry;
	let found: number | null = null;
	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const motes = input.motes.slice();
		motes[grade] += mid;
		const outcome = solve({ ...input, motes }, ANALYSIS_CAP);
		if (outcome.feasible) {
			found = mid;
			high = mid - 1;
		} else {
			low = mid + 1;
		}
	}
	return found === null ? null : { grade, count: found };
}

export interface CopySaving {
	tier: number;
	count: number;
	cost: number;
	costSaved: number;
	motesSaved: MoteUse[];
	voidSaved: number;
	reachesTarget: boolean;
}

/** Cost of the current plan versus the same plan with extra copies at a given tier. */
export function savingsFromExtraCopies(
	input: PlannerInput,
	dropTier: number,
	upTo = 3
): CopySaving[] {
	const base = solve(input, ANALYSIS_CAP);
	const results: CopySaving[] = [];
	for (let count = 1; count <= upTo; count++) {
		const copies = [...input.copies];
		for (let i = 0; i < count; i++) copies.push(expForTier(dropTier));
		const outcome = solve({ ...input, copies }, ANALYSIS_CAP);
		if (!outcome.feasible || !outcome.plan) {
			results.push({
				tier: dropTier,
				count,
				cost: Infinity,
				costSaved: 0,
				motesSaved: [],
				voidSaved: 0,
				reachesTarget: false
			});
			continue;
		}
		const currentUses = new Map((base.plan?.moteUses ?? []).map((u) => [u.grade, u.count]));
		const nextUses = new Map(outcome.plan.moteUses.map((u) => [u.grade, u.count]));
		const motesSaved: MoteUse[] = [];
		for (const grade of new Set([...currentUses.keys(), ...nextUses.keys()])) {
			const saved = (currentUses.get(grade) ?? 0) - (nextUses.get(grade) ?? 0);
			if (saved > 0) motesSaved.push({ grade, count: saved });
		}
		results.push({
			tier: dropTier,
			count,
			cost: outcome.plan.cost,
			costSaved: (base.plan?.cost ?? Infinity) - outcome.plan.cost,
			motesSaved: motesSaved.sort((a, b) => a.grade - b.grade),
			voidSaved: (base.plan?.voidCount ?? 0) - outcome.plan.voidCount,
			reachesTarget: true
		});
	}
	return results;
}

export { MOTE_GRADES, VOID_TOUCHED, MAX_TIER, expForTier, tierForExp };
