/**
 * Options Module
 *
 * Provides options pricing, Greeks calculation, portfolio exposure analysis,
 * and IV percentile calculation.
 */

export {
	calculateGreeks,
	calculateMoneyness,
	calculateOptionsExposure,
	createEmptyExposure,
	daysToYears,
	formatExposure,
	getMoneyStatus,
	normalCDF,
	normalPDF,
	type OptionGreeks,
	type OptionPosition,
	type OptionsExposure,
	type OptionType,
	type SymbolExposure,
} from "./greeks";

export {
	calculateIVPercentile,
	calculateIVRank,
	createVixProxyProvider,
	DEFAULT_IV_PERCENTILE_CONFIG,
	InMemoryIVHistoryStore,
	type IVHistoryProvider,
	type IVObservation,
	IVPercentileCalculator,
	type IVPercentileConfig,
	type IVPercentileResult,
} from "./ivPercentile";

export {
	buildOptionSymbol,
	type IVSolverInput,
	type IVSolverResult,
	parseOptionSymbol,
	solveIV,
	solveIVFromQuote,
	timeToExpiry,
} from "./ivSolver";

export {
	createRealtimeOptionsProvider,
	type OpraQuoteMessage,
	OpraQuoteMessageSchema,
	type OpraTradeMessage,
	OpraTradeMessageSchema,
	type OptionsDataProvider,
	RealtimeOptionsProvider,
	type RealtimeOptionsProviderConfig,
} from "./realtimeOptionsProvider";
