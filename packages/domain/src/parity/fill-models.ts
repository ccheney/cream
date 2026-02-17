import { z } from "zod";

export const FillRecordSchema = z.object({
	orderId: z.string(),
	symbol: z.string(),
	side: z.enum(["buy", "sell"]),
	requestedQty: z.number().positive(),
	filledQty: z.number().nonnegative(),
	requestedPrice: z.number().positive().optional(),
	fillPrice: z.number().positive().optional(),
	orderType: z.enum(["market", "limit", "stop", "stop_limit"]),
	filledAt: z.string().datetime().optional(),
	slippageBps: z.number().optional(),
});

export type FillRecord = z.infer<typeof FillRecordSchema>;

export interface FillModelComparisonResult {
	matchScore: number;
	totalFills: number;
	matchedFills: number;
	stats: {
		avgSlippageResearch: number;
		avgSlippageLive: number;
		fillRateResearch: number;
		fillRateLive: number;
		avgLatencyMs?: number;
	};
	discrepancies: Array<{
		orderId: string;
		field: string;
		researchValue: number | string;
		liveValue: number | string;
	}>;
}

export function compareFillModels(
	researchFills: FillRecord[],
	liveFills: FillRecord[],
	tolerance: { slippageBps: number; fillRatePct: number } = {
		slippageBps: 10,
		fillRatePct: 5,
	},
): FillModelComparisonResult {
	const discrepancies: FillModelComparisonResult["discrepancies"] = [];
	const avgSlippageResearch = getAverageSlippage(researchFills);
	const avgSlippageLive = getAverageSlippage(liveFills);
	const researchFillRate = getFillRate(researchFills);
	const liveFillRate = getFillRate(liveFills);
	appendAggregateDiscrepancies(
		discrepancies,
		tolerance,
		avgSlippageResearch,
		avgSlippageLive,
		researchFillRate,
		liveFillRate,
	);
	const matchedFills = countMatchedFills(researchFills, liveFills, tolerance.slippageBps);
	const matchScore = researchFills.length > 0 ? matchedFills / researchFills.length : 1;

	return {
		matchScore,
		totalFills: researchFills.length,
		matchedFills,
		stats: {
			avgSlippageResearch,
			avgSlippageLive,
			fillRateResearch: researchFillRate,
			fillRateLive: liveFillRate,
		},
		discrepancies,
	};
}

function getAverageSlippage(fills: FillRecord[]): number {
	const slippages = fills
		.map((fill) => fill.slippageBps)
		.filter((slippage): slippage is number => slippage !== undefined);
	if (slippages.length === 0) {
		return 0;
	}
	return slippages.reduce((sum, value) => sum + value, 0) / slippages.length;
}

function getFillRate(fills: FillRecord[]): number {
	if (fills.length === 0) {
		return 0;
	}
	return fills.filter((fill) => fill.filledQty > 0).length / fills.length;
}

function appendAggregateDiscrepancies(
	discrepancies: FillModelComparisonResult["discrepancies"],
	tolerance: { slippageBps: number; fillRatePct: number },
	avgSlippageResearch: number,
	avgSlippageLive: number,
	researchFillRate: number,
	liveFillRate: number,
): void {
	if (Math.abs(avgSlippageResearch - avgSlippageLive) > tolerance.slippageBps) {
		discrepancies.push({
			orderId: "aggregate",
			field: "avgSlippage",
			researchValue: avgSlippageResearch,
			liveValue: avgSlippageLive,
		});
	}
	if (Math.abs((researchFillRate - liveFillRate) * 100) > tolerance.fillRatePct) {
		discrepancies.push({
			orderId: "aggregate",
			field: "fillRate",
			researchValue: researchFillRate,
			liveValue: liveFillRate,
		});
	}
}

function countMatchedFills(
	researchFills: FillRecord[],
	liveFills: FillRecord[],
	slippageToleranceBps: number,
): number {
	const liveByOrderId = new Map(liveFills.map((fill) => [fill.orderId, fill]));
	let matchedFills = 0;
	for (const researchFill of researchFills) {
		const liveFill = liveByOrderId.get(researchFill.orderId);
		if (!liveFill) {
			continue;
		}
		const researchSlippage = researchFill.slippageBps ?? 0;
		const liveSlippage = liveFill.slippageBps ?? 0;
		if (Math.abs(researchSlippage - liveSlippage) <= slippageToleranceBps) {
			matchedFills++;
		}
	}
	return matchedFills;
}
