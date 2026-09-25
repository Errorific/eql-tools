import { describe, expect, it } from 'vitest';
import { extraMotesNeeded, savingsFromExtraCopies, solve } from './planner';
import { MOTE_GRADES, expForTier, tierForExp } from './mechanics';

const FULL_MOTES = [10, 10, 10, 10, 20, 5, 3, 1, 0, 0];

/** Weights used by the prototypes so solver output can be compared to known optima. */
const REFERENCE_WEIGHTS = [1, 3, 9, 27, 81, 729, 6561, 59049, 531441, 4782969];
const REFERENCE_VOID_WEIGHT = 200000;

function totals(plan: NonNullable<ReturnType<typeof solve>['plan']>): number {
	return plan.moteUses.reduce((sum, use) => sum + use.count, 0);
}

describe('solve', () => {
	it('reaches +7 from four +0 copies with a near-optimal mote plan', () => {
		const outcome = solve({
			copies: [0, 0, 0, 0],
			motes: FULL_MOTES,
			voidTouched: 0,
			targetTier: 7,
			weights: REFERENCE_WEIGHTS,
			voidWeight: REFERENCE_VOID_WEIGHT
		});
		expect(outcome.feasible).toBe(true);
		expect(outcome.plan).not.toBeNull();
		expect(outcome.plan!.achievedTier).toBe(7);
		// Exact optimum under these weights is 1321; the heuristic stays close.
		expect(outcome.plan!.cost).toBeLessThanOrEqual(1400);
		expect(totals(outcome.plan!)).toBeGreaterThan(0);
	});

	it('costs nothing when four +5 copies already make +7', () => {
		const outcome = solve({
			copies: [31, 31, 31, 31],
			motes: FULL_MOTES,
			voidTouched: 0,
			targetTier: 7
		});
		expect(outcome.feasible).toBe(true);
		expect(outcome.plan!.cost).toBe(0);
		expect(outcome.plan!.moteUses).toEqual([]);
		expect(outcome.plan!.voidCount).toBe(0);
	});

	it('matches the known optimum for two +4 copies targeting +7', () => {
		const outcome = solve({
			copies: [15, 15],
			motes: [0, 0, 0, 0, 20, 5, 3, 1, 0, 0],
			voidTouched: 0,
			targetTier: 7,
			weights: REFERENCE_WEIGHTS,
			voidWeight: REFERENCE_VOID_WEIGHT
		});
		expect(outcome.feasible).toBe(true);
		// The exhaustive search found 83025 under these weights.
		expect(outcome.plan!.cost).toBeLessThanOrEqual(83025);
	});

	it('recognises an item that is already at the target', () => {
		const outcome = solve({
			copies: [expForTier(10)],
			motes: FULL_MOTES,
			voidTouched: 0,
			targetTier: 10
		});
		expect(outcome.feasible).toBe(true);
		expect(outcome.plan!.cost).toBe(0);
		expect(outcome.plan!.voidCount).toBe(0);
	});

	it('reports the highest reachable tier when the target is out of reach', () => {
		const outcome = solve({
			copies: [0],
			motes: new Array(MOTE_GRADES.length).fill(0),
			voidTouched: 0,
			targetTier: 7
		});
		expect(outcome.feasible).toBe(false);
		expect(outcome.plan).toBeNull();
		expect(outcome.maxTier).toBe(0);
	});

	it('carries an item from +7 to +10 on three Void-Touched', () => {
		const outcome = solve({
			copies: [expForTier(7)],
			motes: new Array(MOTE_GRADES.length).fill(0),
			voidTouched: 3,
			targetTier: 10
		});
		expect(outcome.feasible).toBe(true);
		expect(outcome.plan!.voidCount).toBe(3);
		expect(outcome.plan!.achievedTier).toBe(10);
		expect(outcome.plan!.cost).toBe(3 * 8192);
	});

	it('does not spend Void-Touched when motes are not needed', () => {
		const outcome = solve({
			copies: [expForTier(10)],
			motes: new Array(MOTE_GRADES.length).fill(0),
			voidTouched: 3,
			targetTier: 10
		});
		expect(outcome.plan!.voidCount).toBe(0);
	});

	it('uses Void-Touched after motes, on the base copy', () => {
		const outcome = solve({
			copies: [expForTier(7)],
			motes: new Array(MOTE_GRADES.length).fill(0),
			voidTouched: 3,
			targetTier: 10
		});
		expect(outcome.plan!.base).toBe('A');
		expect(outcome.plan!.merges).toEqual([]);
	});

	it('accounts for every applied mote in the builds', () => {
		const outcome = solve({
			copies: [0, 0, 0, 0],
			motes: FULL_MOTES,
			voidTouched: 0,
			targetTier: 7
		});
		const perBuild = outcome.plan!.builds.reduce(
			(sum, build) => sum + build.motes.reduce((s, m) => s + m.count, 0),
			0
		);
		expect(perBuild).toBe(totals(outcome.plan!));
	});

	it('builds four copies to +5 and void-touches to +10', () => {
		const outcome = solve({
			copies: [0, 0, 0, 0],
			motes: FULL_MOTES,
			voidTouched: 3,
			targetTier: 10
		});
		expect(outcome.feasible).toBe(true);
		expect(outcome.plan!.voidCount).toBe(3);
		expect(outcome.plan!.achievedTier).toBe(10);
		expect(outcome.plan!.exp).toBe(expForTier(10));
	});

	it('void-touches a four-copy +7 straight to +10', () => {
		const outcome = solve({
			copies: [31, 31, 31, 31],
			motes: new Array(MOTE_GRADES.length).fill(0),
			voidTouched: 3,
			targetTier: 10
		});
		expect(outcome.feasible).toBe(true);
		expect(outcome.plan!.voidCount).toBe(3);
		expect(outcome.plan!.cost).toBe(3 * 8192);
		expect(outcome.plan!.merges).toHaveLength(3);
	});

	it('stays fast and reaches +7 from a large farm', () => {
		const started = performance.now();
		const outcome = solve({
			copies: new Array(10).fill(0),
			motes: FULL_MOTES,
			voidTouched: 3,
			targetTier: 7
		});
		expect(outcome.feasible).toBe(true);
		expect(outcome.plan!.achievedTier).toBe(7);
		expect(performance.now() - started).toBeLessThan(3000);
	});
});

describe('extraMotesNeeded', () => {
	it('finds how many Major motes unlock an otherwise unreachable tier', () => {
		const need = extraMotesNeeded(
			{
				copies: [0],
				motes: new Array(MOTE_GRADES.length).fill(0),
				voidTouched: 0,
				targetTier: 1
			},
			4
		);
		expect(need).toEqual({ grade: 4, count: 1 });
	});

	it('reports zero when the target is already reachable', () => {
		const need = extraMotesNeeded(
			{
				copies: [expForTier(4)],
				motes: new Array(MOTE_GRADES.length).fill(0),
				voidTouched: 0,
				targetTier: 4
			},
			4
		);
		expect(need).toEqual({ grade: 4, count: 0 });
	});
});

describe('savingsFromExtraCopies', () => {
	it('quantifies what a spare drop is worth', () => {
		const savings = savingsFromExtraCopies(
			{
				copies: [0],
				motes: [0, 0, 0, 0, 20, 5, 3, 1, 0, 0],
				voidTouched: 0,
				targetTier: 5
			},
			4,
			2
		);
		expect(savings).toHaveLength(2);
		expect(savings.every((s) => s.reachesTarget)).toBe(true);
		expect(savings[0].costSaved).toBeGreaterThan(0);
		expect(savings[0].motesSaved.length).toBeGreaterThan(0);
	});
});
