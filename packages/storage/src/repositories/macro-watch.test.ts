/**
 * MacroWatch Repository Tests
 */

import { describe, expect, test } from "bun:test";
import type {
	CreateMacroWatchEntryInput,
	CreateMorningNewspaperInput,
	MacroWatchCategory,
	MacroWatchSession,
	NewspaperSections,
} from "./macro-watch";

describe("MacroWatch Repository Types", () => {
	describe("MacroWatchEntry creation", () => {
		test("accepts valid entry input", () => {
			const input: CreateMacroWatchEntryInput = {
				id: "news-12345",
				timestamp: "2024-01-15T08:30:00Z",
				session: "PRE_MARKET",
				category: "NEWS",
				headline: "AAPL reports record earnings",
				symbols: ["AAPL"],
				source: "Benzinga",
				metadata: { articleId: 12345 },
			};

			expect(input.id).toBe("news-12345");
			expect(input.session).toBe("PRE_MARKET");
			expect(input.category).toBe("NEWS");
			expect(input.symbols).toEqual(["AAPL"]);
		});

		test("accepts entry without metadata", () => {
			const input: CreateMacroWatchEntryInput = {
				id: "mover-TSLA",
				timestamp: "2024-01-15T06:00:00Z",
				session: "OVERNIGHT",
				category: "MOVER",
				headline: "TSLA +5.2%",
				symbols: ["TSLA"],
				source: "Alpaca Screener",
			};

			expect(input.metadata).toBeUndefined();
		});

		test("supports all session types", () => {
			const sessions: MacroWatchSession[] = ["OVERNIGHT", "PRE_MARKET", "AFTER_HOURS"];

			for (const session of sessions) {
				const input: CreateMacroWatchEntryInput = {
					id: `test-${session}`,
					timestamp: "2024-01-15T00:00:00Z",
					session,
					category: "NEWS",
					headline: "Test",
					symbols: [],
					source: "Test",
				};
				expect(input.session).toBe(session);
			}
		});

		test("supports all category types", () => {
			const categories: MacroWatchCategory[] = [
				"NEWS",
				"PREDICTION",
				"ECONOMIC",
				"MOVER",
				"EARNINGS",
			];

			for (const category of categories) {
				const input: CreateMacroWatchEntryInput = {
					id: `test-${category}`,
					timestamp: "2024-01-15T00:00:00Z",
					session: "OVERNIGHT",
					category,
					headline: "Test",
					symbols: [],
					source: "Test",
				};
				expect(input.category).toBe(category);
			}
		});
	});

	describe("MorningNewspaper creation", () => {
		test("accepts valid newspaper input", () => {
			const sections: NewspaperSections = {
				macro: ["Fed signals rate cut", "Oil prices surge"],
				universe: ["AAPL +3.5% on earnings beat"],
				predictionMarkets: ["Fed rate cut probability: 75%"],
				economicCalendar: ["CPI release 8:30 AM ET"],
			};

			const input: CreateMorningNewspaperInput = {
				id: "newspaper-2024-01-15",
				date: "2024-01-15",
				compiledAt: "2024-01-15T09:00:00Z",
				sections,
				rawEntryIds: ["news-1", "news-2", "mover-1"],
			};

			expect(input.id).toBe("newspaper-2024-01-15");
			expect(input.date).toBe("2024-01-15");
			expect(input.sections.macro).toHaveLength(2);
			expect(input.rawEntryIds).toHaveLength(3);
		});

		test("accepts newspaper with empty sections", () => {
			const sections: NewspaperSections = {
				macro: ["No significant developments"],
				universe: ["No significant developments"],
				predictionMarkets: ["No significant changes"],
				economicCalendar: ["No releases expected"],
			};

			const input: CreateMorningNewspaperInput = {
				id: "newspaper-2024-01-16",
				date: "2024-01-16",
				compiledAt: "2024-01-16T09:00:00Z",
				sections,
				rawEntryIds: [],
			};

			expect(input.rawEntryIds).toHaveLength(0);
		});
	});

	describe("NewspaperSections structure", () => {
		test("all section fields are arrays", () => {
			const sections: NewspaperSections = {
				macro: [],
				universe: [],
				predictionMarkets: [],
				economicCalendar: [],
			};

			expect(Array.isArray(sections.macro)).toBe(true);
			expect(Array.isArray(sections.universe)).toBe(true);
			expect(Array.isArray(sections.predictionMarkets)).toBe(true);
			expect(Array.isArray(sections.economicCalendar)).toBe(true);
		});

		test("sections can have multiple items", () => {
			const sections: NewspaperSections = {
				macro: [
					"Federal Reserve signals policy shift",
					"Oil prices surge amid Middle East tensions",
					"Eurozone inflation data beats expectations",
				],
				universe: [
					"AAPL: Record quarterly revenue reported",
					"MSFT: Azure growth accelerates",
					"GOOGL: Ad revenue concerns addressed",
				],
				predictionMarkets: ["Fed rate cut probability: 65%", "Recession 12m probability: 25%"],
				economicCalendar: ["CPI release 8:30 AM ET (HIGH impact)", "FOMC minutes 2:00 PM ET"],
			};

			expect(sections.macro).toHaveLength(3);
			expect(sections.universe).toHaveLength(3);
			expect(sections.predictionMarkets).toHaveLength(2);
			expect(sections.economicCalendar).toHaveLength(2);
		});
	});
});
