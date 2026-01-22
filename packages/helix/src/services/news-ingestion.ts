/**
 * News Ingestion Service
 *
 * Ingests news items into HelixDB with embedding generation.
 * Creates MENTIONS_COMPANY edges for company references.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { MentionsCompanyEdge, NewsItem } from "@cream/helix-schema";
import { DEFAULT_EMBEDDING_CONFIG, EmbeddingClient } from "@cream/helix-schema";

import type { HelixClient } from "../client.js";
import { batchCreateEdges, type EdgeInput } from "../queries/mutations.js";

// ============================================
// Types
// ============================================

/**
 * News item input for ingestion
 */
export interface NewsItemInput {
	/** Unique item ID */
	itemId: string;
	/** News headline (embedded) */
	headline: string;
	/** News body text */
	bodyText: string;
	/** Publication timestamp */
	publishedAt: Date;
	/** News source name */
	source: string;
	/** Related stock symbols */
	relatedSymbols: string[];
	/** Sentiment score from -1.0 to 1.0 */
	sentimentScore: number;
}

/**
 * Ingestion result
 */
export interface NewsIngestionResult {
	itemsIngested: number;
	edgesCreated: number;
	embeddingsGenerated: number;
	duplicatesSkipped: number;
	executionTimeMs: number;
	warnings: string[];
	errors: string[];
}

/**
 * Ingestion options
 */
export interface NewsIngestionOptions {
	/** Whether to generate embeddings (default: true) */
	generateEmbeddings?: boolean;
	/** Whether to create company mention edges (default: true) */
	createCompanyEdges?: boolean;
	/** Whether to check for duplicates via headline similarity (default: true) */
	deduplicateByHeadline?: boolean;
	/** Similarity threshold for duplicate detection (default: 0.95) */
	deduplicationThreshold?: number;
	/** Batch size for operations (default: 50) */
	batchSize?: number;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Convert NewsItemInput to HelixDB NewsItem
 */
function toNewsItem(input: NewsItemInput): NewsItem {
	return {
		item_id: input.itemId,
		headline: input.headline,
		body_text: input.bodyText,
		published_at: input.publishedAt.toISOString(),
		source: input.source,
		related_symbols: JSON.stringify(input.relatedSymbols),
		sentiment_score: input.sentimentScore,
	};
}

/**
 * Build embeddable text from news item
 * Combines headline with truncated body for better context
 */
function buildEmbeddableText(item: NewsItemInput, maxBodyLength = 500): string {
	const bodyPreview =
		item.bodyText.length > maxBodyLength
			? `${item.bodyText.substring(0, maxBodyLength)}...`
			: item.bodyText;

	return `${item.headline}\n\n${bodyPreview}`;
}

// ============================================
// Main Service Class
// ============================================

/**
 * News Ingestion Service
 *
 * Ingests news items into HelixDB with embeddings and graph edges.
 */
export class NewsIngestionService {
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
	 * Check for duplicate news items by headline similarity
	 */
	private async findDuplicates(headlines: string[], threshold: number): Promise<Set<number>> {
		const duplicateIndices = new Set<number>();

		try {
			for (let i = 0; i < headlines.length; i++) {
				const headline = headlines[i];
				if (!headline) {
					continue;
				}

				const result = await this.client.query<Array<{ item_id: string; similarity: number }>>(
					"SearchNews",
					{ query: headline, limit: 1 },
				);

				if (result.data.length > 0) {
					const match = result.data[0];
					if (match && match.similarity >= threshold) {
						duplicateIndices.add(i);
					}
				}
			}
		} catch {
			// If search fails, proceed without deduplication
		}

		return duplicateIndices;
	}

