/**
 * Tests for prediction markets configuration schema
 */

import { describe, expect, it } from "bun:test";
import {
	CachingConfigSchema,
	createDefaultPredictionMarketsConfig,
	hasEnabledProvider,
	KalshiConfigSchema,
	KalshiRateLimitTier,
	KalshiWebSocketConfigSchema,
	PolymarketConfigSchema,
	PredictionMarketsConfigSchema,
	PreEventPositionReductionConfigSchema,
	RiskThresholdsConfigSchema,
	SignalsConfigSchema,
} from "./prediction_markets";

describe("KalshiRateLimitTier", () => {
	it("should accept valid tiers", () => {
		expect(KalshiRateLimitTier.parse("basic")).toBe("basic");
		expect(KalshiRateLimitTier.parse("advanced")).toBe("advanced");
		expect(KalshiRateLimitTier.parse("premier")).toBe("premier");
		expect(KalshiRateLimitTier.parse("prime")).toBe("prime");
	});

	it("should reject invalid tiers", () => {
		expect(() => KalshiRateLimitTier.parse("enterprise")).toThrow();
	});
});

describe("KalshiWebSocketConfigSchema", () => {
	it("should apply defaults", () => {
		const result = KalshiWebSocketConfigSchema.parse({});
		expect(result.enabled).toBe(false);
		expect(result.reconnect_interval_ms).toBe(5000);
	});

	it("should accept custom values", () => {
		const result = KalshiWebSocketConfigSchema.parse({
			enabled: true,
			reconnect_interval_ms: 10000,
		});
		expect(result.enabled).toBe(true);
		expect(result.reconnect_interval_ms).toBe(10000);
	});
});

describe("KalshiConfigSchema", () => {
	it("should apply defaults", () => {
		const result = KalshiConfigSchema.parse({});
		expect(result.enabled).toBe(true);
		expect(result.base_path).toBe("https://api.elections.kalshi.com/trade-api/v2");
		expect(result.rate_limit_tier).toBe("basic");
		expect(result.subscribed_series).toEqual(["KXFED", "KXCPI", "KXGDP", "KXJOBS"]);
		expect(result.websocket.enabled).toBe(false);
	});

	it("should accept API credentials", () => {
		const result = KalshiConfigSchema.parse({
			api_key_id: "my-key-id",
			private_key_path: "/path/to/key.pem",
		});
		expect(result.api_key_id).toBe("my-key-id");
		expect(result.private_key_path).toBe("/path/to/key.pem");
	});

	it("should accept custom subscribed series", () => {
		const result = KalshiConfigSchema.parse({
			subscribed_series: ["KXFED", "KXPCE"],
		});
		expect(result.subscribed_series).toEqual(["KXFED", "KXPCE"]);
	});

	it("should reject invalid base_path URL", () => {
		expect(() => KalshiConfigSchema.parse({ base_path: "not-a-url" })).toThrow();
	});
});

describe("PolymarketConfigSchema", () => {
	it("should apply defaults", () => {
		const result = PolymarketConfigSchema.parse({});
		expect(result.enabled).toBe(false);
		expect(result.clob_endpoint).toBe("https://clob.polymarket.com");
		expect(result.gamma_endpoint).toBe("https://gamma-api.polymarket.com");
		expect(result.search_queries).toEqual(["Federal Reserve", "inflation", "recession"]);
	});

	it("should accept custom search queries", () => {
		const result = PolymarketConfigSchema.parse({
			enabled: true,
			search_queries: ["tariff", "election"],
		});
		expect(result.enabled).toBe(true);
		expect(result.search_queries).toEqual(["tariff", "election"]);
	});
});

describe("SignalsConfigSchema", () => {
	it("should apply defaults", () => {
		const result = SignalsConfigSchema.parse({});
		expect(result.refresh_interval_minutes).toBe(15);
		expect(result.min_liquidity_score).toBe(0.5);
		expect(result.max_market_age.hours).toBe(168);
	});

	it("should reject liquidity score outside 0-1", () => {
		expect(() => SignalsConfigSchema.parse({ min_liquidity_score: 1.5 })).toThrow();
		expect(() => SignalsConfigSchema.parse({ min_liquidity_score: -0.1 })).toThrow();
	});
});

describe("PreEventPositionReductionConfigSchema", () => {
	it("should apply defaults", () => {
		const result = PreEventPositionReductionConfigSchema.parse({});
		expect(result.hours_before_event).toBe(48);
		expect(result.uncertainty_threshold).toBe(0.4);
		expect(result.max_position_pct).toBe(0.5);
	});

	it("should accept custom values", () => {
		const result = PreEventPositionReductionConfigSchema.parse({
			hours_before_event: 72,
			uncertainty_threshold: 0.3,
			max_position_pct: 0.25,
		});
		expect(result.hours_before_event).toBe(72);
		expect(result.uncertainty_threshold).toBe(0.3);
		expect(result.max_position_pct).toBe(0.25);
	});
});

