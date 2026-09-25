export interface MoteGrade {
	key: string;
	name: string;
	short: string;
	exp: number;
	maxTier: number;
	defaultWeight: number;
}

/**
 * Mote grades in ascending order. A mote can only be merged into an item whose
 * tier is at or below `maxTier`; experience added by a mote is never capped.
 */
export const MOTE_GRADES: MoteGrade[] = [
	{ key: 'infinitesimal', name: 'Mote of Infinitesimal Potential', short: 'Infinitesimal', exp: 1, maxTier: 0, defaultWeight: 1 },
	{ key: 'minor', name: 'Mote of Minor Potential', short: 'Minor', exp: 1, maxTier: 1, defaultWeight: 2 },
	{ key: 'lesser', name: 'Mote of Lesser Potential', short: 'Lesser', exp: 2, maxTier: 2, defaultWeight: 4 },
	{ key: 'potential', name: 'Mote of Potential', short: 'Potential', exp: 4, maxTier: 3, defaultWeight: 8 },
	{ key: 'major', name: 'Mote of Major Potential', short: 'Major', exp: 5, maxTier: 4, defaultWeight: 16 },
	{ key: 'greater', name: 'Mote of Greater Potential', short: 'Greater', exp: 6, maxTier: 5, defaultWeight: 64 },
	{ key: 'superior', name: 'Mote of Superior Potential', short: 'Superior', exp: 7, maxTier: 6, defaultWeight: 256 },
	{ key: 'grand', name: 'Mote of Grand Potential', short: 'Grand', exp: 8, maxTier: 7, defaultWeight: 65536 },
	{ key: 'ascendant', name: 'Mote of Ascendant Potential', short: 'Ascendant', exp: 9, maxTier: 8, defaultWeight: 262144 },
	{ key: 'infinite', name: 'Mote of Infinite Potential', short: 'Infinite', exp: 10, maxTier: 9, defaultWeight: 1048576 }
];

export const VOID_TOUCHED = {
	key: 'void-touched',
	name: 'Void-Touched Potential',
	short: 'Void-Touched',
	defaultWeight: 8192
};

export const MAX_TIER = 10;

/** Exalted effect each tier opens up, from the community socket reference. */
export const TIER_LABELS: Record<number, string> = {
	1: 'Focus',
	2: 'Click',
	3: 'Worn',
	4: 'Proc',
	7: 'Pre-Void',
	10: 'Max'
};

export function tierLabel(tier: number): string | undefined {
	return TIER_LABELS[tier];
}

/** Cumulative experience needed to reach a tier. */
export function expForTier(tier: number): number {
	return 2 ** tier - 1;
}

/** Experience the item still needs inside its current tier to advance. */
export function expToNextTier(tier: number): number {
	return tier >= MAX_TIER ? 0 : 2 ** tier;
}

const TIER_BY_EXP: number[] = (() => {
	const table: number[] = [];
	for (let exp = 0; exp <= expForTier(MAX_TIER) + 64; exp++) {
		table.push(tierForExpUncached(exp));
	}
	return table;
})();

function tierForExpUncached(exp: number): number {
	let tier = 0;
	while (tier < MAX_TIER && exp >= expForTier(tier + 1)) tier++;
	return tier;
}

/** Tier an item with the given cumulative experience sits at. */
export function tierForExp(exp: number): number {
	if (exp < 0) return 0;
	if (exp < TIER_BY_EXP.length) return TIER_BY_EXP[exp];
	return tierForExpUncached(exp);
}

export interface LevelProgress {
	tier: number;
	inLevel: number;
	needed: number;
}

/** Split cumulative experience into tier plus progress within that tier. */
export function levelProgress(exp: number): LevelProgress {
	const tier = tierForExp(exp);
	const inLevel = exp - expForTier(tier);
	const needed = expToNextTier(tier);
	return { tier, inLevel, needed };
}

export function formatLevel(exp: number): string {
	const { tier, inLevel, needed } = levelProgress(exp);
	if (tier >= MAX_TIER) return `+${MAX_TIER}`;
	return `+${tier} (${inLevel}/${needed})`;
}

/** Experience a duplicate at the given tier donates when merged. */
export function mergeValue(tier: number): number {
	return tier >= MAX_TIER ? 0 : 2 ** tier;
}

/** Experience a duplicate with the given cumulative experience donates. */
export function mergeValueForExp(exp: number): number {
	return mergeValue(tierForExp(exp));
}

/** Total experience represented by a set of containers that will be merged. */
export function mergedTotal(containerExps: number[]): number {
	let sum = 0;
	let bestBonus = -Infinity;
	for (const exp of containerExps) {
		const tier = tierForExp(exp);
		const value = mergeValue(tier);
		sum += value;
		const bonus = exp - value;
		if (bonus > bestBonus) bestBonus = bonus;
	}
	return sum + bestBonus;
}
