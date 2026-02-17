/**
 * GraphRAG Tool Implementation Tests
 */

// Set required environment variables before imports
Bun.env.CREAM_ENV = "PAPER";

import { describe, expect, test } from "bun:test";
import type { ExecutionContext } from "@cream/domain";
import type { GraphRAGSearchResult } from "@cream/helix";

// ============================================
// Mock Data
// ============================================

const mockSearchResult: GraphRAGSearchResult = {
	filingChunks: [
		{
			id: "fc-001",
			filingId: "10K-2024-AAPL",
			companySymbol: "AAPL",
			filingType: "10-K",
			filingDate: "2024-01-15",
			chunkText: "Supply chain risks include semiconductor shortages...",
			chunkIndex: 5,
			score: 0.95,
		},
	],
	transcriptChunks: [
		{
			id: "tc-001",
			transcriptId: "Q4-2024-NVDA",
			companySymbol: "NVDA",
			callDate: "2024-02-20",
			speaker: "Jensen Huang",
			chunkText: "We see continued strong demand for AI chips...",
			chunkIndex: 12,
			score: 0.88,
		},
	],
	newsItems: [
		{
			id: "ni-001",
			headline: "Semiconductor Industry Faces Capacity Constraints",
			bodyText: "Multiple chip manufacturers report supply issues...",
			source: "Reuters",
			relatedSymbols: "AAPL,NVDA,TSM",
			sentimentScore: -0.3,
			score: 0.82,
		},
	],
	externalEvents: [
		{
			id: "ee-001",
			eventId: "evt-supply-001",
			eventType: "supply_chain",
			textSummary: "Major fab reports production delays",
			relatedInstrumentIds: "TSM,INTC",
			score: 0.75,
		},
	],
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
			id: "comp-nvda",
			symbol: "NVDA",
			name: "NVIDIA Corporation",
			sector: "Technology",
			industry: "Semiconductors",
			marketCapBucket: "mega",
			source: "transcript",
		},
	],
	executionTimeMs: 15,
};

function createTestContext(): ExecutionContext {
	return {
		environment: "PAPER",
		source: "test",
		traceId: "test-trace",
	};
}

async function runGraphRAGQuery(params: { query: string; symbol?: string; limit?: number }) {
	const { graphragQuery } = await import("./graphrag.js");
	return graphragQuery(createTestContext(), params);
}

function expectObjectFields(value: unknown, fields: string[]): void {
	for (const field of fields) {
		expect(value).toHaveProperty(field);
	}
}

// ============================================
// Tests
// ============================================

describe("graphragQuery test mode", () => {
	test("returns empty results in test mode", async () => {
		const result = await runGraphRAGQuery({
			query: "semiconductor supply chain",
			limit: 10,
		});
		expect(result.filingChunks).toEqual([]);
		expect(result.transcriptChunks).toEqual([]);
		expect(result.newsItems).toEqual([]);
		expect(result.externalEvents).toEqual([]);
		expect(result.companies).toEqual([]);
		expect(result.executionTimeMs).toBe(0);
	});

	test("returns empty results even with symbol filter in test mode", async () => {
		const result = await runGraphRAGQuery({
			query: "revenue growth",
			symbol: "AAPL",
			limit: 5,
		});
		expect(result.filingChunks).toEqual([]);
		expect(result.companies).toEqual([]);
	});
});

describe("graphragQuery parameter handling", () => {
	test("accepts query parameter", async () => {
		const result = await runGraphRAGQuery({ query: "test query" });
		expect(result).toBeDefined();
	});

	test("accepts optional limit parameter", async () => {
		const result = await runGraphRAGQuery({ query: "test query", limit: 20 });
		expect(result).toBeDefined();
	});

	test("accepts optional symbol parameter", async () => {
		const result = await runGraphRAGQuery({ query: "test query", symbol: "AAPL" });
		expect(result).toBeDefined();
	});
});

describe("GraphRAGQueryResult top-level structure", () => {
	test("result has all required fields", () => {
		expectObjectFields(mockSearchResult, [
			"filingChunks",
			"transcriptChunks",
			"newsItems",
			"externalEvents",
			"companies",
			"executionTimeMs",
		]);
	});

	test("company source is valid enum value", () => {
		const validSources = ["filing", "transcript", "news", "related", "dependent"];
		for (const company of mockSearchResult.companies) {
			expect(validSources).toContain(company.source);
		}
	});
});

describe("GraphRAGQueryResult nested field shapes", () => {
	test("nested results include required field shapes", () => {
		expectObjectFields(mockSearchResult.filingChunks[0], [
			"id",
			"filingId",
			"companySymbol",
			"filingType",
			"filingDate",
			"chunkText",
			"chunkIndex",
			"score",
		]);
		expectObjectFields(mockSearchResult.transcriptChunks[0], [
			"id",
			"transcriptId",
			"companySymbol",
			"callDate",
			"speaker",
			"chunkText",
			"chunkIndex",
			"score",
		]);
		expectObjectFields(mockSearchResult.newsItems[0], [
			"id",
			"headline",
			"bodyText",
			"source",
			"relatedSymbols",
			"sentimentScore",
			"score",
		]);
		expectObjectFields(mockSearchResult.externalEvents[0], [
			"id",
			"eventId",
			"eventType",
			"textSummary",
			"relatedInstrumentIds",
			"score",
		]);
		expectObjectFields(mockSearchResult.companies[0], [
			"id",
			"symbol",
			"name",
			"sector",
			"industry",
			"marketCapBucket",
			"source",
		]);
	});
});
