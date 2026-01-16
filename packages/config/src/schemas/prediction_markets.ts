/**
 * Prediction Markets Configuration Schema
 *
 * Configuration for prediction market integrations with Kalshi and Polymarket.
 * Provides probability data for macro-level trading signals.
 *
 * @see docs/plans/18-prediction-markets.md for full specification
 */

import { z } from "zod";

// ============================================
// Kalshi Rate Limit Tier
// ============================================

/**
 * Kalshi API rate limit tier
 *
 * Determines request limits:
 * - basic: 10 req/s
 * - advanced: 25 req/s
 * - premier: 50 req/s
 * - prime: 100 req/s
 */
export const KalshiRateLimitTier = z.enum(["basic", "advanced", "premier", "prime"]);
export type KalshiRateLimitTier = z.infer<typeof KalshiRateLimitTier>;

// ============================================
// Kalshi Configuration
// ============================================

/**
 * Kalshi WebSocket configuration
 */
export const KalshiWebSocketConfigSchema = z.object({
	/**
	 * Enable WebSocket connection for real-time updates
	 * Default: false
	 */
	enabled: z.boolean().default(false),

	/**
	 * Reconnection interval in milliseconds
	 * Default: 5000
	 */
	reconnect_interval_ms: z.number().int().positive().default(5000),
});
export type KalshiWebSocketConfig = z.infer<typeof KalshiWebSocketConfigSchema>;

/**
 * Kalshi API configuration
 */
export const KalshiConfigSchema = z.object({
	/**
	 * Enable Kalshi integration
	 * Default: true
	 */
	enabled: z.boolean().default(true),

	/**
	 * Kalshi API key ID
	 * Env: KALSHI_API_KEY_ID
	 */
	api_key_id: z.string().optional(),

	/**
	 * Path to RSA private key file for authentication
	 * Env: KALSHI_PRIVATE_KEY_PATH
	 */
	private_key_path: z.string().optional(),

	/**
	 * Kalshi API base URL
	 * Default: https://api.elections.kalshi.com/trade-api/v2
	 */
	base_path: z.string().url().default("https://api.elections.kalshi.com/trade-api/v2"),

	/**
	 * Rate limit tier for request throttling
	 * Default: basic
	 */
	rate_limit_tier: KalshiRateLimitTier.default("basic"),

	/**
	 * Market series to subscribe to
	 * Default: KXFED, KXCPI, KXGDP, KXJOBS
	 */
	subscribed_series: z.array(z.string()).default(["KXFED", "KXCPI", "KXGDP", "KXJOBS"]),

	/**
	 * WebSocket configuration
	 */
	websocket: KalshiWebSocketConfigSchema.optional().transform((v) =>
		KalshiWebSocketConfigSchema.parse(v ?? {})
	),
});
export type KalshiConfig = z.infer<typeof KalshiConfigSchema>;

// ============================================
// Polymarket Configuration
// ============================================

/**
 * Polymarket API configuration
 */
export const PolymarketConfigSchema = z.object({
	/**
	 * Enable Polymarket integration
	 * Default: false
	 */
	enabled: z.boolean().default(false),

	/**
	 * Polymarket CLOB API endpoint
	 * Default: https://clob.polymarket.com
	 */
	clob_endpoint: z.string().url().default("https://clob.polymarket.com"),

	/**
	 * Polymarket Gamma API endpoint
	 * Default: https://gamma-api.polymarket.com
	 */
	gamma_endpoint: z.string().url().default("https://gamma-api.polymarket.com"),

	/**
	 * Search queries for market discovery
	 * Default: Federal Reserve, inflation, recession
	 */
	search_queries: z.array(z.string()).default(["Federal Reserve", "inflation", "recession"]),
});
export type PolymarketConfig = z.infer<typeof PolymarketConfigSchema>;

// ============================================
// Signal Processing Configuration
// ============================================

/**
 * Market age filter configuration
 */
export const MaxMarketAgeConfigSchema = z.object({
	/**
	 * Maximum age of markets to consider (hours)
	 * Default: 168 (7 days)
	 */
	hours: z.number().int().positive().default(168),
});
export type MaxMarketAgeConfig = z.infer<typeof MaxMarketAgeConfigSchema>;

/**
 * Signal processing configuration
 */
