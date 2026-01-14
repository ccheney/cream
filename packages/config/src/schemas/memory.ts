/**
 * Memory Configuration Schema
 *
 * Defines configuration for HelixDB, embeddings, and retrieval settings.
 *
 * @see docs/plans/11-configuration.md for full specification
 */

import { z } from "zod";

// ============================================
// HelixDB Configuration
// ============================================

/**
 * HelixDB connection configuration
 */
export const HelixDBConfigSchema = z.object({
	/**
	 * HelixDB endpoint URL
	 */
	endpoint: z.string().url().default("http://localhost:8080"),

	/**
	 * Database name
	 */
	database: z.string().min(1).default("cream"),
});
export type HelixDBConfig = z.infer<typeof HelixDBConfigSchema>;

// ============================================
// Embedding Configuration
// ============================================

/**
 * Embedding model configuration
 */
export const EmbeddingConfigSchema = z.object({
	/**
	 * Embedding model ID
	 *
	 * Default: Gemini embedding model (unified with LLM provider)
	 */
	model_id: z.string().default("gemini-embedding-001"),

	/**
	 * Embedding dimensions
	 *
	 * gemini-embedding-001: 3072 dimensions
	 */
	dimensions: z.number().int().positive().default(3072),
});
export type EmbeddingConfig = z.infer<typeof EmbeddingConfigSchema>;

// ============================================
// Retrieval Configuration
// ============================================

/**
 * Trade memory retrieval settings
 */
export const TradeMemoryRetrievalSchema = z.object({
	/**
	 * Number of similar cases to retrieve
	 */
	k: z.number().int().positive().default(10),

	/**
	 * Minimum similarity threshold (0-1)
	 */
	quality_threshold: z.number().min(0).max(1).default(0.7),

	/**
	 * Retrieval filters
	 */
	filters: z
		.object({
			/**
			 * Only retrieve cases for the same instrument
			 */
			same_instrument: z.boolean().default(true),

			/**
			 * Only retrieve cases from the same regime
			 */
			same_regime: z.boolean().default(true),
		})
		.optional(),
});
export type TradeMemoryRetrieval = z.infer<typeof TradeMemoryRetrievalSchema>;

/**
 * Document retrieval settings
 */
export const DocumentRetrievalSchema = z.object({
	/**
	 * Number of documents to retrieve
	 */
	k: z.number().int().positive().default(5),

	/**
	 * Weight for recency in ranking (0-1)
	 *
	 * Higher values favor more recent documents
	 */
	recency_weight: z.number().min(0).max(1).default(0.3),
});
export type DocumentRetrieval = z.infer<typeof DocumentRetrievalSchema>;

/**
 * Complete retrieval configuration
 */
export const RetrievalConfigSchema = z.object({
	/**
	 * Trade memory retrieval settings
	 */
	trade_memory: TradeMemoryRetrievalSchema.optional(),

	/**
	 * Document retrieval settings
	 */
	documents: DocumentRetrievalSchema.optional(),
});
export type RetrievalConfig = z.infer<typeof RetrievalConfigSchema>;

// ============================================
// Correction Configuration
// ============================================

/**
 * Vector search correction settings
 */
export const CorrectionConfigSchema = z.object({
	/**
	 * Enable vector broadening for improved recall
	 */
	vector_broaden: z.boolean().default(true),

	/**
	 * Number of candidates for broadened search
	 */
	broadened_k: z.number().int().positive().default(25),
});
export type CorrectionConfig = z.infer<typeof CorrectionConfigSchema>;

// ============================================
// Complete Memory Configuration
// ============================================

/**
 * Complete memory configuration
 */
export const MemoryConfigSchema = z.object({
	/**
	 * HelixDB connection settings
	 */
	helixdb: HelixDBConfigSchema.optional(),

	/**
	 * Embedding model settings
	 */
	embedding: EmbeddingConfigSchema.optional(),

	/**
	 * Retrieval settings
	 */
	retrieval: RetrievalConfigSchema.optional(),

	/**
	 * Vector search correction settings
	 */
	correction: CorrectionConfigSchema.optional(),
});
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;
