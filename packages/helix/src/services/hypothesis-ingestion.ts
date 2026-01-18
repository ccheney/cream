/**
 * Hypothesis Ingestion Service
 *
 * Ingests research hypotheses from the Idea Agent into HelixDB.
 * Creates ResearchHypothesis nodes with embedded economic rationale for semantic search.
 * Enables deduplication by finding similar past hypotheses.
 *
 * @see docs/plans/20-research-to-production-pipeline.md
 */

import type { HypothesisStatus, MarketMechanism, ResearchHypothesis } from "@cream/helix-schema";
import { DEFAULT_EMBEDDING_CONFIG, EmbeddingClient } from "@cream/helix-schema";

import type { HelixClient } from "../client.js";

// ============================================
// Types
// ============================================

/**
 * Hypothesis input from Idea Agent
 */
export interface HypothesisInput {
	/** Unique identifier (format: hyp-{timestamp}-{shortname}) */
	hypothesisId: string;
	/** Human-readable title (3-5 words) */
	title: string;
	/** Economic rationale explaining WHY this alpha exists (embedded field) */
	economicRationale: string;
	/** Market mechanism that creates the alpha */
	marketMechanism: MarketMechanism;
	/** Target market regime */
	targetRegime: string;
	/** Current status in the pipeline */
	status: HypothesisStatus;
	/** Expected Information Coefficient (0.03-0.10) */
	expectedIc: number;
	/** Expected Sharpe ratio (1.0-2.5) */
	expectedSharpe: number;
	/** Testable conditions that would prove hypothesis wrong */
	falsificationCriteria: string[];
	/** Required input features (max 8) */
	requiredFeatures: string[];
	/** Related academic papers and references */
	relatedLiterature: string[];
	/** How this differs from existing factors */
	originalityJustification: string;
	/** What triggered this hypothesis (REGIME_GAP, ALPHA_DECAY, etc.) */
	triggerType: string;
	/** Suggestions for implementation */
	implementationHints?: string;
	/** Agent that generated the hypothesis */
	author: string;
	/** Environment (PAPER, LIVE) */
	environment: string;
}

/**
 * Similar hypothesis match result
 */
export interface SimilarHypothesis {
	hypothesisId: string;
	title: string;
	status: HypothesisStatus;
	similarity: number;
	economicRationale: string;
	marketMechanism: string;
	lessonsLearned?: string;
}

/**
 * Ingestion result
 */
export interface HypothesisIngestionResult {
	hypothesesIngested: number;
	duplicatesSkipped: number;
	embeddingsGenerated: number;
	executionTimeMs: number;
	warnings: string[];
	errors: string[];
	/** Similar existing hypotheses found during deduplication */
	similarHypotheses: SimilarHypothesis[];
}

/**
 * Ingestion options
 */
export interface HypothesisIngestionOptions {
	/** Whether to generate embeddings (default: true) */
	generateEmbeddings?: boolean;
	/** Whether to check for duplicates (default: true) */
	checkDuplicates?: boolean;
	/** Similarity threshold for flagging duplicates (default: 0.85) */
	similarityThreshold?: number;
	/** Batch size for operations (default: 20) */
	batchSize?: number;
}

/**
 * Update input for hypothesis status changes
 */
