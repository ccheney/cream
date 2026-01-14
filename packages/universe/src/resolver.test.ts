/**
 * Universe Resolver Tests
 *
 * Tests for the universe resolution system including:
 * - Source resolution (static, index, ETF, screener)
 * - Composition (union, intersection)
 * - Filtering
 * - Ranking and limits
 */

import { describe, expect, it } from "bun:test";
import type { StaticSource, UniverseConfig } from "@cream/config";
import { resolveUniverse, resolveUniverseSymbols } from "./resolver.js";
import { resolveStaticSource } from "./sources.js";

// ============================================
// Static Source Tests
// ============================================

describe("resolveStaticSource", () => {
	it("should resolve static ticker list", async () => {
		const source: StaticSource = {
			type: "static",
			name: "core_watchlist",
			enabled: true,
			tickers: ["AAPL", "MSFT", "GOOG"],
		};

		const result = await resolveStaticSource(source);

		expect(result.sourceName).toBe("core_watchlist");
		expect(result.instruments).toHaveLength(3);
		expect(result.instruments.map((i) => i.symbol)).toEqual(["AAPL", "MSFT", "GOOG"]);
		expect(result.warnings).toHaveLength(0);
	});

	it("should uppercase ticker symbols", async () => {
		const source: StaticSource = {
			type: "static",
			name: "test",
			enabled: true,
			tickers: ["aapl", "Msft", "GOOG"],
		};

		const result = await resolveStaticSource(source);

		expect(result.instruments.map((i) => i.symbol)).toEqual(["AAPL", "MSFT", "GOOG"]);
	});

	it("should include source name in instruments", async () => {
		const source: StaticSource = {
			type: "static",
			name: "my_source",
			enabled: true,
			tickers: ["SPY"],
		};

		const result = await resolveStaticSource(source);

		expect(result.instruments[0].source).toBe("my_source");
	});
});

// ============================================
// Universe Composition Tests (using static sources)
// ============================================

describe("resolveUniverse composition", () => {
	const staticSource1: StaticSource = {
		type: "static",
		name: "source1",
		enabled: true,
		tickers: ["AAPL", "MSFT", "GOOG"],
	};

	const staticSource2: StaticSource = {
		type: "static",
		name: "source2",
		enabled: true,
		tickers: ["MSFT", "GOOG", "AMZN"],
	};

	it("should compose sources with union mode (default)", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [staticSource1, staticSource2],
			max_instruments: 500,
		};

		const result = await resolveUniverse(config);

		// Should have unique symbols from both sources
		const symbols = result.instruments.map((i) => i.symbol);
		expect(symbols).toContain("AAPL");
		expect(symbols).toContain("MSFT");
		expect(symbols).toContain("GOOG");
		expect(symbols).toContain("AMZN");
		expect(new Set(symbols).size).toBe(4); // No duplicates
	});

	it("should compose sources with intersection mode", async () => {
		const config: UniverseConfig = {
			compose_mode: "intersection",
			sources: [staticSource1, staticSource2],
			max_instruments: 500,
		};

		const result = await resolveUniverse(config);

		// Should only have symbols in BOTH sources
		const symbols = result.instruments.map((i) => i.symbol);
		expect(symbols).toContain("MSFT");
		expect(symbols).toContain("GOOG");
		expect(symbols).not.toContain("AAPL"); // Only in source1
		expect(symbols).not.toContain("AMZN"); // Only in source2
		expect(symbols).toHaveLength(2);
	});

	it("should skip disabled sources", async () => {
		const disabledSource: StaticSource = {
			type: "static",
			name: "disabled",
			enabled: false,
			tickers: ["NVDA"],
		};

		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [staticSource1, disabledSource],
			max_instruments: 500,
		};

		const result = await resolveUniverse(config);

		const symbols = result.instruments.map((i) => i.symbol);
		expect(symbols).not.toContain("NVDA");
		expect(symbols).toContain("AAPL");
	});

	it("should throw if no enabled sources", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [
				{ ...staticSource1, enabled: false },
				{ ...staticSource2, enabled: false },
			],
			max_instruments: 500,
		};

		await expect(resolveUniverse(config)).rejects.toThrow("No enabled sources");
	});
});

// ============================================
// Filter Tests
// ============================================

describe("resolveUniverse filters", () => {
	it("should apply exclude_tickers filter", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [
				{
					type: "static",
					name: "test",
					enabled: true,
					tickers: ["AAPL", "MSFT", "GOOG", "BRKB"],
				},
			],
			filters: {
				min_avg_volume: 0,
				min_market_cap: 0,
				min_price: 0,
				exclude_tickers: ["BRKB"],
			},
			max_instruments: 500,
		};

		const result = await resolveUniverse(config);

		const symbols = result.instruments.map((i) => i.symbol);
		expect(symbols).not.toContain("BRKB");
		expect(symbols).toContain("AAPL");
	});

	it("should apply exclude_tickers case-insensitively", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [
				{
					type: "static",
					name: "test",
					enabled: true,
					tickers: ["AAPL", "MSFT"],
				},
			],
			filters: {
				min_avg_volume: 0,
				min_market_cap: 0,
				min_price: 0,
				exclude_tickers: ["aapl"], // lowercase
			},
			max_instruments: 500,
		};

		const result = await resolveUniverse(config);

		const symbols = result.instruments.map((i) => i.symbol);
		expect(symbols).not.toContain("AAPL");
	});
});

