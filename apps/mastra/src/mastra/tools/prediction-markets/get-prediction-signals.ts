/**
 * Get Prediction Signals Tool
 *
 * Derive trading signals from prediction market probabilities.
 */

import { getPredictionSignalsTool } from "@cream/agents";

// Re-export the existing tool
// Already uses v1 patterns with inputSchema, outputSchema, and execute
export const getPredictionSignals = getPredictionSignalsTool;
