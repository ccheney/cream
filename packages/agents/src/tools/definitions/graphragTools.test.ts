/**
 * GraphRAG Tool Definition Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";

import { describe, expect, test } from "bun:test";
import {
	GraphRAGQueryInputSchema,
	type GraphRAGQueryOutput,
	GraphRAGQueryOutputSchema,
	graphragQueryTool,
} from "./graphragTools";

// ============================================
// Tool Definition Tests
// ============================================

describe("graphragQueryTool", () => {
	test("has correct id", () => {
		expect(graphragQueryTool.id).toBe("graphrag_query");
	});

	test("has description mentioning semantic search", () => {
		expect(graphragQueryTool.description).toContain("semantic search");
	});

	test("has description mentioning filings", () => {
		expect(graphragQueryTool.description).toContain("filing");
	});

	test("has description mentioning transcripts", () => {
		expect(graphragQueryTool.description).toContain("transcript");
	});

	test("has description mentioning news", () => {
		expect(graphragQueryTool.description).toContain("news");
	});

	test("has description mentioning companies", () => {
		expect(graphragQueryTool.description).toContain("compan");
	});

	test("has input schema defined", () => {
		expect(graphragQueryTool.inputSchema).toBeDefined();
	});

	test("has output schema defined", () => {
		expect(graphragQueryTool.outputSchema).toBeDefined();
	});

	test("returns empty results in BACKTEST mode", async () => {
		const result = (await graphragQueryTool.execute({
			query: "semiconductor supply chain constraints",
			limit: 10,
		})) as GraphRAGQueryOutput;

		expect(result.filingChunks).toEqual([]);
		expect(result.transcriptChunks).toEqual([]);
		expect(result.newsItems).toEqual([]);
		expect(result.externalEvents).toEqual([]);
		expect(result.companies).toEqual([]);
		expect(result.executionTimeMs).toBe(0);
	});

	test("handles symbol filter in BACKTEST mode", async () => {
		const result = (await graphragQueryTool.execute({
			query: "revenue growth",
			symbol: "AAPL",
			limit: 5,
		})) as GraphRAGQueryOutput;

		expect(result.filingChunks).toEqual([]);
		expect(result.companies).toEqual([]);
	});
});

// ============================================
// Input Schema Tests
// ============================================

describe("GraphRAGQueryInputSchema", () => {
	test("accepts valid input with query only", () => {
		const input = { query: "semiconductor supply chain" };
		const result = GraphRAGQueryInputSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("accepts valid input with all fields", () => {
		const input = {
			query: "revenue growth analysis",
			limit: 20,
			symbol: "AAPL",
		};
		const result = GraphRAGQueryInputSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("rejects empty query", () => {
		const input = { query: "" };
		const result = GraphRAGQueryInputSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("rejects query shorter than 3 characters", () => {
		const input = { query: "ab" };
		const result = GraphRAGQueryInputSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("rejects limit less than 1", () => {
		const input = { query: "test query", limit: 0 };
		const result = GraphRAGQueryInputSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("rejects limit greater than 50", () => {
		const input = { query: "test query", limit: 51 };
		const result = GraphRAGQueryInputSchema.safeParse(input);
		expect(result.success).toBe(false);
	});

	test("accepts limit at boundaries", () => {
		const input1 = { query: "test query", limit: 1 };
		const input50 = { query: "test query", limit: 50 };

		expect(GraphRAGQueryInputSchema.safeParse(input1).success).toBe(true);
		expect(GraphRAGQueryInputSchema.safeParse(input50).success).toBe(true);
	});

	test("accepts missing limit (optional)", () => {
		const input = { query: "test query" };
		const result = GraphRAGQueryInputSchema.safeParse(input);
		expect(result.success).toBe(true);
	});

	test("accepts missing symbol (optional)", () => {
		const input = { query: "test query", limit: 10 };
		const result = GraphRAGQueryInputSchema.safeParse(input);
		expect(result.success).toBe(true);
	});
});

// ============================================
// Output Schema Tests
// ============================================

describe("GraphRAGQueryOutputSchema", () => {
	test("validates empty result", () => {
		const output = {
			filingChunks: [],
			transcriptChunks: [],
			newsItems: [],
			externalEvents: [],
			companies: [],
			executionTimeMs: 0,
		};
		const result = GraphRAGQueryOutputSchema.safeParse(output);
		expect(result.success).toBe(true);
	});

	test("validates result with filing chunks", () => {
		const output = {
			filingChunks: [
				{
					id: "fc-001",
					filingId: "10K-2024-AAPL",
					companySymbol: "AAPL",
					filingType: "10-K",
					filingDate: "2024-01-15",
					chunkText: "Supply chain risks...",
					chunkIndex: 5,
					score: 0.95,
				},
			],
			transcriptChunks: [],
			newsItems: [],
			externalEvents: [],
			companies: [],
			executionTimeMs: 15,
		};
		const result = GraphRAGQueryOutputSchema.safeParse(output);
		expect(result.success).toBe(true);
	});

	test("validates result with transcript chunks", () => {
		const output = {
			filingChunks: [],
			transcriptChunks: [
				{
					id: "tc-001",
					transcriptId: "Q4-2024-NVDA",
					companySymbol: "NVDA",
					callDate: "2024-02-20",
					speaker: "Jensen Huang",
					chunkText: "Strong demand for AI...",
					chunkIndex: 12,
					score: 0.88,
				},
			],
			newsItems: [],
			externalEvents: [],
			companies: [],
			executionTimeMs: 10,
		};
		const result = GraphRAGQueryOutputSchema.safeParse(output);
		expect(result.success).toBe(true);
	});

	test("validates result with news items", () => {
		const output = {
			filingChunks: [],
			transcriptChunks: [],
			newsItems: [
				{
					id: "ni-001",
					headline: "Tech stocks rally",
					bodyText: "Major tech companies...",
					source: "Reuters",
					relatedSymbols: "AAPL,MSFT",
					sentimentScore: 0.5,
					score: 0.82,
				},
			],
			externalEvents: [],
			companies: [],
			executionTimeMs: 8,
		};
		const result = GraphRAGQueryOutputSchema.safeParse(output);
		expect(result.success).toBe(true);
	});

	test("validates result with external events", () => {
		const output = {
			filingChunks: [],
			transcriptChunks: [],
			newsItems: [],
			externalEvents: [
				{
					id: "ee-001",
					eventId: "evt-001",
					eventType: "macro",
					textSummary: "Fed raises rates",
					relatedInstrumentIds: "SPY,QQQ",
					score: 0.75,
				},
			],
			companies: [],
			executionTimeMs: 5,
		};
		const result = GraphRAGQueryOutputSchema.safeParse(output);
		expect(result.success).toBe(true);
	});

	test("validates result with companies", () => {
		const output = {
			filingChunks: [],
			transcriptChunks: [],
			newsItems: [],
			externalEvents: [],
			companies: [
				{
					id: "comp-aapl",
					symbol: "AAPL",
					name: "Apple Inc.",
					sector: "Technology",
					industry: "Consumer Electronics",
					marketCapBucket: "mega",
					source: "filing",
				},
				{
					id: "comp-msft",
					symbol: "MSFT",
					name: "Microsoft",
					sector: "Technology",
					industry: "Software",
					marketCapBucket: "mega",
					source: "related",
				},
			],
			executionTimeMs: 12,
		};
		const result = GraphRAGQueryOutputSchema.safeParse(output);
		expect(result.success).toBe(true);
	});

	test("validates all company source types", () => {
		const sources = ["filing", "transcript", "news", "related", "dependent"] as const;

		for (const source of sources) {
			const output = {
				filingChunks: [],
				transcriptChunks: [],
				newsItems: [],
				externalEvents: [],
				companies: [
					{
						id: "comp-test",
						symbol: "TEST",
						name: "Test Co",
						sector: "Tech",
						industry: "Software",
						marketCapBucket: "large",
						source,
					},
				],
				executionTimeMs: 1,
			};
			const result = GraphRAGQueryOutputSchema.safeParse(output);
			expect(result.success).toBe(true);
		}
	});

	test("rejects invalid company source", () => {
		const output = {
			filingChunks: [],
			transcriptChunks: [],
			newsItems: [],
			externalEvents: [],
			companies: [
				{
					id: "comp-test",
					symbol: "TEST",
					name: "Test Co",
					sector: "Tech",
					industry: "Software",
					marketCapBucket: "large",
					source: "invalid_source",
				},
			],
			executionTimeMs: 1,
		};
		const result = GraphRAGQueryOutputSchema.safeParse(output);
		expect(result.success).toBe(false);
	});

	test("rejects missing required fields", () => {
		const output = {
			filingChunks: [],
			// Missing other required fields
		};
		const result = GraphRAGQueryOutputSchema.safeParse(output);
		expect(result.success).toBe(false);
	});
});
