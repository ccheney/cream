import type { Decision, DecisionPlan } from "../schemas/decision-plan";
import type { PositionInfo } from "./outputEnforcer.types";

const OPTION_INSTRUMENT_ID_LENGTH = 15;

function isOptionInstrumentId(instrumentId: string): boolean {
	return instrumentId.length >= OPTION_INSTRUMENT_ID_LENGTH;
}

function buildFallbackDecision(instrumentId: string, position: PositionInfo): Decision {
	const isOption = isOptionInstrumentId(instrumentId);
	const isLong = position.quantity > 0;

	return {
		instrument: {
			instrumentId,
			instrumentType: isOption ? "OPTION" : "EQUITY",
		},
		action: "HOLD",
		size: {
			quantity: Math.abs(position.quantity),
			unit: isOption ? "CONTRACTS" : "SHARES",
			targetPositionQuantity: position.quantity,
		},
		orderPlan: {
			entryOrderType: "LIMIT",
			exitOrderType: "MARKET",
			timeInForce: "DAY",
			executionTactic: "",
			executionParams: {},
		},
		riskLevels: {
			stopLossLevel: position.avgEntryPrice * (isLong ? 0.95 : 1.05),
			takeProfitLevel: position.avgEntryPrice * (isLong ? 1.1 : 0.9),
			denomination: "UNDERLYING_PRICE",
		},
		strategyFamily: "TREND",
		rationale: "Fallback: maintaining existing position due to plan validation failure",
		confidence: 0.5,
		references: {
			usedIndicators: [],
			memoryCaseIds: [],
			eventIds: [],
		},
	};
}

/**
 * Create a fallback decision plan that maintains existing positions
 */
export function createFallbackPlan(
	cycleId: string,
	currentPositions: Map<string, PositionInfo>,
): DecisionPlan {
	const decisions: Decision[] = [];

	for (const [instrumentId, position] of currentPositions) {
		if (position.quantity !== 0) {
			decisions.push(buildFallbackDecision(instrumentId, position));
		}
	}

	return {
		cycleId,
		asOfTimestamp: `${new Date().toISOString().replace(/\.\d{3}/, "")}Z`,
		environment: "PAPER",
		decisions,
		portfolioNotes: "Fallback plan: no new entries, maintaining existing positions",
	};
}