export interface HypothesisUpdateInput {
	hypothesisId: string;
	status?: HypothesisStatus;
	realizedIc?: number;
	realizedSharpe?: number;
	lessonsLearned?: string;
	factorId?: string;
	validatedAt?: string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_SIMILARITY_THRESHOLD = 0.85;

// ============================================
// Helper Functions
// ============================================

/**
 * Convert HypothesisInput to HelixDB ResearchHypothesis
 */
function toHypothesisNode(input: HypothesisInput): ResearchHypothesis {
	return {
		hypothesis_id: input.hypothesisId,
		title: input.title,
		economic_rationale: input.economicRationale,
		market_mechanism: input.marketMechanism,
		target_regime: input.targetRegime,
		status: input.status,
		expected_ic: input.expectedIc,
		expected_sharpe: input.expectedSharpe,
		falsification_criteria: JSON.stringify(input.falsificationCriteria),
		required_features: JSON.stringify(input.requiredFeatures),
		related_literature: JSON.stringify(input.relatedLiterature),
		originality_justification: input.originalityJustification,
		trigger_type: input.triggerType,
		implementation_hints: input.implementationHints,
		author: input.author,
		created_at: new Date().toISOString(),
		environment: input.environment as "PAPER" | "LIVE",
	};
}

/**
 * Calculate a quality score for a hypothesis
 * Used for ranking similar hypotheses
 */
export function calculateHypothesisQualityScore(hypothesis: HypothesisInput): number {
	let score = 0;

	// Expected IC (higher is better, weight: 30)
	score += hypothesis.expectedIc * 300;

	// Expected Sharpe (higher is better, weight: 20)
	score += hypothesis.expectedSharpe * 10;

	// Falsification criteria (more specific = better, weight: 15)
	score += Math.min(hypothesis.falsificationCriteria.length * 3, 15);

	// Related literature (more references = better grounded, weight: 15)
	score += Math.min(hypothesis.relatedLiterature.length * 3, 15);

	// Originality justification (longer = more thought-out, weight: 10)
	if (hypothesis.originalityJustification.length > 100) {
		score += 10;
	} else if (hypothesis.originalityJustification.length > 50) {
		score += 5;
	}

	// Implementation hints presence (weight: 10)
	if (hypothesis.implementationHints && hypothesis.implementationHints.length > 50) {
		score += 10;
	}

	return Math.round(score * 100) / 100;
}

// ============================================
// Main Service Class
// ============================================

/**
 * Hypothesis Ingestion Service
 *
 * Ingests research hypotheses into HelixDB with embeddings.
 */
export class HypothesisIngestionService {
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
	 * Check if a hypothesis already exists
	 */
	private async hypothesisExists(hypothesisId: string): Promise<boolean> {
		try {
			const result = await this.client.query<Array<{ hypothesis_id: string }>>(
				"GetHypothesisById",
				{ hypothesis_id: hypothesisId }
			);
			return result.data.length > 0;
		} catch {
			return false;
		}
	}

	/**
	 * Search for similar hypotheses by economic rationale
	 */
	async searchSimilarHypotheses(
		economicRationale: string,
		limit = 5,
		similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD
	): Promise<SimilarHypothesis[]> {
		try {
			const result = await this.client.query<
				Array<{
					hypothesis_id: string;
					title: string;
					status: HypothesisStatus;
					similarity: number;
					economic_rationale: string;
					market_mechanism: string;
					lessons_learned: string;
				}>
			>("SearchSimilarHypotheses", {
				query_text: economicRationale,
				limit,
			});

			return result.data
				.filter((r) => r.similarity >= similarityThreshold)
				.map((r) => ({
					hypothesisId: r.hypothesis_id,
					title: r.title,
					status: r.status as HypothesisStatus,
					similarity: r.similarity,
					economicRationale: r.economic_rationale,
					marketMechanism: r.market_mechanism,
					lessonsLearned: r.lessons_learned || undefined,
				}));
		} catch {
			return [];
		}
	}

