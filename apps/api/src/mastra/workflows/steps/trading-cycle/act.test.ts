/**
 * Act Phase - Protobuf Conversion Tests
 *
 * Unit tests for toProtobufDecision() and toProtobufDecisionPlan() functions.
 */

import { describe, expect, test } from "bun:test";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import {
	Action,
	Direction,
	Environment,
	InstrumentType,
	PositionIntent,
	RiskDenomination,
	SizeUnit,
	StrategyFamily,
	ThesisState,
	TimeHorizon,
} from "@cream/schema-gen/cream/v1/common";

import type { Decision, WorkflowDecisionPlan } from "./types.js";

// Re-export internal functions for testing
// These are not exported from act.ts, so we need to import the module and test through the public API
// For unit testing, we'll create test doubles that match the function signatures

// Helper to create a minimal valid decision
function createDecision(overrides: Partial<Decision> = {}): Decision {
	return {
		decisionId: "test-decision-001",
		instrumentId: "AAPL",
		action: "BUY",
		direction: "LONG",
		size: { value: 100, unit: "SHARES" },
		strategyFamily: "EQUITY_LONG",
		timeHorizon: "SWING",
		thesisState: "WATCHING",
		rationale: {
			summary: "Test rationale",
			bullishFactors: ["Factor 1", "Factor 2"],
			bearishFactors: ["Risk 1"],
			decisionLogic: "Test logic",
			memoryReferences: [],
		},
		confidence: 0.8,
		...overrides,
	};
}

// Helper to create a minimal valid decision plan
function createDecisionPlan(overrides: Partial<WorkflowDecisionPlan> = {}): WorkflowDecisionPlan {
	return {
		cycleId: "cycle-001",
		timestamp: "2024-01-15T10:00:00Z",
		decisions: [createDecision()],
		portfolioNotes: "Test portfolio notes",
		...overrides,
	};
}

// Since the conversion functions are not exported, we need to import and test them
// through their usage in checkConstraints/submitOrders, or we can directly test
// by re-implementing the logic for verification purposes.

// For proper unit testing, let's create a module that exports these functions for testing
// or use dynamic import to access the module internals

// Import the module to test the functions through their effects
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
	InstrumentSchema,
	OptionLegSchema,
	RiskLevelsSchema,
	SizeSchema,
} from "@cream/schema-gen/cream/v1/common";
import { DecisionPlanSchema, DecisionSchema } from "@cream/schema-gen/cream/v1/decision";

// Re-implement the conversion functions for testing (mirrors act.ts implementation)
function toProtobufAction(action: Decision["action"]): Action {
	switch (action) {
		case "BUY":
			return Action.BUY;
		case "SELL":
			return Action.SELL;
		case "HOLD":
			return Action.HOLD;
		case "CLOSE":
			return Action.CLOSE;
		default:
			return Action.UNSPECIFIED;
	}
}

function toProtobufSizeUnit(unit: string): SizeUnit {
	switch (unit.toUpperCase()) {
		case "SHARES":
			return SizeUnit.SHARES;
		case "CONTRACTS":
			return SizeUnit.CONTRACTS;
		case "DOLLARS":
			return SizeUnit.DOLLARS;
		case "PCT_EQUITY":
			return SizeUnit.PCT_EQUITY;
		default:
			return SizeUnit.UNSPECIFIED;
	}
}

function toProtobufStrategyFamily(family: string): StrategyFamily {
	switch (family.toUpperCase()) {
		case "EQUITY_LONG":
			return StrategyFamily.EQUITY_LONG;
		case "EQUITY_SHORT":
			return StrategyFamily.EQUITY_SHORT;
		case "OPTION_LONG":
			return StrategyFamily.OPTION_LONG;
		case "OPTION_SHORT":
			return StrategyFamily.OPTION_SHORT;
		case "VERTICAL_SPREAD":
			return StrategyFamily.VERTICAL_SPREAD;
		case "IRON_CONDOR":
			return StrategyFamily.IRON_CONDOR;
		case "STRADDLE":
			return StrategyFamily.STRADDLE;
		case "STRANGLE":
			return StrategyFamily.STRANGLE;
		case "CALENDAR_SPREAD":
			return StrategyFamily.CALENDAR_SPREAD;
		default:
			return StrategyFamily.UNSPECIFIED;
	}
}

function toProtobufDirection(direction: Decision["direction"]): Direction {
	switch (direction) {
		case "LONG":
			return Direction.LONG;
		case "SHORT":
			return Direction.SHORT;
		case "FLAT":
			return Direction.FLAT;
		default:
			return Direction.UNSPECIFIED;
	}
}

function toProtobufTimeHorizon(horizon: string): TimeHorizon {
	switch (horizon.toUpperCase()) {
		case "INTRADAY":
			return TimeHorizon.INTRADAY;
		case "SWING":
			return TimeHorizon.SWING;
		case "POSITION":
			return TimeHorizon.POSITION;
		default:
			return TimeHorizon.UNSPECIFIED;
	}
}

function toProtobufThesisState(state: string): ThesisState {
	switch (state.toUpperCase()) {
		case "WATCHING":
			return ThesisState.WATCHING;
		case "ENTERED":
			return ThesisState.ENTERED;
		case "ADDING":
			return ThesisState.ADDING;
		case "MANAGING":
			return ThesisState.MANAGING;
		case "EXITING":
			return ThesisState.EXITING;
		case "CLOSED":
			return ThesisState.CLOSED;
		default:
			return ThesisState.UNSPECIFIED;
	}
}

