/**
 * MacroWatch Schemas Tests
 */

import { describe, expect, test } from "bun:test";
import {
	MacroWatchCategorySchema,
	MacroWatchEntrySchema,
	MacroWatchInputSchema,
	MacroWatchOutputSchema,
	MacroWatchSessionSchema,
} from "./schemas";

describe("MacroWatch Schemas", () => {
	describe("MacroWatchSessionSchema", () => {
		test("accepts valid sessions", () => {
			expect(MacroWatchSessionSchema.parse("OVERNIGHT")).toBe("OVERNIGHT");
			expect(MacroWatchSessionSchema.parse("PRE_MARKET")).toBe("PRE_MARKET");
			expect(MacroWatchSessionSchema.parse("AFTER_HOURS")).toBe("AFTER_HOURS");
		});

		test("rejects invalid sessions", () => {
			expect(() => MacroWatchSessionSchema.parse("RTH")).toThrow();
			expect(() => MacroWatchSessionSchema.parse("CLOSED")).toThrow();
		});
	});

	describe("MacroWatchCategorySchema", () => {
		test("accepts valid categories", () => {
			expect(MacroWatchCategorySchema.parse("NEWS")).toBe("NEWS");
			expect(MacroWatchCategorySchema.parse("PREDICTION")).toBe("PREDICTION");
			expect(MacroWatchCategorySchema.parse("ECONOMIC")).toBe("ECONOMIC");
			expect(MacroWatchCategorySchema.parse("MOVER")).toBe("MOVER");
			expect(MacroWatchCategorySchema.parse("EARNINGS")).toBe("EARNINGS");
		});

		test("rejects invalid categories", () => {
			expect(() => MacroWatchCategorySchema.parse("STOCK")).toThrow();
			expect(() => MacroWatchCategorySchema.parse("invalid")).toThrow();
		});
	});

	describe("MacroWatchEntrySchema", () => {
		test("validates complete entry", () => {
			const entry = {
				id: "news-12345",
				timestamp: "2024-01-15T08:30:00Z",
				session: "PRE_MARKET",
				category: "NEWS",
				headline: "AAPL reports record Q4 earnings",
				symbols: ["AAPL"],
				source: "Benzinga",
				metadata: { articleId: 12345, summary: "Apple Inc..." },
			};

			const result = MacroWatchEntrySchema.safeParse(entry);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.id).toBe("news-12345");
				expect(result.data.symbols).toEqual(["AAPL"]);
				expect(result.data.metadata?.articleId).toBe(12345);
			}
		});

		test("validates entry without metadata", () => {
			const entry = {
				id: "mover-TSLA-123",
				timestamp: "2024-01-15T06:00:00Z",
				session: "OVERNIGHT",
				category: "MOVER",
				headline: "TSLA +5.2% pre-market",
				symbols: ["TSLA"],
				source: "Alpaca Screener",
			};

			const result = MacroWatchEntrySchema.safeParse(entry);
			expect(result.success).toBe(true);
		});

		test("validates entry with multiple symbols", () => {
			const entry = {
				id: "news-67890",
				timestamp: "2024-01-15T09:00:00Z",
				session: "PRE_MARKET",
				category: "NEWS",
				headline: "Tech sector rally continues",
				symbols: ["AAPL", "MSFT", "GOOGL", "META"],
				source: "Reuters",
			};

			const result = MacroWatchEntrySchema.safeParse(entry);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.symbols).toHaveLength(4);
			}
		});

		test("rejects entry with missing required fields", () => {
			const invalidEntry = {
				id: "news-123",
				timestamp: "2024-01-15T08:30:00Z",
				// missing session, category, headline, symbols, source
			};

			const result = MacroWatchEntrySchema.safeParse(invalidEntry);
			expect(result.success).toBe(false);
		});
	});

	describe("MacroWatchInputSchema", () => {
		test("validates valid input", () => {
			const input = {
				symbols: ["AAPL", "MSFT", "GOOGL"],
				since: "2024-01-15T00:00:00Z",
			};

			const result = MacroWatchInputSchema.safeParse(input);
			expect(result.success).toBe(true);
		});

		test("accepts empty symbols array", () => {
			const input = {
				symbols: [],
				since: "2024-01-15T00:00:00Z",
			};

			const result = MacroWatchInputSchema.safeParse(input);
			expect(result.success).toBe(true);
		});
	});

	describe("MacroWatchOutputSchema", () => {
		test("validates valid output", () => {
			const output = {
				entries: [
					{
						id: "news-123",
						timestamp: "2024-01-15T08:30:00Z",
						session: "PRE_MARKET",
						category: "NEWS",
						headline: "Test headline",
						symbols: ["AAPL"],
						source: "Test",
					},
				],
				totalCount: 1,
				timestamp: "2024-01-15T09:00:00Z",
			};

			const result = MacroWatchOutputSchema.safeParse(output);
			expect(result.success).toBe(true);
		});

		test("validates empty output", () => {
			const output = {
				entries: [],
				totalCount: 0,
				timestamp: "2024-01-15T09:00:00Z",
			};

			const result = MacroWatchOutputSchema.safeParse(output);
			expect(result.success).toBe(true);
		});
	});
});