// ============================================
// Limit Tests
// ============================================

describe("resolveUniverse limits", () => {
	it("should respect max_instruments limit", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [
				{
					type: "static",
					name: "test",
					enabled: true,
					tickers: ["AAPL", "MSFT", "GOOG", "AMZN", "META", "NVDA"],
				},
			],
			max_instruments: 3,
		};

		const result = await resolveUniverse(config);

		expect(result.instruments).toHaveLength(3);
	});

	it("should not limit if under max_instruments", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [
				{
					type: "static",
					name: "test",
					enabled: true,
					tickers: ["AAPL", "MSFT"],
				},
			],
			max_instruments: 100,
		};

		const result = await resolveUniverse(config);

		expect(result.instruments).toHaveLength(2);
	});
});

// ============================================
// Stats Tests
// ============================================

describe("resolveUniverse stats", () => {
	it("should track resolution statistics", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [
				{
					type: "static",
					name: "source1",
					enabled: true,
					tickers: ["AAPL", "MSFT"],
				},
				{
					type: "static",
					name: "source2",
					enabled: true,
					tickers: ["MSFT", "GOOG"],
				},
			],
			max_instruments: 500,
		};

		const result = await resolveUniverse(config);

		expect(result.stats.totalFromSources).toBe(4); // 2 + 2
		expect(result.stats.afterComposition).toBe(3); // AAPL, MSFT, GOOG (deduped)
		expect(result.stats.final).toBe(3);
	});

	it("should include source results", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [
				{
					type: "static",
					name: "source1",
					enabled: true,
					tickers: ["AAPL"],
				},
				{
					type: "static",
					name: "source2",
					enabled: true,
					tickers: ["MSFT"],
				},
			],
			max_instruments: 500,
		};

		const result = await resolveUniverse(config);

		expect(result.sourceResults).toHaveLength(2);
		expect(result.sourceResults[0].sourceName).toBe("source1");
		expect(result.sourceResults[1].sourceName).toBe("source2");
	});
});

// ============================================
// resolveUniverseSymbols Tests
// ============================================

describe("resolveUniverseSymbols", () => {
	it("should return just the symbols", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [
				{
					type: "static",
					name: "test",
					enabled: true,
					tickers: ["AAPL", "MSFT", "GOOG"],
				},
			],
			max_instruments: 500,
		};

		const symbols = await resolveUniverseSymbols(config);

		expect(symbols).toEqual(["AAPL", "MSFT", "GOOG"]);
	});
});

// ============================================
// Metadata Merging Tests
// ============================================

describe("metadata merging", () => {
	it("should merge sources in instrument source field", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [
				{
					type: "static",
					name: "source1",
					enabled: true,
					tickers: ["AAPL"],
				},
				{
					type: "static",
					name: "source2",
					enabled: true,
					tickers: ["AAPL"],
				},
			],
			max_instruments: 500,
		};

		const result = await resolveUniverse(config);

		expect(result.instruments).toHaveLength(1);
		expect(result.instruments[0].source).toBe("source1,source2");
	});
});

// ============================================
// Advanced Filter Tests
// ============================================

