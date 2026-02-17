/**
 * Paper Ingestion Service
 *
 * Ingests academic papers from Semantic Scholar into HelixDB.
 * Creates AcademicPaper nodes with embedded abstracts for semantic search.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { AcademicPaper } from "@cream/helix-schema";
import { DEFAULT_EMBEDDING_CONFIG, EmbeddingClient } from "@cream/helix-schema";

import type { HelixClient } from "../client.js";
import { SEED_PAPERS } from "./paper-ingestion.seed-papers.js";

// ============================================
// Types
// ============================================

/**
 * Paper input from external API (e.g., Semantic Scholar)
 */
export interface PaperInput {
	/** Paper identifier (S2 ID, DOI, or ArXiv ID) */
	paperId: string;
	/** Paper title */
	title: string;
	/** Authors as formatted string */
	authors: string;
	/** Abstract text (will be embedded) */
	abstract: string;
	/** URL to paper (Semantic Scholar, DOI, or ArXiv) */
	url?: string;
	/** Publication year */
	publicationYear?: number;
	/** Citation count */
	citationCount?: number;
}

/**
 * Ingestion result
 */
export interface PaperIngestionResult {
	papersIngested: number;
	duplicatesSkipped: number;
	embeddingsGenerated: number;
	executionTimeMs: number;
	warnings: string[];
	errors: string[];
}

/**
 * Ingestion options
 */
export interface PaperIngestionOptions {
	/** Whether to generate embeddings (default: true) */
	generateEmbeddings?: boolean;
	/** Whether to check for duplicates (default: true) */
	checkDuplicates?: boolean;
	/** Batch size for operations (default: 20) */
	batchSize?: number;
}

interface ResolvedPaperIngestionOptions {
	generateEmbeddings: boolean;
	checkDuplicates: boolean;
	batchSize: number;
}

interface DuplicateCheckResult {
	papersToIngest: PaperInput[];
	duplicatesSkipped: number;
}

interface EmbeddingGenerationResult {
	embeddings: Map<string, number[]>;
	embeddingsGenerated: number;
}

export { SEED_PAPERS };

// ============================================
// Helper Functions
// ============================================

/**
 * Convert PaperInput to HelixDB AcademicPaper
 */
function toPaperNode(input: PaperInput): AcademicPaper {
	return {
		paper_id: input.paperId,
		title: input.title,
		authors: input.authors,
		paper_abstract: input.abstract,
		url: input.url,
		publication_year: input.publicationYear,
		citation_count: input.citationCount ?? 0,
	};
}

/**
 * Calculate relevance score for a paper
 * Used for ranking search results
 */
export function calculatePaperRelevanceScore(paper: PaperInput): number {
	let score = 0;

	if (paper.citationCount && paper.citationCount > 0) {
		score += Math.log10(paper.citationCount + 1) * 10;
	}

	if (paper.publicationYear) {
		const currentYear = new Date().getFullYear();
		const age = currentYear - paper.publicationYear;
		if (age <= 5) {
			score += (5 - age) * 5;
		}
	}

	if (paper.abstract && paper.abstract.length > 200) {
		score += 5;
	}

	return Math.round(score * 100) / 100;
}

// ============================================
// Main Service Class
// ============================================

/**
 * Paper Ingestion Service
 *
 * Ingests academic papers into HelixDB with embeddings.
 */
export class PaperIngestionService {
	private embeddingClient: EmbeddingClient | null = null;

	constructor(private readonly client: HelixClient) {}

	/**
	 * Get or create embedding client (lazy initialization)
	 */
	private getEmbeddingClient(): EmbeddingClient {
		if (!this.embeddingClient) {
			this.embeddingClient = new EmbeddingClient(DEFAULT_EMBEDDING_CONFIG);
		}
		return this.embeddingClient;
	}

	private resolveOptions(options: PaperIngestionOptions): ResolvedPaperIngestionOptions {
		return {
			generateEmbeddings: options.generateEmbeddings ?? true,
			checkDuplicates: options.checkDuplicates ?? true,
			batchSize: options.batchSize ?? 20,
		};
	}

