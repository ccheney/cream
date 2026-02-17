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

describe("calculatePaperRelevanceScore citation behavior", () => {
	test("returns positive score for paper with citations", () => {
		const score = calculatePaperRelevanceScore(createMockPaperInput({ citationCount: 100 }));
		expect(score).toBeGreaterThan(0);
	});

	test("returns higher score for more citations", () => {
		const lowScore = calculatePaperRelevanceScore(createMockPaperInput({ citationCount: 10 }));
		const highScore = calculatePaperRelevanceScore(createMockPaperInput({ citationCount: 1000 }));
		expect(highScore).toBeGreaterThan(lowScore);
	});

	test("citation impact is log-scaled", () => {
		const score100 = calculatePaperRelevanceScore(createMockPaperInput({ citationCount: 100 }));
		const score10000 = calculatePaperRelevanceScore(createMockPaperInput({ citationCount: 10000 }));
		expect(score10000 / score100).toBeLessThan(5);
	});

	test("handles zero citations", () => {
		const score = calculatePaperRelevanceScore(createMockPaperInput({ citationCount: 0 }));
		expect(score).toBeGreaterThanOrEqual(0);
	});
});

describe("calculatePaperRelevanceScore recency behavior", () => {
	test("gives recency bonus for recent papers", () => {
		const currentYear = new Date().getFullYear();
		const recentPaper = createMockPaperInput({
			publicationYear: currentYear - 1,
			citationCount: 50,
		});
		const oldPaper = createMockPaperInput({ publicationYear: currentYear - 10, citationCount: 50 });
		expect(calculatePaperRelevanceScore(recentPaper)).toBeGreaterThan(
			calculatePaperRelevanceScore(oldPaper),
		);
	});

	test("recency bonus decreases with age", () => {
		const currentYear = new Date().getFullYear();
		const score1 = calculatePaperRelevanceScore(
			createMockPaperInput({ publicationYear: currentYear - 1, citationCount: 0 }),
		);
		const score3 = calculatePaperRelevanceScore(
			createMockPaperInput({ publicationYear: currentYear - 3, citationCount: 0 }),
		);
		const score5 = calculatePaperRelevanceScore(
			createMockPaperInput({ publicationYear: currentYear - 5, citationCount: 0 }),
		);
		expect(score1).toBeGreaterThan(score3);
		expect(score3).toBeGreaterThan(score5);
	});

	test("no recency bonus for papers older than 5 years", () => {
		const currentYear = new Date().getFullYear();
		const score6 = calculatePaperRelevanceScore(
			createMockPaperInput({ publicationYear: currentYear - 6, citationCount: 0 }),
		);
		const score10 = calculatePaperRelevanceScore(
			createMockPaperInput({ publicationYear: currentYear - 10, citationCount: 0 }),
		);
		expect(score6).toBe(score10);
	});
});

describe("calculatePaperRelevanceScore quality and missing data", () => {
	test("gives quality bonus for substantial abstracts", () => {
		const longScore = calculatePaperRelevanceScore(
			createMockPaperInput({
				abstract: "A".repeat(300),
				citationCount: 0,
				publicationYear: undefined,
			}),
		);
		const shortScore = calculatePaperRelevanceScore(
			createMockPaperInput({
				abstract: "Short abstract",
				citationCount: 0,
				publicationYear: undefined,
			}),
		);
		expect(longScore).toBeGreaterThan(shortScore);
	});

	test("handles missing publicationYear", () => {
		const score = calculatePaperRelevanceScore(
			createMockPaperInput({ publicationYear: undefined, citationCount: 100 }),
		);
		expect(score).toBeGreaterThan(0);
	});

	test("handles missing abstract", () => {
		const score = calculatePaperRelevanceScore(
			createMockPaperInput({ abstract: "", citationCount: 100 }),
		);
		expect(score).toBeGreaterThan(0);
	});
});

// ============================================
// Seed Papers Validation Tests
// ============================================

describe("SEED_PAPERS structure", () => {
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
		const ids = SEED_PAPERS.map((paper) => paper.paperId);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("SEED_PAPERS key coverage", () => {
	test("contains Fama-French papers", () => {
		const famaFrench = SEED_PAPERS.filter(
			(paper) => paper.authors.includes("Fama") || paper.authors.includes("French"),
		);
		expect(famaFrench.length).toBeGreaterThanOrEqual(2);
	});

	test("contains momentum paper (Jegadeesh-Titman)", () => {
		const momentum = SEED_PAPERS.find(
			(paper) => paper.authors.includes("Jegadeesh") || paper.authors.includes("Titman"),
		);
		expect(momentum).toBeDefined();
		expect(momentum?.title).toContain("Winners");
	});

	test("contains Black-Scholes paper", () => {
		const bs = SEED_PAPERS.find(
			(paper) => paper.authors.includes("Black") && paper.authors.includes("Scholes"),
		);
		expect(bs).toBeDefined();
		expect(bs?.title).toContain("Options");
	});

	test("contains post-publication decay paper (McLean-Pontiff)", () => {
		const decay = SEED_PAPERS.find(
			(paper) => paper.authors.includes("McLean") || paper.title.includes("Destroy"),
		);
		expect(decay).toBeDefined();
	});
});

describe("SEED_PAPERS metadata quality", () => {
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