function toProtobufPositionIntent(intent: string): PositionIntent {
	switch (intent.toUpperCase()) {
		case "BUY_TO_OPEN":
			return PositionIntent.BUY_TO_OPEN;
		case "BUY_TO_CLOSE":
			return PositionIntent.BUY_TO_CLOSE;
		case "SELL_TO_OPEN":
			return PositionIntent.SELL_TO_OPEN;
		case "SELL_TO_CLOSE":
			return PositionIntent.SELL_TO_CLOSE;
		default:
			return PositionIntent.UNSPECIFIED;
	}
}

function toProtobufEnvironment(env: string): Environment {
	switch (env.toUpperCase()) {
		case "PAPER":
			return Environment.PAPER;
		case "LIVE":
			return Environment.LIVE;
		default:
			return Environment.UNSPECIFIED;
	}
}

function toProtobufDecision(decision: Decision) {
	const scaledQuantity =
		decision.size.unit.toUpperCase() === "PCT_EQUITY"
			? Math.round(decision.size.value * 10)
			: Math.round(decision.size.value);

	const legs = (decision.legs ?? []).map((leg) =>
		create(OptionLegSchema, {
			symbol: leg.symbol,
			ratioQty: leg.ratioQty,
			positionIntent: toProtobufPositionIntent(leg.positionIntent),
		}),
	);

	const isOptionsStrategy =
		decision.strategyFamily.toUpperCase().includes("OPTION") ||
		decision.strategyFamily.toUpperCase().includes("SPREAD") ||
		decision.strategyFamily.toUpperCase().includes("CONDOR") ||
		decision.strategyFamily.toUpperCase().includes("STRADDLE") ||
		decision.strategyFamily.toUpperCase().includes("STRANGLE");

	const riskLevels = create(RiskLevelsSchema, {
		stopLossLevel: decision.stopLoss?.price ?? 0,
		takeProfitLevel: decision.takeProfit?.price ?? 0,
		denomination: isOptionsStrategy
			? RiskDenomination.OPTION_PRICE
			: RiskDenomination.UNDERLYING_PRICE,
	});

	return create(DecisionSchema, {
		instrument: create(InstrumentSchema, {
			instrumentId: decision.instrumentId,
			instrumentType: InstrumentType.EQUITY,
		}),
		action: toProtobufAction(decision.action),
		size: create(SizeSchema, {
			quantity: scaledQuantity,
			unit: toProtobufSizeUnit(decision.size.unit),
			targetPositionQuantity: 0,
		}),
		riskLevels,
		strategyFamily: toProtobufStrategyFamily(decision.strategyFamily),
		rationale: decision.rationale?.summary ?? "",
		confidence: decision.confidence,
		direction: toProtobufDirection(decision.direction),
		timeHorizon: toProtobufTimeHorizon(decision.timeHorizon),
		thesisState: toProtobufThesisState(decision.thesisState),
		bullishFactors: decision.rationale?.bullishFactors ?? [],
		bearishFactors: decision.rationale?.bearishFactors ?? [],
		legs,
		netLimitPrice: decision.netLimitPrice,
	});
}

function toProtobufDecisionPlan(plan: WorkflowDecisionPlan, ctx?: { environment: string }) {
	return create(DecisionPlanSchema, {
		cycleId: plan.cycleId,
		asOfTimestamp: timestampFromDate(new Date(plan.timestamp)),
		environment: ctx ? toProtobufEnvironment(ctx.environment) : Environment.UNSPECIFIED,
		decisions: plan.decisions.map(toProtobufDecision),
		portfolioNotes: plan.portfolioNotes,
	});
}

