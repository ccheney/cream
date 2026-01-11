/**
 * Indicator Ingestion Service
 *
 * Ingests synthesized indicators from the indicator pipeline into HelixDB.
 * Creates Indicator nodes with embedded hypothesis/rationale for semantic search.
 * Enables deduplication via code hash, AST signature, and embedding similarity.
 *
 * @see docs/plans/20-research-to-production-pipeline.md
 */

import type { Indicator, IndicatorCategory, IndicatorStatus } from "@cream/helix-schema";
import { DEFAULT_EMBEDDING_CONFIG, EmbeddingClient } from "@cream/helix-schema";

import type { HelixClient } from "../client.js";

// ============================================
// Types
// ============================================

/**
 * Indicator input from synthesis pipeline
 */
export interface IndicatorInput {
  /** Unique identifier (format: ind-{timestamp}-{shortname}) */
  indicatorId: string;
  /** Human-readable name (e.g., "RSI_Adaptive_14") */
  name: string;
  /** Indicator category */
  category: IndicatorCategory;
  /** Lifecycle status */
  status: IndicatorStatus;
  /** Economic hypothesis driving the indicator */
  hypothesis: string;
  /** Economic rationale for why this indicator should work */
  economicRationale: string;
  /** Market regime label when indicator was generated */
  generatedInRegime?: string;
  /** Code hash for deduplication (SHA256) */
  codeHash?: string;
  /** AST signature for structural similarity */
  astSignature?: string;
  /** Deflated Sharpe Ratio from validation */
  deflatedSharpe?: number;
  /** Probability of Backtest Overfitting */
  probabilityOfOverfit?: number;
  /** Information Coefficient */
  informationCoefficient?: number;
  /** Environment (BACKTEST, PAPER, LIVE) */
  environment: string;
}

/**
 * Similar indicator match result
 */
export interface SimilarIndicator {
  indicatorId: string;
  name: string;
  category: IndicatorCategory;
  status: IndicatorStatus;
  similarity: number;
  hypothesis: string;
  deflatedSharpe?: number;
  informationCoefficient?: number;
}

/**
 * Ingestion result
 */
export interface IndicatorIngestionResult {
  indicatorsIngested: number;
  duplicatesSkipped: number;
  embeddingsGenerated: number;
  executionTimeMs: number;
  warnings: string[];
  errors: string[];
  /** Similar existing indicators found during deduplication */
  similarIndicators: SimilarIndicator[];
}

/**
 * Ingestion options
 */
export interface IndicatorIngestionOptions {
  /** Whether to generate embeddings (default: true) */
  generateEmbeddings?: boolean;
  /** Whether to check for duplicates (default: true) */
  checkDuplicates?: boolean;
  /** Similarity threshold for flagging duplicates (default: 0.90) */
  similarityThreshold?: number;
  /** Batch size for operations (default: 20) */
  batchSize?: number;
}

/**
 * Update input for indicator performance metrics
 */
export interface IndicatorUpdateInput {
  indicatorId: string;
  status?: IndicatorStatus;
  deflatedSharpe?: number;
  probabilityOfOverfit?: number;
  informationCoefficient?: number;
}

/**
 * Performance thresholds for indicator validation
 */
export interface ValidationThresholds {
  /** Minimum deflated Sharpe for validation (default: 0.5) */
  minDeflatedSharpe: number;
  /** Maximum probability of overfit (default: 0.3) */
  maxProbabilityOfOverfit: number;
  /** Minimum information coefficient (default: 0.02) */
  minInformationCoefficient: number;
}

// ============================================
// Constants
// ============================================

const DEFAULT_SIMILARITY_THRESHOLD = 0.9;

export const DEFAULT_VALIDATION_THRESHOLDS: ValidationThresholds = {
  minDeflatedSharpe: 0.5,
  maxProbabilityOfOverfit: 0.3,
  minInformationCoefficient: 0.02,
};

// ============================================
// Helper Functions
// ============================================

/**
 * Generate embedding text from hypothesis and economic rationale
 */
