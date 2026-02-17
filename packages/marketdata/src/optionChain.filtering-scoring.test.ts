/**
 * Option Chain filtering/scoring tests
 */

import { describe, expect, it } from "bun:test";
import { OptionChainScanner } from "./optionChain";
import { createMockClient } from "./optionChain.test-helpers";

describe("Option chain filtering logic", () => {
	it("filters by minimum volume", async () => {
		const scanner = new OptionChainScanner(createMockClient());
		const results = await scanner.scan("AAPL", { minVolume: 100 });
		expect(results.length).toBe(0);
	});

	it("allows 'both' option type", async () => {
		const scanner = new OptionChainScanner(createMockClient());
		const results = await scanner.scan("AAPL", { optionType: "both" });
		const types = new Set(results.map((r) => r.type));
		expect(types.size).toBeGreaterThanOrEqual(1);
	});
});

describe("Option chain scoring", () => {
	it("assigns liquidity score", async () => {
		const scanner = new OptionChainScanner(createMockClient());

		const greeksProvider = async (tickers: string[]) => {
			const map = new Map();
			for (const ticker of tickers) {
				map.set(ticker, {
					delta: 0.25,
					volume: 500,
					openInterest: 2000,
					bid: 1.5,
					ask: 1.55,
				});
			}
			return map;
		};

		const results = await scanner.scan("AAPL", {}, greeksProvider);

		for (const opt of results) {
			expect(opt.liquidityScore).toBeDefined();
			expect(opt.liquidityScore).toBeGreaterThan(0);
		}
	});

	it("ranks options by overall score", async () => {
		const scanner = new OptionChainScanner(createMockClient());

		const greeksProvider = async (tickers: string[]) => {
			const map = new Map();
			for (const [i, ticker] of tickers.entries()) {
				map.set(ticker, {
					delta: 0.2 + i * 0.05,
					volume: 100 + i * 100,
					openInterest: 500 + i * 500,
					bid: 1.5,
					ask: 1.55,
				});
			}
			return map;
		};

		const results = await scanner.scan("AAPL", {}, greeksProvider);

		for (let i = 1; i < results.length; i++) {
			const prev = results[i - 1];
			const curr = results[i];
			expect(prev?.overallScore).toBeGreaterThanOrEqual(curr?.overallScore ?? 0);
		}
	});
});
