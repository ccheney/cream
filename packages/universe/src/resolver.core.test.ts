/**
 * Universe resolver core behavior tests.
 */

import { describe, expect, it } from "bun:test";
import type { StaticSource, UniverseConfig } from "@cream/config";
import { resolveUniverse, resolveUniverseSymbols } from "./resolver.js";
import { resolveStaticSource } from "./sources.js";

function createStaticSource(name: string, tickers: string[], enabled = true): StaticSource {
	return {
		type: "static",
		name,
		enabled,
		tickers,
	};
}

describe("resolveStaticSource", () => {
	it("resolves static ticker list", async () => {
		const source = createStaticSource("core_watchlist", ["AAPL", "MSFT", "GOOG"]);
		const result = await resolveStaticSource(source);
		expect(result.sourceName).toBe("core_watchlist");
		expect(result.instruments).toHaveLength(3);
		expect(result.instruments.map((instrument) => instrument.symbol)).toEqual([
			"AAPL",
			"MSFT",
			"GOOG",
		]);
		expect(result.warnings).toHaveLength(0);
	});

	it("uppercases ticker symbols", async () => {
		const source = createStaticSource("test", ["aapl", "Msft", "GOOG"]);
		const result = await resolveStaticSource(source);
		expect(result.instruments.map((instrument) => instrument.symbol)).toEqual([
			"AAPL",
			"MSFT",
			"GOOG",
		]);
	});

	it("includes source name in instruments", async () => {
		const source = createStaticSource("my_source", ["SPY"]);
		const result = await resolveStaticSource(source);
		expect(result.instruments[0]?.source).toBe("my_source");
	});
});

const source1 = createStaticSource("source1", ["AAPL", "MSFT", "GOOG"]);
const source2 = createStaticSource("source2", ["MSFT", "GOOG", "AMZN"]);

describe("resolveUniverse union composition", () => {
	it("combines and deduplicates symbols", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [source1, source2],
			max_instruments: 500,
		};
		const result = await resolveUniverse(config);
		const symbols = result.instruments.map((instrument) => instrument.symbol);
		expect(symbols).toContain("AAPL");
		expect(symbols).toContain("MSFT");
		expect(symbols).toContain("GOOG");
		expect(symbols).toContain("AMZN");
		expect(new Set(symbols).size).toBe(4);
	});
});

describe("resolveUniverse intersection composition", () => {
	it("keeps only symbols present in all sources", async () => {
		const config: UniverseConfig = {
			compose_mode: "intersection",
			sources: [source1, source2],
			max_instruments: 500,
		};
		const result = await resolveUniverse(config);
		const symbols = result.instruments.map((instrument) => instrument.symbol);
		expect(symbols).toEqual(["MSFT", "GOOG"]);
	});

	it("handles a single source", async () => {
		const config: UniverseConfig = {
			compose_mode: "intersection",
			sources: [createStaticSource("only_source", ["AAPL", "MSFT"])],
			max_instruments: 500,
		};
		const result = await resolveUniverse(config);
		expect(result.instruments).toHaveLength(2);
		expect(result.instruments.map((instrument) => instrument.symbol)).toContain("AAPL");
	});
});

describe("resolveUniverse enabled source checks", () => {
	it("skips disabled sources", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [source1, createStaticSource("disabled", ["NVDA"], false)],
			max_instruments: 500,
		};
		const result = await resolveUniverse(config);
		const symbols = result.instruments.map((instrument) => instrument.symbol);
		expect(symbols).not.toContain("NVDA");
		expect(symbols).toContain("AAPL");
	});

	it("throws if no source is enabled", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [createStaticSource("a", ["AAPL"], false), createStaticSource("b", ["MSFT"], false)],
			max_instruments: 500,
		};
		await expect(resolveUniverse(config)).rejects.toThrow("No enabled sources");
	});
});

describe("resolveUniverse basic filters", () => {
	it("applies exclude_tickers", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [createStaticSource("test", ["AAPL", "MSFT", "GOOG", "BRKB"])],
			filters: {
				min_avg_volume: 0,
				min_market_cap: 0,
				min_price: 0,
				exclude_tickers: ["BRKB"],
			},
			max_instruments: 500,
		};
		const result = await resolveUniverse(config);
		expect(result.instruments.map((instrument) => instrument.symbol)).not.toContain("BRKB");
	});

	it("matches excluded tickers case-insensitively", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [createStaticSource("test", ["AAPL", "MSFT"])],
			filters: {
				min_avg_volume: 0,
				min_market_cap: 0,
				min_price: 0,
				exclude_tickers: ["aapl"],
			},
			max_instruments: 500,
		};
		const result = await resolveUniverse(config);
		expect(result.instruments.map((instrument) => instrument.symbol)).not.toContain("AAPL");
	});
});

describe("resolveUniverse limits", () => {
	it("respects max_instruments", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [createStaticSource("test", ["AAPL", "MSFT", "GOOG", "AMZN", "META", "NVDA"])],
			max_instruments: 3,
		};
		const result = await resolveUniverse(config);
		expect(result.instruments).toHaveLength(3);
	});

	it("does not trim below max", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [createStaticSource("test", ["AAPL", "MSFT"])],
			max_instruments: 100,
		};
		const result = await resolveUniverse(config);
		expect(result.instruments).toHaveLength(2);
	});
});

describe("resolveUniverse stats", () => {
	it("tracks summary counts", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [
				createStaticSource("source1", ["AAPL", "MSFT"]),
				createStaticSource("source2", ["MSFT", "GOOG"]),
			],
			max_instruments: 500,
		};
		const result = await resolveUniverse(config);
		expect(result.stats.totalFromSources).toBe(4);
		expect(result.stats.afterComposition).toBe(3);
		expect(result.stats.final).toBe(3);
	});

	it("preserves per-source results", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [createStaticSource("source1", ["AAPL"]), createStaticSource("source2", ["MSFT"])],
			max_instruments: 500,
		};
		const result = await resolveUniverse(config);
		expect(result.sourceResults).toHaveLength(2);
		expect(result.sourceResults[0]?.sourceName).toBe("source1");
		expect(result.sourceResults[1]?.sourceName).toBe("source2");
	});
});

describe("resolveUniverseSymbols", () => {
	it("returns only symbols", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [createStaticSource("test", ["AAPL", "MSFT", "GOOG"])],
			max_instruments: 500,
		};
		const symbols = await resolveUniverseSymbols(config);
		expect(symbols).toEqual(["AAPL", "MSFT", "GOOG"]);
	});
});

describe("metadata merging", () => {
	it("merges source names for duplicate symbols", async () => {
		const config: UniverseConfig = {
			compose_mode: "union",
			sources: [createStaticSource("source1", ["AAPL"]), createStaticSource("source2", ["AAPL"])],
			max_instruments: 500,
		};
		const result = await resolveUniverse(config);
		expect(result.instruments).toHaveLength(1);
		expect(result.instruments[0]?.source).toBe("source1,source2");
	});
});
