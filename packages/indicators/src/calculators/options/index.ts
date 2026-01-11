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
  calculateATMIV,
  calculateIVSkew,
  calculateNormalizedSkew,
  calculateSkewTermStructure,
  classifySkew,
  OptionsContractSchema,
  type OptionsChain,
  type OptionsContract,
  type IVSkewResult,
  type SkewLevel,
  type SkewTermStructure,
} from "./iv-skew";

export {
  calculateAggregatedPutCallRatio,
  calculatePutCallRatio,
  calculateRelativePCR,
  classifyPCRSentiment,
  isExtremePCR,
  type AggregatedPutCallRatio,
  type PCRSentiment,
  type PutCallRatioResult,
} from "./put-call-ratio";

export {
  calculateParkinsonVolatility,
  calculateRealizedVolatility,
  calculateVRP,
  calculateVRPPercentile,
  calculateVRPTermStructure,
  calculateVRPWithParkinson,
  classifyVRPLevel,
  type VRPLevel,
  type VRPResult,
  type VRPTermStructure,
} from "./vrp";

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
  aggregateGreeks,
  aggregateGreeksForUnderlying,
  calculateDeltaNeutralHedge,
  calculateGammaScalpLevel,
  calculatePortfolioRiskSummary,
  OptionPositionSchema,
  type AggregatedGreeksResult,
  type OptionPosition,
  type PortfolioRiskSummary,
  type StockPosition,
  type UnderlyingGreeks,
} from "./greeks-aggregator";
