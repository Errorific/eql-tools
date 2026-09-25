import { describe, expect, it } from 'vitest';
import {
	MOTE_GRADES,
	MAX_TIER,
	expForTier,
	expToNextTier,
	levelProgress,
	mergeValue,
	mergeValueForExp,
	mergedTotal,
	tierForExp,
	formatLevel,
	tierLabel
} from './mechanics';

describe('tier experience', () => {
	it('matches the wiki thresholds', () => {
		expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(expForTier)).toEqual([
			0, 1, 3, 7, 15, 31, 63, 127, 255, 511, 1023
		]);
	});

	it('doubles the experience needed for each tier', () => {
		for (let tier = 0; tier < MAX_TIER; tier++) {
			expect(expToNextTier(tier)).toBe(2 ** tier);
		}
		expect(expToNextTier(MAX_TIER)).toBe(0);
	});

	it('resolves the tier at each boundary', () => {
		expect(tierForExp(0)).toBe(0);
		expect(tierForExp(1)).toBe(1);
		expect(tierForExp(2)).toBe(1);
		expect(tierForExp(3)).toBe(2);
		expect(tierForExp(14)).toBe(3);
		expect(tierForExp(15)).toBe(4);
		expect(tierForExp(1023)).toBe(10);
		expect(tierForExp(5000)).toBe(10);
	});

	it('splits progress within a tier', () => {
		expect(levelProgress(15)).toEqual({ tier: 4, inLevel: 0, needed: 16 });
		expect(levelProgress(20)).toEqual({ tier: 4, inLevel: 5, needed: 16 });
		expect(levelProgress(1023)).toEqual({ tier: 10, inLevel: 0, needed: 0 });
	});

	it('formats levels the way the game shows them', () => {
		expect(formatLevel(15)).toBe('+4 (0/16)');
		expect(formatLevel(20)).toBe('+4 (5/16)');
		expect(formatLevel(1023)).toBe('+10');
	});
});

describe('merge value', () => {
	it('equals the experience needed to reach that tier', () => {
		expect(mergeValue(0)).toBe(1);
		expect(mergeValue(1)).toBe(2);
		expect(mergeValue(4)).toBe(16);
		expect(mergeValue(7)).toBe(128);
		expect(mergeValue(10)).toBe(0);
	});

	it('looks up by experience', () => {
		expect(mergeValueForExp(0)).toBe(1);
		expect(mergeValueForExp(15)).toBe(16);
		expect(mergeValueForExp(31)).toBe(32);
		expect(mergeValueForExp(127)).toBe(128);
	});
});

describe('merged total', () => {
	it('is one when a single +0 is the item', () => {
		expect(mergedTotal([0])).toBe(0);
	});

	it('adds the body of each merged copy', () => {
		expect(mergedTotal([0, 0])).toBe(1);
		expect(mergedTotal([0, 0, 0])).toBe(2);
		expect(mergedTotal([0, 0, 0, 0])).toBe(3);
	});

	it('matches the classic four +5 copies into +7', () => {
		expect(mergedTotal([31, 31, 31, 31])).toBe(127);
	});

	it('matches the wiki pyramid', () => {
		// Four +5 copies into +7, then three void-touched reach +10.
		expect(mergedTotal([31, 31, 31, 31])).toBe(expForTier(7));
	});

	it('preserves the partial on the best base', () => {
		expect(mergedTotal([15, 15])).toBe(31);
		// 2/8 on a +3 base plus a +4 fuel beats a clean +4 base plus a +3 fuel.
		expect(mergedTotal([9, 15])).toBe(9 + 16);
		expect(mergedTotal([15, 9])).toBe(9 + 16);
	});

	it('does not count a +10 fuel as a merge', () => {
		expect(mergedTotal([1023, 31])).toBe(1023 + 32);
	});
});

describe('mote definitions', () => {
	it('lists the ten grades in order with wiki values', () => {
		expect(MOTE_GRADES.map((g) => g.exp)).toEqual([1, 1, 2, 4, 5, 6, 7, 8, 9, 10]);
		expect(MOTE_GRADES.map((g) => g.maxTier)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
	});

	it('orders scarcity upward', () => {
		const weights = MOTE_GRADES.map((g) => g.defaultWeight);
		for (let i = 1; i < weights.length; i++) expect(weights[i]).toBeGreaterThan(weights[i - 1]);
	});
});

describe('tier labels', () => {
	it('names the exaltation breakpoints', () => {
		expect(tierLabel(1)).toBe('Focus');
		expect(tierLabel(2)).toBe('Click');
		expect(tierLabel(3)).toBe('Worn');
		expect(tierLabel(4)).toBe('Proc');
		expect(tierLabel(7)).toBe('Pre-Void');
		expect(tierLabel(10)).toBe('Max');
		expect(tierLabel(5)).toBeUndefined();
	});
});
