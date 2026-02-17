export const validEquityDecision = {
	instrument: {
		instrumentId: "AAPL",
		instrumentType: "EQUITY" as const,
	},
	action: "INCREASE" as const,
	size: {
		quantity: 250,
		unit: "SHARES" as const,
		targetPositionQuantity: 500,
	},
	orderPlan: {
		entryOrderType: "LIMIT" as const,
		entryLimitPrice: 201.15,
		exitOrderType: "MARKET" as const,
		timeInForce: "DAY" as const,
		executionTactic: "",
		executionParams: {},
	},
	riskLevels: {
		stopLossLevel: 195.0,
		takeProfitLevel: 212.5,
		denomination: "UNDERLYING_PRICE" as const,
	},
	strategyFamily: "TREND" as const,
	rationale: "Regime=BULL_TREND; trend metrics strengthening",
	confidence: 0.71,
	references: {
		usedIndicators: ["cfg:trend_strength"],
		memoryCaseIds: ["td_0182"],
		eventIds: [],
	},
};

export const validOptionDecision = {
	instrument: {
		instrumentId: "SPY_2026-03-20_450_C",
		instrumentType: "OPTION" as const,
		optionContract: {
			underlyingSymbol: "SPY",
			expirationDate: "2026-03-20",
			strike: 450.0,
			right: "CALL" as const,
			multiplier: 100,
		},
	},
	action: "BUY" as const,
	size: {
		quantity: 5,
		unit: "CONTRACTS" as const,
		targetPositionQuantity: 5,
	},
	orderPlan: {
		entryOrderType: "LIMIT" as const,
		entryLimitPrice: 12.5,
		exitOrderType: "MARKET" as const,
		timeInForce: "DAY" as const,
	},
	riskLevels: {
		stopLossLevel: 445.0,
		takeProfitLevel: 465.0,
		denomination: "UNDERLYING_PRICE" as const,
	},
	strategyFamily: "TREND" as const,
	rationale: "SPY in BULL_TREND; delta exposure adds to portfolio bias",
	confidence: 0.65,
};

export const validDecisionPlan = {
	cycleId: "2026-01-04T15:00:00Z",
	asOfTimestamp: "2026-01-04T15:00:00Z",
	environment: "LIVE" as const,
	decisions: [validEquityDecision],
	portfolioNotes: "Increase trend sleeve via AAPL equity",
};
