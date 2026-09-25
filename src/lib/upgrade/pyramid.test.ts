import { describe, expect, it } from 'vitest';
import { PYRAMID_GRADE, pyramidBuilds, pyramidFrontier, pyramidPlan } from './pyramid';
import { expForTier } from './mechanics';

describe('pyramidBuilds', () => {
	it('lists every legal Major allocation for a fresh copy', () => {
		const builds = pyramidBuilds(PYRAMID_GRADE);
		expect(builds.map((b) => b.motes)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
		expect(builds.map((b) => b.exp)).toEqual([0, 5, 10, 15, 20, 25, 30, 35]);
		expect(builds.map((b) => b.merge)).toEqual([1, 4, 8, 16, 16, 16, 16, 32]);
	});

	it('stops once the copy outgrows the grade limit', () => {
		const builds = pyramidBuilds(PYRAMID_GRADE);
		for (const build of builds) {
			expect(build.exp).toBeGreaterThanOrEqual(0);
		}
		// A Major cannot be applied to a copy above +4, so 35 is the ceiling.
		expect(builds[builds.length - 1].exp).toBe(35);
	});
});

describe('pyramidFrontier', () => {
	const rows = pyramidFrontier(PYRAMID_GRADE, 7, 140);
	const at = (copies: number) => rows.find((r) => r.copies === copies)!;

	it('needs 28 Majors with four copies', () => {
		expect(at(4).minMotes).toBe(28);
	});

	it('needs 24 Majors with eight copies to reach exactly +7', () => {
		expect(at(8).minMotes).toBe(24);
		expect(at(8).maxExp).toBeGreaterThanOrEqual(expForTier(7));
	});

	it('needs no Majors at all once there are 128 raw copies', () => {
		expect(at(128).minMotes).toBe(0);
	});

	it('never needs more Majors as copies are added', () => {
		let previous = Infinity;
		for (const row of rows) {
			if (row.minMotes === null) continue;
			expect(row.minMotes).toBeLessThanOrEqual(previous);
			previous = row.minMotes;
		}
	});
});

describe('pyramidPlan', () => {
	it('finds the fewest Majors across forty copies', () => {
		const plan = pyramidPlan(PYRAMID_GRADE, 40, 40, 7);
		expect(plan.reached).toBe(true);
		expect(plan.motesUsed).toBe(18);
		expect(plan.allocation).toEqual([
			{ motesPerCopy: 0, copies: 34 },
			{ motesPerCopy: 3, copies: 6 }
		]);
	});

	it('reports a shortfall when there are not enough Majors', () => {
		const plan = pyramidPlan(PYRAMID_GRADE, 8, 10, 7);
		expect(plan.reached).toBe(false);
		expect(plan.motesUsed).toBe(10);
	});

	it('folds in the base copy partial when it helps', () => {
		// Six Majors on a copy sits at +4 with 14 progress, which the base keeps.
		const plan = pyramidPlan(PYRAMID_GRADE, 4, 24, 7);
		const total = plan.allocation.reduce((sum, entry) => sum + entry.copies, 0);
		expect(total).toBe(4);
		expect(plan.motesUsed).toBeLessThanOrEqual(24);
	});
});
