import { MOTE_GRADES, expForTier, tierForExp } from './mechanics';

/** Major Potential is the workhorse for bulk copy pyramids. */
export const PYRAMID_GRADE = 4;

export interface PyramidBuild {
	motes: number;
	exp: number;
	merge: number;
	partial: number;
	tier: number;
}

/**
 * Every way a single fresh copy can be fed motes of one grade, up to the point
 * where the next mote would be illegal because the copy outgrew the grade.
 */
export function pyramidBuilds(gradeIndex: number): PyramidBuild[] {
	const grade = MOTE_GRADES[gradeIndex];
	const builds: PyramidBuild[] = [
		{ motes: 0, exp: 0, merge: 2 ** 0, partial: 0 - 2 ** 0, tier: 0 }
	];
	let exp = 0;
	let motes = 0;
	while (tierForExp(exp) <= grade.maxTier) {
		exp += grade.exp;
		motes += 1;
		const tier = tierForExp(exp);
		const merge = 2 ** tier;
		builds.push({ motes, exp, merge, partial: exp - merge, tier });
	}
	return builds;
}

export interface PyramidRow {
	copies: number;
	/** Fewest motes of the grade needed to hit the target, or null if unreachable. */
	minMotes: number | null;
	/** Best total experience achievable with this many copies, no matter how many motes. */
	maxExp: number;
}

/**
 * For each copy count, the fewest motes needed to reach a tier. Adding a copy
 * always adds at least one experience, so this is monotone in copies.
 */
export function pyramidFrontier(
	gradeIndex: number,
	targetTier: number,
	maxCopies: number
): PyramidRow[] {
	const builds = pyramidBuilds(gradeIndex);
	const partials = [...new Set(builds.map((b) => b.partial))].sort((a, b) => a - b);
	const partialIndex = new Map(partials.map((p, i) => [p, i]));
	const targetExp = expForTier(targetTier);
	const maxMotes = builds[builds.length - 1].motes * maxCopies;
	const NEG = -1;
	const width = partials.length;

	let dp: Int32Array = new Int32Array((maxMotes + 1) * width).fill(NEG);
	dp[partialIndex.get(-1)!] = 0;
	const rows: PyramidRow[] = [];

	for (let n = 1; n <= maxCopies; n++) {
		const next = new Int32Array((maxMotes + 1) * width).fill(NEG);
		for (let m = 0; m <= maxMotes; m++) {
			const base = m * width;
			for (let hi = 0; hi < width; hi++) {
				const value = dp[base + hi];
				if (value < 0) continue;
				for (const build of builds) {
					const nm = m + build.motes;
					if (nm > maxMotes) continue;
					const nhi = Math.max(hi, partialIndex.get(build.partial)!);
					const idx = nm * width + nhi;
					const candidate = value + build.merge;
					if (candidate > next[idx]) next[idx] = candidate;
				}
			}
		}
		dp = next;

		let minMotes: number | null = null;
		let maxExp = 0;
		for (let m = 0; m <= maxMotes; m++) {
			const base = m * width;
			let best = NEG;
			for (let hi = 0; hi < width; hi++) {
				const value = dp[base + hi];
				if (value < 0) continue;
				const total = value + partials[hi];
				if (total > best) best = total;
			}
			if (best > maxExp) maxExp = best;
			if (minMotes === null && best >= targetExp) minMotes = m;
		}
		rows.push({ copies: n, minMotes, maxExp });
	}
	return rows;
}

export interface PyramidAllocation {
	motesPerCopy: number;
	copies: number;
}

export interface PyramidPlan {
	grade: number;
	copies: number;
	motesUsed: number;
	motesAvailable: number;
	exp: number;
	tier: number;
	targetTier: number;
	reached: boolean;
	/** Copies grouped by how many motes that copy receives. */
	allocation: PyramidAllocation[];
}

/**
 * Best split of a fixed mote budget across a fixed set of fresh copies,
 * returning how many copies receive how many motes.
 */
export function pyramidPlan(
	gradeIndex: number,
	copies: number,
	motesAvailable: number,
	targetTier: number
): PyramidPlan {
	const builds = pyramidBuilds(gradeIndex);
	const partials = [...new Set(builds.map((b) => b.partial))].sort((a, b) => a - b);
	const partialIndex = new Map(partials.map((p, i) => [p, i]));
	const width = partials.length;
	const maxPerCopy = builds[builds.length - 1].motes;
	const maxMotes = Math.min(motesAvailable, maxPerCopy * copies);
	const NEG = -1;

	const layers: { choice: Uint8Array; prevHi: Uint8Array }[] = [];
	let dp: Int32Array = new Int32Array((maxMotes + 1) * width).fill(NEG);
	dp[partialIndex.get(-1)!] = 0;

	for (let n = 0; n < copies; n++) {
		const next = new Int32Array((maxMotes + 1) * width).fill(NEG);
		const choice = new Uint8Array((maxMotes + 1) * width);
		const prevHi = new Uint8Array((maxMotes + 1) * width);
		for (let m = 0; m <= maxMotes; m++) {
			const base = m * width;
			for (let hi = 0; hi < width; hi++) {
				const value = dp[base + hi];
				if (value < 0) continue;
				for (let b = 0; b < builds.length; b++) {
					const build = builds[b];
					const nm = m + build.motes;
					if (nm > maxMotes) continue;
					const nhi = Math.max(hi, partialIndex.get(build.partial)!);
					const idx = nm * width + nhi;
					const candidate = value + build.merge;
					if (candidate > next[idx]) {
						next[idx] = candidate;
						choice[idx] = b;
						prevHi[idx] = hi;
					}
				}
			}
		}
		layers.push({ choice, prevHi });
		dp = next;
	}

	// Prefer the fewest motes that reach the target; otherwise show the best
	// total the player can squeeze out of what they have.
	const targetExp = expForTier(targetTier);
	let bestExp = -1;
	let bestM = 0;
	let bestHi = 0;
	let chosenExp = -1;
	let chosenM = 0;
	let chosenHi = 0;
	for (let m = 0; m <= maxMotes; m++) {
		const base = m * width;
		for (let hi = 0; hi < width; hi++) {
			const value = dp[base + hi];
			if (value < 0) continue;
			const total = value + partials[hi];
			if (total > bestExp) {
				bestExp = total;
				bestM = m;
				bestHi = hi;
			}
			if (total >= targetExp && (chosenExp < 0 || m < chosenM || (m === chosenM && total > chosenExp))) {
				chosenExp = total;
				chosenM = m;
				chosenHi = hi;
			}
		}
	}
	const useChosen = chosenExp >= 0;
	const finalExp = useChosen ? chosenExp : bestExp;
	const finalM = useChosen ? chosenM : bestM;
	const finalHi = useChosen ? chosenHi : bestHi;

	const counts = new Map<number, number>();
	let m = finalM;
	let hi = finalHi;
	for (let n = copies - 1; n >= 0; n--) {
		const idx = m * width + hi;
		const build = builds[layers[n].choice[idx]];
		counts.set(build.motes, (counts.get(build.motes) ?? 0) + 1);
		m -= build.motes;
		hi = layers[n].prevHi[idx];
	}

	const allocation: PyramidAllocation[] = [...counts.entries()]
		.map(([motesPerCopy, count]) => ({ motesPerCopy, copies: count }))
		.sort((a, b) => a.motesPerCopy - b.motesPerCopy);

	return {
		grade: gradeIndex,
		copies,
		motesUsed: finalM,
		motesAvailable,
		exp: finalExp,
		tier: tierForExp(finalExp),
		targetTier,
		reached: finalExp >= targetExp,
		allocation
	};
}
