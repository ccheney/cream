/**
 * Gemini Embedding Integration
 *
 * Provides embedding generation using Google Gemini's embedding models.
 * Supports batch processing, retry logic, and model version tracking.
 *
 * @see docs/plans/04-memory-helixdb.md for Embedding Policy
 */

import { GoogleGenAI } from "@google/genai";

// ============================================
// Configuration
// ============================================

/**
 * Embedding model configuration
 */
export interface EmbeddingConfig {
  /** Embedding provider */
  provider: "gemini";
  /** Model identifier */
  model: string;
  /** Output dimensions */
  dimensions: number;
  /** Max batch size per request */
  batchSize: number;
  /** Max input tokens per text */
  maxTokens: number;
  /** API key environment variable name */
  apiKeyEnvVar: string;
}

/**
 * Default embedding configuration for Gemini
 */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  provider: "gemini",
  model: "gemini-embedding-001",
  dimensions: 3072,
  batchSize: 100,
  maxTokens: 2048,
  apiKeyEnvVar: "GOOGLE_GENERATIVE_AI_API_KEY",
};

/**
 * Alternative embedding models for future migration
 */
export const EMBEDDING_MODELS: Record<string, EmbeddingConfig> = {
  "gemini-embedding-001": {
    provider: "gemini",
    model: "gemini-embedding-001",
    dimensions: 3072,
    batchSize: 100,
    maxTokens: 2048,
    apiKeyEnvVar: "GOOGLE_GENERATIVE_AI_API_KEY",
  },
  "text-embedding-004": {
    provider: "gemini",
    model: "text-embedding-004",
    dimensions: 768,
    batchSize: 100,
    maxTokens: 2048,
    apiKeyEnvVar: "GOOGLE_GENERATIVE_AI_API_KEY",
  },
};

// ============================================
// Types
// ============================================

/**
 * Embedding result with metadata
 */
export interface EmbeddingResult {
  /** The embedding vector */
  values: number[];
  /** Model used for embedding */
  model: string;
  /** Timestamp when embedding was generated */
  generatedAt: string;
  /** Input text length (chars) */
  inputLength: number;
}

/**
 * Batch embedding result
 */
export interface BatchEmbeddingResult {
  /** Embeddings in order of input */
  embeddings: EmbeddingResult[];
  /** Total processing time (ms) */
  processingTimeMs: number;
  /** Number of API calls made */
  apiCalls: number;
}

/**
 * Embedding metadata for version tracking
 */
export interface EmbeddingMetadata {
  /** Model used for embedding */
  model: string;
  /** Model version/revision if available */
  modelVersion?: string;
  /** When embedding was generated (ISO 8601) */
  generatedAt: string;
  /** Days since embedding was generated */
  ageInDays?: number;
  /** Whether embedding is stale (>90 days) */
  isStale?: boolean;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxRetries: number;
  /** Initial delay in ms */
  initialDelayMs: number;
  /** Maximum delay in ms */
  maxDelayMs: number;
  /** Exponential backoff multiplier */
  backoffMultiplier: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

// ============================================
// Embedding Client
// ============================================

/**
 * Gemini Embedding Client
 *
 * Provides methods for generating embeddings with batch processing,
 * rate limit handling, and retry logic.
 */
export class EmbeddingClient {
  private client: GoogleGenAI;
  private config: EmbeddingConfig;
  private retryConfig: RetryConfig;

  constructor(
    config: EmbeddingConfig = DEFAULT_EMBEDDING_CONFIG,
    retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
  ) {
    const apiKey = process.env[config.apiKeyEnvVar];
    if (!apiKey) {
      throw new Error(`Missing API key: ${config.apiKeyEnvVar} environment variable not set`);
    }

    this.client = new GoogleGenAI({ apiKey });
    this.config = config;
    this.retryConfig = retryConfig;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const result = await this.batchGenerateEmbeddings([text]);
    const embedding = result.embeddings[0];
    if (!embedding) {
      throw new Error("Failed to generate embedding");
    }
    return embedding;
  }

  /**
   * Generate embeddings for multiple texts
   *
   * Automatically chunks requests to respect batch size limits.
   */
  async batchGenerateEmbeddings(texts: string[]): Promise<BatchEmbeddingResult> {
    if (texts.length === 0) {
      return {
        embeddings: [],
        processingTimeMs: 0,
        apiCalls: 0,
      };
    }

    const startTime = Date.now();
    const embeddings: EmbeddingResult[] = [];
    let apiCalls = 0;

    // Chunk texts into batches
    const batches = this.chunkArray(texts, this.config.batchSize);

    for (const batch of batches) {
      const batchResult = await this.embedBatchWithRetry(batch);
      embeddings.push(...batchResult);
      apiCalls++;
    }

    return {
      embeddings,
      processingTimeMs: Date.now() - startTime,
      apiCalls,
    };
  }

  /**
   * Embed a batch of texts with retry logic
   */
  private async embedBatchWithRetry(texts: string[]): Promise<EmbeddingResult[]> {
    let lastError: Error | undefined;
    let delay = this.retryConfig.initialDelayMs;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await this.embedBatch(texts);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (!this.isRetryableError(lastError)) {
          throw lastError;
        }

        // If not last attempt, wait and retry
        if (attempt < this.retryConfig.maxRetries) {
          await this.sleep(delay);
          delay = Math.min(delay * this.retryConfig.backoffMultiplier, this.retryConfig.maxDelayMs);
        }
      }
    }

