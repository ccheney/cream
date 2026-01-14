/**
 * Tests for PolymarketClient.calculateScores method
 */

import { describe, expect, it } from "bun:test";
import { PolymarketClient } from "../client.js";

describe("PolymarketClient.calculateScores", () => {
	it("should calculate scores from events", () => {
		const client = new PolymarketClient();

		const events = [
			{
				eventId: "pm_polymarket_test",
				eventType: "PREDICTION_MARKET" as const,
				eventTime: "2026-12-31T23:59:59Z",
				payload: {
					platform: "POLYMARKET" as const,
					marketType: "FED_RATE" as const,
					marketTicker: "0x1234",
					marketQuestion: "Will the Fed cut rates?",
					outcomes: [
						{ outcome: "25bps cut", probability: 0.6, price: 0.6 },
						{ outcome: "No change", probability: 0.3, price: 0.3 },
						{ outcome: "25bps hike", probability: 0.1, price: 0.1 },
					],
					lastUpdated: "2026-01-04T15:00:00Z",
				},
				relatedInstrumentIds: ["XLF"],
			},
		];

		const scores = client.calculateScores(events);
		expect(scores.fedCutProbability).toBe(0.6);
		expect(scores.fedHikeProbability).toBe(0.1);
	});

	it("should calculate recession probability from events", () => {
		const client = new PolymarketClient();

		const events = [
			{
				eventId: "pm_polymarket_recession",
				eventType: "PREDICTION_MARKET" as const,
				eventTime: "2026-12-31T23:59:59Z",
				payload: {
					platform: "POLYMARKET" as const,
					marketType: "RECESSION" as const,
					marketTicker: "0xrec",
					marketQuestion: "Will there be a recession in 2026?",
					outcomes: [
						{ outcome: "Yes", probability: 0.35, price: 0.35 },
						{ outcome: "No", probability: 0.65, price: 0.65 },
					],
					lastUpdated: "2026-01-04T15:00:00Z",
				},
				relatedInstrumentIds: ["SPY"],
			},
		];

		const scores = client.calculateScores(events);
		expect(scores.recessionProbability12m).toBe(0.35);
	});

	it("should calculate macro uncertainty index", () => {
		const client = new PolymarketClient();

		const events = [
			{
				eventId: "pm_polymarket_cut",
				eventType: "PREDICTION_MARKET" as const,
				eventTime: "2026-06-30T00:00:00Z",
				payload: {
					platform: "POLYMARKET" as const,
					marketType: "FED_RATE" as const,
					marketTicker: "cut-market",
					marketQuestion: "Fed rate cut?",
					outcomes: [{ outcome: "Cut decrease", probability: 0.5, price: 0.5 }],
					lastUpdated: new Date().toISOString(),
				},
				relatedInstrumentIds: [],
			},
			{
				eventId: "pm_polymarket_hike",
				eventType: "PREDICTION_MARKET" as const,
				eventTime: "2026-06-30T00:00:00Z",
				payload: {
					platform: "POLYMARKET" as const,
					marketType: "FED_RATE" as const,
					marketTicker: "hike-market",
					marketQuestion: "Fed rate hike?",
					outcomes: [{ outcome: "Hike increase", probability: 0.4, price: 0.4 }],
					lastUpdated: new Date().toISOString(),
				},
				relatedInstrumentIds: [],
			},
		];

		const scores = client.calculateScores(events);

		expect(scores.fedCutProbability).toBe(0.5);
		expect(scores.fedHikeProbability).toBe(0.4);
		expect(scores.macroUncertaintyIndex).toBe(0.8); // 0.4 / 0.5
	});

	it("should return empty scores for empty events", () => {
		const client = new PolymarketClient();
		const scores = client.calculateScores([]);

		expect(scores.fedCutProbability).toBeUndefined();
		expect(scores.fedHikeProbability).toBeUndefined();
		expect(scores.recessionProbability12m).toBeUndefined();
	});
});