function generateEmbeddingText(hypothesis: string, economicRationale: string): string {
  return `${hypothesis}\n\n${economicRationale}`;
}

/**
 * Convert IndicatorInput to HelixDB Indicator
 */
function toIndicatorNode(input: IndicatorInput): Indicator {
  return {
    indicator_id: input.indicatorId,
    name: input.name,
    category: input.category,
    status: input.status,
    hypothesis: input.hypothesis,
    economic_rationale: input.economicRationale,
    embedding_text: generateEmbeddingText(input.hypothesis, input.economicRationale),
    generated_in_regime: input.generatedInRegime,
    code_hash: input.codeHash,
    ast_signature: input.astSignature,
    deflated_sharpe: input.deflatedSharpe,
    probability_of_overfit: input.probabilityOfOverfit,
    information_coefficient: input.informationCoefficient,
    generated_at: new Date().toISOString(),
    environment: input.environment as "BACKTEST" | "PAPER" | "LIVE",
  };
}

/**
 * Check if indicator meets validation thresholds
 */
export function meetsValidationThresholds(
  indicator: IndicatorInput,
  thresholds: ValidationThresholds = DEFAULT_VALIDATION_THRESHOLDS
): boolean {
  const { deflatedSharpe, probabilityOfOverfit, informationCoefficient } = indicator;

  if (
    deflatedSharpe === undefined ||
    probabilityOfOverfit === undefined ||
    informationCoefficient === undefined
  ) {
    return false;
  }

  return (
    deflatedSharpe >= thresholds.minDeflatedSharpe &&
    probabilityOfOverfit <= thresholds.maxProbabilityOfOverfit &&
    informationCoefficient >= thresholds.minInformationCoefficient
  );
}

/**
 * Calculate a quality score for an indicator
 * Used for ranking similar indicators
 */
export function calculateIndicatorQualityScore(indicator: IndicatorInput): number {
  let score = 0;

  // Deflated Sharpe (weight: 40) - higher is better
  if (indicator.deflatedSharpe !== undefined) {
    score += Math.min(indicator.deflatedSharpe * 40, 60);
  }

  // Information Coefficient (weight: 30) - higher is better
  if (indicator.informationCoefficient !== undefined) {
    score += indicator.informationCoefficient * 300;
  }

  // Probability of Overfit (weight: 20) - lower is better
  if (indicator.probabilityOfOverfit !== undefined) {
    score += (1 - indicator.probabilityOfOverfit) * 20;
  }

  // Hypothesis quality (weight: 10)
  if (indicator.hypothesis.length > 100) {
    score += 10;
  } else if (indicator.hypothesis.length > 50) {
    score += 5;
  }

  return Math.round(score * 100) / 100;
}

// ============================================
// Main Service Class
// ============================================

