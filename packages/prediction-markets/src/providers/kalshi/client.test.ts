/**
 * Tests for Kalshi API client
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { PredictionMarketEvent } from "@cream/domain";
import type { AuthenticationError } from "../../index";
import {
	createKalshiClientFromEnv,
	KALSHI_RATE_LIMITS,
	KalshiClient,
	KalshiEventSchema,
	KalshiMarketSchema,
	MARKET_TYPE_TO_SERIES,
} from "./client";

const mockKalshiMarket = {
	ticker: "KXFED-26JAN29-T50",
	event_ticker: "KXFED-26JAN29",
	series_ticker: "KXFED",
	title: "Will the Fed cut rates by 50bps in January 2026?",
	subtitle: "FOMC January 2026 Decision",
	status: "open",
	yes_bid: 55,
	yes_ask: 57,
	no_bid: 43,
	no_ask: 45,
	last_price: 56,
	volume: 100000,
	volume_24h: 15000,
	open_interest: 50000,
	close_time: "2026-01-29T19:00:00Z",
	expiration_time: "2026-01-29T21:00:00Z",
};

const mockKalshiEvent = {
	event_ticker: "KXFED-26JAN29",
	series_ticker: "KXFED",
	title: "Federal Reserve January 2026 Decision",
	category: "Economics",
	markets: [mockKalshiMarket],
};

const createScoringClient = () =>
	new KalshiClient({
		apiKeyId: "test-key",
		privateKeyPem: "test",
	});

function createPredictionEvent({
	id,
	marketType,
	marketQuestion,
	outcomes,
	relatedInstrumentIds = [],
	eventTime = "2026-06-30T00:00:00Z",
}: {
	id: string;
	marketType: PredictionMarketEvent["payload"]["marketType"];
	marketQuestion: string;
	outcomes: PredictionMarketEvent["payload"]["outcomes"];
	relatedInstrumentIds?: string[];
	eventTime?: string;
}): PredictionMarketEvent {
	return {
		eventId: `pm_kalshi_${id}`,
		eventType: "PREDICTION_MARKET",
		eventTime,
		payload: {
			platform: "KALSHI",
			marketType,
			marketTicker: id,
			marketQuestion,
			outcomes,
			lastUpdated: "2026-01-04T15:00:00Z",
		},
		relatedInstrumentIds,
	};
}

describe("KALSHI_RATE_LIMITS", () => {
	it("should have all tiers defined", () => {
		expect(KALSHI_RATE_LIMITS.basic).toBeDefined();
		expect(KALSHI_RATE_LIMITS.advanced).toBeDefined();
		expect(KALSHI_RATE_LIMITS.premier).toBeDefined();
		expect(KALSHI_RATE_LIMITS.prime).toBeDefined();
	});

	it("should have increasing limits per tier", () => {
		expect(KALSHI_RATE_LIMITS.basic.read).toBeLessThan(KALSHI_RATE_LIMITS.advanced.read);
		expect(KALSHI_RATE_LIMITS.advanced.read).toBeLessThan(KALSHI_RATE_LIMITS.premier.read);
		expect(KALSHI_RATE_LIMITS.premier.read).toBeLessThan(KALSHI_RATE_LIMITS.prime.read);
	});

	it("should have correct values", () => {
		expect(KALSHI_RATE_LIMITS.basic.read).toBe(20);
		expect(KALSHI_RATE_LIMITS.basic.write).toBe(10);
		expect(KALSHI_RATE_LIMITS.prime.read).toBe(400);
		expect(KALSHI_RATE_LIMITS.prime.write).toBe(400);
	});
});

describe("MARKET_TYPE_TO_SERIES", () => {
	it("should map FED_RATE to correct series", () => {
		expect(MARKET_TYPE_TO_SERIES.FED_RATE).toContain("KXFED");
		expect(MARKET_TYPE_TO_SERIES.FED_RATE).toContain("KXFOMC");
	});

	it("should map ECONOMIC_DATA to correct series", () => {
		expect(MARKET_TYPE_TO_SERIES.ECONOMIC_DATA).toContain("KXCPI");
		expect(MARKET_TYPE_TO_SERIES.ECONOMIC_DATA).toContain("KXGDP");
		expect(MARKET_TYPE_TO_SERIES.ECONOMIC_DATA).toContain("KXJOBS");
		expect(MARKET_TYPE_TO_SERIES.ECONOMIC_DATA).toContain("KXPCE");
	});

	it("should map RECESSION and ELECTION to correct series", () => {
		expect(MARKET_TYPE_TO_SERIES.RECESSION).toContain("KXREC");
		expect(MARKET_TYPE_TO_SERIES.ELECTION).toContain("KXPRES");
	});

	it("should keep GEOPOLITICAL and REGULATORY empty", () => {
		expect(MARKET_TYPE_TO_SERIES.GEOPOLITICAL).toEqual([]);
		expect(MARKET_TYPE_TO_SERIES.REGULATORY).toEqual([]);
	});
});

describe("KalshiMarketSchema", () => {
	it("should parse valid market data", () => {
		const result = KalshiMarketSchema.parse(mockKalshiMarket);
		expect(result.ticker).toBe("KXFED-26JAN29-T50");
		expect(result.yes_bid).toBe(55);
		expect(result.yes_ask).toBe(57);
		expect(result.last_price).toBe(56);
	});

	it("should handle optional fields", () => {
		const result = KalshiMarketSchema.parse({
			ticker: "TEST",
			event_ticker: "TEST-EVENT",
			title: "Test market",
			status: "open",
		});
		expect(result.ticker).toBe("TEST");
		expect(result.yes_bid).toBeUndefined();
		expect(result.subtitle).toBeUndefined();
	});
});

describe("KalshiEventSchema", () => {
	it("should parse valid event data", () => {
		const result = KalshiEventSchema.parse(mockKalshiEvent);
		expect(result.event_ticker).toBe("KXFED-26JAN29");
		expect(result.title).toBe("Federal Reserve January 2026 Decision");
		expect(result.markets).toHaveLength(1);
	});

	it("should handle event without markets", () => {
		const result = KalshiEventSchema.parse({
			event_ticker: "EVT-123",
			title: "Event without markets",
		});
		expect(result.event_ticker).toBe("EVT-123");
		expect(result.markets).toBeUndefined();
	});
});

describe("KalshiClient constructor", () => {
	it("should throw AuthenticationError if no private key provided", () => {
		try {
			new KalshiClient({ apiKeyId: "test-key" });
			expect.unreachable("Should have thrown");
		} catch (error) {
			expect((error as Error).name).toBe("AuthenticationError");
			expect((error as AuthenticationError).platform).toBe("KALSHI");
			expect((error as AuthenticationError).code).toBe("AUTH_ERROR");
		}
	});

	it("should create client with supported options", () => {
		const clientWithPem = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
		});
		const clientWithCustomBasePath = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
			basePath: "https://custom-api.kalshi.com",
		});
		const clientWithTier = new KalshiClient({
			apiKeyId: "test-key",
			privateKeyPem: "test-pem",
			tier: "premier",
		});
		expect(clientWithPem.platform).toBe("KALSHI");
		expect(clientWithCustomBasePath.platform).toBe("KALSHI");
		expect(clientWithTier.platform).toBe("KALSHI");
	});
});

describe("KalshiClient.calculateScores fed and recession", () => {
	it("should calculate fed cut/hike probabilities from events", () => {
		const events = [
			createPredictionEvent({
				id: "fed-rates",
				marketType: "FED_RATE",
				marketQuestion: "Will the Fed cut rates?",
				outcomes: [
					{ outcome: "25bps cut", probability: 0.8, price: 0.8 },
					{ outcome: "No change", probability: 0.15, price: 0.15 },
					{ outcome: "25bps hike", probability: 0.05, price: 0.05 },
				],
				relatedInstrumentIds: ["XLF"],
				eventTime: "2026-01-29T19:00:00Z",
			}),
		];
		const scores = createScoringClient().calculateScores(events);
		expect(scores.fedCutProbability).toBe(0.8);
		expect(scores.fedHikeProbability).toBe(0.05);
	});

	it("should calculate recession probability from yes outcome", () => {
		const events = [
			createPredictionEvent({
				id: "recession-2026",
				marketType: "RECESSION",
				marketQuestion: "Will there be a recession in 2026?",
				outcomes: [
					{ outcome: "Yes", probability: 0.25, price: 0.25 },
					{ outcome: "No", probability: 0.75, price: 0.75 },
				],
				relatedInstrumentIds: ["SPY"],
				eventTime: "2026-12-31T23:59:59Z",
			}),
		];
		const scores = createScoringClient().calculateScores(events);
		expect(scores.recessionProbability12m).toBe(0.25);
	});
});

describe("KalshiClient.calculateScores macro uncertainty", () => {
	it("should calculate macro uncertainty index", () => {
		const events = [
			createPredictionEvent({
				id: "cut-market",
				marketType: "FED_RATE",
				marketQuestion: "Fed rate cut?",
				outcomes: [{ outcome: "Rate decrease", probability: 0.6, price: 0.6 }],
			}),
			createPredictionEvent({
				id: "hike-market",
				marketType: "FED_RATE",
				marketQuestion: "Fed rate hike?",
				outcomes: [{ outcome: "Rate increase", probability: 0.3, price: 0.3 }],
			}),
		];
		const scores = createScoringClient().calculateScores(events);
		expect(scores.fedCutProbability).toBe(0.6);
		expect(scores.fedHikeProbability).toBe(0.3);
		expect(scores.macroUncertaintyIndex).toBe(0.5);
	});

	it("should calculate high uncertainty when cut and hike are equal", () => {
		const events = [
			createPredictionEvent({
				id: "cut-equal",
				marketType: "FED_RATE",
				marketQuestion: "Fed rate cut?",
				outcomes: [{ outcome: "Rate cut", probability: 0.5, price: 0.5 }],
			}),
			createPredictionEvent({
				id: "hike-equal",
				marketType: "FED_RATE",
				marketQuestion: "Fed rate hike?",
				outcomes: [{ outcome: "Rate hike", probability: 0.5, price: 0.5 }],
			}),
		];
		const scores = createScoringClient().calculateScores(events);
		expect(scores.macroUncertaintyIndex).toBe(1.0);
	});

	it("should skip macro uncertainty when max probability is 0", () => {
		const events = [
			createPredictionEvent({
				id: "flat-rates",
				marketType: "FED_RATE",
				marketQuestion: "Fed rate?",
				outcomes: [
					{ outcome: "cut", probability: 0, price: 0 },
					{ outcome: "hike", probability: 0, price: 0 },
				],
			}),
		];
		const scores = createScoringClient().calculateScores(events);
		expect(scores.fedCutProbability).toBe(0);
		expect(scores.fedHikeProbability).toBe(0);
		expect(scores.macroUncertaintyIndex).toBeUndefined();
	});
});

describe("KalshiClient.calculateScores edge cases", () => {
	it("should return empty scores for empty events", () => {
		const scores = createScoringClient().calculateScores([]);
		expect(scores.fedCutProbability).toBeUndefined();
		expect(scores.fedHikeProbability).toBeUndefined();
		expect(scores.recessionProbability12m).toBeUndefined();
		expect(scores.macroUncertaintyIndex).toBeUndefined();
	});

	it("should handle recession market without Yes outcome", () => {
		const events = [
			createPredictionEvent({
				id: "recession-no",
				marketType: "RECESSION",
				marketQuestion: "Will there be a recession in 2026?",
				outcomes: [{ outcome: "No", probability: 0.75, price: 0.75 }],
				relatedInstrumentIds: ["SPY"],
				eventTime: "2026-12-31T23:59:59Z",
			}),
		];
		const scores = createScoringClient().calculateScores(events);
		expect(scores.recessionProbability12m).toBeUndefined();
	});
});

describe("createKalshiClientFromEnv", () => {
	const originalApiKeyId = Bun.env.KALSHI_API_KEY_ID;
	const originalPrivateKeyPath = Bun.env.KALSHI_PRIVATE_KEY_PATH;

	const resetEnv = () => {
		if (originalApiKeyId !== undefined) {
			Bun.env.KALSHI_API_KEY_ID = originalApiKeyId;
		} else {
			delete Bun.env.KALSHI_API_KEY_ID;
		}
		if (originalPrivateKeyPath !== undefined) {
			Bun.env.KALSHI_PRIVATE_KEY_PATH = originalPrivateKeyPath;
		} else {
			delete Bun.env.KALSHI_PRIVATE_KEY_PATH;
		}
	};

	beforeEach(resetEnv);
	afterEach(resetEnv);

	it("should throw AuthenticationError without KALSHI_API_KEY_ID", () => {
		delete Bun.env.KALSHI_API_KEY_ID;
		delete Bun.env.KALSHI_PRIVATE_KEY_PATH;
		// @ts-expect-error - Bun.env is readonly but we need to clear for test
		Bun.env.KALSHI_API_KEY_ID = undefined;
		// @ts-expect-error - Bun.env is readonly but we need to clear for test
		Bun.env.KALSHI_PRIVATE_KEY_PATH = undefined;
		try {
			createKalshiClientFromEnv();
			expect.unreachable("Should have thrown");
		} catch (error) {
			expect((error as Error).name).toBe("AuthenticationError");
			expect((error as AuthenticationError).message).toContain("KALSHI_API_KEY_ID");
		}
	});

	it("should throw AuthenticationError without KALSHI_PRIVATE_KEY_PATH", () => {
		Bun.env.KALSHI_API_KEY_ID = "test-key-id";
		delete Bun.env.KALSHI_PRIVATE_KEY_PATH;
		// @ts-expect-error - Bun.env is readonly but we need to clear for test
		Bun.env.KALSHI_PRIVATE_KEY_PATH = undefined;
		try {
			createKalshiClientFromEnv();
			expect.unreachable("Should have thrown");
		} catch (error) {
			expect((error as Error).name).toBe("AuthenticationError");
			expect((error as AuthenticationError).message).toContain("KALSHI_PRIVATE_KEY_PATH");
		}
	});
});