describe("RiskThresholdsConfigSchema", () => {
	it("should apply defaults", () => {
		const result = RiskThresholdsConfigSchema.parse({});
		expect(result.macro_uncertainty_warning).toBe(0.5);
		expect(result.macro_uncertainty_critical).toBe(0.7);
		expect(result.policy_event_risk_warning).toBe(0.4);
	});

	it("should reject thresholds outside 0-1", () => {
		expect(() => RiskThresholdsConfigSchema.parse({ macro_uncertainty_warning: 1.5 })).toThrow();
	});
});

describe("CachingConfigSchema", () => {
	it("should apply defaults", () => {
		const result = CachingConfigSchema.parse({});
		expect(result.in_memory_ttl_minutes).toBe(5);
		expect(result.persist_to_database).toBe(true);
		expect(result.retention_days).toBe(365);
	});

	it("should accept custom values", () => {
		const result = CachingConfigSchema.parse({
			in_memory_ttl_minutes: 10,
			persist_to_database: false,
			retention_days: 90,
		});
		expect(result.in_memory_ttl_minutes).toBe(10);
		expect(result.persist_to_database).toBe(false);
		expect(result.retention_days).toBe(90);
	});
});

describe("PredictionMarketsConfigSchema", () => {
	it("should apply all defaults", () => {
		const result = PredictionMarketsConfigSchema.parse({});
		expect(result.enabled).toBe(true);
		expect(result.kalshi.enabled).toBe(true);
		expect(result.polymarket.enabled).toBe(false);
		expect(result.signals.refresh_interval_minutes).toBe(15);
		expect(result.risk_thresholds.macro_uncertainty_warning).toBe(0.5);
		expect(result.caching.persist_to_database).toBe(true);
	});

	it("should accept full configuration", () => {
		const config = {
			enabled: true,
			kalshi: {
				enabled: true,
				api_key_id: "my-key",
				rate_limit_tier: "advanced" as const,
				websocket: {
					enabled: true,
				},
			},
			polymarket: {
				enabled: true,
				search_queries: ["Fed", "recession"],
			},
			signals: {
				refresh_interval_minutes: 5,
				min_liquidity_score: 0.7,
			},
			risk_thresholds: {
				macro_uncertainty_critical: 0.8,
			},
			caching: {
				retention_days: 180,
			},
		};

		const result = PredictionMarketsConfigSchema.parse(config);
		expect(result.kalshi.rate_limit_tier).toBe("advanced");
		expect(result.kalshi.websocket.enabled).toBe(true);
		expect(result.polymarket.enabled).toBe(true);
		expect(result.signals.min_liquidity_score).toBe(0.7);
		expect(result.risk_thresholds.macro_uncertainty_critical).toBe(0.8);
		expect(result.caching.retention_days).toBe(180);
	});

	it("should allow disabling the entire integration", () => {
		const result = PredictionMarketsConfigSchema.parse({ enabled: false });
		expect(result.enabled).toBe(false);
	});
});

describe("createDefaultPredictionMarketsConfig", () => {
	it("should return default configuration", () => {
		const config = createDefaultPredictionMarketsConfig();
		expect(config.enabled).toBe(true);
		expect(config.kalshi.enabled).toBe(true);
		expect(config.polymarket.enabled).toBe(false);
	});
});

describe("hasEnabledProvider", () => {
	it("should return true when Kalshi is enabled", () => {
		const config = PredictionMarketsConfigSchema.parse({
			kalshi: { enabled: true },
		});
		expect(hasEnabledProvider(config)).toBe(true);
	});

	it("should return true when Polymarket is enabled", () => {
		const config = PredictionMarketsConfigSchema.parse({
			kalshi: { enabled: false },
			polymarket: { enabled: true },
		});
		expect(hasEnabledProvider(config)).toBe(true);
	});

	it("should return false when integration is disabled", () => {
		const config = PredictionMarketsConfigSchema.parse({
			enabled: false,
			kalshi: { enabled: true },
		});
		expect(hasEnabledProvider(config)).toBe(false);
	});

	it("should return false when no providers enabled", () => {
		const config = PredictionMarketsConfigSchema.parse({
			kalshi: { enabled: false },
			polymarket: { enabled: false },
		});
		expect(hasEnabledProvider(config)).toBe(false);
	});
});
