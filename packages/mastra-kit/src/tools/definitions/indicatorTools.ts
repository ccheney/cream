/**
 * Indicator Mastra Tool Definitions
 *
 * Tools for searching and retrieving synthesized indicators from HelixDB.
 * Enables agents to find similar indicators, avoid duplicates, and build on
 * successful indicator patterns.
 */

import { createContext, requireEnv } from "@cream/domain";
import type { IndicatorCategory, IndicatorStatus } from "@cream/helix-schema";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  getIndicator,
  getValidatedIndicators,
  ingestIndicator,
  searchIndicatorsByCategory,
  searchSimilarIndicators,
} from "../implementations/indicatorIngestion.js";

/**
 * Create ExecutionContext for tool invocation.
 */
function createToolContext() {
  return createContext(requireEnv(), "scheduled");
}

// ============================================
// Schemas
// ============================================

const IndicatorCategorySchema = z.enum(["momentum", "trend", "volatility", "volume", "custom"]);

const IndicatorStatusSchema = z.enum(["staging", "paper", "production", "retired"]);

const IndicatorSearchResultSchema = z.object({
  indicatorId: z.string().describe("Unique indicator identifier"),
  name: z.string().describe("Indicator name"),
  category: IndicatorCategorySchema.describe("Indicator category"),
  status: IndicatorStatusSchema.describe("Indicator lifecycle status"),
  similarity: z.number().describe("Semantic similarity score (0-1)"),
  hypothesis: z.string().describe("Indicator hypothesis"),
  deflatedSharpe: z.number().optional().describe("Deflated Sharpe ratio"),
  informationCoefficient: z.number().optional().describe("Information coefficient"),
});

const IndicatorDetailsSchema = z.object({
  indicatorId: z.string().describe("Unique identifier"),
  name: z.string().describe("Indicator name"),
  category: IndicatorCategorySchema.describe("Indicator category"),
  status: IndicatorStatusSchema.describe("Lifecycle status"),
  hypothesis: z.string().describe("Economic hypothesis"),
  economicRationale: z.string().describe("Economic rationale"),
  deflatedSharpe: z.number().optional().describe("Deflated Sharpe ratio"),
  probabilityOfOverfit: z.number().optional().describe("Probability of overfitting"),
  informationCoefficient: z.number().optional().describe("Information coefficient"),
  codeHash: z.string().optional().describe("Code hash for deduplication"),
  astSignature: z.string().optional().describe("AST signature for structural similarity"),
});

const ValidatedIndicatorSchema = z.object({
  indicatorId: z.string().describe("Indicator identifier"),
  name: z.string().describe("Indicator name"),
  category: IndicatorCategorySchema.describe("Indicator category"),
  deflatedSharpe: z.number().describe("Deflated Sharpe ratio"),
  probabilityOfOverfit: z.number().describe("Probability of overfitting"),
  informationCoefficient: z.number().describe("Information coefficient"),
});

// Input/Output Schemas

export const SearchSimilarIndicatorsInputSchema = z.object({
  query: z
    .string()
    .min(10)
    .max(1000)
    .describe(
      "Search query describing the indicator hypothesis or economic rationale (e.g., 'momentum reversal at extreme values with volatility adjustment')"
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe("Maximum number of indicators to return (default: 5)"),
});

export const SearchSimilarIndicatorsOutputSchema = z.object({
  query: z.string().describe("Original search query"),
  indicators: z
    .array(IndicatorSearchResultSchema)
    .describe("Matching indicators ranked by similarity"),
  totalFound: z.number().describe("Total number of matching indicators"),
  executionTimeMs: z.number().describe("Query execution time in milliseconds"),
});

export const SearchByCategoryInputSchema = z.object({
  category: IndicatorCategorySchema.describe("Indicator category to search"),
  query: z
    .string()
    .min(5)
    .max(500)
    .optional()
    .default("")
    .describe("Optional query to filter within category"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(10)
    .describe("Maximum number of indicators to return (default: 10)"),
});

export const SearchByCategoryOutputSchema = z.object({
  category: IndicatorCategorySchema.describe("Searched category"),
  query: z.string().describe("Filter query used"),
  indicators: z.array(IndicatorSearchResultSchema).describe("Indicators in category"),
  totalFound: z.number().describe("Total number found"),
  executionTimeMs: z.number().describe("Query execution time"),
});

export const GetIndicatorInputSchema = z.object({
  indicatorId: z
    .string()
    .min(1)
    .max(100)
    .describe("Indicator identifier (from search results or known ID)"),
});

export const GetIndicatorOutputSchema = z.object({
  found: z.boolean().describe("Whether the indicator was found"),
  indicator: IndicatorDetailsSchema.nullable().describe("Full indicator details if found"),
  executionTimeMs: z.number().describe("Query execution time"),
});

export const GetValidatedIndicatorsInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(20)
    .describe("Maximum number of indicators to return (default: 20)"),
});

export const GetValidatedIndicatorsOutputSchema = z.object({
  indicators: z.array(ValidatedIndicatorSchema).describe("Validated indicators meeting thresholds"),
  totalFound: z.number().describe("Total number of validated indicators"),
  executionTimeMs: z.number().describe("Query execution time"),
});

