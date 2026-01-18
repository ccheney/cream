/**
 * Paper Ingestion Service Tests
 *
 * Tests for the PaperIngestionService including:
 * - Paper conversion
 * - Relevance score calculation
 * - Seed papers validation
 */

import { describe, expect, test } from "bun:test";
import {
	_internal,
	calculatePaperRelevanceScore,
	type PaperInput,
	SEED_PAPERS,
} from "./paper-ingestion.js";

const { toPaperNode } = _internal;

// ============================================
// Test Data Factories
// ============================================

function createMockPaperInput(overrides: Partial<PaperInput> = {}): PaperInput {
	return {
		paperId: "test-paper-123",
		title: "Machine Learning in Factor Investing",
		authors: "John Smith, Jane Doe",
		abstract:
			"This paper examines the application of machine learning techniques to factor investing strategies. We find that neural networks can capture non-linear relationships in factor returns that traditional linear models miss.",
		url: "https://doi.org/10.1234/example",
		publicationYear: 2023,
		citationCount: 150,
		...overrides,
	};
}

// ============================================
// Paper Conversion Tests
// ============================================

describe("toPaperNode", () => {
	test("converts paperId to paper_id", () => {
		const input = createMockPaperInput();
		const node = toPaperNode(input);
		expect(node.paper_id).toBe("test-paper-123");
	});

	test("preserves title", () => {
		const input = createMockPaperInput();
		const node = toPaperNode(input);
		expect(node.title).toBe("Machine Learning in Factor Investing");
	});

	test("preserves authors", () => {
		const input = createMockPaperInput();
		const node = toPaperNode(input);
		expect(node.authors).toBe("John Smith, Jane Doe");
	});

	test("converts abstract to paper_abstract", () => {
		const input = createMockPaperInput();
		const node = toPaperNode(input);
		expect(node.paper_abstract).toContain("machine learning techniques");
	});

	test("preserves url", () => {
		const input = createMockPaperInput();
		const node = toPaperNode(input);
		expect(node.url).toBe("https://doi.org/10.1234/example");
	});

	test("converts publicationYear to publication_year", () => {
		const input = createMockPaperInput();
		const node = toPaperNode(input);
		expect(node.publication_year).toBe(2023);
	});

	test("converts citationCount to citation_count", () => {
		const input = createMockPaperInput();
		const node = toPaperNode(input);
		expect(node.citation_count).toBe(150);
	});

	test("handles undefined url", () => {
		const input = createMockPaperInput({ url: undefined });
		const node = toPaperNode(input);
		expect(node.url).toBeUndefined();
	});

	test("handles undefined publicationYear", () => {
		const input = createMockPaperInput({ publicationYear: undefined });
		const node = toPaperNode(input);
		expect(node.publication_year).toBeUndefined();
	});

	test("handles undefined citationCount (defaults to 0)", () => {
		const input = createMockPaperInput({ citationCount: undefined });
		const node = toPaperNode(input);
		expect(node.citation_count).toBe(0);
	});
});

// ============================================
// Relevance Score Calculation Tests
// ============================================

