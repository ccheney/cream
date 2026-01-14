/**
 * Options Indicator Calculators
 *
 * Includes:
 * - IV Skew
 * - Term Structure Slope
 * - VRP (Volatility Risk Premium)
 * - Put/Call Ratio
 * - Greeks Aggregator
 */

export {
	type AggregatedGreeksResult,
	aggregateGreeks,
	aggregateGreeksForUnderlying,
	calculateDeltaNeutralHedge,
	calculateGammaScalpLevel,
	calculatePortfolioRiskSummary,
	type OptionPosition,
	OptionPositionSchema,
	type PortfolioRiskSummary,
	type StockPosition,
	type UnderlyingGreeks,
} from "./greeks-aggregator";
export {
	calculateATMIV,
	calculateIVSkew,
	calculateNormalizedSkew,
	calculateSkewTermStructure,
	classifySkew,
	type IVSkewResult,
	type OptionsChain,
	type OptionsContract,
	OptionsContractSchema,
	type SkewLevel,
	type SkewTermStructure,
} from "./iv-skew";
export {
	type AggregatedPutCallRatio,
	calculateAggregatedPutCallRatio,
	calculatePutCallRatio,
	calculateRelativePCR,
	classifyPCRSentiment,
	isExtremePCR,
	type PCRSentiment,
	type PutCallRatioResult,
} from "./put-call-ratio";

export {
	buildTermStructure,
	calculateTermStructureCurvature,
	calculateTermStructureSlope,
	calculateTermStructureSlopeSimple,
	calculateWeightedAverageIV,
	classifyTermStructureShape,
	findTermStructureKinks,
	type TermStructurePoint,
	type TermStructureResult,
	type TermStructureShape,
} from "./term-structure";
export {
	// Note: calculateParkinsonVolatility and calculateRealizedVolatility are not exported
	// to avoid conflicts with price/volatility.ts. Use those for standalone volatility calculations.
	calculateVRP,
	calculateVRPPercentile,
	calculateVRPTermStructure,
	calculateVRPWithParkinson,
	classifyVRPLevel,
	type VRPLevel,
	type VRPResult,
	type VRPTermStructure,
} from "./vrp";
