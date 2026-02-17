/**
 * Tests for Prediction Market Transformers
 */

import { describe, expect, it } from "bun:test";
import type { PredictionMarketEvent, PredictionMarketScores } from "@cream/domain";
import {
	INSTRUMENT_MAPPING,
	mapToRelatedInstruments,
	transformScoresToNumeric,
	transformToExternalEvent,
	transformToExternalEvents,
} from "./transformers";

interface EventFixture {
	eventId: string;
	platform: "KALSHI" | "POLYMARKET";
	marketType: PredictionMarketEvent["payload"]["marketType"];
	ticker: string;
	question: string;
	eventTime?: string;
	outcomes: PredictionMarketEvent["payload"]["outcomes"];
	liquidityScore?: number;
	volume24h?: number;
	relatedInstrumentIds?: string[];
}

function createPredictionEvent(fixture: EventFixture): PredictionMarketEvent {
	const {
		eventId,
		platform,
		marketType,
		ticker,
		question,
		eventTime = "2026-01-29T19:00:00Z",
		outcomes,
		liquidityScore,
		volume24h,
		relatedInstrumentIds = [],
	} = fixture;

	return {
		eventId,
		eventType: "PREDICTION_MARKET",
		eventTime,
		payload: {
			platform,
			marketType,
			marketTicker: ticker,
			marketQuestion: question,
			outcomes,
			lastUpdated: "2026-01-04T15:00:00Z",
			liquidityScore,
			volume24h,
		},
		relatedInstrumentIds,
	};
}

describe("mapToRelatedInstruments: FED_RATE", () => {
	it("maps rate-sensitive instruments", () => {
		const event = createPredictionEvent({
			eventId: "pm_kalshi_fed_jan26",
			platform: "KALSHI",
			marketType: "FED_RATE",
			ticker: "KXFED-26JAN29",
			question: "Will the Fed cut rates in January 2026?",
			outcomes: [
				{ outcome: "Yes", probability: 0.6, price: 0.6 },
				{ outcome: "No", probability: 0.4, price: 0.4 },
			],
		});

		const instruments = mapToRelatedInstruments(event);
		expect(instruments).toContain("XLF");
		expect(instruments).toContain("TLT");
		expect(instruments).toContain("IYR");
		expect(instruments).toContain("KRE");
	});
});

describe("mapToRelatedInstruments: ECONOMIC_DATA", () => {
	it("maps instruments from indicator keywords", () => {
		const cpiEvent = createPredictionEvent({
			eventId: "pm_kalshi_cpi",
			platform: "KALSHI",
			marketType: "ECONOMIC_DATA",
			ticker: "KXCPI-26FEB",
			question: "Will CPI inflation exceed 3% in January?",
			outcomes: [
				{ outcome: "Yes", probability: 0.35, price: 0.35 },
				{ outcome: "No", probability: 0.65, price: 0.65 },
			],
		});

		const instruments = mapToRelatedInstruments(cpiEvent);
		expect(instruments).toContain("TIPS");
		expect(instruments).toContain("GLD");
		expect(instruments).toContain("TIP");
	});
});

describe("mapToRelatedInstruments: RECESSION", () => {
	it("maps defensive instruments", () => {
		const event = createPredictionEvent({
			eventId: "pm_poly_recession",
			platform: "POLYMARKET",
			marketType: "RECESSION",
			ticker: "0xrec2026",
			question: "Will there be a recession in 2026?",
			eventTime: "2026-12-31T23:59:59Z",
			outcomes: [
				{ outcome: "Yes", probability: 0.25, price: 0.25 },
				{ outcome: "No", probability: 0.75, price: 0.75 },
			],
		});

		const instruments = mapToRelatedInstruments(event);
		expect(instruments).toContain("SPY");
		expect(instruments).toContain("QQQ");
		expect(instruments).toContain("VIX");
		expect(instruments).toContain("TLT");
		expect(instruments).toContain("XLU");
		expect(instruments).toContain("XLP");
		expect(instruments).toContain("GLD");
	});
});

describe("mapToRelatedInstruments: existing ids", () => {
	it("includes relatedInstrumentIds from event", () => {
		const event = createPredictionEvent({
			eventId: "pm_kalshi_fed",
			platform: "KALSHI",
			marketType: "FED_RATE",
			ticker: "KXFED",
			question: "Fed rate decision",
			outcomes: [{ outcome: "Yes", probability: 0.5, price: 0.5 }],
			relatedInstrumentIds: ["AAPL", "GOOGL"],
		});

		const instruments = mapToRelatedInstruments(event);
		expect(instruments).toContain("AAPL");
		expect(instruments).toContain("GOOGL");
	});
});

describe("transformToExternalEvent: core mapping", () => {
	it("maps event fields into ExternalEvent", () => {
		const pmEvent = createPredictionEvent({
			eventId: "pm_kalshi_fed_jan26",
			platform: "KALSHI",
			marketType: "FED_RATE",
			ticker: "KXFED-26JAN29",
			question: "Will the Fed cut rates in January 2026?",
			outcomes: [
				{ outcome: "Yes", probability: 0.6, price: 0.6, volume24h: 50000 },
				{ outcome: "No", probability: 0.4, price: 0.4, volume24h: 30000 },
			],
			liquidityScore: 0.8,
			volume24h: 80000,
		});

		const externalEvent = transformToExternalEvent(pmEvent);
		expect(externalEvent.eventId).toBe("pm_kalshi_fed_jan26");
		expect(externalEvent.eventType).toBe("PREDICTION_MARKET");
		expect(externalEvent.eventTime).toBe("2026-01-29T19:00:00Z");
		expect(externalEvent.source).toBe("KALSHI");
		expect(externalEvent.headline).toBe("Will the Fed cut rates in January 2026?");
		expect(externalEvent.payload.platform).toBe("KALSHI");
		expect(externalEvent.payload.marketType).toBe("FED_RATE");
		expect(externalEvent.payload.liquidityScore).toBe(0.8);
		expect(externalEvent.relatedInstrumentIds).toContain("XLF");
		expect(externalEvent.relatedInstrumentIds).toContain("TLT");
	});
});

