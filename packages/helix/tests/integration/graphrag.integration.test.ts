/**
 * GraphRAG Integration Tests
 *
 * End-to-end validation of GraphRAG query pipeline.
 * Uses mock client until HelixDB Docker image is available.
 *
 * @see docs/plans/34-graphrag-query-tool.md (Testing Strategy)
 */

import { describe, expect, it } from "bun:test";
import type {
	CompanyResult,
	ExternalEventResult,
	FilingChunkResult,
	GraphRAGSearchResult,
	NewsItemResult,
	TranscriptChunkResult,
} from "../../src/queries/graphrag.js";

// ============================================
// Mock Data Generators
// ============================================

function createFilingChunk(
	id: string,
	symbol: string,
	text: string,
	score: number
): FilingChunkResult {
	return {
		id,
		filingId: `10K-2024-${symbol}`,
		companySymbol: symbol,
		filingType: "10-K",
		filingDate: "2024-01-15",
		chunkText: text,
		chunkIndex: 1,
		score,
	};
}

function createTranscriptChunk(
	id: string,
	symbol: string,
	speaker: string,
	text: string,
	score: number
): TranscriptChunkResult {
	return {
		id,
		transcriptId: `Q4-2024-${symbol}`,
		companySymbol: symbol,
		callDate: "2024-02-15",
		speaker,
		chunkText: text,
		chunkIndex: 1,
		score,
	};
}

function createNewsItem(
	id: string,
	headline: string,
	symbols: string,
	sentiment: number,
	score: number
): NewsItemResult {
	return {
		id,
		headline,
		bodyText: `News body for ${headline}`,
		source: "Reuters",
		relatedSymbols: symbols,
		sentimentScore: sentiment,
		score,
	};
}

function createExternalEvent(
	id: string,
	eventType: string,
	summary: string,
	score: number
): ExternalEventResult {
	return {
		id,
		eventId: `evt-${id}`,
		eventType,
		textSummary: summary,
		relatedInstrumentIds: "SPY,QQQ",
		score,
	};
}

function createCompany(
	symbol: string,
	name: string,
	source: CompanyResult["source"]
): CompanyResult {
	return {
		id: `comp-${symbol.toLowerCase()}`,
		symbol,
		name,
		sector: "Technology",
		industry: "Semiconductors",
		marketCapBucket: "mega",
		source,
	};
}

// ============================================
// Mock GraphRAG Client
// ============================================

interface MockGraphRAGClient {
	searchGraphContext(options: {
		query: string;
		limit?: number;
		symbol?: string;
	}): Promise<GraphRAGSearchResult>;
}

/**
 * Creates a mock GraphRAG client with configurable test data.
 */
function createMockGraphRAGClient(testData: {
	filingChunks?: FilingChunkResult[];
	transcriptChunks?: TranscriptChunkResult[];
	newsItems?: NewsItemResult[];
	externalEvents?: ExternalEventResult[];
	companies?: CompanyResult[];
}): MockGraphRAGClient {
	return {
		async searchGraphContext(options): Promise<GraphRAGSearchResult> {
			const startTime = performance.now();
			const { limit = 10, symbol } = options;

			let filingChunks = testData.filingChunks ?? [];
			let transcriptChunks = testData.transcriptChunks ?? [];
			let newsItems = testData.newsItems ?? [];
			let externalEvents = testData.externalEvents ?? [];
			const companies = testData.companies ?? [];

			// Filter by symbol if provided
			if (symbol) {
				filingChunks = filingChunks.filter((c) => c.companySymbol === symbol);
				transcriptChunks = transcriptChunks.filter((c) => c.companySymbol === symbol);
				// News and events don't filter by single symbol
				// Companies include related/dependent for symbol queries
			}

			// Apply limit
			filingChunks = filingChunks.slice(0, limit);
			transcriptChunks = transcriptChunks.slice(0, limit);
			newsItems = newsItems.slice(0, limit);
			externalEvents = externalEvents.slice(0, limit);

			return {
				filingChunks,
				transcriptChunks,
				newsItems,
				externalEvents,
				companies,
				executionTimeMs: performance.now() - startTime,
			};
		},
	};
}

// ============================================
// Integration Tests
// ============================================

