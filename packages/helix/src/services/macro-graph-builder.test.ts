/**
 * Macro Graph Builder Tests
 *
 * Tests for the MacroGraphBuilder service including:
 * - Predefined macro entities validation
 * - Sector default sensitivities
 * - Correlation calculations
 * - Sensitivity conversion
 */

import { describe, expect, test } from "bun:test";
import {
	type CompanySensitivity,
	calculateRollingCorrelation,
	correlationToSensitivity,
	type EventMacroLink,
	getSectorDefaultSensitivities,
	type MacroCategory,
	PREDEFINED_MACRO_ENTITIES,
	SECTOR_DEFAULT_SENSITIVITIES,
} from "./macro-graph-builder.js";

// ============================================
// Predefined Macro Entities Tests
// ============================================

describe("PREDEFINED_MACRO_ENTITIES", () => {
	test("contains expected number of entities", () => {
		expect(PREDEFINED_MACRO_ENTITIES.length).toBe(19);
	});

	test("all entities have required fields", () => {
		for (const entity of PREDEFINED_MACRO_ENTITIES) {
			expect(entity.entity_id).toBeDefined();
			expect(entity.entity_id.length).toBeGreaterThan(0);
			expect(entity.name).toBeDefined();
			expect(entity.name.length).toBeGreaterThan(0);
			expect(entity.description).toBeDefined();
			expect(entity.frequency).toBeDefined();
			expect(entity.category).toBeDefined();
		}
	});

	test("entity IDs are unique", () => {
		const ids = PREDEFINED_MACRO_ENTITIES.map((e) => e.entity_id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	test("contains all expected categories", () => {
		const categories = new Set(PREDEFINED_MACRO_ENTITIES.map((e) => e.category));
		expect(categories.has("INTEREST_RATES")).toBe(true);
		expect(categories.has("COMMODITIES")).toBe(true);
		expect(categories.has("CURRENCIES")).toBe(true);
		expect(categories.has("VOLATILITY")).toBe(true);
		expect(categories.has("CREDIT")).toBe(true);
		expect(categories.has("ECONOMIC_INDICATORS")).toBe(true);
	});

	test("frequencies are valid MacroFrequency values", () => {
		const validFrequencies = ["MONTHLY", "QUARTERLY", "WEEKLY", "IRREGULAR"];
		for (const entity of PREDEFINED_MACRO_ENTITIES) {
			expect(validFrequencies).toContain(entity.frequency);
		}
	});

	test("contains key interest rate factors", () => {
		const interestRates = PREDEFINED_MACRO_ENTITIES.filter((e) => e.category === "INTEREST_RATES");
		const ids = interestRates.map((e) => e.entity_id);
		expect(ids).toContain("fed_funds_rate");
		expect(ids).toContain("treasury_10y");
		expect(ids).toContain("treasury_2y");
		expect(ids).toContain("yield_curve");
	});

	test("contains key commodity factors", () => {
		const commodities = PREDEFINED_MACRO_ENTITIES.filter((e) => e.category === "COMMODITIES");
		const ids = commodities.map((e) => e.entity_id);
		expect(ids).toContain("oil_wti");
		expect(ids).toContain("gold");
		expect(ids).toContain("copper");
	});

	test("contains VIX volatility factor", () => {
		const vix = PREDEFINED_MACRO_ENTITIES.find((e) => e.entity_id === "vix");
		expect(vix).toBeDefined();
		expect(vix?.category).toBe("VOLATILITY");
		expect(vix?.dataSymbol).toBe("^VIX");
	});
});

// ============================================
// Sector Default Sensitivities Tests
// ============================================

describe("SECTOR_DEFAULT_SENSITIVITIES", () => {
	test("contains expected sectors", () => {
		const sectors = Object.keys(SECTOR_DEFAULT_SENSITIVITIES);
		expect(sectors).toContain("Financial Services");
		expect(sectors).toContain("Technology");
		expect(sectors).toContain("Energy");
		expect(sectors).toContain("Healthcare");
		expect(sectors).toContain("Utilities");
		expect(sectors).toContain("Real Estate");
	});

	test("all sensitivity values are between 0 and 1", () => {
		for (const [_sector, sensitivities] of Object.entries(SECTOR_DEFAULT_SENSITIVITIES)) {
			for (const [_factor, value] of Object.entries(sensitivities)) {
				expect(value).toBeGreaterThanOrEqual(0);
				expect(value).toBeLessThanOrEqual(1);
			}
		}
	});

	test("Financial Services has high interest rate sensitivity", () => {
		const fs = SECTOR_DEFAULT_SENSITIVITIES["Financial Services"];
		expect(fs).toBeDefined();
		expect(fs?.fed_funds_rate).toBeGreaterThanOrEqual(0.8);
		expect(fs?.treasury_10y).toBeGreaterThanOrEqual(0.8);
	});

	test("Energy sector has high oil sensitivity", () => {
		const energy = SECTOR_DEFAULT_SENSITIVITIES.Energy;
		expect(energy).toBeDefined();
		expect(energy?.oil_wti).toBeGreaterThanOrEqual(0.9);
	});

	test("Real Estate has high rate sensitivity", () => {
		const re = SECTOR_DEFAULT_SENSITIVITIES["Real Estate"];
		expect(re).toBeDefined();
		expect(re?.treasury_10y).toBeGreaterThanOrEqual(0.8);
		expect(re?.fed_funds_rate).toBeGreaterThanOrEqual(0.8);
	});

	test("all macro entity IDs in sensitivities exist in predefined entities", () => {
		const predefinedIds = new Set(PREDEFINED_MACRO_ENTITIES.map((e) => e.entity_id));

		for (const [_sector, sensitivities] of Object.entries(SECTOR_DEFAULT_SENSITIVITIES)) {
			for (const macroId of Object.keys(sensitivities)) {
				expect(predefinedIds.has(macroId)).toBe(true);
			}
		}
	});
});

// ============================================
// Correlation Calculation Tests
// ============================================

describe("calculateRollingCorrelation", () => {
	test("returns 1.0 for perfectly correlated series", () => {
		const returnsA = [0.01, 0.02, -0.01, 0.03, 0.005];
		const returnsB = [0.01, 0.02, -0.01, 0.03, 0.005];
		const correlation = calculateRollingCorrelation(returnsA, returnsB);
		expect(correlation).toBeCloseTo(1.0, 4);
	});

	test("returns -1.0 for perfectly negatively correlated series", () => {
		const returnsA = [0.01, 0.02, -0.01, 0.03];
		const returnsB = [-0.01, -0.02, 0.01, -0.03];
		const correlation = calculateRollingCorrelation(returnsA, returnsB);
		expect(correlation).toBeCloseTo(-1.0, 4);
	});

	test("returns 0 for uncorrelated series", () => {
		const returnsA = [0.01, -0.01, 0.01, -0.01];
		const returnsB = [0.01, 0.01, -0.01, -0.01];
		const correlation = calculateRollingCorrelation(returnsA, returnsB);
		expect(Math.abs(correlation)).toBeLessThan(0.01);
	});

	test("returns 0 for series of different lengths", () => {
		const returnsA = [0.01, 0.02, -0.01];
		const returnsB = [0.01, 0.02];
		const correlation = calculateRollingCorrelation(returnsA, returnsB);
		expect(correlation).toBe(0);
	});

	test("returns 0 for series with less than 2 elements", () => {
		expect(calculateRollingCorrelation([0.01], [0.02])).toBe(0);
		expect(calculateRollingCorrelation([], [])).toBe(0);
	});

	test("returns 0 for constant series (no variance)", () => {
		const returnsA = [0.01, 0.01, 0.01, 0.01];
		const returnsB = [0.02, 0.03, 0.01, 0.04];
		const correlation = calculateRollingCorrelation(returnsA, returnsB);
		expect(correlation).toBe(0);
	});

	test("calculates correlation for typical stock-macro relationship", () => {
		// Bank stock returns vs Treasury yield changes
		const bankReturns = [0.02, -0.01, 0.015, -0.005, 0.01];
		const yieldChanges = [0.015, -0.008, 0.012, -0.003, 0.008];
		const correlation = calculateRollingCorrelation(bankReturns, yieldChanges);
		expect(correlation).toBeGreaterThan(0.8);
	});
});

// ============================================
// Sensitivity Conversion Tests
// ============================================

describe("correlationToSensitivity", () => {
	test("converts positive correlation to sensitivity", () => {
		expect(correlationToSensitivity(0.8)).toBe(0.8);
		expect(correlationToSensitivity(0.5)).toBe(0.5);
		expect(correlationToSensitivity(1.0)).toBe(1.0);
	});

	test("converts negative correlation to sensitivity (absolute value)", () => {
		expect(correlationToSensitivity(-0.8)).toBe(0.8);
		expect(correlationToSensitivity(-0.5)).toBe(0.5);
		expect(correlationToSensitivity(-1.0)).toBe(1.0);
	});

	test("caps sensitivity at 1.0", () => {
		expect(correlationToSensitivity(1.5)).toBe(1);
		expect(correlationToSensitivity(-1.5)).toBe(1);
	});

	test("returns 0 for zero correlation", () => {
		expect(correlationToSensitivity(0)).toBe(0);
	});
});

// ============================================
// Sector Default Sensitivity Retrieval Tests
// ============================================

describe("getSectorDefaultSensitivities", () => {
	test("returns sensitivities for known sector", () => {
		const sensitivities = getSectorDefaultSensitivities("Financial Services");
		expect(sensitivities.length).toBeGreaterThan(0);
		expect(sensitivities.every((s) => s.source === "sector_default")).toBe(true);
	});

	test("returns empty array for unknown sector", () => {
		const sensitivities = getSectorDefaultSensitivities("Unknown Sector");
		expect(sensitivities).toEqual([]);
	});

	test("returns correct structure for sensitivities", () => {
		const sensitivities = getSectorDefaultSensitivities("Technology");
		expect(sensitivities.length).toBeGreaterThan(0);

		for (const sensitivity of sensitivities) {
			expect(sensitivity.companySymbol).toBe("");
			expect(sensitivity.macroEntityId).toBeDefined();
			expect(sensitivity.sensitivity).toBeGreaterThan(0);
			expect(sensitivity.sensitivity).toBeLessThanOrEqual(1);
			expect(sensitivity.source).toBe("sector_default");
		}
	});

	test("Energy sector includes oil sensitivity", () => {
		const sensitivities = getSectorDefaultSensitivities("Energy");
		const oilSensitivity = sensitivities.find((s) => s.macroEntityId === "oil_wti");
		expect(oilSensitivity).toBeDefined();
		expect(oilSensitivity?.sensitivity).toBeGreaterThanOrEqual(0.9);
	});
});

// ============================================
// Company Sensitivity Data Structure Tests
// ============================================

describe("CompanySensitivity structure", () => {
	const sensitivities: CompanySensitivity[] = [
		{
			companySymbol: "JPM",
			macroEntityId: "fed_funds_rate",
			sensitivity: 0.9,
			source: "calculated",
			lookbackDays: 252,
		},
		{
			companySymbol: "JPM",
			macroEntityId: "treasury_10y",
			sensitivity: 0.85,
			source: "sector_default",
		},
		{
			companySymbol: "XOM",
			macroEntityId: "oil_wti",
			sensitivity: 0.95,
			source: "calculated",
			lookbackDays: 126,
		},
	];

	test("sensitivities have valid sensitivity values", () => {
		expect(sensitivities.every((s) => s.sensitivity >= 0 && s.sensitivity <= 1)).toBe(true);
	});

	test("calculated sensitivities have lookback days", () => {
		const calculated = sensitivities.filter((s) => s.source === "calculated");
		expect(calculated.every((s) => s.lookbackDays !== undefined)).toBe(true);
	});

	test("can filter sensitivities by company", () => {
		const jpmSensitivities = sensitivities.filter((s) => s.companySymbol === "JPM");
		expect(jpmSensitivities.length).toBe(2);
	});

	test("can sort sensitivities by sensitivity score", () => {
		const sorted = sensitivities.toSorted((a, b) => b.sensitivity - a.sensitivity);
		expect(sorted[0]?.companySymbol).toBe("XOM");
		expect(sorted[0]?.sensitivity).toBe(0.95);
	});
});

// ============================================
// Event Macro Link Tests
// ============================================

describe("EventMacroLink structure", () => {
	const links: EventMacroLink[] = [
		{ eventId: "fomc-2024-01", macroEntityId: "fed_funds_rate" },
		{ eventId: "cpi-2024-01", macroEntityId: "cpi" },
		{ eventId: "opec-meeting-2024-01", macroEntityId: "oil_wti" },
		{ eventId: "jobs-report-2024-01", macroEntityId: "unemployment" },
	];

	test("all links have valid structure", () => {
		for (const link of links) {
			expect(link.eventId).toBeDefined();
			expect(link.eventId.length).toBeGreaterThan(0);
			expect(link.macroEntityId).toBeDefined();
			expect(link.macroEntityId.length).toBeGreaterThan(0);
		}
	});

	test("can group links by macro entity", () => {
		const byEntity = Map.groupBy(links, (l) => l.macroEntityId);
		expect(byEntity.get("fed_funds_rate")?.length).toBe(1);
		expect(byEntity.get("cpi")?.length).toBe(1);
	});
});

// ============================================
// Macro Category Tests
// ============================================

describe("MacroCategory enum", () => {
	test("all categories are valid strings", () => {
		const validCategories: MacroCategory[] = [
			"INTEREST_RATES",
			"COMMODITIES",
			"CURRENCIES",
			"VOLATILITY",
			"CREDIT",
			"ECONOMIC_INDICATORS",
		];

		const entityCategories = new Set(PREDEFINED_MACRO_ENTITIES.map((e) => e.category));

		for (const category of entityCategories) {
			expect(validCategories).toContain(category);
		}
	});

	test("can filter entities by category", () => {
		const interestRates = PREDEFINED_MACRO_ENTITIES.filter((e) => e.category === "INTEREST_RATES");
		expect(interestRates.length).toBe(4);

		const commodities = PREDEFINED_MACRO_ENTITIES.filter((e) => e.category === "COMMODITIES");
		expect(commodities.length).toBe(3);

		const currencies = PREDEFINED_MACRO_ENTITIES.filter((e) => e.category === "CURRENCIES");
		expect(currencies.length).toBe(3);

		const volatility = PREDEFINED_MACRO_ENTITIES.filter((e) => e.category === "VOLATILITY");
		expect(volatility.length).toBe(2);

		const credit = PREDEFINED_MACRO_ENTITIES.filter((e) => e.category === "CREDIT");
		expect(credit.length).toBe(2);

		const economic = PREDEFINED_MACRO_ENTITIES.filter((e) => e.category === "ECONOMIC_INDICATORS");
		expect(economic.length).toBe(5);
	});
});
