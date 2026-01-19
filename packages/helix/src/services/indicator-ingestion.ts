/**
 * Indicator Ingestion Service
 *
 * Syncs indicators from PostgreSQL to HelixDB when they transition
 * to paper or production status.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md
 */

import { DEFAULT_EMBEDDING_CONFIG, EmbeddingClient } from "@cream/helix-schema";

import type { HelixClient } from "../client.js";

// ============================================
// Types
// ============================================

/**
 * Indicator input for ingestion
 */
export interface IndicatorInput {
	/** Unique indicator ID */
	indicatorId: string;
	/** Indicator name */
	name: string;
	/** Category: momentum, trend, volatility, volume, sentiment */
	category: string;
	/** Status: staging, paper, production, retired */
	status: string;
	/** Research hypothesis */
	hypothesis: string;
	/** Economic rationale for the indicator */
	economicRationale: string;
	/** Market regime when generated */
	generatedInRegime: string;
	/** Code hash for deduplication */
	codeHash: string;
	/** AST signature for similarity detection */
	astSignature: string;
	/** Deflated Sharpe ratio from validation */
	deflatedSharpe: number;
	/** Probability of overfit */
	probabilityOfOverfit: number;
	/** Information coefficient */
	informationCoefficient: number;
	/** Environment: PAPER or LIVE */
	environment: string;
}

/**
 * Ingestion result
 */
export interface IndicatorIngestionResult {
	indicatorsIngested: number;
	embeddingsGenerated: number;
	duplicatesSkipped: number;
	executionTimeMs: number;
	warnings: string[];
	errors: string[];
}

/**
 * Ingestion options
 */
export interface IndicatorIngestionOptions {
	/** Whether to generate embeddings (default: true) */
	generateEmbeddings?: boolean;
	/** Whether to check for duplicates via code hash (default: true) */
	deduplicateByCodeHash?: boolean;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Build embeddable text from indicator
 * Combines hypothesis with economic rationale for semantic search
 */
function buildEmbeddableText(input: IndicatorInput): string {
	return `${input.name}: ${input.hypothesis}\n\nEconomic Rationale: ${input.economicRationale}`;
}

// ============================================
// Main Service Class
// ============================================

/**
 * Indicator Ingestion Service
 *
 * Syncs indicators to HelixDB for semantic search and graph operations.
 */
export class IndicatorIngestionService {
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
	 * Check if indicator already exists by code hash
	 */
	private async findByCodeHash(codeHash: string): Promise<boolean> {
		try {
			const result = await this.client.query<Array<{ indicator_id: string }>>(
				"GetIndicatorByCodeHash",
				{ code_hash: codeHash }
			);
			return result.data.length > 0;
		} catch {
			return false;
		}
	}

	/**
	 * Upsert an indicator with embedding
	 */
	private async upsertIndicator(
		input: IndicatorInput,
		_embedding?: number[]
	): Promise<{ success: boolean; error?: string }> {
		try {
			await this.client.query("InsertIndicator", {
				indicator_id: input.indicatorId,
				name: input.name,
				category: input.category,
				status: input.status,
				hypothesis: input.hypothesis,
				economic_rationale: input.economicRationale,
				embedding_text: buildEmbeddableText(input),
				generated_in_regime: input.generatedInRegime,
				code_hash: input.codeHash,
				ast_signature: input.astSignature,
				deflated_sharpe: input.deflatedSharpe,
				probability_of_overfit: input.probabilityOfOverfit,
				information_coefficient: input.informationCoefficient,
				environment: input.environment,
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
	 * Ingest a batch of indicators
	 */
	async ingestIndicators(
		inputs: IndicatorInput[],
		options: IndicatorIngestionOptions = {}
	): Promise<IndicatorIngestionResult> {
		const startTime = performance.now();
		const warnings: string[] = [];
		const errors: string[] = [];

		const { generateEmbeddings = true, deduplicateByCodeHash = true } = options;

		if (inputs.length === 0) {
			return {
				indicatorsIngested: 0,
				embeddingsGenerated: 0,
				duplicatesSkipped: 0,
				executionTimeMs: 0,
				warnings: [],
				errors: [],
			};
		}

		// Step 1: Check for duplicates by code hash
		let duplicatesSkipped = 0;
		const uniqueInputs: IndicatorInput[] = [];

		if (deduplicateByCodeHash) {
			for (const input of inputs) {
				const exists = await this.findByCodeHash(input.codeHash);
				if (exists) {
					duplicatesSkipped++;
				} else {
					uniqueInputs.push(input);
				}
			}

			if (duplicatesSkipped > 0) {
				warnings.push(`Skipped ${duplicatesSkipped} duplicate indicators by code hash`);
			}
		} else {
			uniqueInputs.push(...inputs);
		}

		if (uniqueInputs.length === 0) {
			return {
				indicatorsIngested: 0,
				embeddingsGenerated: 0,
				duplicatesSkipped,
				executionTimeMs: performance.now() - startTime,
				warnings,
				errors: [],
			};
		}

		// Step 2: Generate embeddings if enabled
		const embeddings: Map<string, number[]> = new Map();
		let embeddingsGenerated = 0;

		if (generateEmbeddings) {
			try {
				const embeddingClient = this.getEmbeddingClient();
				const textsToEmbed = uniqueInputs.map((input) => buildEmbeddableText(input));

				const result = await embeddingClient.batchGenerateEmbeddings(textsToEmbed);

				for (let i = 0; i < uniqueInputs.length; i++) {
					const embedding = result.embeddings[i];
					const input = uniqueInputs[i];
					if (embedding && input) {
						embeddings.set(input.indicatorId, embedding.values);
						embeddingsGenerated++;
					}
				}
			} catch (error) {
				warnings.push(
					`Embedding generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
				);
			}
		}

		// Step 3: Upsert indicators
		let indicatorsIngested = 0;

		for (const input of uniqueInputs) {
			const embedding = embeddings.get(input.indicatorId);
			const result = await this.upsertIndicator(input, embedding);

			if (result.success) {
				indicatorsIngested++;
			} else {
				errors.push(`Failed to ingest ${input.indicatorId}: ${result.error}`);
			}
		}

		return {
			indicatorsIngested,
			embeddingsGenerated,
			duplicatesSkipped,
			executionTimeMs: performance.now() - startTime,
			warnings,
			errors,
		};
	}

	/**
	 * Ingest a single indicator
	 */
	async ingestIndicator(
		input: IndicatorInput,
		options: IndicatorIngestionOptions = {}
	): Promise<IndicatorIngestionResult> {
		return this.ingestIndicators([input], options);
	}

	/**
	 * Search for similar indicators by text
	 */
	async searchSimilarIndicators(
		queryText: string,
		limit = 10
	): Promise<Array<{ indicatorId: string; similarity: number; name: string; hypothesis: string }>> {
		try {
			const result = await this.client.query<
				Array<{ indicator_id: string; similarity: number; name: string; hypothesis: string }>
			>("SearchSimilarIndicators", { query_text: queryText, limit });

			return result.data.map((r) => ({
				indicatorId: r.indicator_id,
				similarity: r.similarity,
				name: r.name,
				hypothesis: r.hypothesis,
			}));
		} catch {
			return [];
		}
	}
}

// ============================================
// Factory Function
// ============================================

/**
 * Create an IndicatorIngestionService instance
 */
export function createIndicatorIngestionService(client: HelixClient): IndicatorIngestionService {
	return new IndicatorIngestionService(client);
}
