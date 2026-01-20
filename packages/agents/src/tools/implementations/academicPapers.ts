/**
 * Academic Papers Tool Implementation
 *
 * Provides functionality for searching, retrieving, and ingesting academic
 * papers from HelixDB and external sources (Semantic Scholar).
 */

import { type ExecutionContext, isTest } from "@cream/domain";
import { createSemanticScholarClient, type SemanticScholarPaper } from "@cream/external-context";
import { createPaperIngestionService, type PaperInput } from "@cream/helix";
import { getHelixClient } from "../clients.js";

// Singleton client to maintain rate limiting state across all tool calls
let semanticScholarClient: ReturnType<typeof createSemanticScholarClient> | null = null;

function getSemanticScholarClient() {
	if (!semanticScholarClient) {
		semanticScholarClient = createSemanticScholarClient();
	}
	return semanticScholarClient;
}

// ============================================
// Types
// ============================================

/**
 * Paper search result from HelixDB
 */
export interface AcademicPaperSearchResult {
	paperId: string;
	title: string;
	authors: string;
	similarity: number;
	citationCount: number;
}

/**
 * Full paper details
 */
export interface AcademicPaperDetails {
	paperId: string;
	title: string;
	authors: string;
	abstract: string;
	url?: string;
	publicationYear?: number;
	citationCount: number;
}

/**
 * External paper result
 */
export interface ExternalPaperResult {
	paperId: string;
	title: string;
	authors: string;
	abstract?: string;
	year?: number;
	citationCount?: number;
	url?: string;
}

// ============================================
// Search Academic Papers in HelixDB
// ============================================

/**
 * Search for academic papers in the HelixDB knowledge base
 *
 * @param ctx - Execution context
 * @param query - Search query
 * @param limit - Maximum results to return
 * @returns Search results with semantic similarity scores
 */
export async function searchAcademicPapers(
	ctx: ExecutionContext,
	query: string,
	limit: number
): Promise<{
	query: string;
	papers: AcademicPaperSearchResult[];
	totalFound: number;
	executionTimeMs: number;
}> {
	const startTime = performance.now();

	// In test mode, return empty results
	if (isTest(ctx)) {
		return {
			query,
			papers: [],
			totalFound: 0,
			executionTimeMs: performance.now() - startTime,
		};
	}

	const client = getHelixClient();
	const service = createPaperIngestionService(client);

	const results = await service.searchPapers(query, limit);

	return {
		query,
		papers: results.map((r) => ({
			paperId: r.paperId,
			title: r.title,
			authors: r.authors,
			similarity: r.similarity,
			citationCount: r.citationCount,
		})),
		totalFound: results.length,
		executionTimeMs: performance.now() - startTime,
	};
}

// ============================================
// Get Paper Details
// ============================================

/**
 * Get full details for a specific academic paper
 *
 * @param ctx - Execution context
 * @param paperId - Paper identifier
 * @returns Full paper details or null if not found
 */
export async function getAcademicPaper(
	ctx: ExecutionContext,
	paperId: string
): Promise<{
	found: boolean;
	paper: AcademicPaperDetails | null;
	executionTimeMs: number;
}> {
	const startTime = performance.now();

	// In test mode, return not found
	if (isTest(ctx)) {
		return {
			found: false,
			paper: null,
			executionTimeMs: performance.now() - startTime,
		};
	}

	const client = getHelixClient();
	const service = createPaperIngestionService(client);

	const paper = await service.getPaperById(paperId);

	if (!paper) {
		return {
			found: false,
			paper: null,
			executionTimeMs: performance.now() - startTime,
		};
	}

	return {
		found: true,
		paper: {
			paperId: paper.paperId,
			title: paper.title,
			authors: paper.authors,
			abstract: paper.abstract,
			url: paper.url,
			publicationYear: paper.publicationYear,
			citationCount: paper.citationCount,
		},
		executionTimeMs: performance.now() - startTime,
	};
}

// ============================================
// Search External Papers (Semantic Scholar)
// ============================================

/**
 * Search Semantic Scholar for papers on a topic
 *
 * @param ctx - Execution context
 * @param topic - Research topic to search
 * @param limit - Maximum results
 * @param recentOnly - Only include recent papers (< 5 years)
 * @returns Papers from external search
 */
