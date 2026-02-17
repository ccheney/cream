import { z } from "zod";

export const IndicatorVersionSchema = z.object({
	id: z.string().min(1),
	version: z.string().regex(/^\d+\.\d+\.\d+$/),
	introducedAt: z.string().datetime(),
	implementationHash: z.string().length(64).optional(),
	parameters: z.record(z.string(), z.unknown()).optional(),
});

export type IndicatorVersion = z.infer<typeof IndicatorVersionSchema>;

export const VersionRegistrySchema = z.object({
	createdAt: z.string().datetime(),
	environment: z.enum(["PAPER", "LIVE"]),
	indicators: z.record(z.string(), IndicatorVersionSchema),
});

export type VersionRegistry = z.infer<typeof VersionRegistrySchema>;

export interface VersionComparisonResult {
	match: boolean;
	mismatches: Array<{
		indicatorId: string;
		researchVersion: string;
		liveVersion: string;
	}>;
	missingFromLive: string[];
	missingFromResearch: string[];
}

export function compareVersionRegistries(
	research: VersionRegistry,
	live: VersionRegistry,
): VersionComparisonResult {
	const mismatches: VersionComparisonResult["mismatches"] = [];
	const missingFromLive: string[] = [];
	const missingFromResearch: string[] = [];

	const researchIds = new Set(Object.keys(research.indicators));
	const liveIds = new Set(Object.keys(live.indicators));

	for (const id of researchIds) {
		const researchIndicator = research.indicators[id];
		if (!researchIndicator) {
			continue;
		}

		if (!liveIds.has(id)) {
			missingFromLive.push(id);
		} else {
			const liveIndicator = live.indicators[id];
			if (liveIndicator && researchIndicator.version !== liveIndicator.version) {
				mismatches.push({
					indicatorId: id,
					researchVersion: researchIndicator.version,
					liveVersion: liveIndicator.version,
				});
			}
		}
	}

	for (const id of liveIds) {
		if (!researchIds.has(id)) {
			missingFromResearch.push(id);
		}
	}

	return {
		match:
			mismatches.length === 0 && missingFromLive.length === 0 && missingFromResearch.length === 0,
		mismatches,
		missingFromLive,
		missingFromResearch,
	};
}
