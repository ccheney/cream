/**
 * Mastra Filing Tool Definitions
 *
 * Tools for searching SEC filings in HelixDB.
 * Wraps the core searchFilings implementation.
 */

import { createContext, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { type SearchFilingsResult, searchFilings } from "../searchFilings.js";

/**
 * Create ExecutionContext for tool invocation.
 * Tools are invoked by the agent framework during scheduled runs.
 */
function createToolContext() {
  return createContext(requireEnv(), "scheduled");
}

// ============================================
// Search Filings Tool
// ============================================

const SearchFilingsInputSchema = z.object({
  query: z.string().describe("Search query for semantic matching against filing content"),
  symbol: z.string().optional().describe("Filter by company symbol (e.g., 'AAPL', 'MSFT')"),
  filingTypes: z
    .array(z.enum(["10-K", "10-Q", "8-K", "DEF14A", "S-1", "S-3", "4", "SC 13G"]))
    .optional()
    .describe(
      "Filter by filing type(s). Common types: 10-K (annual), 10-Q (quarterly), 8-K (current events)"
    ),
  limit: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum results to return (default: 10, max: 50)"),
});

const FilingChunkSummarySchema = z.object({
  chunkId: z.string(),
  filingId: z.string(),
  symbol: z.string(),
  filingType: z.string(),
  filingDate: z.string(),
  content: z.string(),
  chunkIndex: z.number(),
  score: z.number().optional(),
});

const SearchFilingsOutputSchema = z.object({
  chunks: z.array(FilingChunkSummarySchema),
  totalFound: z.number(),
  query: z.string(),
});

export const searchFilingsTool = createTool({
  id: "search_filings",
  description: `Search SEC filings for relevant information using semantic search. Use this tool to:
- Find risk factors from 10-K filings
- Search quarterly revenue discussions from 10-Q filings
- Look up material events from 8-K filings
- Research management discussion and analysis (MD&A)
- Find executive compensation details from DEF14A proxy statements

Filing Types:
- 10-K: Annual report with comprehensive business overview, risk factors, financials
- 10-Q: Quarterly report with interim financials and MD&A updates
- 8-K: Current report for material events (earnings, acquisitions, exec changes)
- DEF14A: Proxy statement with exec compensation and governance

Search Tips:
- Be specific: "revenue growth drivers" vs "financials"
- Include context: "supply chain risks AAPL" vs just "supply chain"
- Use company symbol filter when researching specific stocks`,
  inputSchema: SearchFilingsInputSchema,
  outputSchema: SearchFilingsOutputSchema,
  execute: async (inputData): Promise<SearchFilingsResult> => {
    const ctx = createToolContext();
    return searchFilings(ctx, {
      query: inputData.query,
      symbol: inputData.symbol,
      filingTypes: inputData.filingTypes,
      limit: inputData.limit,
    });
  },
});

// Re-export schemas for testing
export { FilingChunkSummarySchema, SearchFilingsInputSchema, SearchFilingsOutputSchema };