describe("calculatePaperRelevanceScore", () => {
	test("returns positive score for paper with citations", () => {
		const input = createMockPaperInput({ citationCount: 100 });
		const score = calculatePaperRelevanceScore(input);
		expect(score).toBeGreaterThan(0);
	});

	test("returns higher score for more citations", () => {
		const lowCites = createMockPaperInput({ citationCount: 10 });
		const highCites = createMockPaperInput({ citationCount: 1000 });

		const lowScore = calculatePaperRelevanceScore(lowCites);
		const highScore = calculatePaperRelevanceScore(highCites);

		expect(highScore).toBeGreaterThan(lowScore);
	});

	test("citation impact is log-scaled", () => {
		const paper100 = createMockPaperInput({ citationCount: 100 });
		const paper10000 = createMockPaperInput({ citationCount: 10000 });

		const score100 = calculatePaperRelevanceScore(paper100);
		const score10000 = calculatePaperRelevanceScore(paper10000);

		// 100x more citations should NOT result in 100x score
		// With log-scaling, ratio should be much smaller
		const ratio = score10000 / score100;
		expect(ratio).toBeLessThan(5);
	});

	test("gives recency bonus for recent papers", () => {
		const currentYear = new Date().getFullYear();
		const recentPaper = createMockPaperInput({
			publicationYear: currentYear - 1,
			citationCount: 50,
		});
		const oldPaper = createMockPaperInput({
			publicationYear: currentYear - 10,
			citationCount: 50,
		});

		const recentScore = calculatePaperRelevanceScore(recentPaper);
		const oldScore = calculatePaperRelevanceScore(oldPaper);

		expect(recentScore).toBeGreaterThan(oldScore);
	});

	test("recency bonus decreases with age", () => {
		const currentYear = new Date().getFullYear();
		const year1 = createMockPaperInput({
			publicationYear: currentYear - 1,
			citationCount: 0,
		});
		const year3 = createMockPaperInput({
			publicationYear: currentYear - 3,
			citationCount: 0,
		});
		const year5 = createMockPaperInput({
			publicationYear: currentYear - 5,
			citationCount: 0,
		});

		const score1 = calculatePaperRelevanceScore(year1);
		const score3 = calculatePaperRelevanceScore(year3);
		const score5 = calculatePaperRelevanceScore(year5);

		expect(score1).toBeGreaterThan(score3);
		expect(score3).toBeGreaterThan(score5);
	});

	test("no recency bonus for papers older than 5 years", () => {
		const currentYear = new Date().getFullYear();
		const paper6Years = createMockPaperInput({
			publicationYear: currentYear - 6,
			citationCount: 0,
		});
		const paper10Years = createMockPaperInput({
			publicationYear: currentYear - 10,
			citationCount: 0,
		});

		const score6 = calculatePaperRelevanceScore(paper6Years);
		const score10 = calculatePaperRelevanceScore(paper10Years);

		// Both should have same score (no recency component)
		expect(score6).toBe(score10);
	});

	test("gives quality bonus for substantial abstracts", () => {
		const longAbstract = createMockPaperInput({
			abstract: "A".repeat(300),
			citationCount: 0,
			publicationYear: undefined,
		});
		const shortAbstract = createMockPaperInput({
			abstract: "Short abstract",
			citationCount: 0,
			publicationYear: undefined,
		});

		const longScore = calculatePaperRelevanceScore(longAbstract);
		const shortScore = calculatePaperRelevanceScore(shortAbstract);

		expect(longScore).toBeGreaterThan(shortScore);
	});

	test("handles zero citations", () => {
		const input = createMockPaperInput({ citationCount: 0 });
		const score = calculatePaperRelevanceScore(input);
		expect(score).toBeGreaterThanOrEqual(0);
	});

	test("handles missing publicationYear", () => {
		const input = createMockPaperInput({ publicationYear: undefined, citationCount: 100 });
		const score = calculatePaperRelevanceScore(input);
		expect(score).toBeGreaterThan(0);
	});

	test("handles missing abstract", () => {
		const input = createMockPaperInput({ abstract: "", citationCount: 100 });
		const score = calculatePaperRelevanceScore(input);
		expect(score).toBeGreaterThan(0);
	});
});

// ============================================
// Seed Papers Validation Tests
// ============================================

describe("SEED_PAPERS", () => {
	test("contains expected number of papers", () => {
		expect(SEED_PAPERS.length).toBe(22);
	});

	test("all papers have required fields", () => {
		for (const paper of SEED_PAPERS) {
			expect(paper.paperId).toBeDefined();
			expect(paper.paperId.length).toBeGreaterThan(0);
			expect(paper.title).toBeDefined();
			expect(paper.title.length).toBeGreaterThan(0);
			expect(paper.authors).toBeDefined();
			expect(paper.authors.length).toBeGreaterThan(0);
			expect(paper.abstract).toBeDefined();
			expect(paper.abstract.length).toBeGreaterThan(50);
		}
	});

	test("paper IDs are unique", () => {
		const ids = SEED_PAPERS.map((p) => p.paperId);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(ids.length);
	});

	test("contains Fama-French papers", () => {
		const famaFrench = SEED_PAPERS.filter(
			(p) => p.authors.includes("Fama") || p.authors.includes("French")
		);
		expect(famaFrench.length).toBeGreaterThanOrEqual(2);
	});

	test("contains momentum paper (Jegadeesh-Titman)", () => {
		const momentum = SEED_PAPERS.find(
			(p) => p.authors.includes("Jegadeesh") || p.authors.includes("Titman")
		);
		expect(momentum).toBeDefined();
		expect(momentum?.title).toContain("Winners");
	});

	test("contains Black-Scholes paper", () => {
		const bs = SEED_PAPERS.find(
			(p) => p.authors.includes("Black") && p.authors.includes("Scholes")
		);
		expect(bs).toBeDefined();
		expect(bs?.title).toContain("Options");
	});

	test("contains post-publication decay paper (McLean-Pontiff)", () => {
		const decay = SEED_PAPERS.find(
			(p) => p.authors.includes("McLean") || p.title.includes("Destroy")
		);
		expect(decay).toBeDefined();
	});

	test("all papers have publication years", () => {
		for (const paper of SEED_PAPERS) {
			expect(paper.publicationYear).toBeDefined();
			expect(paper.publicationYear).toBeGreaterThanOrEqual(1952);
			expect(paper.publicationYear).toBeLessThanOrEqual(new Date().getFullYear());
		}
	});

	test("all papers have citation counts", () => {
		for (const paper of SEED_PAPERS) {
			expect(paper.citationCount).toBeDefined();
			expect(paper.citationCount).toBeGreaterThan(0);
		}
	});

	test("all papers have URLs", () => {
		for (const paper of SEED_PAPERS) {
			expect(paper.url).toBeDefined();
			expect(paper.url).toContain("doi.org");
		}
	});

	test("abstracts are substantial", () => {
		for (const paper of SEED_PAPERS) {
			expect(paper.abstract.length).toBeGreaterThan(100);
		}
	});
});