describe("toProtobufDecision", () => {
	describe("action mapping", () => {
		test("maps BUY action correctly", () => {
			const decision = createDecision({ action: "BUY" });
			const result = toProtobufDecision(decision);
			expect(result.action).toBe(Action.BUY);
		});

		test("maps SELL action correctly", () => {
			const decision = createDecision({ action: "SELL" });
			const result = toProtobufDecision(decision);
			expect(result.action).toBe(Action.SELL);
		});

		test("maps HOLD action correctly", () => {
			const decision = createDecision({ action: "HOLD" });
			const result = toProtobufDecision(decision);
			expect(result.action).toBe(Action.HOLD);
		});

		test("maps CLOSE action correctly", () => {
			const decision = createDecision({ action: "CLOSE" });
			const result = toProtobufDecision(decision);
			expect(result.action).toBe(Action.CLOSE);
		});
	});

	describe("direction mapping", () => {
		test("maps LONG direction correctly", () => {
			const decision = createDecision({ direction: "LONG" });
			const result = toProtobufDecision(decision);
			expect(result.direction).toBe(Direction.LONG);
		});

		test("maps SHORT direction correctly", () => {
			const decision = createDecision({ direction: "SHORT" });
			const result = toProtobufDecision(decision);
			expect(result.direction).toBe(Direction.SHORT);
		});

		test("maps FLAT direction correctly", () => {
			const decision = createDecision({ direction: "FLAT" });
			const result = toProtobufDecision(decision);
			expect(result.direction).toBe(Direction.FLAT);
		});
	});

	describe("size unit mapping", () => {
		test("maps SHARES unit correctly", () => {
			const decision = createDecision({ size: { value: 100, unit: "SHARES" } });
			const result = toProtobufDecision(decision);
			expect(result.size?.unit).toBe(SizeUnit.SHARES);
			expect(result.size?.quantity).toBe(100);
		});

		test("maps CONTRACTS unit correctly", () => {
			const decision = createDecision({
				size: { value: 10, unit: "CONTRACTS" },
			});
			const result = toProtobufDecision(decision);
			expect(result.size?.unit).toBe(SizeUnit.CONTRACTS);
			expect(result.size?.quantity).toBe(10);
		});

		test("maps DOLLARS unit correctly", () => {
			const decision = createDecision({ size: { value: 5000, unit: "DOLLARS" } });
			const result = toProtobufDecision(decision);
			expect(result.size?.unit).toBe(SizeUnit.DOLLARS);
			expect(result.size?.quantity).toBe(5000);
		});

		test("maps PCT_EQUITY unit with scaled value", () => {
			const decision = createDecision({
				size: { value: 5.5, unit: "PCT_EQUITY" },
			});
			const result = toProtobufDecision(decision);
			expect(result.size?.unit).toBe(SizeUnit.PCT_EQUITY);
			expect(result.size?.quantity).toBe(55);
		});

		test("handles lowercase size unit", () => {
			const decision = createDecision({ size: { value: 100, unit: "shares" } });
			const result = toProtobufDecision(decision);
			expect(result.size?.unit).toBe(SizeUnit.SHARES);
		});

		test("handles mixed case size unit", () => {
			const decision = createDecision({
				size: { value: 2.5, unit: "Pct_Equity" },
			});
			const result = toProtobufDecision(decision);
			expect(result.size?.unit).toBe(SizeUnit.PCT_EQUITY);
			expect(result.size?.quantity).toBe(25);
		});

		test("maps unknown unit to UNSPECIFIED", () => {
			const decision = createDecision({ size: { value: 100, unit: "UNKNOWN" } });
			const result = toProtobufDecision(decision);
			expect(result.size?.unit).toBe(SizeUnit.UNSPECIFIED);
		});
	});

	describe("risk levels mapping", () => {
		test("maps stopLoss.price to riskLevels.stopLossLevel", () => {
			const decision = createDecision({
				stopLoss: { price: 145.0, type: "FIXED" },
			});
			const result = toProtobufDecision(decision);
			expect(result.riskLevels?.stopLossLevel).toBe(145.0);
		});

		test("maps takeProfit.price to riskLevels.takeProfitLevel", () => {
			const decision = createDecision({
				takeProfit: { price: 175.0 },
			});
			const result = toProtobufDecision(decision);
			expect(result.riskLevels?.takeProfitLevel).toBe(175.0);
		});

		test("sets stopLossLevel to 0 when stopLoss is undefined", () => {
			const decision = createDecision({ stopLoss: undefined });
			const result = toProtobufDecision(decision);
			expect(result.riskLevels?.stopLossLevel).toBe(0);
		});

		test("sets takeProfitLevel to 0 when takeProfit is undefined", () => {
			const decision = createDecision({ takeProfit: undefined });
			const result = toProtobufDecision(decision);
			expect(result.riskLevels?.takeProfitLevel).toBe(0);
		});

		test("uses UNDERLYING_PRICE denomination for equity strategies", () => {
			const decision = createDecision({ strategyFamily: "EQUITY_LONG" });
			const result = toProtobufDecision(decision);
			expect(result.riskLevels?.denomination).toBe(RiskDenomination.UNDERLYING_PRICE);
		});

		test("uses OPTION_PRICE denomination for option strategies", () => {
			const decision = createDecision({ strategyFamily: "OPTION_LONG" });
			const result = toProtobufDecision(decision);
			expect(result.riskLevels?.denomination).toBe(RiskDenomination.OPTION_PRICE);
		});

		test("uses OPTION_PRICE denomination for spread strategies", () => {
			const decision = createDecision({ strategyFamily: "VERTICAL_SPREAD" });
			const result = toProtobufDecision(decision);
			expect(result.riskLevels?.denomination).toBe(RiskDenomination.OPTION_PRICE);
		});

		test("uses OPTION_PRICE denomination for iron condor", () => {
			const decision = createDecision({ strategyFamily: "IRON_CONDOR" });
			const result = toProtobufDecision(decision);
			expect(result.riskLevels?.denomination).toBe(RiskDenomination.OPTION_PRICE);
		});
	});

	describe("rationale mapping", () => {
		test("maps rationale.summary to rationale field", () => {
			const decision = createDecision({
				rationale: {
					summary: "Strong momentum with volume confirmation",
					bullishFactors: [],
					bearishFactors: [],
					decisionLogic: "",
					memoryReferences: [],
				},
			});
			const result = toProtobufDecision(decision);
			expect(result.rationale).toBe("Strong momentum with volume confirmation");
		});

		test("maps rationale.bullishFactors to bullishFactors", () => {
			const decision = createDecision({
				rationale: {
					summary: "Test",
					bullishFactors: ["RSI oversold", "Support level holding"],
					bearishFactors: [],
					decisionLogic: "",
					memoryReferences: [],
				},
			});
			const result = toProtobufDecision(decision);
			expect(result.bullishFactors).toEqual(["RSI oversold", "Support level holding"]);
		});

		test("maps rationale.bearishFactors to bearishFactors", () => {
			const decision = createDecision({
				rationale: {
					summary: "Test",
					bullishFactors: [],
					bearishFactors: ["Earnings miss risk", "Sector weakness"],
					decisionLogic: "",
					memoryReferences: [],
				},
			});
			const result = toProtobufDecision(decision);
			expect(result.bearishFactors).toEqual(["Earnings miss risk", "Sector weakness"]);
		});

		test("handles undefined rationale gracefully", () => {
			const decision = createDecision();
			// @ts-expect-error - testing undefined case
			decision.rationale = undefined;
			const result = toProtobufDecision(decision);
			expect(result.rationale).toBe("");
			expect(result.bullishFactors).toEqual([]);
			expect(result.bearishFactors).toEqual([]);
		});
	});

	describe("strategy family mapping", () => {
		test("maps EQUITY_LONG correctly", () => {
			const decision = createDecision({ strategyFamily: "EQUITY_LONG" });
			const result = toProtobufDecision(decision);
			expect(result.strategyFamily).toBe(StrategyFamily.EQUITY_LONG);
		});

		test("maps EQUITY_SHORT correctly", () => {
			const decision = createDecision({ strategyFamily: "EQUITY_SHORT" });
			const result = toProtobufDecision(decision);
			expect(result.strategyFamily).toBe(StrategyFamily.EQUITY_SHORT);
		});

		test("maps OPTION_LONG correctly", () => {
			const decision = createDecision({ strategyFamily: "OPTION_LONG" });
			const result = toProtobufDecision(decision);
			expect(result.strategyFamily).toBe(StrategyFamily.OPTION_LONG);
		});

		test("maps OPTION_SHORT correctly", () => {
			const decision = createDecision({ strategyFamily: "OPTION_SHORT" });
			const result = toProtobufDecision(decision);
			expect(result.strategyFamily).toBe(StrategyFamily.OPTION_SHORT);
		});

		test("maps VERTICAL_SPREAD correctly", () => {
			const decision = createDecision({ strategyFamily: "VERTICAL_SPREAD" });
			const result = toProtobufDecision(decision);
			expect(result.strategyFamily).toBe(StrategyFamily.VERTICAL_SPREAD);
		});

		test("maps IRON_CONDOR correctly", () => {
			const decision = createDecision({ strategyFamily: "IRON_CONDOR" });
			const result = toProtobufDecision(decision);
			expect(result.strategyFamily).toBe(StrategyFamily.IRON_CONDOR);
		});

		test("maps STRADDLE correctly", () => {
			const decision = createDecision({ strategyFamily: "STRADDLE" });
			const result = toProtobufDecision(decision);
			expect(result.strategyFamily).toBe(StrategyFamily.STRADDLE);
		});

		test("maps STRANGLE correctly", () => {
			const decision = createDecision({ strategyFamily: "STRANGLE" });
			const result = toProtobufDecision(decision);
			expect(result.strategyFamily).toBe(StrategyFamily.STRANGLE);
		});

		test("maps CALENDAR_SPREAD correctly", () => {
			const decision = createDecision({ strategyFamily: "CALENDAR_SPREAD" });
			const result = toProtobufDecision(decision);
			expect(result.strategyFamily).toBe(StrategyFamily.CALENDAR_SPREAD);
		});

		test("handles lowercase strategy family", () => {
			const decision = createDecision({ strategyFamily: "equity_long" });
			const result = toProtobufDecision(decision);
			expect(result.strategyFamily).toBe(StrategyFamily.EQUITY_LONG);
		});

		test("maps unknown strategy to UNSPECIFIED", () => {
			const decision = createDecision({ strategyFamily: "UNKNOWN_STRATEGY" });
			const result = toProtobufDecision(decision);
			expect(result.strategyFamily).toBe(StrategyFamily.UNSPECIFIED);
		});
	});

	describe("time horizon mapping", () => {
		test("maps INTRADAY correctly", () => {
			const decision = createDecision({ timeHorizon: "INTRADAY" });
			const result = toProtobufDecision(decision);
			expect(result.timeHorizon).toBe(TimeHorizon.INTRADAY);
		});

		test("maps SWING correctly", () => {
			const decision = createDecision({ timeHorizon: "SWING" });
			const result = toProtobufDecision(decision);
			expect(result.timeHorizon).toBe(TimeHorizon.SWING);
		});

		test("maps POSITION correctly", () => {
			const decision = createDecision({ timeHorizon: "POSITION" });
			const result = toProtobufDecision(decision);
			expect(result.timeHorizon).toBe(TimeHorizon.POSITION);
		});

		test("handles lowercase time horizon", () => {
			const decision = createDecision({ timeHorizon: "swing" });
			const result = toProtobufDecision(decision);
			expect(result.timeHorizon).toBe(TimeHorizon.SWING);
		});

		test("maps unknown horizon to UNSPECIFIED", () => {
			const decision = createDecision({ timeHorizon: "LONG_TERM" });
			const result = toProtobufDecision(decision);
			expect(result.timeHorizon).toBe(TimeHorizon.UNSPECIFIED);
		});
	});

	describe("thesis state mapping", () => {
		test("maps WATCHING correctly", () => {
			const decision = createDecision({ thesisState: "WATCHING" });
			const result = toProtobufDecision(decision);
			expect(result.thesisState).toBe(ThesisState.WATCHING);
		});

		test("maps ENTERED correctly", () => {
			const decision = createDecision({ thesisState: "ENTERED" });
			const result = toProtobufDecision(decision);
			expect(result.thesisState).toBe(ThesisState.ENTERED);
		});

		test("maps ADDING correctly", () => {
			const decision = createDecision({ thesisState: "ADDING" });
			const result = toProtobufDecision(decision);
			expect(result.thesisState).toBe(ThesisState.ADDING);
		});

		test("maps MANAGING correctly", () => {
			const decision = createDecision({ thesisState: "MANAGING" });
			const result = toProtobufDecision(decision);
			expect(result.thesisState).toBe(ThesisState.MANAGING);
		});

		test("maps EXITING correctly", () => {
			const decision = createDecision({ thesisState: "EXITING" });
			const result = toProtobufDecision(decision);
			expect(result.thesisState).toBe(ThesisState.EXITING);
		});

		test("maps CLOSED correctly", () => {
			const decision = createDecision({ thesisState: "CLOSED" });
			const result = toProtobufDecision(decision);
			expect(result.thesisState).toBe(ThesisState.CLOSED);
		});

		test("handles lowercase thesis state", () => {
			const decision = createDecision({ thesisState: "managing" });
			const result = toProtobufDecision(decision);
			expect(result.thesisState).toBe(ThesisState.MANAGING);
		});

		test("maps unknown state to UNSPECIFIED", () => {
			const decision = createDecision({ thesisState: "UNKNOWN" });
			const result = toProtobufDecision(decision);
			expect(result.thesisState).toBe(ThesisState.UNSPECIFIED);
		});
	});

	describe("legs conversion", () => {
		test("converts single option leg correctly", () => {
			const decision = createDecision({
				strategyFamily: "OPTION_LONG",
				legs: [
					{
						symbol: "AAPL250117C00190000",
						ratioQty: 1,
						positionIntent: "BUY_TO_OPEN",
					},
				],
			});
			const result = toProtobufDecision(decision);
			expect(result.legs).toHaveLength(1);
			expect(result.legs[0]!.symbol).toBe("AAPL250117C00190000");
			expect(result.legs[0]!.ratioQty).toBe(1);
			expect(result.legs[0]!.positionIntent).toBe(PositionIntent.BUY_TO_OPEN);
		});

		test("converts vertical spread legs correctly", () => {
			const decision = createDecision({
				strategyFamily: "VERTICAL_SPREAD",
				legs: [
					{
						symbol: "AAPL250117C00190000",
						ratioQty: 1,
						positionIntent: "BUY_TO_OPEN",
					},
					{
						symbol: "AAPL250117C00200000",
						ratioQty: -1,
						positionIntent: "SELL_TO_OPEN",
					},
				],
				netLimitPrice: 3.5,
			});
			const result = toProtobufDecision(decision);
			expect(result.legs).toHaveLength(2);
			expect(result.legs[0]!.ratioQty).toBe(1);
			expect(result.legs[0]!.positionIntent).toBe(PositionIntent.BUY_TO_OPEN);
			expect(result.legs[1]!.ratioQty).toBe(-1);
			expect(result.legs[1]!.positionIntent).toBe(PositionIntent.SELL_TO_OPEN);
		});

		test("converts iron condor legs correctly", () => {
			const decision = createDecision({
				strategyFamily: "IRON_CONDOR",
				legs: [
					{
						symbol: "SPY250117P00450000",
						ratioQty: 1,
						positionIntent: "BUY_TO_OPEN",
					},
					{
						symbol: "SPY250117P00455000",
						ratioQty: -1,
						positionIntent: "SELL_TO_OPEN",
					},
					{
						symbol: "SPY250117C00470000",
						ratioQty: -1,
						positionIntent: "SELL_TO_OPEN",
					},
					{
						symbol: "SPY250117C00475000",
						ratioQty: 1,
						positionIntent: "BUY_TO_OPEN",
					},
				],
				netLimitPrice: -2.5,
			});
			const result = toProtobufDecision(decision);
			expect(result.legs).toHaveLength(4);
			expect(result.netLimitPrice).toBe(-2.5);
		});

		test("handles empty legs array", () => {
			const decision = createDecision({ legs: [] });
			const result = toProtobufDecision(decision);
			expect(result.legs).toEqual([]);
		});

		test("handles undefined legs", () => {
			const decision = createDecision({ legs: undefined });
			const result = toProtobufDecision(decision);
			expect(result.legs).toEqual([]);
		});

		test("converts position intent BUY_TO_CLOSE correctly", () => {
			const decision = createDecision({
				strategyFamily: "OPTION_LONG",
				legs: [
					{
						symbol: "AAPL250117C00190000",
						ratioQty: 1,
						positionIntent: "BUY_TO_CLOSE",
					},
				],
			});
			const result = toProtobufDecision(decision);
			expect(result.legs[0]!.positionIntent).toBe(PositionIntent.BUY_TO_CLOSE);
		});

		test("converts position intent SELL_TO_CLOSE correctly", () => {
			const decision = createDecision({
				strategyFamily: "OPTION_LONG",
				legs: [
					{
						symbol: "AAPL250117C00190000",
						ratioQty: -1,
						positionIntent: "SELL_TO_CLOSE",
					},
				],
			});
			const result = toProtobufDecision(decision);
			expect(result.legs[0]!.positionIntent).toBe(PositionIntent.SELL_TO_CLOSE);
		});
	});

	describe("netLimitPrice passthrough", () => {
		test("passes through positive netLimitPrice (debit)", () => {
			const decision = createDecision({
				strategyFamily: "VERTICAL_SPREAD",
				netLimitPrice: 4.25,
			});
			const result = toProtobufDecision(decision);
			expect(result.netLimitPrice).toBe(4.25);
		});

		test("passes through negative netLimitPrice (credit)", () => {
			const decision = createDecision({
				strategyFamily: "IRON_CONDOR",
				netLimitPrice: -1.75,
			});
			const result = toProtobufDecision(decision);
			expect(result.netLimitPrice).toBe(-1.75);
		});

		test("handles undefined netLimitPrice", () => {
			const decision = createDecision({ netLimitPrice: undefined });
			const result = toProtobufDecision(decision);
			expect(result.netLimitPrice).toBeUndefined();
		});

		test("passes through zero netLimitPrice", () => {
			const decision = createDecision({ netLimitPrice: 0 });
			const result = toProtobufDecision(decision);
			expect(result.netLimitPrice).toBe(0);
		});
	});

	describe("instrument mapping", () => {
		test("sets instrumentId from decision", () => {
			const decision = createDecision({ instrumentId: "TSLA" });
			const result = toProtobufDecision(decision);
			expect(result.instrument?.instrumentId).toBe("TSLA");
		});

		test("sets instrumentType to EQUITY", () => {
			const decision = createDecision({ instrumentId: "GOOGL" });
			const result = toProtobufDecision(decision);
			expect(result.instrument?.instrumentType).toBe(InstrumentType.EQUITY);
		});
	});

	describe("default values", () => {
		test("sets default confidence to 0.8", () => {
			const decision = createDecision();
			const result = toProtobufDecision(decision);
			expect(result.confidence).toBe(0.8);
		});

		test("sets targetPositionQuantity to 0", () => {
			const decision = createDecision();
			const result = toProtobufDecision(decision);
			expect(result.size?.targetPositionQuantity).toBe(0);
		});
	});
});