export const SignalsConfigSchema = z.object({
	/**
	 * How often to refresh prediction data (minutes)
	 * Default: 15
	 */
	refresh_interval_minutes: z.number().int().positive().default(15),

	/**
	 * Minimum liquidity score to consider a market (0-1)
	 * Default: 0.5
	 */
	min_liquidity_score: z.number().min(0).max(1).default(0.5),

	/**
	 * Maximum market age filter
	 */
	max_market_age: MaxMarketAgeConfigSchema.optional().transform((v) =>
		MaxMarketAgeConfigSchema.parse(v ?? {})
	),
});
export type SignalsConfig = z.infer<typeof SignalsConfigSchema>;

// ============================================
// Risk Thresholds Configuration
// ============================================

/**
 * Pre-event position reduction configuration
 */
export const PreEventPositionReductionConfigSchema = z.object({
	/**
	 * Hours before event to start reducing positions
	 * Default: 48
	 */
	hours_before_event: z.number().int().positive().default(48),

	/**
	 * Uncertainty threshold to trigger reduction (0-1)
	 * Default: 0.4
	 */
	uncertainty_threshold: z.number().min(0).max(1).default(0.4),

	/**
	 * Maximum position size as percentage of normal
	 * Default: 0.5 (50%)
	 */
	max_position_pct: z.number().min(0).max(1).default(0.5),
});
export type PreEventPositionReductionConfig = z.infer<typeof PreEventPositionReductionConfigSchema>;

/**
 * Risk thresholds configuration
 */
export const RiskThresholdsConfigSchema = z.object({
	/**
	 * Macro uncertainty warning threshold (0-1)
	 * Default: 0.5
	 */
	macro_uncertainty_warning: z.number().min(0).max(1).default(0.5),

	/**
	 * Macro uncertainty critical threshold (0-1)
	 * Default: 0.7
	 */
	macro_uncertainty_critical: z.number().min(0).max(1).default(0.7),

	/**
	 * Policy event risk warning threshold (0-1)
	 * Default: 0.4
	 */
	policy_event_risk_warning: z.number().min(0).max(1).default(0.4),

	/**
	 * Pre-event position reduction settings
	 */
	pre_event_position_reduction: PreEventPositionReductionConfigSchema.optional().transform((v) =>
		PreEventPositionReductionConfigSchema.parse(v ?? {})
	),
});
export type RiskThresholdsConfig = z.infer<typeof RiskThresholdsConfigSchema>;

// ============================================
// Caching Configuration
// ============================================

/**
 * Caching configuration
 */
export const CachingConfigSchema = z.object({
	/**
	 * In-memory cache TTL (minutes)
	 * Default: 5
	 */
	in_memory_ttl_minutes: z.number().int().positive().default(5),

	/**
	 * Persist cached data to PostgreSQL
	 * Default: true
	 */
	persist_to_database: z.boolean().default(true),

	/**
	 * Data retention period (days)
	 * Default: 365
	 */
	retention_days: z.number().int().positive().default(365),
});
export type CachingConfig = z.infer<typeof CachingConfigSchema>;

// ============================================
// Complete Prediction Markets Configuration
// ============================================

/**
 * Complete prediction markets configuration
 */
export const PredictionMarketsConfigSchema = z.object({
	/**
	 * Enable prediction markets integration
	 * Default: true
	 */
	enabled: z.boolean().default(true),

	/**
	 * Kalshi API configuration
	 */
	kalshi: KalshiConfigSchema.optional().transform((v) => KalshiConfigSchema.parse(v ?? {})),

	/**
	 * Polymarket API configuration
	 */
	polymarket: PolymarketConfigSchema.optional().transform((v) =>
		PolymarketConfigSchema.parse(v ?? {})
	),

	/**
	 * Signal processing configuration
	 */
	signals: SignalsConfigSchema.optional().transform((v) => SignalsConfigSchema.parse(v ?? {})),

	/**
	 * Risk thresholds for macro uncertainty
	 */
	risk_thresholds: RiskThresholdsConfigSchema.optional().transform((v) =>
		RiskThresholdsConfigSchema.parse(v ?? {})
	),

	/**
	 * Caching configuration
	 */
	caching: CachingConfigSchema.optional().transform((v) => CachingConfigSchema.parse(v ?? {})),
});
export type PredictionMarketsConfig = z.infer<typeof PredictionMarketsConfigSchema>;

// ============================================
// Helpers
// ============================================

/**
 * Create default prediction markets configuration
 */
export function createDefaultPredictionMarketsConfig(): PredictionMarketsConfig {
	return PredictionMarketsConfigSchema.parse({});
}

/**
 * Check if any prediction market provider is enabled
 */
export function hasEnabledProvider(config: PredictionMarketsConfig): boolean {
	return config.enabled && (config.kalshi.enabled || config.polymarket.enabled);
}