	private createEmptyResult(): PaperIngestionResult {
		return {
			papersIngested: 0,
			duplicatesSkipped: 0,
			embeddingsGenerated: 0,
			executionTimeMs: 0,
			warnings: [],
			errors: [],
		};
	}

	/**
	 * Check if a paper already exists
	 */
	private async paperExists(paperId: string): Promise<boolean> {
		try {
			const result = await this.client.query<Array<{ paper_id: string }>>("GetPaperById", {
				paper_id: paperId,
			});
			return result.data.length > 0;
		} catch {
			return false;
		}
	}

	private async filterExistingPapers(
		papers: PaperInput[],
		checkDuplicates: boolean,
		warnings: string[],
	): Promise<DuplicateCheckResult> {
		if (!checkDuplicates) {
			return { papersToIngest: papers, duplicatesSkipped: 0 };
		}

		const papersToIngest: PaperInput[] = [];
		let duplicatesSkipped = 0;
		for (const paper of papers) {
			const exists = await this.paperExists(paper.paperId);
			if (exists) {
				duplicatesSkipped++;
				continue;
			}
			papersToIngest.push(paper);
		}

		if (duplicatesSkipped > 0) {
			warnings.push(`Skipped ${duplicatesSkipped} existing papers`);
		}

		return { papersToIngest, duplicatesSkipped };
	}