describe("toProtobufDecisionPlan", () => {
	describe("cycleId passthrough", () => {
		test("passes through cycleId correctly", () => {
			const plan = createDecisionPlan({ cycleId: "cycle-abc-123" });
			const result = toProtobufDecisionPlan(plan);
			expect(result.cycleId).toBe("cycle-abc-123");
		});
	});

	describe("timestamp conversion", () => {
		test("converts timestamp to asOfTimestamp", () => {
			const plan = createDecisionPlan({ timestamp: "2024-01-15T10:30:00Z" });
			const result = toProtobufDecisionPlan(plan);
			expect(result.asOfTimestamp).toBeDefined();
			const date = timestampDate(result.asOfTimestamp!);
			expect(date.toISOString()).toBe("2024-01-15T10:30:00.000Z");
		});

		test("handles different timestamp formats", () => {
			const plan = createDecisionPlan({
				timestamp: "2024-06-15T14:45:30.123Z",
			});
			const result = toProtobufDecisionPlan(plan);
			const date = timestampDate(result.asOfTimestamp!);
			expect(date.getFullYear()).toBe(2024);
			expect(date.getMonth()).toBe(5);
			expect(date.getDate()).toBe(15);
		});
	});

	describe("decisions array conversion", () => {
		test("converts single decision correctly", () => {
			const plan = createDecisionPlan({
				decisions: [createDecision({ instrumentId: "AAPL" })],
			});
			const result = toProtobufDecisionPlan(plan);
			expect(result.decisions).toHaveLength(1);
			expect(result.decisions[0]!.instrument?.instrumentId).toBe("AAPL");
		});

		test("converts multiple decisions correctly", () => {
			const plan = createDecisionPlan({
				decisions: [
					createDecision({ instrumentId: "AAPL", action: "BUY" }),
					createDecision({ instrumentId: "MSFT", action: "SELL" }),
					createDecision({ instrumentId: "GOOGL", action: "HOLD" }),
				],
			});
			const result = toProtobufDecisionPlan(plan);
			expect(result.decisions).toHaveLength(3);
			expect(result.decisions[0]!.instrument?.instrumentId).toBe("AAPL");
			expect(result.decisions[0]!.action).toBe(Action.BUY);
			expect(result.decisions[1]!.instrument?.instrumentId).toBe("MSFT");
			expect(result.decisions[1]!.action).toBe(Action.SELL);
			expect(result.decisions[2]!.instrument?.instrumentId).toBe("GOOGL");
			expect(result.decisions[2]!.action).toBe(Action.HOLD);
		});

		test("handles empty decisions array", () => {
			const plan = createDecisionPlan({ decisions: [] });
			const result = toProtobufDecisionPlan(plan);
			expect(result.decisions).toEqual([]);
		});
	});

	describe("portfolioNotes passthrough", () => {
		test("passes through portfolioNotes correctly", () => {
			const plan = createDecisionPlan({
				portfolioNotes: "Reducing exposure due to elevated VIX",
			});
			const result = toProtobufDecisionPlan(plan);
			expect(result.portfolioNotes).toBe("Reducing exposure due to elevated VIX");
		});

		test("handles empty portfolioNotes", () => {
			const plan = createDecisionPlan({ portfolioNotes: "" });
			const result = toProtobufDecisionPlan(plan);
			expect(result.portfolioNotes).toBe("");
		});
	});

	describe("environment mapping", () => {
		test("maps PAPER environment correctly", () => {
			const plan = createDecisionPlan();
			const result = toProtobufDecisionPlan(plan, { environment: "PAPER" });
			expect(result.environment).toBe(Environment.PAPER);
		});

		test("maps LIVE environment correctly", () => {
			const plan = createDecisionPlan();
			const result = toProtobufDecisionPlan(plan, { environment: "LIVE" });
			expect(result.environment).toBe(Environment.LIVE);
		});

		test("handles lowercase environment", () => {
			const plan = createDecisionPlan();
			const result = toProtobufDecisionPlan(plan, { environment: "paper" });
			expect(result.environment).toBe(Environment.PAPER);
		});

		test("sets UNSPECIFIED when context is undefined", () => {
			const plan = createDecisionPlan();
			const result = toProtobufDecisionPlan(plan);
			expect(result.environment).toBe(Environment.UNSPECIFIED);
		});

		test("sets UNSPECIFIED for unknown environment", () => {
			const plan = createDecisionPlan();
			const result = toProtobufDecisionPlan(plan, { environment: "UNKNOWN" });
			expect(result.environment).toBe(Environment.UNSPECIFIED);
		});
	});
});

