/**
 * Global LLM Model Configuration
 *
 * All Mastra agents and LLM-based services use a single global model selection
 * determined by environment variables: LLM_PROVIDER and LLM_MODEL_ID.
 *
 * Exception: claudeCodeIndicator uses claude-opus-4-5-20251101 (hardcoded).
 */

import { z } from "zod";
import { getFullModelId, getLLMModelId, getLLMProvider } from "./env.js";

/**
 * Zod schema for global model selection - validates against env var value
 */
export const GlobalModelSchema = z.string();

/**
 * Type for global model selection (now a simple string from env)
 */
export type GlobalModel = string;

/**
 * Get the default model from environment variable
 */
export function getDefaultGlobalModel(): GlobalModel {
	return getLLMModelId();
}

/**
 * Get the Mastra-compatible model ID (provider/model format)
 * Uses environment variables LLM_PROVIDER and LLM_MODEL_ID
 */
export function getModelId(_model?: GlobalModel): string {
	return getFullModelId();
}

/**
 * Validate and parse a model string, returning the env default if invalid/empty
 */
export function parseModel(model: string | undefined | null): GlobalModel {
	if (model?.trim()) {
		return model;
	}
	return getLLMModelId();
}

/**
 * Check if a string is a valid global model (any non-empty string is valid)
 */
export function isValidModel(model: string): model is GlobalModel {
	return typeof model === "string" && model.trim().length > 0;
}

// Re-export env helpers for convenience
export { getFullModelId, getLLMModelId, getLLMProvider };
