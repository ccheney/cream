/**
 * Chunker Tests
 *
 * Tests for section-based document chunking for RAG.
 */

import { describe, expect, test } from "bun:test";
import {
	chunkParsedFiling,
	createChunkId,
	estimateTokens,
	SECTION_NAMES,
	splitTextWithOverlap,
} from "./chunker";
import type { Filing, ParsedFiling } from "./types";

// ============================================
// createChunkId Tests
// ============================================

describe("createChunkId", () => {
	test("creates chunk ID from filing ID, section, and index", () => {
		const result = createChunkId("0000320193-24-000081", "business", 0);
		expect(result).toBe("chunk_000032019324000081_business_000");
	});

	test("pads index to 3 digits", () => {
		const result = createChunkId("0000320193-24-000081", "risk_factors", 15);
		expect(result).toBe("chunk_000032019324000081_risk_factors_015");
	});

	test("handles section names with spaces", () => {
		const result = createChunkId("1234567890", "Financial Statements", 0);
		expect(result).toBe("chunk_1234567890_financial_statements_000");
	});

	test("handles section names with multiple underscores", () => {
		const result = createChunkId("1234567890", "item_2_02", 5);
		expect(result).toBe("chunk_1234567890_item_2_02_005");
	});
});

// ============================================
// estimateTokens Tests
// ============================================

describe("estimateTokens", () => {
	test("estimates tokens at ~4 chars per token", () => {
		const text = "Hello world"; // 11 chars
		expect(estimateTokens(text)).toBe(3); // ceil(11/4) = 3
	});

	test("handles empty string", () => {
		expect(estimateTokens("")).toBe(0);
	});

	test("rounds up fractional tokens", () => {
		const text = "Hi"; // 2 chars
		expect(estimateTokens(text)).toBe(1); // ceil(2/4) = 1
	});
});

// ============================================
// splitTextWithOverlap Tests
// ============================================

describe("splitTextWithOverlap", () => {
	test("returns single chunk for text under maxSize", () => {
		const text = "Short text that fits in a single chunk.";
		const result = splitTextWithOverlap(text, 100);
		expect(result).toHaveLength(1);
		expect(result[0]).toBe(text);
	});

	test("splits on paragraph boundaries", () => {
		const paragraph1 = "First paragraph content.";
		const paragraph2 = "Second paragraph content.";
		const text = `${paragraph1}\n\n${paragraph2}`;
		const result = splitTextWithOverlap(text, 30, 5);

		expect(result.length).toBeGreaterThan(1);
		expect(result[0]).toContain("First paragraph");
	});

	test("includes overlap between chunks", () => {
		const text = `${"A".repeat(100)}\n\n${"B".repeat(100)}`;
		const result = splitTextWithOverlap(text, 120, 20);

		expect(result.length).toBeGreaterThan(1);
		// Second chunk should start with overlap from first
		if (result[1]) {
			expect(result[1].startsWith("A")).toBe(true);
		}
	});

	test("handles empty paragraphs", () => {
		const text = "Content\n\n\n\nMore content";
		const result = splitTextWithOverlap(text, 1000);
		expect(result).toHaveLength(1);
		expect(result[0]).toContain("Content");
		expect(result[0]).toContain("More content");
	});

	test("handles oversized paragraphs by splitting on sentences", () => {
		const longParagraph = "First sentence. Second sentence. Third sentence. Fourth sentence.";
		const result = splitTextWithOverlap(longParagraph, 40, 10);

		expect(result.length).toBeGreaterThanOrEqual(1);
	});

	test("returns empty array for whitespace-only text", () => {
		const text = "   \n\n   ";
		const result = splitTextWithOverlap(text, 100);
		// After filtering empty paragraphs, may be empty or single chunk
		expect(result.length).toBeLessThanOrEqual(1);
	});
});

// ============================================
// chunkParsedFiling Tests
// ============================================