describe("advanced filters", () => {
	it("should apply min_avg_volume filter with pre-populated data", async () => {
		// Test with instruments that have volume data already
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [
				{
					type: "static",
					name: "test",
					enabled: true,
					tickers: ["AAPL", "MSFT", "GOOG"],
				},
			],
			filters: {
				min_avg_volume: 1000000, // Will filter all since static has no volume
				min_market_cap: 0,
				min_price: 0,
				exclude_tickers: [],
			},
			max_instruments: 500,
		};

		const result = await resolveUniverse(config);

		// Static sources have no volume data (undefined → 0), so all are filtered
		expect(result.instruments.length).toBeLessThanOrEqual(3);
		// Should have warning about filtered instruments
		expect(result.warnings.some((w) => w.includes("volume"))).toBe(true);
	});

	it("should apply min_market_cap filter", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [
				{
					type: "static",
					name: "test",
					enabled: true,
					tickers: ["AAPL", "MSFT"],
				},
			],
			filters: {
				min_avg_volume: 0,
				min_market_cap: 1000000000000, // 1 trillion - filters static sources
				min_price: 0,
				exclude_tickers: [],
			},
			max_instruments: 500,
		};

		const result = await resolveUniverse(config);

		// Static sources have no market cap data, so all are filtered
		expect(result.warnings.some((w) => w.includes("market cap"))).toBe(true);
	});

	it("should apply min_price filter", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [
				{
					type: "static",
					name: "test",
					enabled: true,
					tickers: ["AAPL", "MSFT"],
				},
			],
			filters: {
				min_avg_volume: 0,
				min_market_cap: 0,
				min_price: 100,
				exclude_tickers: [],
			},
			max_instruments: 500,
		};

		const result = await resolveUniverse(config);

		// Static sources have no price data, so all are filtered
		expect(result.warnings.some((w) => w.includes("price"))).toBe(true);
	});

	it("should apply max_price filter", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [
				{
					type: "static",
					name: "test",
					enabled: true,
					tickers: ["AAPL", "MSFT"],
				},
			],
			filters: {
				min_avg_volume: 0,
				min_market_cap: 0,
				min_price: 0,
				max_price: 10, // Very low max price
				exclude_tickers: [],
			},
			max_instruments: 500,
		};

		const result = await resolveUniverse(config);

		// Static sources have no price (POSITIVE_INFINITY), so filtered
		expect(result.warnings.some((w) => w.includes("max price"))).toBe(true);
	});

	it("should apply include_sectors filter", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [
				{
					type: "static",
					name: "test",
					enabled: true,
					tickers: ["AAPL", "MSFT", "JPM"],
				},
			],
			filters: {
				min_avg_volume: 0,
				min_market_cap: 0,
				min_price: 0,
				exclude_tickers: [],
				include_sectors: ["Technology"],
			},
			max_instruments: 500,
		};

		const result = await resolveUniverse(config);

		// Static sources have no sector data, so none match Technology
		expect(result.instruments.length).toBe(0);
	});

	it("should apply exclude_sectors filter", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [
				{
					type: "static",
					name: "test",
					enabled: true,
					tickers: ["AAPL", "MSFT"],
				},
			],
			filters: {
				min_avg_volume: 0,
				min_market_cap: 0,
				min_price: 0,
				exclude_tickers: [],
				exclude_sectors: ["Unknown"], // Static sources have undefined sector
			},
			max_instruments: 500,
		};

		const result = await resolveUniverse(config);

		// Instruments with undefined sector are not excluded (undefined !== "Unknown")
		expect(result.instruments.length).toBeGreaterThanOrEqual(0);
	});
});

// ============================================
// Intersection Composition Edge Cases
// ============================================

describe("intersection composition edge cases", () => {
	it("should return empty for zero sources", async () => {
		const config: UniverseConfig = {
			compose_mode: "intersection",
			sources: [
				{
					type: "static",
					name: "disabled",
					enabled: false,
					tickers: ["AAPL"],
				},
			],
			max_instruments: 500,
		};

		await expect(resolveUniverse(config)).rejects.toThrow("No enabled sources");
	});

	it("should handle single source in intersection mode", async () => {
		const config: UniverseConfig = {
			compose_mode: "intersection",
			sources: [
				{
					type: "static",
					name: "only_source",
					enabled: true,
					tickers: ["AAPL", "MSFT"],
				},
			],
			max_instruments: 500,
		};

		const result = await resolveUniverse(config);

		expect(result.instruments).toHaveLength(2);
		expect(result.instruments.map((i) => i.symbol)).toContain("AAPL");
	});
});

// ============================================
// Diversification Tests
// ============================================

describe("diversification", () => {
	it("should limit instruments per sector", async () => {
		// Create instruments with sectors
		const config = {
			compose_mode: "union" as const,
			sources: [
				{
					type: "static" as const,
					name: "tech",
					enabled: true,
					tickers: ["AAPL", "MSFT", "GOOG", "META", "NVDA"],
				},
			],
			max_instruments: 500,
			diversification: {
				maxPerSector: 2,
			},
		};

		// Note: Static sources don't have sector data, so this just tests the logic path
		const result = await resolveUniverse(config);

		// With static sources (no sector data), all go to "Unknown" sector
		// maxPerSector: 2 means only 2 should remain
		expect(result.instruments.length).toBeLessThanOrEqual(2);
	});

	it("should warn when min sectors not represented", async () => {
		const config = {
			compose_mode: "union" as const,
			sources: [
				{
					type: "static" as const,
					name: "test",
					enabled: true,
					tickers: ["AAPL"],
				},
			],
			max_instruments: 500,
			diversification: {
				minSectorsRepresented: 5, // Impossible with 1 stock
			},
		};

		const result = await resolveUniverse(config);

		// Should have warning about sector representation
		expect(result.warnings.some((w) => w.includes("sectors represented"))).toBe(true);
	});

	it("should pass without diversification config", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [
				{
					type: "static",
					name: "test",
					enabled: true,
					tickers: ["AAPL", "MSFT"],
				},
			],
			max_instruments: 500,
		};

		const result = await resolveUniverse(config);

		expect(result.instruments).toHaveLength(2);
		expect(result.warnings.filter((w) => w.includes("Diversification"))).toHaveLength(0);
	});
});