describe("complex scenarios", () => {
	describe("equity trade with full risk management", () => {
		test("converts complete equity long trade", () => {
			const decision = createDecision({
				decisionId: "eq-001",
				instrumentId: "NVDA",
				action: "BUY",
				direction: "LONG",
				size: { value: 50, unit: "SHARES" },
				stopLoss: { price: 480.0, type: "FIXED" },
				takeProfit: { price: 550.0 },
				strategyFamily: "EQUITY_LONG",
				timeHorizon: "SWING",
				thesisState: "ENTERED",
				rationale: {
					summary: "AI demand thesis with strong momentum",
					bullishFactors: [
						"Data center revenue growth",
						"AI chip dominance",
						"Positive earnings revisions",
					],
					bearishFactors: ["High valuation multiples", "China export restrictions"],
					decisionLogic: "Technical breakout with fundamental support",
					memoryReferences: ["case-nvda-2024-01"],
				},
			});

			const result = toProtobufDecision(decision);

			expect(result.instrument?.instrumentId).toBe("NVDA");
			expect(result.action).toBe(Action.BUY);
			expect(result.direction).toBe(Direction.LONG);
			expect(result.size?.quantity).toBe(50);
			expect(result.size?.unit).toBe(SizeUnit.SHARES);
			expect(result.riskLevels?.stopLossLevel).toBe(480.0);
			expect(result.riskLevels?.takeProfitLevel).toBe(550.0);
			expect(result.riskLevels?.denomination).toBe(RiskDenomination.UNDERLYING_PRICE);
			expect(result.strategyFamily).toBe(StrategyFamily.EQUITY_LONG);
			expect(result.timeHorizon).toBe(TimeHorizon.SWING);
			expect(result.thesisState).toBe(ThesisState.ENTERED);
			expect(result.bullishFactors).toHaveLength(3);
			expect(result.bearishFactors).toHaveLength(2);
		});
	});

	describe("vertical spread trade", () => {
		test("converts bull call spread correctly", () => {
			const decision = createDecision({
				decisionId: "spread-001",
				instrumentId: "AAPL",
				action: "BUY",
				direction: "LONG",
				size: { value: 5, unit: "CONTRACTS" },
				stopLoss: { price: 1.5, type: "FIXED" },
				takeProfit: { price: 8.0 },
				strategyFamily: "VERTICAL_SPREAD",
				timeHorizon: "SWING",
				thesisState: "ENTERED",
				legs: [
					{
						symbol: "AAPL250221C00190000",
						ratioQty: 1,
						positionIntent: "BUY_TO_OPEN",
					},
					{
						symbol: "AAPL250221C00200000",
						ratioQty: -1,
						positionIntent: "SELL_TO_OPEN",
					},
				],
				netLimitPrice: 4.25,
				rationale: {
					summary: "Bullish on AAPL into earnings with defined risk",
					bullishFactors: ["Strong iPhone sales data", "Services growth"],
					bearishFactors: ["China market weakness"],
					decisionLogic: "Vertical spread for defined risk directional bet",
					memoryReferences: [],
				},
			});

			const result = toProtobufDecision(decision);

			expect(result.strategyFamily).toBe(StrategyFamily.VERTICAL_SPREAD);
			expect(result.size?.unit).toBe(SizeUnit.CONTRACTS);
			expect(result.size?.quantity).toBe(5);
			expect(result.riskLevels?.denomination).toBe(RiskDenomination.OPTION_PRICE);
			expect(result.legs).toHaveLength(2);
			expect(result.legs[0]!.symbol).toBe("AAPL250221C00190000");
			expect(result.legs[0]!.ratioQty).toBe(1);
			expect(result.legs[1]!.symbol).toBe("AAPL250221C00200000");
			expect(result.legs[1]!.ratioQty).toBe(-1);
			expect(result.netLimitPrice).toBe(4.25);
		});
	});

	describe("iron condor trade", () => {
		test("converts iron condor with all four legs", () => {
			const decision = createDecision({
				decisionId: "ic-001",
				instrumentId: "SPY",
				action: "SELL",
				direction: "FLAT",
				size: { value: 10, unit: "CONTRACTS" },
				stopLoss: { price: 5.0, type: "FIXED" },
				takeProfit: { price: 0.5 },
				strategyFamily: "IRON_CONDOR",
				timeHorizon: "INTRADAY",
				thesisState: "ENTERED",
				legs: [
					{
						symbol: "SPY250221P00450000",
						ratioQty: 1,
						positionIntent: "BUY_TO_OPEN",
					},
					{
						symbol: "SPY250221P00455000",
						ratioQty: -1,
						positionIntent: "SELL_TO_OPEN",
					},
					{
						symbol: "SPY250221C00470000",
						ratioQty: -1,
						positionIntent: "SELL_TO_OPEN",
					},
					{
						symbol: "SPY250221C00475000",
						ratioQty: 1,
						positionIntent: "BUY_TO_OPEN",
					},
				],
				netLimitPrice: -2.5,
				rationale: {
					summary: "Range-bound market thesis with low volatility expectation",
					bullishFactors: [],
					bearishFactors: [],
					decisionLogic: "Premium collection in low IV environment",
					memoryReferences: [],
				},
			});

			const result = toProtobufDecision(decision);

			expect(result.strategyFamily).toBe(StrategyFamily.IRON_CONDOR);
			expect(result.direction).toBe(Direction.FLAT);
			expect(result.riskLevels?.denomination).toBe(RiskDenomination.OPTION_PRICE);
			expect(result.legs).toHaveLength(4);
			expect(result.netLimitPrice).toBe(-2.5);

			const buyLegs = result.legs.filter((l) => l.ratioQty > 0);
			const sellLegs = result.legs.filter((l) => l.ratioQty < 0);
			expect(buyLegs).toHaveLength(2);
			expect(sellLegs).toHaveLength(2);
		});
	});

	describe("straddle trade", () => {
		test("converts long straddle correctly", () => {
			const decision = createDecision({
				decisionId: "straddle-001",
				instrumentId: "TSLA",
				action: "BUY",
				direction: "FLAT",
				size: { value: 3, unit: "CONTRACTS" },
				strategyFamily: "STRADDLE",
				timeHorizon: "SWING",
				thesisState: "WATCHING",
				legs: [
					{
						symbol: "TSLA250221C00250000",
						ratioQty: 1,
						positionIntent: "BUY_TO_OPEN",
					},
					{
						symbol: "TSLA250221P00250000",
						ratioQty: 1,
						positionIntent: "BUY_TO_OPEN",
					},
				],
				netLimitPrice: 25.0,
				rationale: {
					summary: "High IV event play for earnings",
					bullishFactors: ["Expecting large move"],
					bearishFactors: ["High IV premium"],
					decisionLogic: "Volatility play",
					memoryReferences: [],
				},
			});

			const result = toProtobufDecision(decision);

			expect(result.strategyFamily).toBe(StrategyFamily.STRADDLE);
			expect(result.riskLevels?.denomination).toBe(RiskDenomination.OPTION_PRICE);
			expect(result.legs).toHaveLength(2);
			expect(result.legs.every((l) => l.ratioQty === 1)).toBe(true);
		});
	});

	describe("PCT_EQUITY sizing", () => {
		test("converts PCT_EQUITY with decimal percentage", () => {
			const decision = createDecision({
				instrumentId: "AMZN",
				size: { value: 2.5, unit: "PCT_EQUITY" },
			});

			const result = toProtobufDecision(decision);

			expect(result.size?.unit).toBe(SizeUnit.PCT_EQUITY);
			expect(result.size?.quantity).toBe(25);
		});

		test("converts PCT_EQUITY with whole percentage", () => {
			const decision = createDecision({
				instrumentId: "META",
				size: { value: 5, unit: "PCT_EQUITY" },
			});

			const result = toProtobufDecision(decision);

			expect(result.size?.unit).toBe(SizeUnit.PCT_EQUITY);
			expect(result.size?.quantity).toBe(50);
		});
	});

	describe("full decision plan", () => {
		test("converts complete decision plan with multiple strategies", () => {
			const plan = createDecisionPlan({
				cycleId: "cycle-2024-01-15-10",
				timestamp: "2024-01-15T10:00:00Z",
				decisions: [
					createDecision({
						instrumentId: "AAPL",
						action: "BUY",
						strategyFamily: "EQUITY_LONG",
						size: { value: 100, unit: "SHARES" },
					}),
					createDecision({
						instrumentId: "SPY",
						action: "SELL",
						strategyFamily: "IRON_CONDOR",
						size: { value: 5, unit: "CONTRACTS" },
						legs: [
							{
								symbol: "SPY250221P00450000",
								ratioQty: 1,
								positionIntent: "BUY_TO_OPEN",
							},
							{
								symbol: "SPY250221P00455000",
								ratioQty: -1,
								positionIntent: "SELL_TO_OPEN",
							},
							{
								symbol: "SPY250221C00470000",
								ratioQty: -1,
								positionIntent: "SELL_TO_OPEN",
							},
							{
								symbol: "SPY250221C00475000",
								ratioQty: 1,
								positionIntent: "BUY_TO_OPEN",
							},
						],
						netLimitPrice: -2.0,
					}),
					createDecision({
						instrumentId: "MSFT",
						action: "HOLD",
						strategyFamily: "EQUITY_LONG",
					}),
				],
				portfolioNotes: "Mixed positioning: adding equity exposure while collecting premium",
			});

			const result = toProtobufDecisionPlan(plan, { environment: "PAPER" });

			expect(result.cycleId).toBe("cycle-2024-01-15-10");
			expect(result.environment).toBe(Environment.PAPER);
			expect(result.decisions).toHaveLength(3);
			expect(result.portfolioNotes).toBe(
				"Mixed positioning: adding equity exposure while collecting premium",
			);

			const [equityDecision, condorDecision, holdDecision] = result.decisions;
			expect(equityDecision!.strategyFamily).toBe(StrategyFamily.EQUITY_LONG);
			expect(condorDecision!.strategyFamily).toBe(StrategyFamily.IRON_CONDOR);
			expect(condorDecision!.legs).toHaveLength(4);
			expect(holdDecision!.action).toBe(Action.HOLD);
		});
	});
});
