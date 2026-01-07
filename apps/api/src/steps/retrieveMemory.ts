/**
 * Retrieve Memory Step
 *
 * Step 3: Fetch relevant memories from HelixDB (similar trades, patterns).
 */

import { isBacktest } from "@cream/domain";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { SnapshotOutputSchema } from "./buildSnapshot.js";

export const MemoryOutputSchema = z.object({
  similarTrades: z.array(z.any()),
  relevantPatterns: z.array(z.any()),
  recentDecisions: z.array(z.any()),
});

export type MemoryOutput = z.infer<typeof MemoryOutputSchema>;

export const retrieveMemoryStep = createStep({
  id: "retrieve-memory",
  description: "Fetch relevant memories from HelixDB",
  inputSchema: SnapshotOutputSchema,
  outputSchema: MemoryOutputSchema,
  retries: 2,
  execute: async ({ inputData }) => {
    const { symbolCount } = inputData;

    // In backtest mode, return empty memories for faster execution
    if (isBacktest()) {
      return {
        similarTrades: [],
        relevantPatterns: [],
        recentDecisions: [],
      };
    }

    // Skip if no symbols to process
    if (symbolCount === 0) {
      return {
        similarTrades: [],
        relevantPatterns: [],
        recentDecisions: [],
      };
    }

    // TODO: Wire up HelixDB vector search when server is running
    // For now, return empty memories
    return {
      similarTrades: [],
      relevantPatterns: [],
      recentDecisions: [],
    };
  },
});