	/**
	 * Upsert a single paper
	 */
	private async upsertPaper(
		paper: AcademicPaper,
		embedding?: number[],
	): Promise<{ success: boolean; error?: string }> {
		try {
			await this.client.query("InsertAcademicPaper", {
				paper_id: paper.paper_id,
				title: paper.title,
				authors: paper.authors,
				paper_abstract: paper.paper_abstract,
				url: paper.url ?? "",
				publication_year: paper.publication_year ?? 0,
				citation_count: paper.citation_count ?? 0,
				embedding,
				embedding_model_version: DEFAULT_EMBEDDING_CONFIG.model,
			});
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	private async generateEmbeddingsForPapers(
		papers: PaperInput[],
		generateEmbeddings: boolean,
		warnings: string[],
	): Promise<EmbeddingGenerationResult> {
		const embeddings = new Map<string, number[]>();
		let embeddingsGenerated = 0;

		if (!generateEmbeddings) {
			return { embeddings, embeddingsGenerated };
		}

		try {
			const embeddingClient = this.getEmbeddingClient();
			const textsToEmbed = papers.map((paper) => `${paper.title}\n\n${paper.abstract}`);
			const validTexts = textsToEmbed.filter((text) => text.length > 10);

			if (validTexts.length === 0) {
				return { embeddings, embeddingsGenerated };
			}

			const result = await embeddingClient.batchGenerateEmbeddings(validTexts);
			let validIndex = 0;
			for (let i = 0; i < textsToEmbed.length; i++) {
				if ((textsToEmbed[i]?.length ?? 0) <= 10) {
					continue;
				}
				const embedding = result.embeddings[validIndex];
				const paper = papers[i];
				if (embedding && paper) {
					embeddings.set(paper.paperId, embedding.values);
					embeddingsGenerated++;
				}
				validIndex++;
			}
		} catch (error) {
			warnings.push(
				`Embedding generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}

		return { embeddings, embeddingsGenerated };
	}

	private async upsertPapers(
		paperNodes: AcademicPaper[],
		embeddings: Map<string, number[]>,
		batchSize: number,
		errors: string[],
	): Promise<number> {
		let papersIngested = 0;

		for (let i = 0; i < paperNodes.length; i += batchSize) {
			const batch = paperNodes.slice(i, i + batchSize);
			for (const paper of batch) {
				const result = await this.upsertPaper(paper, embeddings.get(paper.paper_id));
				if (result.success) {
					papersIngested++;
					continue;
				}
				errors.push(`Failed to ingest ${paper.paper_id}: ${result.error}`);
			}
		}

		return papersIngested;
	}

	/**
	 * Ingest a batch of papers
	 */
	async ingestPapers(
		papers: PaperInput[],
		options: PaperIngestionOptions = {},
	): Promise<PaperIngestionResult> {
		if (papers.length === 0) {
			return this.createEmptyResult();
		}

		const startTime = performance.now();
		const warnings: string[] = [];
		const errors: string[] = [];
		const resolvedOptions = this.resolveOptions(options);
		const { papersToIngest, duplicatesSkipped } = await this.filterExistingPapers(
			papers,
			resolvedOptions.checkDuplicates,
			warnings,
		);
		if (papersToIngest.length === 0) {
			return {
				papersIngested: 0,
				duplicatesSkipped,
				embeddingsGenerated: 0,
				executionTimeMs: performance.now() - startTime,
				warnings,
				errors: [],
			};
		}

		const paperNodes = papersToIngest.map(toPaperNode);
		const { embeddings, embeddingsGenerated } = await this.generateEmbeddingsForPapers(
			papersToIngest,
			resolvedOptions.generateEmbeddings,
			warnings,
		);
		const papersIngested = await this.upsertPapers(
			paperNodes,
			embeddings,
			resolvedOptions.batchSize,
			errors,
		);

		return {
			papersIngested,
			duplicatesSkipped,
			embeddingsGenerated,
			executionTimeMs: performance.now() - startTime,
			warnings,
			errors,
		};
	}

	/**
	 * Ingest a single paper
	 */
	async ingestPaper(
		paper: PaperInput,
		options: PaperIngestionOptions = {},
	): Promise<PaperIngestionResult> {
		return this.ingestPapers([paper], options);
	}

	/**
	 * Ingest the seed papers (foundational research)
	 */
	async ingestSeedPapers(): Promise<PaperIngestionResult> {
		return this.ingestPapers(SEED_PAPERS);
	}

	/**
	 * Search for similar papers by text query.
	 * Returns full paper data including abstract for LLM consumption.
	 */
	async searchPapers(
		queryText: string,
		limit = 10,
	): Promise<
		Array<{
			paperId: string;
			title: string;
			authors: string;
			abstract: string;
			url?: string;
			publicationYear?: number;
			citationCount: number;
			similarity: number;
		}>
	> {
		try {
			const result = await this.client.query<{
				results: Array<{
					paper_id: string;
					title: string;
					authors: string;
					paper_abstract: string;
					url?: string;
					publication_year?: number;
					citation_count: number;
					score?: number;
				}>;
			}>("SearchAcademicPapers", { query_text: queryText, limit });

			return result.data.results.map((row) => ({
				paperId: row.paper_id,
				title: row.title,
				authors: row.authors,
				abstract: row.paper_abstract,
				url: row.url || undefined,
				publicationYear: row.publication_year || undefined,
				citationCount: row.citation_count,
				similarity: row.score ?? 0,
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Get a paper by ID
	 */
	async getPaperById(paperId: string): Promise<{
		paperId: string;
		title: string;
		authors: string;
		abstract: string;
		url?: string;
		publicationYear?: number;
		citationCount: number;
	} | null> {
		try {
			const result = await this.client.query<
				Array<{
					paper_id: string;
					title: string;
					authors: string;
					paper_abstract: string;
					url: string;
					publication_year: number;
					citation_count: number;
				}>
			>("GetPaperById", { paper_id: paperId });

			if (result.data.length === 0) {
				return null;
			}

			const paper = result.data[0];
			return paper
				? {
						paperId: paper.paper_id,
						title: paper.title,
						authors: paper.authors,
						abstract: paper.paper_abstract,
						url: paper.url || undefined,
						publicationYear: paper.publication_year || undefined,
						citationCount: paper.citation_count,
					}
				: null;
		} catch {
			return null;
		}
	}
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a PaperIngestionService instance
 */
export function createPaperIngestionService(client: HelixClient): PaperIngestionService {
	return new PaperIngestionService(client);
}

// ============================================
// Exported Helper Functions (for testing)
// ============================================

/** @internal Exported for testing */
export const _internal = {
	toPaperNode,
	calculatePaperRelevanceScore,
};
