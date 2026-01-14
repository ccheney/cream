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

// ============================================
// Seed Papers - Foundational Research
// ============================================

/**
 * Foundational papers for seeding the knowledge base.
 * These are seminal works in factor investing and quantitative finance.
 */
export const SEED_PAPERS: PaperInput[] = [
	// Factor Investing Foundations
	{
		paperId: "fama-french-1992",
		title: "The Cross-Section of Expected Stock Returns",
		authors: "Eugene F. Fama, Kenneth R. French",
		abstract:
			"Two easily measured variables, size and book-to-market equity, combine to capture the cross-sectional variation in average stock returns associated with market beta, size, leverage, book-to-market equity, and earnings-price ratios. Moreover, when the tests allow for variation in beta that is unrelated to size, the relation between market beta and average return is flat, even when beta is the only explanatory variable.",
		url: "https://doi.org/10.1111/j.1540-6261.1992.tb04398.x",
		publicationYear: 1992,
		citationCount: 20000,
	},
	{
		paperId: "jegadeesh-titman-1993",
		title: "Returns to Buying Winners and Selling Losers: Implications for Stock Market Efficiency",
		authors: "Narasimhan Jegadeesh, Sheridan Titman",
		abstract:
			"This paper documents that strategies which buy stocks that have performed well in the past and sell stocks that have performed poorly in the past generate significant positive returns over 3- to 12-month holding periods. We find that the profitability of these strategies are not due to their systematic risk or to delayed stock price reactions to common factors.",
		url: "https://doi.org/10.1111/j.1540-6261.1993.tb04702.x",
		publicationYear: 1993,
		citationCount: 12000,
	},
	{
		paperId: "fama-french-2015",
		title: "A Five-Factor Asset Pricing Model",
		authors: "Eugene F. Fama, Kenneth R. French",
		abstract:
			"A five-factor model directed at capturing the size, value, profitability, and investment patterns in average stock returns performs better than the three-factor model of Fama and French (1993). The five-factor model's main problem is its failure to capture the low average returns on small stocks whose returns behave like those of firms that invest a lot despite low profitability.",
		url: "https://doi.org/10.1016/j.jfineco.2014.10.010",
		publicationYear: 2015,
		citationCount: 8000,
	},
	{
		paperId: "carhart-1997",
		title: "On Persistence in Mutual Fund Performance",
		authors: "Mark M. Carhart",
		abstract:
			"Using a sample free of survivorship bias, I demonstrate that common factors in stock returns and investment expenses almost completely explain persistence in equity mutual funds' mean and risk-adjusted returns. Hendricks, Patel, and Zeckhauser's (1993) hot hands result is mainly driven by the one-year momentum effect of Jegadeesh and Titman (1993), but individual funds do not earn higher returns from following the momentum strategy.",
		url: "https://doi.org/10.1111/j.1540-6261.1997.tb03808.x",
		publicationYear: 1997,
		citationCount: 7500,
	},

	// Machine Learning in Finance
	{
		paperId: "gu-kelly-xiu-2020",
		title: "Empirical Asset Pricing via Machine Learning",
		authors: "Shihao Gu, Bryan Kelly, Dacheng Xiu",
		abstract:
			"We perform a comparative analysis of machine learning methods for the canonical problem of empirical asset pricing: measuring asset risk premiums. We demonstrate large economic gains to investors using machine learning forecasts, in some cases doubling the performance of leading regression-based strategies from the literature.",
		url: "https://doi.org/10.1093/rfs/hhaa009",
		publicationYear: 2020,
		citationCount: 2500,
	},
	{
		paperId: "chen-pelger-zhu-2020",
		title: "Deep Learning in Asset Pricing",
		authors: "Luyang Chen, Markus Pelger, Jason Zhu",
		abstract:
			"We use deep neural networks to estimate an asset pricing model for individual stock returns that takes advantage of the vast amount of conditioning information, while keeping a low-dimensional structure. Our approach is successful at explaining variation in returns and provides insights about the sources of asset pricing anomalies.",
		url: "https://doi.org/10.1287/mnsc.2023.4695",
		publicationYear: 2020,
		citationCount: 800,
	},

	// Market Microstructure
	{
		paperId: "kyle-1985",
		title: "Continuous Auctions and Insider Trading",
		authors: "Albert S. Kyle",
		abstract:
			"A dynamic model of insider trading with sequential auctions, structured to resemble a sequential equilibrium, is used to examine the informational content of prices, the ## liquidity characteristics of a speculative market, and the value of private information to an insider. The analysis develops a theory of market depth and provides conditions under which markets are informationally efficient.",
		url: "https://doi.org/10.2307/1913210",
		publicationYear: 1985,
		citationCount: 10000,
	},

	// Behavioral Finance
	{
		paperId: "barberis-thaler-2003",
		title: "A Survey of Behavioral Finance",
		authors: "Nicholas Barberis, Richard Thaler",
		abstract:
			"Behavioral finance argues that some financial phenomena can be better understood using models in which some agents are not fully rational. We discuss two common themes in behavioral finance: limits to arbitrage and psychology.",
		url: "https://doi.org/10.1016/S1574-0102(03)01027-6",
		publicationYear: 2003,
		citationCount: 6000,
	},

	// Options and Volatility
	{
		paperId: "black-scholes-1973",
		title: "The Pricing of Options and Corporate Liabilities",
		authors: "Fischer Black, Myron Scholes",
		abstract:
			"If options are correctly priced in the market, it should not be possible to make sure profits by creating portfolios of long and short positions in options and their underlying stocks. Using this principle, a theoretical valuation formula for options is derived.",
		url: "https://doi.org/10.1086/260062",
		publicationYear: 1973,
		citationCount: 35000,
	},

	// Post-Publication Decay
	{
		paperId: "mclean-pontiff-2016",
		title: "Does Academic Research Destroy Stock Return Predictability?",
		authors: "R. David McLean, Jeffrey Pontiff",
		abstract:
			"We study the out-of-sample and post-publication return predictability of 97 variables shown to predict cross-sectional stock returns. Portfolio returns are 26% lower out-of-sample and 58% lower post-publication. The out-of-sample decline is similar in magnitude to post-publication declines, suggesting that the publication process reveals overfit signals.",
		url: "https://doi.org/10.1111/jofi.12365",
		publicationYear: 2016,
		citationCount: 1500,
	},
];

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

	// Citation count (log-scaled to prevent domination)
	if (paper.citationCount && paper.citationCount > 0) {
		score += Math.log10(paper.citationCount + 1) * 10;
	}

	// Recency bonus (papers < 5 years old)
	if (paper.publicationYear) {
		const currentYear = new Date().getFullYear();
		const age = currentYear - paper.publicationYear;
		if (age <= 5) {
			score += (5 - age) * 5; // Up to 25 points for very recent papers
		}
	}

	// Abstract quality (longer abstracts tend to be more informative)
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

	/**
	 * Upsert a single paper
	 */
	private async upsertPaper(
		paper: AcademicPaper,
		embedding?: number[]
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

	/**
	 * Ingest a batch of papers
	 */
	async ingestPapers(
		papers: PaperInput[],
		options: PaperIngestionOptions = {}
	): Promise<PaperIngestionResult> {
		const startTime = performance.now();
		const warnings: string[] = [];
		const errors: string[] = [];

		const { generateEmbeddings = true, checkDuplicates = true, batchSize = 20 } = options;

		if (papers.length === 0) {
			return {
				papersIngested: 0,
				duplicatesSkipped: 0,
				embeddingsGenerated: 0,
				executionTimeMs: 0,
				warnings: [],
				errors: [],
			};
		}

		// Step 1: Check for duplicates
		let papersToIngest = papers;
		let duplicatesSkipped = 0;

		if (checkDuplicates) {
			const uniquePapers: PaperInput[] = [];

			for (const paper of papers) {
				const exists = await this.paperExists(paper.paperId);
				if (exists) {
					duplicatesSkipped++;
				} else {
					uniquePapers.push(paper);
				}
			}

			papersToIngest = uniquePapers;

			if (duplicatesSkipped > 0) {
				warnings.push(`Skipped ${duplicatesSkipped} existing papers`);
			}
		}

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

		// Step 2: Convert to HelixDB format
		const paperNodes = papersToIngest.map(toPaperNode);

		// Step 3: Generate embeddings from abstracts
		const embeddings: Map<string, number[]> = new Map();
		let embeddingsGenerated = 0;

		if (generateEmbeddings) {
			try {
				const embeddingClient = this.getEmbeddingClient();
				const textsToEmbed = papersToIngest.map((p) => `${p.title}\n\n${p.abstract}`);
				const validTexts = textsToEmbed.filter((t) => t.length > 10);

				if (validTexts.length > 0) {
					const result = await embeddingClient.batchGenerateEmbeddings(validTexts);

					let validIndex = 0;
					for (let i = 0; i < textsToEmbed.length; i++) {
						const text = textsToEmbed[i];
						if (text && text.length > 10) {
							const embedding = result.embeddings[validIndex];
							const paper = papersToIngest[i];
							if (embedding && paper) {
								embeddings.set(paper.paperId, embedding.values);
								embeddingsGenerated++;
							}
							validIndex++;
						}
					}
				}
			} catch (error) {
				warnings.push(
					`Embedding generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
				);
			}
		}

		// Step 4: Upsert papers
		let papersIngested = 0;

		for (let i = 0; i < paperNodes.length; i += batchSize) {
			const batch = paperNodes.slice(i, i + batchSize);

			for (const paper of batch) {
				const embedding = embeddings.get(paper.paper_id);
				const result = await this.upsertPaper(paper, embedding);

				if (result.success) {
					papersIngested++;
				} else {
					errors.push(`Failed to ingest ${paper.paper_id}: ${result.error}`);
				}
			}
		}

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
		options: PaperIngestionOptions = {}
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
	 * Search for similar papers by text query
	 */
	async searchPapers(
		queryText: string,
		limit = 10
	): Promise<
		Array<{
			paperId: string;
			title: string;
			authors: string;
			similarity: number;
			citationCount: number;
		}>
	> {
		try {
			const result = await this.client.query<
				Array<{
					paper_id: string;
					title: string;
					authors: string;
					similarity: number;
					citation_count: number;
				}>
			>("SearchAcademicPapers", { query_text: queryText, limit });

			return result.data.map((r) => ({
				paperId: r.paper_id,
				title: r.title,
				authors: r.authors,
				similarity: r.similarity,
				citationCount: r.citation_count,
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