describe("transformToExternalEvent: outcomes", () => {
	it("preserves all outcome data", () => {
		const pmEvent = createPredictionEvent({
			eventId: "pm_test",
			platform: "POLYMARKET",
			marketType: "ELECTION",
			ticker: "0x123",
			question: "Who will win the 2028 election?",
			outcomes: [
				{ outcome: "Democrat", probability: 0.45, price: 0.45, volume24h: 100000 },
				{ outcome: "Republican", probability: 0.52, price: 0.52, volume24h: 120000 },
				{ outcome: "Other", probability: 0.03, price: 0.03, volume24h: 5000 },
			],
		});

		const externalEvent = transformToExternalEvent(pmEvent);
		const outcomes = externalEvent.payload.outcomes as Array<{
			outcome: string;
			probability: number;
			price: number;
			volume24h?: number;
		}>;

		expect(outcomes).toHaveLength(3);
		expect(outcomes[0]?.outcome).toBe("Democrat");
		expect(outcomes[0]?.probability).toBe(0.45);
		expect(outcomes[1]?.outcome).toBe("Republican");
		expect(outcomes[1]?.volume24h).toBe(120000);
	});
});

describe("transformToExternalEvents", () => {
	it("transforms multiple events", () => {
		const events: PredictionMarketEvent[] = [
			createPredictionEvent({
				eventId: "pm_1",
				platform: "KALSHI",
				marketType: "FED_RATE",
				ticker: "KXFED",
				question: "Fed rate cut?",
				outcomes: [{ outcome: "Yes", probability: 0.6, price: 0.6 }],
			}),
			createPredictionEvent({
				eventId: "pm_2",
				platform: "POLYMARKET",
				marketType: "RECESSION",
				ticker: "0xrec",
				question: "Recession in 2026?",
				eventTime: "2026-12-31T23:59:59Z",
				outcomes: [{ outcome: "Yes", probability: 0.25, price: 0.25 }],
			}),
		];

		const externalEvents = transformToExternalEvents(events);
		expect(externalEvents).toHaveLength(2);
		expect(externalEvents[0]?.eventId).toBe("pm_1");
		expect(externalEvents[1]?.eventId).toBe("pm_2");
		expect(externalEvents[0]?.eventType).toBe("PREDICTION_MARKET");
		expect(externalEvents[1]?.eventType).toBe("PREDICTION_MARKET");
	});
});

describe("transformScoresToNumeric", () => {
	it("maps prediction scores to numeric score keys", () => {
		const scores: PredictionMarketScores = {
			fedCutProbability: 0.65,
			fedHikeProbability: 0.05,
			recessionProbability12m: 0.25,
			macroUncertaintyIndex: 0.45,
			policyEventRisk: 0.3,
		};

		const numericScores = transformScoresToNumeric(scores);
		expect(numericScores.pm_fed_cut).toBe(0.65);
		expect(numericScores.pm_fed_hike).toBe(0.05);
		expect(numericScores.pm_recession_12m).toBe(0.25);
		expect(numericScores.pm_macro_uncertainty).toBe(0.45);
		expect(numericScores.pm_policy_risk).toBe(0.3);
	});

	it("only includes defined scores", () => {
		const numericScores = transformScoresToNumeric({ fedCutProbability: 0.6 });
		expect(numericScores.pm_fed_cut).toBe(0.6);
		expect(numericScores.pm_fed_hike).toBeUndefined();
		expect(numericScores.pm_recession_12m).toBeUndefined();
	});

	it("includes economic surprise indicators", () => {
		const numericScores = transformScoresToNumeric({
			cpiSurpriseDirection: 0.3,
			gdpSurpriseDirection: -0.2,
			shutdownProbability: 0.1,
			tariffEscalationProbability: 0.15,
		});
		expect(numericScores.pm_cpi_surprise).toBe(0.3);
		expect(numericScores.pm_gdp_surprise).toBe(-0.2);
		expect(numericScores.pm_shutdown).toBe(0.1);
		expect(numericScores.pm_tariff_escalation).toBe(0.15);
	});
});

describe("INSTRUMENT_MAPPING", () => {
	it("includes all market types", () => {
		const marketTypes = [
			"FED_RATE",
			"ECONOMIC_DATA",
			"RECESSION",
			"GEOPOLITICAL",
			"REGULATORY",
			"ELECTION",
		] as const;

		for (const type of marketTypes) {
			expect(INSTRUMENT_MAPPING[type]).toBeDefined();
		}
	});

	it("contains expected FED_RATE mapping", () => {
		const fedMapping = INSTRUMENT_MAPPING.FED_RATE;
		expect(fedMapping.defaultInstruments).toContain("XLF");
		expect(fedMapping.defaultInstruments).toContain("TLT");
		expect(fedMapping.keywordMappings.cut).toBeDefined();
		expect(fedMapping.keywordMappings.hike).toBeDefined();
	});

	it("contains expected GEOPOLITICAL mapping", () => {
		const geoMapping = INSTRUMENT_MAPPING.GEOPOLITICAL;
		expect(geoMapping.defaultInstruments).toContain("VIX");
		expect(geoMapping.defaultInstruments).toContain("GLD");
		expect(geoMapping.keywordMappings.war).toContain("ITA");
		expect(geoMapping.keywordMappings.tariff).toContain("EEM");
	});
});