export async function searchExternalPapers(
	ctx: ExecutionContext,
	topic: string,
	limit: number,
	recentOnly: boolean
): Promise<{
	topic: string;
	papers: ExternalPaperResult[];
	source: string;
	executionTimeMs: number;
}> {
	const startTime = performance.now();

	// In test mode, return empty results
	if (isTest(ctx)) {
		return {
			topic,
			papers: [],
			source: "Semantic Scholar (test mode - skipped)",
			executionTimeMs: performance.now() - startTime,
		};
	}

	const client = getSemanticScholarClient();

	const papers = await client.searchFinancePapers(topic, {
		limit,
		recentYears: recentOnly ? 5 : undefined,
	});

	return {
		topic,
		papers: papers?.map(formatSemanticScholarPaper) ?? [],
		source: "Semantic Scholar",
		executionTimeMs: performance.now() - startTime,
	};
}

/**
 * Format Semantic Scholar paper to our result type
 */
function formatSemanticScholarPaper(paper: SemanticScholarPaper): ExternalPaperResult {
	return {
		paperId: paper.paperId,
		title: paper.title,
		authors: paper.authors?.map((a) => a.name).join(", ") ?? "Unknown",
		abstract: paper.abstract ?? undefined,
		year: paper.year ?? undefined,
		citationCount: paper.citationCount ?? undefined,
		url: paper.url ?? paper.openAccessPdf?.url ?? undefined,
	};
}

/**
 * Convert external paper to PaperInput for ingestion
 */
function toPaperInput(paper: SemanticScholarPaper): PaperInput | null {
	// Skip papers without abstracts (needed for embedding)
	if (!paper.abstract || paper.abstract.length < 50) {
		return null;
	}

	return {
		paperId: paper.paperId,
		title: paper.title,
		authors: paper.authors?.map((a) => a.name).join(", ") ?? "Unknown",
		abstract: paper.abstract,
		url: paper.url ?? paper.openAccessPdf?.url,
		publicationYear: paper.year,
		citationCount: paper.citationCount,
	};
}

// ============================================
// Ingest Papers from External Sources
// ============================================

/**
 * Search Semantic Scholar and ingest papers into HelixDB
 *
 * @param ctx - Execution context
 * @param topic - Research topic to search
 * @param limit - Maximum papers to ingest
 * @returns Ingestion result
 */
export async function ingestSemanticScholarPapers(
	ctx: ExecutionContext,
	topic: string,
	limit: number
): Promise<{
	topic: string;
	papersIngested: number;
	duplicatesSkipped: number;
	errors: string[];
	executionTimeMs: number;
}> {
	const startTime = performance.now();

	// In test mode, skip ingestion
	if (isTest(ctx)) {
		return {
			topic,
			papersIngested: 0,
			duplicatesSkipped: 0,
			errors: ["Test mode - ingestion skipped"],
			executionTimeMs: performance.now() - startTime,
		};
	}

	// Step 1: Search Semantic Scholar
	const s2Client = getSemanticScholarClient();
	const papers = await s2Client.searchFinancePapers(topic, { limit });

	if (papers.length === 0) {
		return {
			topic,
			papersIngested: 0,
			duplicatesSkipped: 0,
			errors: ["No papers found for topic"],
			executionTimeMs: performance.now() - startTime,
		};
	}

	// Step 2: Convert to PaperInput (filter out papers without abstracts)
	const paperInputs: PaperInput[] = [];
	for (const paper of papers) {
		const input = toPaperInput(paper);
		if (input) {
			paperInputs.push(input);
		}
	}

	if (paperInputs.length === 0) {
		return {
			topic,
			papersIngested: 0,
			duplicatesSkipped: 0,
			errors: ["No papers with valid abstracts found"],
			executionTimeMs: performance.now() - startTime,
		};
	}

	// Step 3: Ingest into HelixDB
	const helixClient = getHelixClient();
	const ingestionService = createPaperIngestionService(helixClient);

	const result = await ingestionService.ingestPapers(paperInputs);

	return {
		topic,
		papersIngested: result.papersIngested,
		duplicatesSkipped: result.duplicatesSkipped,
		errors: result.errors,
		executionTimeMs: performance.now() - startTime,
	};
}