    throw lastError;
  }

  /**
   * Make the actual embedding API call
   */
  private async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const generatedAt = new Date().toISOString();

    const response = await this.client.models.embedContent({
      model: this.config.model,
      contents: texts,
    });

    if (!response.embeddings || response.embeddings.length !== texts.length) {
      throw new Error(
        `Embedding count mismatch: expected ${texts.length}, got ${response.embeddings?.length ?? 0}`
      );
    }

    return response.embeddings.map((embedding, index) => ({
      values: embedding.values ?? [],
      model: this.config.model,
      generatedAt,
      inputLength: texts[index]?.length ?? 0,
    }));
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Rate limit errors
    if (message.includes("rate limit") || message.includes("quota")) {
      return true;
    }

    // Transient errors
    if (
      message.includes("timeout") ||
      message.includes("temporarily") ||
      message.includes("503") ||
      message.includes("429")
    ) {
      return true;
    }

    // Network errors
    if (message.includes("network") || message.includes("econnreset")) {
      return true;
    }

    return false;
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current configuration
   */
  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }
}

// ============================================
// Node Embedding Helpers
// ============================================

/**
 * Fields that can be embedded for each node type
 */
export const EMBEDDABLE_FIELDS: Record<string, string[]> = {
  TradeDecision: ["rationale_text"],
  ExternalEvent: ["text_summary"],
  FilingChunk: ["chunk_text"],
  TranscriptChunk: ["chunk_text"],
  NewsItem: ["headline", "body_text"],
  Indicator: ["embedding_text"],
  ThesisMemory: ["entry_thesis"],
};

/**
 * Extract embeddable text from a node
 */
export function extractEmbeddableText(
  nodeType: string,
  node: Record<string, unknown>,
  fields?: string[]
): string {
  const fieldsToEmbed = fields ?? EMBEDDABLE_FIELDS[nodeType] ?? [];
  const texts: string[] = [];

  for (const field of fieldsToEmbed) {
    const value = node[field];
    if (typeof value === "string" && value.trim().length > 0) {
      texts.push(value.trim());
    }
  }

  return texts.join("\n\n");
}

/**
 * Check if embedding is stale (>90 days old)
 */
export function isEmbeddingStale(metadata: EmbeddingMetadata, staleDays = 90): boolean {
  const generatedAt = new Date(metadata.generatedAt);
  const now = new Date();
  const ageMs = now.getTime() - generatedAt.getTime();
  const ageInDays = ageMs / (1000 * 60 * 60 * 24);
  return ageInDays > staleDays;
}

/**
 * Create embedding metadata
 */
export function createEmbeddingMetadata(model: string): EmbeddingMetadata {
  return {
    model,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Check if node needs re-embedding
 *
 * Returns true if:
 * - No existing embedding
 * - Model version changed
 * - Embedding is stale (>90 days)
 */
export function needsReembedding(
  metadata: EmbeddingMetadata | undefined,
  currentModel: string,
  staleDays = 90
): boolean {
  // No existing embedding
  if (!metadata) {
    return true;
  }

  // Model changed
  if (metadata.model !== currentModel) {
    return true;
  }

  // Stale embedding
  if (isEmbeddingStale(metadata, staleDays)) {
    return true;
  }

  return false;
}

// ============================================
// Batch Processing Helpers
// ============================================

/**
 * Progress callback for batch operations
 */
export type BatchProgressCallback = (processed: number, total: number) => void;

/**
 * Batch embedding options
 */
export interface BatchEmbeddingOptions {
  /** Progress callback */
  onProgress?: BatchProgressCallback;
  /** Concurrent batches (default: 1) */
  concurrency?: number;
}

/**
 * Process many texts with progress tracking
 *
 * For very large batches, provides progress updates
 */
export async function batchEmbedWithProgress(
  client: EmbeddingClient,
  texts: string[],
  options: BatchEmbeddingOptions = {}
): Promise<BatchEmbeddingResult> {
  const { onProgress, concurrency = 1 } = options;
  const config = client.getConfig();
  const batchSize = config.batchSize;

  const startTime = Date.now();
  const embeddings: EmbeddingResult[] = [];
  let apiCalls = 0;

  // Chunk into batches
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    batches.push(texts.slice(i, i + batchSize));
  }

  // Process batches
  let processed = 0;

  if (concurrency <= 1) {
    // Sequential processing
    for (const batch of batches) {
      const result = await client.batchGenerateEmbeddings(batch);
      embeddings.push(...result.embeddings);
      apiCalls += result.apiCalls;
      processed += batch.length;

      if (onProgress) {
        onProgress(processed, texts.length);
      }
    }
  } else {
    // Concurrent processing (limited parallelism)
    for (let i = 0; i < batches.length; i += concurrency) {
      const concurrentBatches = batches.slice(i, i + concurrency);
      const results = await Promise.all(
        concurrentBatches.map((batch) => client.batchGenerateEmbeddings(batch))
      );

      for (const result of results) {
        embeddings.push(...result.embeddings);
        apiCalls += result.apiCalls;
        processed += result.embeddings.length;
      }

      if (onProgress) {
        onProgress(processed, texts.length);
      }
    }
  }

  return {
    embeddings,
    processingTimeMs: Date.now() - startTime,
    apiCalls,
  };
}

// ============================================
// Factory Function
// ============================================

/**
 * Create an embedding client with default configuration
 */
export function createEmbeddingClient(modelName?: keyof typeof EMBEDDING_MODELS): EmbeddingClient {
  const config = modelName ? EMBEDDING_MODELS[modelName] : DEFAULT_EMBEDDING_CONFIG;
  return new EmbeddingClient(config);
}
