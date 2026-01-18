/**
 * @cream/prediction-markets
 *
 * Prediction markets integration for Cream trading system.
 * Aggregates probability data from Kalshi and Polymarket to provide
 * macro-level signals for trading decisions.
 *
 * @example
 * ```typescript
 * import {
 *   PredictionMarketEventSchema,
 *   PredictionMarketScoresSchema,
 *   type PredictionMarketEvent,
 *   type PredictionMarketScores,
 * } from "@cream/prediction-markets";
 * ```
 */

export const PACKAGE_NAME = "@cream/prediction-markets";
export const VERSION = "0.0.1";

// ============================================
// Schema & Type Exports (from @cream/domain)
// ============================================

export {
	// Aggregated data
	type AggregatedPredictionData,
	AggregatedPredictionDataSchema,
	// Helper functions
	createEmptyPredictionScores,
	getFedDirection,
	hasHighMacroUncertainty,
	hasHighPolicyRisk,
	// Type aliases for convenience
	type MarketOutcome,
	type MarketType,
	type Platform,
	// Core types
	type PredictionMarketEvent,
	PredictionMarketEventSchema,
	type PredictionMarketPayload,
	PredictionMarketPayloadSchema,
	type PredictionMarketScores,
	PredictionMarketScoresSchema,
	PredictionMarketType,
	type PredictionOutcome,
	PredictionOutcomeSchema,
	PredictionPlatform,
	toNumericScores,
} from "./types";

// ============================================
// Provider & Error Exports
// ============================================

export {
	// Error classes
	AuthenticationError,
	PredictionMarketError,
	// Provider interface
	type PredictionMarketProvider,
	RateLimitError,
} from "./types";

// ============================================
// Provider Exports
// ============================================

export {
	createKalshiClient,
	createKalshiClientFromEnv,
	KALSHI_RATE_LIMITS,
	KalshiClient,
	type KalshiClientOptions,
	type KalshiEvent,
	KalshiEventSchema,
	type KalshiMarket,
	KalshiMarketSchema,
	MARKET_TYPE_TO_SERIES,
} from "./providers/kalshi";

export {
	type ClobOrderbook,
	ClobOrderbookSchema,
	type ClobPrice,
	ClobPriceSchema,
	createPolymarketClient,
	createPolymarketClientFromEnv,
	DEFAULT_SEARCH_QUERIES,
	POLYMARKET_CLOB_URL,
	POLYMARKET_GAMMA_URL,
	POLYMARKET_RATE_LIMITS,
	PolymarketClient,
	type PolymarketClientOptions,
	type PolymarketEvent,
	PolymarketEventSchema,
	type PolymarketMarket,
	PolymarketMarketSchema,
} from "./providers/polymarket";

// ============================================
// Aggregator Exports
// ============================================

export {
	AGGREGATOR_VERSION,
	type ArbitrageAlert,
	ArbitrageDetector,
	type ArbitrageDetectorConfig,
	type ArbitrageSummary,
	createUnifiedClient,
	DEFAULT_ARBITRAGE_CONFIG,
	DEFAULT_MATCHER_CONFIG,
	DEFAULT_UNIFIED_CONFIG,
	type EconomicDataMarket,
	type FedRateMarket,
	type MacroRiskSignals,
	MarketMatcher,
	type MarketMatcherConfig,
	type MatchedMarket,
	type UnifiedClientConfig,
	type UnifiedMarketData,
	UnifiedPredictionMarketClient,
} from "./aggregator";

// ============================================
// Transformer Exports
// ============================================

export {
	INSTRUMENT_MAPPING,
	type InstrumentMappingConfig,
	mapToRelatedInstruments,
	transformScoresToNumeric,
	transformToExternalEvent,
	transformToExternalEvents,
} from "./transformers";

// ============================================
// Cache Exports
// ============================================

export {
	type CacheStats,
	createMarketCache,
	MarketCache,
	type MarketCacheConfig,
} from "./cache";

// ============================================
// Sector Mapping Exports
// ============================================

export {
	findRelatedInstruments as findSectorInstruments,
	findSectorMatches,
	getAggregateImpact,
	getPrimarySector,
	getSectorETFs,
	type ImpactDirection,
	isHighVolatilityMarket,
	SECTOR_MAPPINGS,
	type Sector,
	type SectorMarketMapping,
	type SectorMatchResult,
	type VolatilityExpectation,
} from "./mappings";

// ============================================
// Streaming Exports
// ============================================

export {
	createStreamingServiceFromConfig,
	createUnifiedStreamingService,
	type Platform as StreamingPlatform,
	type StreamingCallback,
	type StreamingConfig,
	type StreamingMarketUpdate,
	UnifiedStreamingService,
} from "./streaming";

// ============================================
// WebSocket Exports
// ============================================

export {
	createKalshiWebSocketClient,
	KALSHI_DEMO_WEBSOCKET_URL,
	KALSHI_WEBSOCKET_URL,
	type KalshiWebSocketCallback,
	type KalshiWebSocketChannel,
	KalshiWebSocketClient,
	type KalshiWebSocketConfig,
	type KalshiWebSocketMessage,
} from "./providers/kalshi/websocket";

export {
	createPolymarketWebSocketClient,
	POLYMARKET_WEBSOCKET_URL,
	type PolymarketWebSocketCallback,
	PolymarketWebSocketClient,
	type PolymarketWebSocketConfig,
	type PolymarketWebSocketMessage,
} from "./providers/polymarket/websocket";
