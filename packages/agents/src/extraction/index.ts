/**
 * Extraction Module
 *
 * Provides LLM-based extraction clients for structured data extraction.
 * Uses the global model configuration from @cream/domain.
 */

export {
	createExtractionClient,
	ExtractionClient,
	type ExtractionClientConfig,
} from "./client.js";
