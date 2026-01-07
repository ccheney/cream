/**
 * Gather External Context Step
 *
 * Step 4: Get news, sentiment, macro context from external sources.
 */

import { isBacktest } from "@cream/domain";
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

import { MemoryOutputSchema } from "./retrieveMemory.js";

export const ExternalContextSchema = z.object({
  news: z.array(z.any()),
  sentiment: z.record(z.string(), z.number()),
  macroIndicators: z.record(z.string(), z.number()),
});

export type ExternalContext = z.infer<typeof ExternalContextSchema>;

export const gatherExternalContextStep = createStep({
  id: "gather-external-context",
  description: "Get news, sentiment, macro context",
  inputSchema: MemoryOutputSchema,
  outputSchema: ExternalContextSchema,
  retries: 2,
  execute: async ({ inputData: _inputData }) => {
    // In backtest mode, return empty context for faster execution
    if (isBacktest()) {
      return {
        news: [],
        sentiment: {},
        macroIndicators: {},
      };
    }

    // TODO: Wire up @cream/external-context pipeline when API keys are configured
    // This requires FMP/Alpha Vantage API keys and LLM for extraction
    // For now, return empty context as placeholder
    return {
      news: [],
      sentiment: {},
      macroIndicators: {},
    };
  },
});
