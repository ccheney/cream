/**
 * Global LLM Model Configuration
 *
 * All Mastra agents and LLM-based services use a single global model selection.
 * Only two models are allowed: gemini-3-pro-preview and gemini-3-flash-preview.
 *
 * Exception: claudeCodeIndicator uses claude-opus-4-5-20251101 (hardcoded).
 */

import { z } from "zod";

/**
 * Allowed global model options
 * - gemini-3-flash-preview: Default, faster model for most tasks
 * - gemini-3-pro-preview: More capable model for complex reasoning
 */
export const ALLOWED_MODELS = ["gemini-3-flash-preview", "gemini-3-pro-preview"] as const;

/**
 * Zod schema for global model selection
 */
export const GlobalModelSchema = z.enum(ALLOWED_MODELS);

/**
 * Type for global model selection
 */
export type GlobalModel = z.infer<typeof GlobalModelSchema>;

/**
 * Default model used when no explicit selection is made
 */
export const DEFAULT_GLOBAL_MODEL: GlobalModel = "gemini-3-flash-preview";

/**
 * Model ID mapping to provider-prefixed format used by Mastra
 */
export const MODEL_ID_MAP: Record<GlobalModel, string> = {
  "gemini-3-flash-preview": "google/gemini-3-flash-preview",
  "gemini-3-pro-preview": "google/gemini-3-pro-preview",
} as const;

/**
 * Get the Mastra-compatible model ID for a global model
 */
export function getModelId(model: GlobalModel): string {
  return MODEL_ID_MAP[model];
}

/**
 * Validate and parse a model string, returning the default if invalid
 */
export function parseModel(model: string | undefined | null): GlobalModel {
  const result = GlobalModelSchema.safeParse(model);
  return result.success ? result.data : DEFAULT_GLOBAL_MODEL;
}

/**
 * Check if a string is a valid global model
 */
export function isValidModel(model: string): model is GlobalModel {
  return GlobalModelSchema.safeParse(model).success;
}