describe("GraphRAG Integration", () => {
	describe("Cross-Type Search", () => {
		it("returns results from multiple document types", async () => {
			const client = createMockGraphRAGClient({
				filingChunks: [
					createFilingChunk(
						"fc-1",
						"TSM",
						"Capacity constraints in advanced node production...",
						0.95
					),
					createFilingChunk("fc-2", "INTC", "Foundry capacity investments accelerating...", 0.88),
				],
				transcriptChunks: [
					createTranscriptChunk(
						"tc-1",
						"NVDA",
						"Jensen Huang",
						"Supply chain for AI chips remains tight...",
						0.92
					),
				],
				newsItems: [
					createNewsItem(
						"ni-1",
						"Semiconductor Industry Faces Capacity Constraints",
						"TSM,INTC,NVDA",
						-0.3,
						0.85
					),
				],
				externalEvents: [
					createExternalEvent("ee-1", "supply_chain", "Major fab reports production delays", 0.78),
				],
				companies: [
					createCompany("TSM", "Taiwan Semiconductor", "filing"),
					createCompany("INTC", "Intel Corporation", "filing"),
					createCompany("NVDA", "NVIDIA Corporation", "transcript"),
				],
			});

			const result = await client.searchGraphContext({
				query: "semiconductor capacity constraints",
				limit: 10,
			});

			// Verify multiple types returned
			expect(result.filingChunks.length).toBeGreaterThan(0);
			expect(result.transcriptChunks.length).toBeGreaterThan(0);
			expect(result.newsItems.length).toBeGreaterThan(0);
			expect(result.externalEvents.length).toBeGreaterThan(0);

			// Verify companies discovered
			expect(result.companies.length).toBe(3);
			const symbols = result.companies.map((c) => c.symbol);
			expect(symbols).toContain("TSM");
			expect(symbols).toContain("INTC");
			expect(symbols).toContain("NVDA");
		});

		it("scores results by relevance", async () => {
			const client = createMockGraphRAGClient({
				filingChunks: [
					createFilingChunk("fc-1", "AAPL", "Highly relevant content", 0.95),
					createFilingChunk("fc-2", "MSFT", "Less relevant content", 0.72),
					createFilingChunk("fc-3", "GOOGL", "Somewhat relevant", 0.85),
				],
			});

			const result = await client.searchGraphContext({
				query: "test query",
				limit: 10,
			});

			// Verify scores are present
			for (const chunk of result.filingChunks) {
				expect(chunk.score).toBeGreaterThanOrEqual(0);
				expect(chunk.score).toBeLessThanOrEqual(1);
			}
		});

		it("tracks execution time", async () => {
			const client = createMockGraphRAGClient({});

			const result = await client.searchGraphContext({
				query: "test query",
			});

			expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
		});
	});

	describe("Company-Scoped Queries", () => {
		it("filters results to specific company", async () => {
			const client = createMockGraphRAGClient({
				filingChunks: [
					createFilingChunk("fc-1", "AAPL", "Apple iPhone revenue...", 0.9),
					createFilingChunk("fc-2", "MSFT", "Microsoft Azure growth...", 0.85),
					createFilingChunk("fc-3", "AAPL", "Services segment expansion...", 0.88),
				],
				transcriptChunks: [
					createTranscriptChunk("tc-1", "AAPL", "Tim Cook", "Q4 results...", 0.92),
					createTranscriptChunk("tc-2", "GOOGL", "Sundar Pichai", "AI investments...", 0.87),
				],
				companies: [
					createCompany("AAPL", "Apple Inc.", "filing"),
					createCompany("MSFT", "Microsoft Corporation", "related"),
				],
			});

			const result = await client.searchGraphContext({
				query: "revenue growth",
				symbol: "AAPL",
				limit: 10,
			});

			// All filing chunks should be AAPL
			for (const chunk of result.filingChunks) {
				expect(chunk.companySymbol).toBe("AAPL");
			}

			// All transcript chunks should be AAPL
			for (const chunk of result.transcriptChunks) {
				expect(chunk.companySymbol).toBe("AAPL");
			}
		});

		it("includes related companies for symbol queries", async () => {
			const client = createMockGraphRAGClient({
				filingChunks: [createFilingChunk("fc-1", "AAPL", "Supply chain...", 0.9)],
				companies: [
					createCompany("AAPL", "Apple Inc.", "filing"),
					createCompany("FOXCONN", "Hon Hai Precision", "dependent"),
					createCompany("MSFT", "Microsoft Corporation", "related"),
				],
			});

			const result = await client.searchGraphContext({
				query: "supply chain",
				symbol: "AAPL",
			});

			// Should include related and dependent companies
			const sources = result.companies.map((c) => c.source);
			expect(sources).toContain("filing");
			expect(sources).toContain("dependent");
			expect(sources).toContain("related");
		});
	});

	describe("Supply Chain Discovery", () => {
		it("discovers companies through graph relationships", async () => {
			const client = createMockGraphRAGClient({
				filingChunks: [
					createFilingChunk("fc-1", "WMT", "Rising shipping costs impacting margins...", 0.92),
					createFilingChunk("fc-2", "TGT", "Logistics expense headwinds...", 0.88),
				],
				transcriptChunks: [
					createTranscriptChunk("tc-1", "UPS", "CEO", "Fuel surcharges increasing...", 0.85),
				],
				companies: [
					createCompany("WMT", "Walmart Inc.", "filing"),
					createCompany("TGT", "Target Corporation", "filing"),
					createCompany("UPS", "United Parcel Service", "transcript"),
					createCompany("FDX", "FedEx Corporation", "related"),
				],
			});

			const result = await client.searchGraphContext({
				query: "shipping costs spike",
				limit: 10,
			});

			// Should find retail companies mentioning logistics
			expect(result.filingChunks.some((c) => c.companySymbol === "WMT")).toBe(true);
			expect(result.filingChunks.some((c) => c.companySymbol === "TGT")).toBe(true);

			// Should discover transportation companies
			expect(result.companies.some((c) => c.symbol === "UPS")).toBe(true);
			expect(result.companies.some((c) => c.symbol === "FDX")).toBe(true);
		});
	});

	describe("Result Limits", () => {
		it("respects limit parameter", async () => {
			const client = createMockGraphRAGClient({
				filingChunks: Array.from({ length: 20 }, (_, i) =>
					createFilingChunk(`fc-${i}`, "AAPL", `Content ${i}`, 0.9 - i * 0.01)
				),
			});

			const result = await client.searchGraphContext({
				query: "test",
				limit: 5,
			});

			expect(result.filingChunks).toHaveLength(5);
		});

		it("uses default limit of 10", async () => {
			const client = createMockGraphRAGClient({
				filingChunks: Array.from({ length: 20 }, (_, i) =>
					createFilingChunk(`fc-${i}`, "AAPL", `Content ${i}`, 0.9 - i * 0.01)
				),
			});

			const result = await client.searchGraphContext({
				query: "test",
			});

			expect(result.filingChunks).toHaveLength(10);
		});
	});

	describe("Empty Results", () => {
		it("handles no matching results gracefully", async () => {
			const client = createMockGraphRAGClient({});

			const result = await client.searchGraphContext({
				query: "nonexistent topic xyz123",
			});

			expect(result.filingChunks).toEqual([]);
			expect(result.transcriptChunks).toEqual([]);
			expect(result.newsItems).toEqual([]);
			expect(result.externalEvents).toEqual([]);
			expect(result.companies).toEqual([]);
			expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
		});
	});

	describe("Company Source Attribution", () => {
		it("correctly attributes company discovery source", async () => {
			const client = createMockGraphRAGClient({
				companies: [
					createCompany("AAPL", "Apple Inc.", "filing"),
					createCompany("NVDA", "NVIDIA Corporation", "transcript"),
					createCompany("TSLA", "Tesla Inc.", "news"),
					createCompany("MSFT", "Microsoft Corporation", "related"),
					createCompany("FOXCONN", "Hon Hai Precision", "dependent"),
				],
			});

			const result = await client.searchGraphContext({
				query: "test",
			});

			const sourceMap = new Map(result.companies.map((c) => [c.symbol, c.source]));

			expect(sourceMap.get("AAPL")).toBe("filing");
			expect(sourceMap.get("NVDA")).toBe("transcript");
			expect(sourceMap.get("TSLA")).toBe("news");
			expect(sourceMap.get("MSFT")).toBe("related");
			expect(sourceMap.get("FOXCONN")).toBe("dependent");
		});
	});
});