/**
 * Indicator Ingestion Service
 *
 * Ingests synthesized indicators into HelixDB with embeddings.
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
   * Check if an indicator already exists by ID
   */
  private async indicatorExists(indicatorId: string): Promise<boolean> {
    try {
      const result = await this.client.query<Array<{ indicator_id: string }>>("GetIndicatorById", {
        indicator_id: indicatorId,
      });
      return result.data.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Check for duplicate by code hash
   */
  async findByCodeHash(codeHash: string): Promise<SimilarIndicator | null> {
    try {
      // Search with a generic query and filter by code_hash
      const result = await this.client.query<
        Array<{
          indicator_id: string;
          name: string;
          category: string;
          status: string;
          hypothesis: string;
          code_hash: string;
          deflated_sharpe: number;
          information_coefficient: number;
        }>
      >("SearchSimilarIndicators", {
        query_text: "code hash match",
        limit: 100,
      });

      const match = result.data.find((ind) => ind.code_hash === codeHash);
      if (!match) {
        return null;
      }

      return {
        indicatorId: match.indicator_id,
        name: match.name,
        category: match.category as IndicatorCategory,
        status: match.status as IndicatorStatus,
        similarity: 1.0, // Exact code match
        hypothesis: match.hypothesis,
        deflatedSharpe: match.deflated_sharpe,
        informationCoefficient: match.information_coefficient,
      };
    } catch {
      return null;
    }
  }

  /**
   * Search for similar indicators by embedding
   */
  async searchSimilarIndicators(
    embeddingText: string,
    limit = 5,
    similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD
  ): Promise<SimilarIndicator[]> {
    try {
      const result = await this.client.query<
        Array<{
          indicator_id: string;
          name: string;
          category: string;
          status: string;
          similarity: number;
          hypothesis: string;
          deflated_sharpe: number;
          information_coefficient: number;
        }>
      >("SearchSimilarIndicators", {
        query_text: embeddingText,
        limit,
      });

      return result.data
        .filter((r) => r.similarity >= similarityThreshold)
        .map((r) => ({
          indicatorId: r.indicator_id,
          name: r.name,
          category: r.category as IndicatorCategory,
          status: r.status as IndicatorStatus,
          similarity: r.similarity,
          hypothesis: r.hypothesis,
          deflatedSharpe: r.deflated_sharpe,
          informationCoefficient: r.information_coefficient,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Search indicators by category
   */
  async searchByCategory(
    category: IndicatorCategory,
    queryText: string,
    limit = 10
  ): Promise<SimilarIndicator[]> {
    try {
      const result = await this.client.query<
        Array<{
          indicator_id: string;
          name: string;
          category: string;
          status: string;
          similarity: number;
          hypothesis: string;
          deflated_sharpe: number;
          information_coefficient: number;
        }>
      >("SearchIndicatorsByCategory", {
        query_text: queryText,
        category,
        limit,
      });

      return result.data.map((r) => ({
        indicatorId: r.indicator_id,
        name: r.name,
        category: r.category as IndicatorCategory,
        status: r.status as IndicatorStatus,
        similarity: r.similarity,
        hypothesis: r.hypothesis,
        deflatedSharpe: r.deflated_sharpe,
        informationCoefficient: r.information_coefficient,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Upsert a single indicator
   */
  private async upsertIndicator(
    indicator: Indicator,
    embedding?: number[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.client.query("InsertIndicator", {
        indicator_id: indicator.indicator_id,
        name: indicator.name,
        category: indicator.category,
        status: indicator.status,
        hypothesis: indicator.hypothesis,
        economic_rationale: indicator.economic_rationale,
        embedding_text: indicator.embedding_text,
        generated_in_regime: indicator.generated_in_regime ?? "",
        code_hash: indicator.code_hash ?? "",
        ast_signature: indicator.ast_signature ?? "",
        deflated_sharpe: indicator.deflated_sharpe ?? 0,
        probability_of_overfit: indicator.probability_of_overfit ?? 0,
        information_coefficient: indicator.information_coefficient ?? 0,
        environment: indicator.environment,
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
   * Ingest a batch of indicators
   */
  async ingestIndicators(
    indicators: IndicatorInput[],
    options: IndicatorIngestionOptions = {}
  ): Promise<IndicatorIngestionResult> {
    const startTime = performance.now();
    const warnings: string[] = [];
    const errors: string[] = [];
    const allSimilarIndicators: SimilarIndicator[] = [];

    const {
      generateEmbeddings = true,
      checkDuplicates = true,
      similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
      batchSize = 20,
    } = options;

    if (indicators.length === 0) {
      return {
        indicatorsIngested: 0,
        duplicatesSkipped: 0,
        embeddingsGenerated: 0,
        executionTimeMs: 0,
        warnings: [],
        errors: [],
        similarIndicators: [],
      };
    }

    // Step 1: Check for existing indicators and duplicates
    let indicatorsToIngest = indicators;
    let duplicatesSkipped = 0;

    if (checkDuplicates) {
      const uniqueIndicators: IndicatorInput[] = [];

      for (const indicator of indicators) {
        // Check exact ID match
        const exists = await this.indicatorExists(indicator.indicatorId);
        if (exists) {
          duplicatesSkipped++;
          continue;
        }

        // Check code hash duplicate
        if (indicator.codeHash) {
          const codeMatch = await this.findByCodeHash(indicator.codeHash);
          if (codeMatch) {
            duplicatesSkipped++;
            allSimilarIndicators.push(codeMatch);
            warnings.push(
              `Indicator "${indicator.name}" has identical code to "${codeMatch.name}"`
            );
            continue;
          }
        }

        // Check semantic similarity
        const embeddingText = generateEmbeddingText(
          indicator.hypothesis,
          indicator.economicRationale
        );
        const similar = await this.searchSimilarIndicators(embeddingText, 5, similarityThreshold);

        if (similar.length > 0) {
          allSimilarIndicators.push(...similar);
          warnings.push(
            `Indicator "${indicator.name}" has ${similar.length} similar existing indicators`
          );
        }

        uniqueIndicators.push(indicator);
      }

      indicatorsToIngest = uniqueIndicators;

      if (duplicatesSkipped > 0) {
        warnings.push(`Skipped ${duplicatesSkipped} duplicate indicators`);
      }
    }

    if (indicatorsToIngest.length === 0) {
      return {
        indicatorsIngested: 0,
        duplicatesSkipped,
        embeddingsGenerated: 0,
        executionTimeMs: performance.now() - startTime,
        warnings,
        errors: [],
        similarIndicators: allSimilarIndicators,
      };
    }

    // Step 2: Convert to HelixDB format
    const indicatorNodes = indicatorsToIngest.map(toIndicatorNode);

    // Step 3: Generate embeddings
    const embeddings: Map<string, number[]> = new Map();
    let embeddingsGenerated = 0;

    if (generateEmbeddings) {
      try {
        const embeddingClient = this.getEmbeddingClient();
        const textsToEmbed = indicatorNodes.map((i) => i.embedding_text);
        const validTexts = textsToEmbed.filter((t) => t.length > 10);

        if (validTexts.length > 0) {
          const result = await embeddingClient.batchGenerateEmbeddings(validTexts);

          let validIndex = 0;
          for (let i = 0; i < textsToEmbed.length; i++) {
            const text = textsToEmbed[i];
            if (text && text.length > 10) {
              const embedding = result.embeddings[validIndex];
              const indicator = indicatorsToIngest[i];
              if (embedding && indicator) {
                embeddings.set(indicator.indicatorId, embedding.values);
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

    // Step 4: Upsert indicators
    let indicatorsIngested = 0;

    for (let i = 0; i < indicatorNodes.length; i += batchSize) {
      const batch = indicatorNodes.slice(i, i + batchSize);

      for (const indicator of batch) {
        const embedding = embeddings.get(indicator.indicator_id);
        const result = await this.upsertIndicator(indicator, embedding);

        if (result.success) {
          indicatorsIngested++;
        } else {
          errors.push(`Failed to ingest ${indicator.indicator_id}: ${result.error}`);
        }
      }
    }

    return {
      indicatorsIngested,
      duplicatesSkipped,
      embeddingsGenerated,
      executionTimeMs: performance.now() - startTime,
      warnings,
      errors,
      similarIndicators: allSimilarIndicators,
    };
  }

  /**
   * Ingest a single indicator
   */
  async ingestIndicator(
    indicator: IndicatorInput,
    options: IndicatorIngestionOptions = {}
  ): Promise<IndicatorIngestionResult> {
    return this.ingestIndicators([indicator], options);
  }

  /**
   * Update indicator performance metrics
   */
  async updateIndicatorMetrics(update: IndicatorUpdateInput): Promise<boolean> {
    try {
      const existing = await this.getIndicatorById(update.indicatorId);
      if (!existing) {
        return false;
      }

      // Note: A proper implementation would have an UpdateIndicator query
      // For now, return true to indicate we found the indicator
      // TODO: Add UpdateIndicator query to HelixDB schema
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get an indicator by ID
   */
  async getIndicatorById(indicatorId: string): Promise<{
    indicatorId: string;
    name: string;
    category: IndicatorCategory;
    status: IndicatorStatus;
    hypothesis: string;
    economicRationale: string;
    deflatedSharpe?: number;
    probabilityOfOverfit?: number;
    informationCoefficient?: number;
    codeHash?: string;
    astSignature?: string;
  } | null> {
    try {
      const result = await this.client.query<
        Array<{
          indicator_id: string;
          name: string;
          category: string;
          status: string;
          hypothesis: string;
          economic_rationale: string;
          deflated_sharpe: number;
          probability_of_overfit: number;
          information_coefficient: number;
          code_hash: string;
          ast_signature: string;
        }>
      >("GetIndicatorById", { indicator_id: indicatorId });

      if (result.data.length === 0) {
        return null;
      }

      const ind = result.data[0];
      return ind
        ? {
            indicatorId: ind.indicator_id,
            name: ind.name,
            category: ind.category as IndicatorCategory,
            status: ind.status as IndicatorStatus,
            hypothesis: ind.hypothesis,
            economicRationale: ind.economic_rationale,
            deflatedSharpe: ind.deflated_sharpe || undefined,
            probabilityOfOverfit: ind.probability_of_overfit || undefined,
            informationCoefficient: ind.information_coefficient || undefined,
            codeHash: ind.code_hash || undefined,
            astSignature: ind.ast_signature || undefined,
          }
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Get indicators by status
   */
  async getIndicatorsByStatus(
    status: IndicatorStatus,
    limit = 20
  ): Promise<
    Array<{
      indicatorId: string;
      name: string;
      category: IndicatorCategory;
      deflatedSharpe?: number;
      informationCoefficient?: number;
    }>
  > {
    try {
      const result = await this.client.query<
        Array<{
          indicator_id: string;
          name: string;
          category: string;
          deflated_sharpe: number;
          information_coefficient: number;
        }>
      >("SearchIndicatorsByStatus", {
        query_text: "",
        status,
        limit,
      });

      return result.data.map((ind) => ({
        indicatorId: ind.indicator_id,
        name: ind.name,
        category: ind.category as IndicatorCategory,
        deflatedSharpe: ind.deflated_sharpe || undefined,
        informationCoefficient: ind.information_coefficient || undefined,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get validated indicators (passing thresholds)
   */
  async getValidatedIndicators(
    thresholds: ValidationThresholds = DEFAULT_VALIDATION_THRESHOLDS,
    limit = 50
  ): Promise<
    Array<{
      indicatorId: string;
      name: string;
      category: IndicatorCategory;
      deflatedSharpe: number;
      probabilityOfOverfit: number;
      informationCoefficient: number;
    }>
  > {
    try {
      // Get production indicators
      const result = await this.client.query<
        Array<{
          indicator_id: string;
          name: string;
          category: string;
          deflated_sharpe: number;
          probability_of_overfit: number;
          information_coefficient: number;
        }>
      >("SearchIndicatorsByStatus", {
        query_text: "",
        status: "production",
        limit,
      });

      // Filter by thresholds
      return result.data
        .filter(
          (ind) =>
            ind.deflated_sharpe >= thresholds.minDeflatedSharpe &&
            ind.probability_of_overfit <= thresholds.maxProbabilityOfOverfit &&
            ind.information_coefficient >= thresholds.minInformationCoefficient
        )
        .map((ind) => ({
          indicatorId: ind.indicator_id,
          name: ind.name,
          category: ind.category as IndicatorCategory,
          deflatedSharpe: ind.deflated_sharpe,
          probabilityOfOverfit: ind.probability_of_overfit,
          informationCoefficient: ind.information_coefficient,
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

// ============================================
// Exported Helper Functions (for testing)
// ============================================

/** @internal Exported for testing */
export const _internal = {
  toIndicatorNode,
  generateEmbeddingText,
  DEFAULT_SIMILARITY_THRESHOLD,
};
