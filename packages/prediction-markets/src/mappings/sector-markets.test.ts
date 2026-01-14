/**
 * Tests for Sector-Specific Market Mappings
 */

import { describe, expect, test } from "bun:test";
import {
	findRelatedInstruments,
	findSectorMatches,
	getAggregateImpact,
	getPrimarySector,
	getSectorETFs,
	isHighVolatilityMarket,
	SECTOR_MAPPINGS,
} from "./sector-markets";

describe("SECTOR_MAPPINGS", () => {
	test("has mappings for all major sectors", () => {
		const sectors = new Set(SECTOR_MAPPINGS.map((m) => m.sector));

		expect(sectors.has("HEALTHCARE")).toBe(true);
		expect(sectors.has("TECHNOLOGY")).toBe(true);
		expect(sectors.has("ENERGY")).toBe(true);
		expect(sectors.has("FINANCIALS")).toBe(true);
		expect(sectors.has("REAL_ESTATE")).toBe(true);
	});

	test("all mappings have required fields", () => {
		for (const mapping of SECTOR_MAPPINGS) {
			expect(mapping.marketPattern).toBeDefined();
			expect(mapping.sector).toBeDefined();
			expect(mapping.relatedInstruments.length).toBeGreaterThan(0);
			expect(["POSITIVE", "NEGATIVE", "MIXED"]).toContain(mapping.impactDirection);
			expect(["HIGH", "MEDIUM", "LOW"]).toContain(mapping.volatilityExpectation);
		}
	});
});

describe("findRelatedInstruments", () => {
	test("finds instruments for FDA approval markets", () => {
		const instruments = findRelatedInstruments("Will the FDA approve Pfizer's new cancer drug?");

		expect(instruments).toContain("XLV");
		expect(instruments).toContain("IBB");
		expect(instruments).toContain("XBI");
	});

	test("finds instruments for Fed rate decisions", () => {
		const instruments = findRelatedInstruments("Will the Fed cut interest rates in January?");

		expect(instruments).toContain("XLF");
		expect(instruments).toContain("TLT");
		expect(instruments).toContain("KRE");
	});

	test("finds instruments for antitrust cases", () => {
		const instruments = findRelatedInstruments("Will Google face antitrust breakup?");

		expect(instruments).toContain("XLK");
		expect(instruments).toContain("QQQ");
		expect(instruments).toContain("GOOGL");
	});

	test("finds instruments for oil markets", () => {
		const instruments = findRelatedInstruments("Will OPEC cut oil production?");

		expect(instruments).toContain("XLE");
		expect(instruments).toContain("XOP");
		expect(instruments).toContain("USO");
	});

	test("deduplicates instruments from multiple matches", () => {
		const instruments = findRelatedInstruments("Fed rate decision and inflation CPI data");

		// Should contain instruments from both Fed and inflation mappings
		expect(instruments).toContain("TLT");
		expect(instruments).toContain("XLF");

		// No duplicates
		const uniqueCount = new Set(instruments).size;
		expect(uniqueCount).toBe(instruments.length);
	});

	test("returns empty array for unmatched questions", () => {
		const instruments = findRelatedInstruments("What color is the sky?");
		expect(instruments).toEqual([]);
	});
});

describe("findSectorMatches", () => {
	test("returns all matching sectors", () => {
		const matches = findSectorMatches("Will the Fed cut rates and cause inflation?");

		expect(matches.length).toBeGreaterThanOrEqual(2);
		expect(matches.some((m) => m.sector === "FINANCIALS")).toBe(true);
	});

	test("includes impact direction and volatility", () => {
		const matches = findSectorMatches("FDA approval decision for new drug");

		expect(matches.length).toBeGreaterThan(0);
		expect(matches[0].impactDirection).toBe("POSITIVE");
		expect(matches[0].volatilityExpectation).toBe("HIGH");
	});

	test("returns empty array for no matches", () => {
		const matches = findSectorMatches("Random unrelated question");
		expect(matches).toEqual([]);
	});
});