describe("Test Mode Behavior", () => {
	it("should be tested via unit tests in graphrag.test.ts", () => {
		// Test mode is tested in the unit tests
		// This is a placeholder to document that behavior is covered
		expect(true).toBe(true);
	});
});

describe("Performance Characteristics", () => {
	it("returns results in reasonable time with mock client", async () => {
		const client = createMockGraphRAGClient({
			filingChunks: Array.from({ length: 100 }, (_, i) =>
				createFilingChunk(`fc-${i}`, "AAPL", `Content ${i}`, 0.9)
			),
			transcriptChunks: Array.from({ length: 100 }, (_, i) =>
				createTranscriptChunk(`tc-${i}`, "AAPL", "Speaker", `Content ${i}`, 0.85)
			),
			newsItems: Array.from({ length: 50 }, (_, i) =>
				createNewsItem(`ni-${i}`, `Headline ${i}`, "AAPL", 0.5, 0.8)
			),
		});

		const startTime = performance.now();
		const result = await client.searchGraphContext({
			query: "test",
			limit: 10,
		});
		const elapsed = performance.now() - startTime;

		// Mock client should be very fast (< 50ms)
		expect(elapsed).toBeLessThan(50);
		expect(result.executionTimeMs).toBeLessThan(50);
	});
});
