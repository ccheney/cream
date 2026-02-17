import type { Decision, DecisionPlan } from "../schemas/decision-plan";
import type { MarketContext, PositionInfo } from "./outputEnforcer";

export function createValidDecisionPlan(): DecisionPlan {
	return {
		cycleId: "test-cycle-1",
		asOfTimestamp: "2026-01-05T15:00:00Z",
		environment: "PAPER",
		decisions: [
			{
				instrument: {
					instrumentId: "AAPL",
					instrumentType: "EQUITY",
				},
				action: "BUY",
				size: {
					quantity: 100,
					unit: "SHARES",
					targetPositionQuantity: 100,
				},
				orderPlan: {
					entryOrderType: "LIMIT",
					entryLimitPrice: 150,
					exitOrderType: "MARKET",
					timeInForce: "DAY",
					executionTactic: "",
					executionParams: {},
				},
				riskLevels: {
					stopLossLevel: 140,
					takeProfitLevel: 165,
					denomination: "UNDERLYING_PRICE",
				},
				strategyFamily: "TREND",
				rationale: "Strong momentum signals",
				confidence: 0.8,
				references: {
					usedIndicators: ["rsi", "atr"],
					memoryCaseIds: [],
					eventIds: [],
				},
			},
		],
	};
}

export function getFirstDecision(): Decision {
	const decision = createValidDecisionPlan().decisions[0];
	if (!decision) {
		throw new Error("Expected decision to be defined");
	}
	return decision;
}

export function createPlanWithDecision(decision: Decision): DecisionPlan {
	return {
		...createValidDecisionPlan(),
		decisions: [decision],
	};
}

export function createMarketContext(overrides: Partial<MarketContext> = {}): MarketContext {
	return {
		marketOpen: true,
		currentTime: new Date("2026-01-05T15:00:00Z"),
		buyingPower: 100000,
		marginUsage: 0.3,
		maxMarginUsage: 0.9,
		currentPositions: new Map(),
		...overrides,
	};
}

export function createPosition(
	instrumentId: string,
	quantity: number,
	avgEntryPrice = 150,
): PositionInfo {
	return {
		instrumentId,
		quantity,
		avgEntryPrice,
		marketValue: Math.abs(quantity) * avgEntryPrice,
	};
}