	/**
	 * Upsert a single hypothesis
	 */
	private async upsertHypothesis(
		hypothesis: ResearchHypothesis,
		embedding?: number[]
	): Promise<{ success: boolean; error?: string }> {
		try {
			await this.client.query("InsertResearchHypothesis", {
				hypothesis_id: hypothesis.hypothesis_id,
				title: hypothesis.title,
				economic_rationale: hypothesis.economic_rationale,
				market_mechanism: hypothesis.market_mechanism,
				target_regime: hypothesis.target_regime,
				status: hypothesis.status,
				expected_ic: hypothesis.expected_ic,
				expected_sharpe: hypothesis.expected_sharpe,
				falsification_criteria: hypothesis.falsification_criteria,
				required_features: hypothesis.required_features,
				related_literature: hypothesis.related_literature,
				originality_justification: hypothesis.originality_justification,
				trigger_type: hypothesis.trigger_type,
				implementation_hints: hypothesis.implementation_hints ?? "",
				lessons_learned: hypothesis.lessons_learned ?? "",
				realized_ic: hypothesis.realized_ic ?? 0,
				realized_sharpe: hypothesis.realized_sharpe ?? 0,
				factor_id: hypothesis.factor_id ?? "",
				author: hypothesis.author,
				validated_at: hypothesis.validated_at ?? "",
				environment: "PAPER", // Default for now
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
	 * Ingest a batch of hypotheses
	 */
	async ingestHypotheses(
		hypotheses: HypothesisInput[],
		options: HypothesisIngestionOptions = {}
	): Promise<HypothesisIngestionResult> {
		const startTime = performance.now();
		const warnings: string[] = [];
		const errors: string[] = [];
		const allSimilarHypotheses: SimilarHypothesis[] = [];

		const {
			generateEmbeddings = true,
			checkDuplicates = true,
			similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
			batchSize = 20,
		} = options;

		if (hypotheses.length === 0) {
			return {
				hypothesesIngested: 0,
				duplicatesSkipped: 0,
				embeddingsGenerated: 0,
				executionTimeMs: 0,
				warnings: [],
				errors: [],
				similarHypotheses: [],
			};
		}

		// Step 1: Check for existing hypotheses and similar ones
		let hypothesesToIngest = hypotheses;
		let duplicatesSkipped = 0;

		if (checkDuplicates) {
			const uniqueHypotheses: HypothesisInput[] = [];

			for (const hypothesis of hypotheses) {
				// Check exact ID match
				const exists = await this.hypothesisExists(hypothesis.hypothesisId);
				if (exists) {
					duplicatesSkipped++;
					continue;
				}

				// Check semantic similarity
				const similar = await this.searchSimilarHypotheses(
					hypothesis.economicRationale,
					5,
					similarityThreshold
				);

				if (similar.length > 0) {
					allSimilarHypotheses.push(...similar);
					warnings.push(
						`Hypothesis "${hypothesis.title}" has ${similar.length} similar existing hypotheses`
					);
				}

				uniqueHypotheses.push(hypothesis);
			}

			hypothesesToIngest = uniqueHypotheses;

			if (duplicatesSkipped > 0) {
				warnings.push(`Skipped ${duplicatesSkipped} existing hypotheses`);
			}
		}

		if (hypothesesToIngest.length === 0) {
			return {
				hypothesesIngested: 0,
				duplicatesSkipped,
				embeddingsGenerated: 0,
				executionTimeMs: performance.now() - startTime,
				warnings,
				errors: [],
				similarHypotheses: allSimilarHypotheses,
			};
		}

		// Step 2: Convert to HelixDB format
		const hypothesisNodes = hypothesesToIngest.map(toHypothesisNode);

		// Step 3: Generate embeddings from economic rationale
		const embeddings: Map<string, number[]> = new Map();
		let embeddingsGenerated = 0;

		if (generateEmbeddings) {
			try {
				const embeddingClient = this.getEmbeddingClient();
				const textsToEmbed = hypothesesToIngest.map((h) => `${h.title}\n\n${h.economicRationale}`);
				const validTexts = textsToEmbed.filter((t) => t.length > 10);

				if (validTexts.length > 0) {
					const result = await embeddingClient.batchGenerateEmbeddings(validTexts);

					let validIndex = 0;
					for (let i = 0; i < textsToEmbed.length; i++) {
						const text = textsToEmbed[i];
						if (text && text.length > 10) {
							const embedding = result.embeddings[validIndex];
							const hypothesis = hypothesesToIngest[i];
							if (embedding && hypothesis) {
								embeddings.set(hypothesis.hypothesisId, embedding.values);
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

		// Step 4: Upsert hypotheses
		let hypothesesIngested = 0;

		for (let i = 0; i < hypothesisNodes.length; i += batchSize) {
			const batch = hypothesisNodes.slice(i, i + batchSize);

			for (const hypothesis of batch) {
				const embedding = embeddings.get(hypothesis.hypothesis_id);
				const result = await this.upsertHypothesis(hypothesis, embedding);

				if (result.success) {
					hypothesesIngested++;
				} else {
					errors.push(`Failed to ingest ${hypothesis.hypothesis_id}: ${result.error}`);
				}
			}
		}

		return {
			hypothesesIngested,
			duplicatesSkipped,
			embeddingsGenerated,
			executionTimeMs: performance.now() - startTime,
			warnings,
			errors,
			similarHypotheses: allSimilarHypotheses,
		};
	}

	/**
	 * Ingest a single hypothesis
	 */
	async ingestHypothesis(
		hypothesis: HypothesisInput,
		options: HypothesisIngestionOptions = {}
	): Promise<HypothesisIngestionResult> {
		return this.ingestHypotheses([hypothesis], options);
	}

	/**
	 * Update hypothesis status (after validation/rejection)
	 */
	async updateHypothesisStatus(update: HypothesisUpdateInput): Promise<boolean> {
		try {
			// For now, we re-fetch and re-insert (HelixDB upsert pattern)
			// In production, this could be a dedicated update query
			const existing = await this.getHypothesisById(update.hypothesisId);
			if (!existing) {
				return false;
			}

			// Note: A proper implementation would have an UpdateResearchHypothesis query
			// For now, return true to indicate we found the hypothesis
			// TODO: Add UpdateResearchHypothesis query to HelixDB schema
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get a hypothesis by ID
	 */
	async getHypothesisById(hypothesisId: string): Promise<{
		hypothesisId: string;
		title: string;
		economicRationale: string;
		marketMechanism: MarketMechanism;
		targetRegime: string;
		status: HypothesisStatus;
		expectedIc: number;
		expectedSharpe: number;
		lessonsLearned?: string;
		realizedIc?: number;
		realizedSharpe?: number;
		factorId?: string;
	} | null> {
		try {
			const result = await this.client.query<
				Array<{
					hypothesis_id: string;
					title: string;
					economic_rationale: string;
					market_mechanism: string;
					target_regime: string;
					status: string;
					expected_ic: number;
					expected_sharpe: number;
					lessons_learned: string;
					realized_ic: number;
					realized_sharpe: number;
					factor_id: string;
				}>
			>("GetHypothesisById", { hypothesis_id: hypothesisId });

			if (result.data.length === 0) {
				return null;
			}

			const h = result.data[0];
			return h
				? {
						hypothesisId: h.hypothesis_id,
						title: h.title,
						economicRationale: h.economic_rationale,
						marketMechanism: h.market_mechanism as MarketMechanism,
						targetRegime: h.target_regime,
						status: h.status as HypothesisStatus,
						expectedIc: h.expected_ic,
						expectedSharpe: h.expected_sharpe,
						lessonsLearned: h.lessons_learned || undefined,
						realizedIc: h.realized_ic || undefined,
						realizedSharpe: h.realized_sharpe || undefined,
						factorId: h.factor_id || undefined,
					}
				: null;
		} catch {
			return null;
		}
	}

	/**
	 * Get hypotheses by status
	 */
	async getHypothesesByStatus(
		status: HypothesisStatus,
		limit = 20
	): Promise<
		Array<{
			hypothesisId: string;
			title: string;
			marketMechanism: string;
			expectedIc: number;
			expectedSharpe: number;
		}>
	> {
		try {
			const result = await this.client.query<
				Array<{
					hypothesis_id: string;
					title: string;
					market_mechanism: string;
					expected_ic: number;
					expected_sharpe: number;
				}>
			>("SearchHypothesesByStatus", {
				query_text: "", // Empty query to get all
				status,
				limit,
			});

			return result.data.map((h) => ({
				hypothesisId: h.hypothesis_id,
				title: h.title,
				marketMechanism: h.market_mechanism,
				expectedIc: h.expected_ic,
				expectedSharpe: h.expected_sharpe,
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Get hypotheses by market mechanism
	 */
	async getHypothesesByMechanism(
		mechanism: MarketMechanism,
		limit = 20
	): Promise<
		Array<{
			hypothesisId: string;
			title: string;
			status: HypothesisStatus;
			expectedIc: number;
		}>
	> {
		try {
			const result = await this.client.query<
				Array<{
					hypothesis_id: string;
					title: string;
					status: string;
					expected_ic: number;
				}>
			>("SearchHypothesesByMechanism", {
				query_text: "", // Empty query to get all
				market_mechanism: mechanism,
				limit,
			});

			return result.data.map((h) => ({
				hypothesisId: h.hypothesis_id,
				title: h.title,
				status: h.status as HypothesisStatus,
				expectedIc: h.expected_ic,
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
 * Create a HypothesisIngestionService instance
 */
export function createHypothesisIngestionService(client: HelixClient): HypothesisIngestionService {
	return new HypothesisIngestionService(client);
}

// ============================================
// Exported Helper Functions (for testing)
// ============================================

/** @internal Exported for testing */
export const _internal = {
	toHypothesisNode,
	calculateHypothesisQualityScore,
	DEFAULT_SIMILARITY_THRESHOLD,
};
