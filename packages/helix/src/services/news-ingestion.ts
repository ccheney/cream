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

interface ResolvedNewsIngestionOptions {
	generateEmbeddings: boolean;
	createCompanyEdges: boolean;
	deduplicateByHeadline: boolean;
	deduplicationThreshold: number;
	batchSize: number;
}

interface DuplicateResolutionResult {
	uniqueItems: NewsItemInput[];
	duplicatesSkipped: number;
}

interface EmbeddingGenerationResult {
	embeddings: Map<string, number[]>;
	embeddingsGenerated: number;
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

	private resolveOptions(options: NewsIngestionOptions): ResolvedNewsIngestionOptions {
		return {
			generateEmbeddings: options.generateEmbeddings ?? true,
			createCompanyEdges: options.createCompanyEdges ?? true,
			deduplicateByHeadline: options.deduplicateByHeadline ?? true,
			deduplicationThreshold: options.deduplicationThreshold ?? 0.95,
			batchSize: options.batchSize ?? 50,
		};
	}

	private createEmptyResult(): NewsIngestionResult {
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

	private async resolveUniqueItems(
		items: NewsItemInput[],
		options: ResolvedNewsIngestionOptions,
		warnings: string[],
	): Promise<DuplicateResolutionResult> {
		if (!options.deduplicateByHeadline) {
			return { uniqueItems: items, duplicatesSkipped: 0 };
		}

		const duplicateIndices = await this.findDuplicates(
			items.map((item) => item.headline),
			options.deduplicationThreshold,
		);
		const duplicatesSkipped = duplicateIndices.size;
		if (duplicatesSkipped > 0) {
			warnings.push(`Skipped ${duplicatesSkipped} duplicate items by headline similarity`);
		}

		return {
			uniqueItems: items.filter((_, index) => !duplicateIndices.has(index)),
			duplicatesSkipped,
		};
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

	private async generateEmbeddingsForItems(
		items: NewsItemInput[],
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
			const textsToEmbed = items.map((item) => buildEmbeddableText(item));
			const validTexts = textsToEmbed.filter((text) => text.length > 0);

			if (validTexts.length === 0) {
				return { embeddings, embeddingsGenerated };
			}

			const result = await embeddingClient.batchGenerateEmbeddings(validTexts);
			let validIndex = 0;
			for (let i = 0; i < textsToEmbed.length; i++) {
				if (!textsToEmbed[i]) {
					continue;
				}
				const embedding = result.embeddings[validIndex];
				const item = items[i];
				if (embedding && item) {
					embeddings.set(item.itemId, embedding.values);
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

	private async upsertNewsItems(
		newsItems: NewsItem[],
		embeddings: Map<string, number[]>,
		batchSize: number,
		errors: string[],
	): Promise<number> {
		let itemsIngested = 0;

		for (let i = 0; i < newsItems.length; i += batchSize) {
			const batch = newsItems.slice(i, i + batchSize);
			for (const item of batch) {
				const result = await this.upsertNewsItem(item, embeddings.get(item.item_id));
				if (result.success) {
					itemsIngested++;
					continue;
				}
				errors.push(`Failed to ingest ${item.item_id}: ${result.error}`);
			}
		}

		return itemsIngested;
	}

	private buildCompanyEdges(items: NewsItemInput[], createCompanyEdges: boolean): EdgeInput[] {
		if (!createCompanyEdges) {
			return [];
		}

		const edges: EdgeInput[] = [];
		for (const item of items) {
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

		return edges;
	}

	private async createEdgesInBatches(
		edges: EdgeInput[],
		batchSize: number,
		warnings: string[],
	): Promise<number> {
		let edgesCreated = 0;
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
		return edgesCreated;
	}

	/**
	 * Ingest a batch of news items
	 */
	async ingestNews(
		items: NewsItemInput[],
		options: NewsIngestionOptions = {},
	): Promise<NewsIngestionResult> {
		if (items.length === 0) {
			return this.createEmptyResult();
		}

		const startTime = performance.now();
		const warnings: string[] = [];
		const errors: string[] = [];
		const resolvedOptions = this.resolveOptions(options);
		const { uniqueItems, duplicatesSkipped } = await this.resolveUniqueItems(
			items,
			resolvedOptions,
			warnings,
		);
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

		const newsItems = uniqueItems.map(toNewsItem);
		const { embeddings, embeddingsGenerated } = await this.generateEmbeddingsForItems(
			uniqueItems,
			resolvedOptions.generateEmbeddings,
			warnings,
		);
		const itemsIngested = await this.upsertNewsItems(
			newsItems,
			embeddings,
			resolvedOptions.batchSize,
			errors,
		);
		const edges = this.buildCompanyEdges(uniqueItems, resolvedOptions.createCompanyEdges);
		const edgesCreated = await this.createEdgesInBatches(
			edges,
			resolvedOptions.batchSize,
			warnings,
		);

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

			return result.data.map((row) => ({
				itemId: row.item_id,
				similarity: row.similarity,
				headline: row.headline,
				source: row.source,
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

			return result.data.map((row) => ({
				itemId: row.item_id,
				headline: row.headline,
				sentimentScore: row.sentiment_score,
				publishedAt: row.published_at,
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