	/**
	 * Upsert a news item with embedding
	 */
	private async upsertNewsItem(
		item: NewsItem,
		embedding?: number[],
	): Promise<{ success: boolean; error?: string }> {
		try {
			await this.client.query("InsertNewsItem", {
				item_id: item.item_id,
				headline: item.headline,
				body_text: item.body_text,
				source: item.source,
				related_symbols: item.related_symbols,
				sentiment_score: item.sentiment_score,
				published_at: item.published_at,
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
	 * Ingest a batch of news items
	 */
	async ingestNews(
		items: NewsItemInput[],
		options: NewsIngestionOptions = {},
	): Promise<NewsIngestionResult> {
		const startTime = performance.now();
		const warnings: string[] = [];
		const errors: string[] = [];

		const {
			generateEmbeddings = true,
			createCompanyEdges = true,
			deduplicateByHeadline = true,
			deduplicationThreshold = 0.95,
			batchSize = 50,
		} = options;

		if (items.length === 0) {
			return {
				itemsIngested: 0,
				edgesCreated: 0,
				embeddingsGenerated: 0,
				duplicatesSkipped: 0,
				executionTimeMs: 0,
				warnings: [],
				errors: [],
			};
		}

		// Step 1: Check for duplicates
		let duplicateIndices = new Set<number>();
		let duplicatesSkipped = 0;

		if (deduplicateByHeadline) {
			duplicateIndices = await this.findDuplicates(
				items.map((i) => i.headline),
				deduplicationThreshold,
			);
			duplicatesSkipped = duplicateIndices.size;

			if (duplicatesSkipped > 0) {
				warnings.push(`Skipped ${duplicatesSkipped} duplicate items by headline similarity`);
			}
		}

		// Filter out duplicates
		const uniqueItems = items.filter((_, idx) => !duplicateIndices.has(idx));

		if (uniqueItems.length === 0) {
			return {
				itemsIngested: 0,
				edgesCreated: 0,
				embeddingsGenerated: 0,
				duplicatesSkipped,
				executionTimeMs: performance.now() - startTime,
				warnings,
				errors: [],
			};
		}

		// Step 2: Convert to HelixDB format
		const newsItems = uniqueItems.map(toNewsItem);

		// Step 3: Generate embeddings if enabled
		const embeddings: Map<string, number[]> = new Map();
		let embeddingsGenerated = 0;

		if (generateEmbeddings) {
			try {
				const embeddingClient = this.getEmbeddingClient();
				const textsToEmbed = uniqueItems.map((item) => buildEmbeddableText(item));
				const validTexts = textsToEmbed.filter((t) => t.length > 0);

				if (validTexts.length > 0) {
					const result = await embeddingClient.batchGenerateEmbeddings(validTexts);

					let validIndex = 0;
					for (let i = 0; i < textsToEmbed.length; i++) {
						const text = textsToEmbed[i];
						if (text && text.length > 0) {
							const embedding = result.embeddings[validIndex];
							const item = uniqueItems[i];
							if (embedding && item) {
								embeddings.set(item.itemId, embedding.values);
								embeddingsGenerated++;
							}
							validIndex++;
						}
					}
				}
			} catch (error) {
				warnings.push(
					`Embedding generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
		}

		// Step 4: Upsert news items with embeddings
		let itemsIngested = 0;

		for (let i = 0; i < newsItems.length; i += batchSize) {
			const batch = newsItems.slice(i, i + batchSize);

			for (const item of batch) {
				const embedding = embeddings.get(item.item_id);
				const result = await this.upsertNewsItem(item, embedding);

				if (result.success) {
					itemsIngested++;
				} else {
					errors.push(`Failed to ingest ${item.item_id}: ${result.error}`);
				}
			}
		}

		// Step 5: Create MENTIONS_COMPANY edges
		const edges: EdgeInput[] = [];

		if (createCompanyEdges) {
			for (const item of uniqueItems) {
				if (item.relatedSymbols.length > 0) {
					for (const symbol of item.relatedSymbols) {
						const edge: MentionsCompanyEdge = {
							source_id: item.itemId,
							target_id: symbol,
							sentiment: item.sentimentScore,
						};
						edges.push({
							sourceId: edge.source_id,
							targetId: edge.target_id,
							edgeType: "MENTIONS_COMPANY",
							properties: {
								sentiment: edge.sentiment,
							},
						});
					}
				}
			}
		}

		// Batch create edges
		let edgesCreated = 0;
		if (edges.length > 0) {
			for (let i = 0; i < edges.length; i += batchSize) {
				const batch = edges.slice(i, i + batchSize);
				const result = await batchCreateEdges(this.client, batch);
				edgesCreated += result.successful.length;

				if (result.failed.length > 0) {
					warnings.push(
						`${result.failed.length} edges failed to create in batch ${Math.floor(i / batchSize) + 1}`,
					);
				}
			}
		}

		return {
			itemsIngested,
			edgesCreated,
			embeddingsGenerated,
			duplicatesSkipped,
			executionTimeMs: performance.now() - startTime,
			warnings,
			errors,
		};
	}

	/**
	 * Ingest a single news item
	 */
	async ingestNewsItem(
		item: NewsItemInput,
		options: NewsIngestionOptions = {},
	): Promise<NewsIngestionResult> {
		return this.ingestNews([item], options);
	}

	/**
	 * Search for similar news by text
	 */
	async searchSimilarNews(
		queryText: string,
		limit = 10,
	): Promise<Array<{ itemId: string; similarity: number; headline: string; source: string }>> {
		try {
			const result = await this.client.query<
				Array<{ item_id: string; similarity: number; headline: string; source: string }>
			>("SearchNews", { query: queryText, limit });

			return result.data.map((r) => ({
				itemId: r.item_id,
				similarity: r.similarity,
				headline: r.headline,
				source: r.source,
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Get news items by company symbol
	 */
	async getNewsByCompany(
		symbol: string,
		limit = 20,
	): Promise<
		Array<{ itemId: string; headline: string; sentimentScore: number; publishedAt: string }>
	> {
		try {
			const result = await this.client.query<
				Array<{ item_id: string; headline: string; sentiment_score: number; published_at: string }>
			>("getNewsByCompany", { symbol, limit });

			return result.data.map((r) => ({
				itemId: r.item_id,
				headline: r.headline,
				sentimentScore: r.sentiment_score,
				publishedAt: r.published_at,
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Get aggregate sentiment for a company from news
	 */
	async getCompanySentiment(
		symbol: string,
		daysBack = 7,
	): Promise<{ avgSentiment: number; newsCount: number }> {
		try {
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - daysBack);

			const result = await this.client.query<Array<{ avg_sentiment: number; count: number }>>(
				"getCompanySentiment",
				{
					symbol,
					since: cutoffDate.toISOString(),
				},
			);

			if (result.data.length > 0) {
				const data = result.data[0];
				return {
					avgSentiment: data?.avg_sentiment ?? 0,
					newsCount: data?.count ?? 0,
				};
			}

			return { avgSentiment: 0, newsCount: 0 };
		} catch {
			return { avgSentiment: 0, newsCount: 0 };
		}
	}
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a NewsIngestionService instance
 */
export function createNewsIngestionService(client: HelixClient): NewsIngestionService {
	return new NewsIngestionService(client);
}

// ============================================
// Exported Helper Functions (for testing)
// ============================================

/** @internal Exported for testing */
export const _internal = {
	toNewsItem,
	buildEmbeddableText,
};