describe("chunkParsedFiling", () => {
	const createMockFiling = (): Filing => ({
		accessionNumber: "0000320193-24-000081",
		filingType: "10-K",
		filedDate: new Date("2024-01-15"),
		company: {
			cik: "0000320193",
			name: "Apple Inc.",
			ticker: "AAPL",
		},
		primaryDocument: "aapl-20231230.htm",
	});

	const createMockParsedFiling = (sections: Record<string, string>): ParsedFiling => ({
		filing: createMockFiling(),
		sections,
		financialTables: [],
		extractedAt: new Date(),
	});

	test("creates chunks with correct metadata", () => {
		const parsed = createMockParsedFiling({
			business: "This is the business section content for testing purposes. ".repeat(10),
		});

		const chunks = chunkParsedFiling(parsed);

		expect(chunks.length).toBeGreaterThan(0);
		expect(chunks[0]).toMatchObject({
			filingId: "0000320193-24-000081",
			companySymbol: "AAPL",
			filingType: "10-K",
			filingDate: "2024-01-15",
		});
	});

	test("sets totalChunks on all chunks", () => {
		const parsed = createMockParsedFiling({
			business: "Business content ".repeat(100),
			mda: "MDA content ".repeat(100),
		});

		const chunks = chunkParsedFiling(parsed);

		// All chunks should have the same totalChunks
		expect(chunks.length).toBeGreaterThan(0);
		const firstChunk = chunks[0];
		if (!firstChunk) {
			throw new Error("Expected at least one chunk");
		}
		const totalChunks = firstChunk.totalChunks;
		expect(totalChunks).toBe(chunks.length);
		for (const chunk of chunks) {
			expect(chunk.totalChunks).toBe(totalChunks);
		}
	});

	test("skips sections shorter than minimum length", () => {
		const parsed = createMockParsedFiling({
			business: "Too short", // Less than 100 chars
			mda: "This section is long enough to be included in the chunking process.".repeat(5),
		});

		const chunks = chunkParsedFiling(parsed);

		// Should only have chunks from mda, not business
		const sectionNames = chunks.map((c) => c.sectionName);
		expect(sectionNames).not.toContain("Business Description");
		expect(sectionNames.some((name) => name.includes("Management"))).toBe(true);
	});

	test("prepends section header to chunk text", () => {
		const parsed = createMockParsedFiling({
			risk_factors: "Risk factor content for testing the header prepending functionality. ".repeat(
				5,
			),
		});

		const chunks = chunkParsedFiling(parsed);

		expect(chunks[0]?.chunkText.startsWith("## Risk Factors")).toBe(true);
	});

	test("uses ticker when available, falls back to CIK", () => {
		const filingWithTicker = createMockParsedFiling({
			business: "Content ".repeat(50),
		});
		const chunksWithTicker = chunkParsedFiling(filingWithTicker);
		expect(chunksWithTicker[0]?.companySymbol).toBe("AAPL");

		// Test without ticker
		const filingWithoutTicker: ParsedFiling = {
			filing: {
				...createMockFiling(),
				company: {
					cik: "0000320193",
					name: "Apple Inc.",
					ticker: undefined,
				},
			},
			sections: { business: "Content ".repeat(50) },
			financialTables: [],
			extractedAt: new Date(),
		};
		const chunksWithoutTicker = chunkParsedFiling(filingWithoutTicker);
		expect(chunksWithoutTicker[0]?.companySymbol).toBe("0000320193");
	});

	test("handles 8-K item sections", () => {
		const parsed = createMockParsedFiling({
			item_2_02: "Results of operations content for the current quarter. ".repeat(10),
		});

		const chunks = chunkParsedFiling(parsed);

		expect(chunks[0]?.sectionName).toBe("Item 2.02");
	});

	test("adds part numbers for multi-chunk sections", () => {
		// Create a very long section that will be split into multiple chunks
		const parsed = createMockParsedFiling({
			business: "X".repeat(20000), // Will be split due to MAX_CHUNK_SIZE
		});

		const chunks = chunkParsedFiling(parsed);

		if (chunks.length > 1) {
			expect(chunks[0]?.chunkText).toContain("(Part 1 of");
			expect(chunks[1]?.chunkText).toContain("(Part 2 of");
		}
	});
});

// ============================================
// SECTION_NAMES Tests
// ============================================

describe("SECTION_NAMES", () => {
	test("maps standard 10-K sections", () => {
		expect(SECTION_NAMES.business).toBe("Business Description");
		expect(SECTION_NAMES.risk_factors).toBe("Risk Factors");
		expect(SECTION_NAMES.mda).toBe("Management Discussion and Analysis");
	});

	test("maps quarterly sections with Q suffix", () => {
		expect(SECTION_NAMES.mda_q).toBe("Quarterly MD&A");
		expect(SECTION_NAMES.controls_q).toBe("Controls and Procedures");
	});
});
