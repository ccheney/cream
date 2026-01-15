/**
 * Morning Newspaper Service Tests
 */

import { describe, expect, test } from "bun:test";
import type { MacroWatchEntry } from "@cream/storage";

import {
	compileMorningNewspaper,
	compileNewspaper,
	createNewspaperContent,
	formatNewspaperForLLM,
} from "./newspaper";

describe("Morning Newspaper Service", () => {
	const mockEntries: MacroWatchEntry[] = [
		{
			id: "news-1",
			timestamp: "2024-01-15T06:00:00Z",
			session: "OVERNIGHT",
			category: "NEWS",
			headline: "AAPL announces new product",
			symbols: ["AAPL"],
			source: "Benzinga",
			metadata: null,
			createdAt: "2024-01-15T06:00:00Z",
		},
		{
			id: "news-2",
			timestamp: "2024-01-15T07:00:00Z",
			session: "PRE_MARKET",
			category: "NEWS",
			headline: "Fed signals policy shift",
			symbols: ["SPY", "QQQ"],
			source: "Reuters",
			metadata: null,
			createdAt: "2024-01-15T07:00:00Z",
		},
		{
			id: "mover-1",
			timestamp: "2024-01-15T08:00:00Z",
			session: "PRE_MARKET",
			category: "MOVER",
			headline: "TSLA +5.2% pre-market",
			symbols: ["TSLA"],
			source: "Alpaca Screener",
			metadata: null,
			createdAt: "2024-01-15T08:00:00Z",
		},
		{
			id: "prediction-1",
			timestamp: "2024-01-15T04:00:00Z",
			session: "OVERNIGHT",
			category: "PREDICTION",
			headline: "Fed rate cut probability: 65%",
			symbols: ["FED_RATE"],
			source: "KALSHI",
			metadata: null,
			createdAt: "2024-01-15T04:00:00Z",
		},
		{
			id: "economic-1",
			timestamp: "2024-01-15T05:00:00Z",
			session: "OVERNIGHT",
			category: "ECONOMIC",
			headline: "CPI release expected 8:30 AM ET (HIGH impact)",
			symbols: ["SPY", "QQQ"],
			source: "Economic Calendar",
			metadata: null,
			createdAt: "2024-01-15T05:00:00Z",
		},
	];

	const universeSymbols = ["AAPL", "MSFT", "TSLA"];

	describe("compileNewspaper", () => {
		test("categorizes entries correctly", () => {
			const sections = compileNewspaper(mockEntries, universeSymbols);

			// Should have universe news for AAPL and TSLA (in universe)
			expect(sections.universe.some((s) => s.includes("AAPL"))).toBe(true);
			expect(sections.universe.some((s) => s.includes("TSLA"))).toBe(true);

			// Should have macro news for Fed story (SPY/QQQ not in universe)
			expect(sections.macro.some((s) => s.includes("Fed"))).toBe(true);

			// Should have prediction markets
			expect(sections.predictionMarkets.some((s) => s.includes("Fed rate"))).toBe(true);

			// Should have economic calendar
			expect(sections.economicCalendar.some((s) => s.includes("CPI"))).toBe(true);
		});

		test("handles empty entries", () => {
			const sections = compileNewspaper([], universeSymbols);

			expect(sections.macro).toContain("No significant macro developments");
			expect(sections.universe).toContain("No significant universe developments");
			expect(sections.predictionMarkets).toContain("No significant prediction market changes");
			expect(sections.economicCalendar).toContain("No economic releases expected today");
		});

		test("filters universe news correctly", () => {
			const sections = compileNewspaper(mockEntries, ["AAPL"]);

			// AAPL news should be in universe section
			const universeHasAAPL = sections.universe.some((s) => s.includes("AAPL"));
			expect(universeHasAAPL).toBe(true);

			// TSLA (not in universe) should still appear as mover since it's still universe-related in original entry
			// but Fed news should be in macro
			const macroHasFed = sections.macro.some((s) => s.includes("Fed"));
			expect(macroHasFed).toBe(true);
		});
	});

	describe("formatNewspaperForLLM", () => {
		test("formats sections as markdown", () => {
			const sections = compileNewspaper(mockEntries, universeSymbols);
			const formatted = formatNewspaperForLLM(sections);

			expect(formatted).toContain("## Morning Newspaper");
			expect(formatted).toContain("### Macro Headlines");
			expect(formatted).toContain("### Universe News");
			expect(formatted).toContain("### Prediction Markets");
			expect(formatted).toContain("### Economic Calendar");
		});

		test("includes bullet points", () => {
			const sections = {
				macro: ["Test macro headline"],
				universe: ["Test universe headline"],
				predictionMarkets: ["Test prediction"],
				economicCalendar: ["Test economic"],
			};

			const formatted = formatNewspaperForLLM(sections);

			expect(formatted).toContain("Test macro headline");
			expect(formatted).toContain("Test universe headline");
		});
	});

	describe("createNewspaperContent", () => {
		test("creates complete content object", () => {
			const content = createNewspaperContent(mockEntries, universeSymbols);

			expect(content.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(content.compiledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
			expect(content.summary).toContain("## Morning Newspaper");
			expect(content.entryCount).toBe(mockEntries.length);
			expect(content.sections.macro).toBeDefined();
			expect(content.sections.universe).toBeDefined();
			expect(content.sections.predictionMarkets).toBeDefined();
			expect(content.sections.economicCalendar).toBeDefined();
		});
	});

	describe("compileMorningNewspaper", () => {
		test("returns content and storage input", () => {
			const result = compileMorningNewspaper(mockEntries, universeSymbols);

			expect(result.content).toBeDefined();
			expect(result.storageInput).toBeDefined();
			expect(result.content.entryCount).toBe(mockEntries.length);
			expect(result.storageInput.rawEntryIds).toHaveLength(mockEntries.length);
		});

		test("storage input has correct format", () => {
			const result = compileMorningNewspaper(mockEntries, universeSymbols);

			expect(result.storageInput.id).toMatch(/^newspaper-\d{4}-\d{2}-\d{2}-\d+$/);
			expect(result.storageInput.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(result.storageInput.compiledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
			expect(result.storageInput.sections).toBeDefined();
			expect(Array.isArray(result.storageInput.sections.macro)).toBe(true);
		});
	});
});