describe("getPrimarySector", () => {
	test("returns primary sector for single match", () => {
		const sector = getPrimarySector("FDA drug approval decision");
		expect(sector).toBe("HEALTHCARE");
	});

	test("returns highest volatility sector for multiple matches", () => {
		// Fed decisions are HIGH volatility
		const sector = getPrimarySector("Federal Reserve rate cut decision");
		expect(sector).toBe("FINANCIALS");
	});

	test("returns null for no matches", () => {
		const sector = getPrimarySector("Unrelated question");
		expect(sector).toBeNull();
	});
});

describe("getSectorETFs", () => {
	test("filters out individual stocks", () => {
		const etfs = getSectorETFs("Google antitrust breakup decision");

		// Should have ETFs
		expect(etfs).toContain("XLK");
		expect(etfs).toContain("QQQ");

		// Should not have individual stocks (this is a simplified check)
		// GOOGL should be filtered if our list is complete
		expect(etfs.every((e) => e.length <= 4)).toBe(true);
	});

	test("returns known ETFs only", () => {
		const etfs = getSectorETFs("Fed rate decision impact on banks");

		expect(etfs).toContain("XLF");
		expect(etfs).toContain("TLT");
		expect(etfs).toContain("KRE");
		expect(etfs).toContain("KBE");
	});
});

describe("isHighVolatilityMarket", () => {
	test("returns true for high volatility markets", () => {
		expect(isHighVolatilityMarket("FDA drug approval")).toBe(true);
		expect(isHighVolatilityMarket("Fed rate decision")).toBe(true);
		expect(isHighVolatilityMarket("Antitrust breakup")).toBe(true);
	});

	test("returns false for low volatility markets", () => {
		expect(isHighVolatilityMarket("Electric grid regulation")).toBe(false);
	});

	test("returns false for unmatched markets", () => {
		expect(isHighVolatilityMarket("Random question")).toBe(false);
	});
});

describe("getAggregateImpact", () => {
	test("returns POSITIVE for positive-only matches", () => {
		const impact = getAggregateImpact("FDA drug approval success");
		expect(impact).toBe("POSITIVE");
	});

	test("returns NEGATIVE for negative-only matches", () => {
		const impact = getAggregateImpact("Antitrust monopoly breakup case");
		expect(impact).toBe("NEGATIVE");
	});

	test("returns MIXED for mixed or multiple directions", () => {
		const impact = getAggregateImpact("Fed rate decision on banks");
		expect(impact).toBe("MIXED");
	});

	test("returns MIXED for unmatched markets", () => {
		const impact = getAggregateImpact("Random question");
		expect(impact).toBe("MIXED");
	});
});

describe("Real-world market questions", () => {
	test("matches 2026 Fed rate cut prediction", () => {
		const question = "Will the Federal Reserve cut rates by 25 bps at January FOMC meeting?";
		const instruments = findRelatedInstruments(question);

		expect(instruments.length).toBeGreaterThan(0);
		expect(instruments).toContain("XLF");
		expect(isHighVolatilityMarket(question)).toBe(true);
	});

	test("matches recession probability market", () => {
		const question = "Will there be a US recession in 2026?";
		const instruments = findRelatedInstruments(question);

		expect(instruments.length).toBeGreaterThan(0);
		expect(instruments).toContain("SPY");
		expect(instruments).toContain("TLT");
	});

	test("matches China tariff market", () => {
		const question = "Will the US impose new tariffs on China in 2026?";
		const instruments = findRelatedInstruments(question);

		expect(instruments.length).toBeGreaterThan(0);
		// Tariff + China patterns
		expect(instruments).toContain("FXI");
	});

	test("matches CPI inflation market", () => {
		const question = "Will CPI inflation exceed 3% in Q1 2026?";
		const instruments = findRelatedInstruments(question);

		expect(instruments).toContain("TIP");
		expect(instruments).toContain("GLD");
		expect(isHighVolatilityMarket(question)).toBe(true);
	});
});
