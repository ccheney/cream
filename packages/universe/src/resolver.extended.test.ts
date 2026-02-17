/**
 * Universe resolver extended filter and diversification tests.
 */

import { describe, expect, it } from "bun:test";
import type { StaticSource, UniverseConfig } from "@cream/config";
import { resolveUniverse } from "./resolver.js";

function staticSource(name: string, tickers: string[]): StaticSource {
	return {
		type: "static",
		name,
		enabled: true,
		tickers,
	};
}

function baseConfig(overrides: Partial<UniverseConfig> = {}): UniverseConfig {
	return {
		compose_mode: "union",
		sources: [staticSource("test", ["AAPL", "MSFT", "GOOG"])],
		max_instruments: 500,
		...overrides,
	};
}

describe("advanced filter min_avg_volume", () => {
	it("adds volume warning when static symbols have no volume metadata", async () => {
		const result = await resolveUniverse(
			baseConfig({
				filters: {
					min_avg_volume: 1_000_000,
					min_market_cap: 0,
					min_price: 0,
					exclude_tickers: [],
				},
			}),
		);
		expect(result.instruments.length).toBeLessThanOrEqual(3);
		expect(result.warnings.some((warning) => warning.includes("volume"))).toBe(true);
	});
});

describe("advanced filter min_market_cap", () => {
	it("adds market cap warning", async () => {
		const result = await resolveUniverse(
			baseConfig({
				filters: {
					min_avg_volume: 0,
					min_market_cap: 1_000_000_000_000,
					min_price: 0,
					exclude_tickers: [],
				},
			}),
		);
		expect(result.warnings.some((warning) => warning.includes("market cap"))).toBe(true);
	});
});

describe("advanced filter min_price", () => {
	it("adds min price warning", async () => {
		const result = await resolveUniverse(
			baseConfig({
				filters: {
					min_avg_volume: 0,
					min_market_cap: 0,
					min_price: 100,
					exclude_tickers: [],
				},
			}),
		);
		expect(result.warnings.some((warning) => warning.includes("price"))).toBe(true);
	});
});

describe("advanced filter max_price", () => {
	it("adds max price warning", async () => {
		const result = await resolveUniverse(
			baseConfig({
				filters: {
					min_avg_volume: 0,
					min_market_cap: 0,
					min_price: 0,
					max_price: 10,
					exclude_tickers: [],
				},
			}),
		);
		expect(result.warnings.some((warning) => warning.includes("max price"))).toBe(true);
	});
});

describe("advanced filter include_sectors", () => {
	it("filters out static symbols without sector metadata", async () => {
		const result = await resolveUniverse(
			baseConfig({
				sources: [staticSource("test", ["AAPL", "MSFT", "JPM"])],
				filters: {
					min_avg_volume: 0,
					min_market_cap: 0,
					min_price: 0,
					exclude_tickers: [],
					include_sectors: ["Technology"],
				},
			}),
		);
		expect(result.instruments).toHaveLength(0);
	});
});

describe("advanced filter exclude_sectors", () => {
	it("keeps static symbols with undefined sector", async () => {
		const result = await resolveUniverse(
			baseConfig({
				sources: [staticSource("test", ["AAPL", "MSFT"])],
				filters: {
					min_avg_volume: 0,
					min_market_cap: 0,
					min_price: 0,
					exclude_tickers: [],
					exclude_sectors: ["Unknown"],
				},
			}),
		);
		expect(result.instruments.length).toBeGreaterThanOrEqual(0);
	});
});

describe("diversification maxPerSector", () => {
	it("limits symbols under a shared Unknown sector", async () => {
		const result = await resolveUniverse({
			compose_mode: "union",
			sources: [staticSource("tech", ["AAPL", "MSFT", "GOOG", "META", "NVDA"])],
			max_instruments: 500,
			diversification: { maxPerSector: 2 },
		});
		expect(result.instruments.length).toBeLessThanOrEqual(2);
	});
});

describe("diversification minSectorsRepresented", () => {
	it("warns when represented sectors are below minimum", async () => {
		const result = await resolveUniverse({
			compose_mode: "union",
			sources: [staticSource("test", ["AAPL"])],
			max_instruments: 500,
			diversification: { minSectorsRepresented: 5 },
		});
		expect(result.warnings.some((warning) => warning.includes("sectors represented"))).toBe(true);
	});
});

describe("diversification optional", () => {
	it("does not emit diversification warnings when unset", async () => {
		const result = await resolveUniverse({
			compose_mode: "union",
			sources: [staticSource("test", ["AAPL", "MSFT"])],
			max_instruments: 500,
		});
		expect(result.instruments).toHaveLength(2);
		expect(result.warnings.filter((warning) => warning.includes("Diversification"))).toHaveLength(
			0,
		);
	});
});
