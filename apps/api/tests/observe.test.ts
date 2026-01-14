/**
 * Observe Phase Tests
 *
 * Tests for the market snapshot types and structure.
 *
 * NOTE: Full integration tests for fetchMarketSnapshot with indicator
 * calculations require fixing the legacy marketdata -> indicators
 * import chain (tracked by cream-z5zyh). These tests verify the
 * type structure and basic fixture functionality.
 */

import { describe, expect, it } from "bun:test";

import type { MarketSnapshot } from "../src/workflows/steps/trading-cycle/types.js";

describe("Observe Phase Types", () => {
	describe("MarketSnapshot structure", () => {
		it("should accept a valid market snapshot with indicators", () => {
			const snapshot: MarketSnapshot = {
				instruments: ["AAPL", "MSFT"],
				candles: {
					AAPL: [
						{
							timestamp: 1704499200000,
							open: 150,
							high: 155,
							low: 149,
							close: 154,
							volume: 1000000,
						},
					],
					MSFT: [
						{
							timestamp: 1704499200000,
							open: 400,
							high: 410,
							low: 398,
							close: 405,
							volume: 500000,
						},
					],
				},
				quotes: {
					AAPL: { bid: 153.95, ask: 154.05, bidSize: 100, askSize: 100, timestamp: 1704499200000 },
					MSFT: { bid: 404.9, ask: 405.1, bidSize: 200, askSize: 200, timestamp: 1704499200000 },
				},
				timestamp: 1704499200000,
			};

			expect(snapshot.instruments).toHaveLength(2);
			expect(snapshot.candles.AAPL).toHaveLength(1);
			expect(snapshot.quotes.AAPL?.bid).toBe(153.95);
		});

		it("should allow optional indicators field", () => {
			const snapshotWithoutIndicators: MarketSnapshot = {
				instruments: ["AAPL"],
				candles: {
					AAPL: [
						{
							timestamp: 1704499200000,
							open: 150,
							high: 155,
							low: 149,
							close: 154,
							volume: 1000000,
						},
					],
				},
				quotes: {
					AAPL: { bid: 153.95, ask: 154.05, bidSize: 100, askSize: 100, timestamp: 1704499200000 },
				},
				timestamp: 1704499200000,
			};

			expect(snapshotWithoutIndicators.indicators).toBeUndefined();
		});
	});

	describe("CandleData structure", () => {
		it("should have all required OHLCV fields", () => {
			const snapshot: MarketSnapshot = {
				instruments: ["AAPL"],
				candles: {
					AAPL: [
						{
							timestamp: 1704499200000,
							open: 150.25,
							high: 155.5,
							low: 149.0,
							close: 154.75,
							volume: 1234567,
						},
					],
				},
				quotes: {
					AAPL: { bid: 154.7, ask: 154.8, bidSize: 100, askSize: 100, timestamp: 1704499200000 },
				},
				timestamp: 1704499200000,
			};

			const candle = snapshot.candles.AAPL[0];
			expect(candle).toBeDefined();
			expect(candle?.timestamp).toBe(1704499200000);
			expect(candle?.open).toBe(150.25);
			expect(candle?.high).toBe(155.5);
			expect(candle?.low).toBe(149.0);
			expect(candle?.close).toBe(154.75);
			expect(candle?.volume).toBe(1234567);
		});
	});

	describe("QuoteData structure", () => {
		it("should have all required bid/ask fields", () => {
			const snapshot: MarketSnapshot = {
				instruments: ["AAPL"],
				candles: {
					AAPL: [],
				},
				quotes: {
					AAPL: {
						bid: 154.7,
						ask: 154.8,
						bidSize: 500,
						askSize: 300,
						timestamp: 1704499200000,
					},
				},
				timestamp: 1704499200000,
			};

			const quote = snapshot.quotes.AAPL;
			expect(quote).toBeDefined();
			expect(quote?.bid).toBe(154.7);
			expect(quote?.ask).toBe(154.8);
			expect(quote?.bidSize).toBe(500);
			expect(quote?.askSize).toBe(300);
			expect(quote?.timestamp).toBe(1704499200000);
		});
	});

	describe("Empty instrument list handling", () => {
		it("should accept empty instrument list", () => {
			const snapshot: MarketSnapshot = {
				instruments: [],
				candles: {},
				quotes: {},
				timestamp: Date.now(),
			};

			expect(snapshot.instruments).toHaveLength(0);
			expect(Object.keys(snapshot.candles)).toHaveLength(0);
			expect(Object.keys(snapshot.quotes)).toHaveLength(0);
		});
	});
});