export const IngestIndicatorInputSchema = z.object({
  indicatorId: z
    .string()
    .min(1)
    .describe("Unique identifier (format: ind-{timestamp}-{shortname})"),
  name: z.string().min(1).describe("Human-readable name"),
  category: IndicatorCategorySchema.describe("Indicator category"),
  status: IndicatorStatusSchema.describe("Initial status"),
  hypothesis: z.string().min(10).describe("Economic hypothesis driving the indicator"),
  economicRationale: z.string().min(10).describe("Why this indicator should work"),
  generatedInRegime: z.string().optional().describe("Market regime when generated"),
  codeHash: z.string().optional().describe("SHA256 hash of indicator code"),
  astSignature: z.string().optional().describe("AST signature for structural deduplication"),
  deflatedSharpe: z.number().optional().describe("Deflated Sharpe from backtesting"),
  probabilityOfOverfit: z.number().optional().describe("Probability of backtest overfitting"),
  informationCoefficient: z.number().optional().describe("IC with forward returns"),
  environment: z.enum(["BACKTEST", "PAPER", "LIVE"]).describe("Trading environment"),
});

export const IngestIndicatorOutputSchema = z.object({
  success: z.boolean().describe("Whether ingestion succeeded"),
  indicatorId: z.string().describe("Indicator ID"),
  duplicateFound: z.boolean().describe("Whether a duplicate was found"),
  similarIndicators: z
    .array(IndicatorSearchResultSchema)
    .describe("Similar existing indicators found"),
  executionTimeMs: z.number().describe("Execution time"),
  errors: z.array(z.string()).describe("Any errors encountered"),
});

// ============================================
// Tool Definitions
// ============================================

/**
 * Search for similar indicators in HelixDB by semantic similarity
 */
export const searchSimilarIndicatorsTool = createTool({
  id: "search_similar_indicators",
  description: `Search the indicator knowledge base for indicators similar to a given hypothesis.

Use this tool BEFORE generating new indicators to:
- Avoid duplicating existing indicators
- Find indicators to improve upon
- Discover related research that might inform new hypotheses

Returns indicators ranked by semantic similarity to your query.`,
  inputSchema: SearchSimilarIndicatorsInputSchema,
  outputSchema: SearchSimilarIndicatorsOutputSchema,
  execute: async (inputData) => {
    const ctx = createToolContext();
    return searchSimilarIndicators(ctx, inputData.query, inputData.limit ?? 5);
  },
});

/**
 * Search indicators by category
 */
export const searchIndicatorsByCategoryTool = createTool({
  id: "search_indicators_by_category",
  description: `Search for indicators within a specific category (momentum, trend, volatility, volume, custom).

Use this tool to:
- Explore existing indicators in a category before creating new ones
- Find the best-performing indicators in a category
- Understand what approaches have been tried for a specific category`,
  inputSchema: SearchByCategoryInputSchema,
  outputSchema: SearchByCategoryOutputSchema,
  execute: async (inputData) => {
    const ctx = createToolContext();
    return searchIndicatorsByCategory(
      ctx,
      inputData.category as IndicatorCategory,
      inputData.query ?? "",
      inputData.limit ?? 10
    );
  },
});

/**
 * Get full details for a specific indicator
 */
export const getIndicatorTool = createTool({
  id: "get_indicator",
  description: `Retrieve full details for a specific indicator by ID.

Use this tool to:
- Get the complete hypothesis and rationale for an indicator
- Review performance metrics (Sharpe, IC, probability of overfit)
- Understand implementation details (code hash, AST signature)`,
  inputSchema: GetIndicatorInputSchema,
  outputSchema: GetIndicatorOutputSchema,
  execute: async (inputData) => {
    const ctx = createToolContext();
    return getIndicator(ctx, inputData.indicatorId);
  },
});

/**
 * Get validated indicators meeting performance thresholds
 */
export const getValidatedIndicatorsTool = createTool({
  id: "get_validated_indicators",
  description: `Retrieve indicators that have passed validation thresholds.

Thresholds:
- Deflated Sharpe >= 0.5
- Probability of Overfit <= 0.3
- Information Coefficient >= 0.02

Use this tool to:
- Find production-ready indicators
- Identify successful approaches to build upon
- Review the best-performing indicators in the system`,
  inputSchema: GetValidatedIndicatorsInputSchema,
  outputSchema: GetValidatedIndicatorsOutputSchema,
  execute: async (inputData) => {
    const ctx = createToolContext();
    return getValidatedIndicators(ctx, inputData.limit ?? 20);
  },
});

/**
 * Ingest a synthesized indicator into HelixDB
 */
export const ingestIndicatorTool = createTool({
  id: "ingest_indicator",
  description: `Persist a synthesized indicator to the knowledge base.

Use this tool AFTER generating and validating a new indicator to:
- Store it for future reference and similarity search
- Enable deduplication for future indicator generation
- Track indicator lifecycle from staging to production

The tool will check for duplicates and flag similar existing indicators.`,
  inputSchema: IngestIndicatorInputSchema,
  outputSchema: IngestIndicatorOutputSchema,
  execute: async (inputData) => {
    const ctx = createToolContext();
    return ingestIndicator(ctx, {
      indicatorId: inputData.indicatorId,
      name: inputData.name,
      category: inputData.category as IndicatorCategory,
      status: inputData.status as IndicatorStatus,
      hypothesis: inputData.hypothesis,
      economicRationale: inputData.economicRationale,
      generatedInRegime: inputData.generatedInRegime,
      codeHash: inputData.codeHash,
      astSignature: inputData.astSignature,
      deflatedSharpe: inputData.deflatedSharpe,
      probabilityOfOverfit: inputData.probabilityOfOverfit,
      informationCoefficient: inputData.informationCoefficient,
      environment: inputData.environment,
    });
  },
});

/**
 * All indicator tools as an array for easy registration
 */
export const indicatorTools = [
  searchSimilarIndicatorsTool,
  searchIndicatorsByCategoryTool,
  getIndicatorTool,
  getValidatedIndicatorsTool,
  ingestIndicatorTool,
];
