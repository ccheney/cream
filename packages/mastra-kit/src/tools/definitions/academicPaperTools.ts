/**
 * Academic Paper Mastra Tool Definitions
 *
 * Tools for searching and retrieving academic papers from HelixDB.
 * Enables agents to ground hypotheses in peer-reviewed research and
 * reference relevant academic literature in their analysis.
 */

import { createContext, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  getAcademicPaper,
  ingestSemanticScholarPapers,
  searchAcademicPapers,
  searchExternalPapers,
} from "../implementations/academicPapers.js";

/**
 * Create ExecutionContext for tool invocation.
 */
function createToolContext() {
  return createContext(requireEnv(), "scheduled");
}

// ============================================
// Schemas
// ============================================

const AcademicPaperSchema = z.object({
  paperId: z.string().describe("Unique paper identifier"),
  title: z.string().describe("Paper title"),
  authors: z.string().describe("Author names"),
  abstract: z.string().describe("Paper abstract"),
  url: z.string().optional().describe("URL to paper"),
  publicationYear: z.number().optional().describe("Publication year"),
  citationCount: z.number().describe("Number of citations"),
});

const PaperSearchResultSchema = z.object({
  paperId: z.string().describe("Paper identifier"),
  title: z.string().describe("Paper title"),
  authors: z.string().describe("Authors"),
  similarity: z.number().describe("Semantic similarity score (0-1)"),
  citationCount: z.number().describe("Citation count"),
});

const ExternalPaperSchema = z.object({
  paperId: z.string().describe("External paper ID (S2, DOI, or ArXiv)"),
  title: z.string().describe("Paper title"),
  authors: z.string().describe("Authors"),
  abstract: z.string().optional().describe("Paper abstract"),
  year: z.number().optional().describe("Publication year"),
  citationCount: z.number().optional().describe("Citation count"),
  url: z.string().optional().describe("URL to paper"),
});

// Input/Output Schemas

export const SearchPapersInputSchema = z.object({
  query: z
    .string()
    .min(5)
    .max(500)
    .describe(
      "Search query describing the topic or research question (e.g., 'momentum factor returns post-publication decay')"
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(5)
    .describe("Maximum number of papers to return (default: 5)"),
});

export const SearchPapersOutputSchema = z.object({
  query: z.string().describe("Original search query"),
  papers: z.array(PaperSearchResultSchema).describe("Matching papers ranked by relevance"),
  totalFound: z.number().describe("Total number of matching papers"),
  executionTimeMs: z.number().describe("Query execution time in milliseconds"),
});

export const GetPaperInputSchema = z.object({
  paperId: z
    .string()
    .min(1)
    .max(100)
    .describe("Paper identifier (from search results or known ID)"),
});

export const GetPaperOutputSchema = z.object({
  found: z.boolean().describe("Whether the paper was found"),
  paper: AcademicPaperSchema.nullable().describe("Full paper details if found"),
  executionTimeMs: z.number().describe("Query execution time in milliseconds"),
});

export const SearchExternalPapersInputSchema = z.object({
  topic: z
    .string()
    .min(5)
    .max(200)
    .describe("Research topic to search for (e.g., 'machine learning factor models')"),
  recentYearsOnly: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, only search for papers from the last 5 years"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe("Maximum number of papers to return (default: 5)"),
});

export const SearchExternalPapersOutputSchema = z.object({
  topic: z.string().describe("Original search topic"),
  papers: z.array(ExternalPaperSchema).describe("Papers found from external sources"),
  source: z.string().describe("External source used (e.g., 'Semantic Scholar')"),
  executionTimeMs: z.number().describe("Search execution time in milliseconds"),
});

export const IngestPapersInputSchema = z.object({
  topic: z.string().min(5).max(200).describe("Topic to search and ingest papers for"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe("Maximum papers to ingest (default: 5)"),
});

export const IngestPapersOutputSchema = z.object({
  topic: z.string().describe("Search topic"),
  papersIngested: z.number().describe("Number of papers successfully ingested"),
  duplicatesSkipped: z.number().describe("Papers already in database"),
  errors: z.array(z.string()).describe("Any errors encountered"),
  executionTimeMs: z.number().describe("Total execution time in milliseconds"),
});

// ============================================
// Tool Definitions
// ============================================

/**
 * Search for academic papers in HelixDB by semantic similarity
 */
export const searchAcademicPapersTool = createTool({
  id: "search_academic_papers",
  description: `Search the academic paper knowledge base for papers relevant to a research topic.

Use this tool to:
- Find foundational research supporting a hypothesis
- Discover relevant academic literature for factor research
- Ground trading decisions in peer-reviewed evidence

Returns papers ranked by semantic similarity to your query.`,
  inputSchema: SearchPapersInputSchema,
  outputSchema: SearchPapersOutputSchema,
  execute: async (inputData) => {
    const ctx = createToolContext();
    return searchAcademicPapers(ctx, inputData.query, inputData.limit ?? 5);
  },
});

/**
 * Get full details for a specific academic paper
 */
export const getAcademicPaperTool = createTool({
  id: "get_academic_paper",
  description: `Retrieve full details for a specific academic paper by ID.

Use this tool to:
- Get the complete abstract for a paper found in search results
- Access paper metadata (authors, year, citations)
- Reference specific papers in hypothesis generation`,
  inputSchema: GetPaperInputSchema,
  outputSchema: GetPaperOutputSchema,
  execute: async (inputData) => {
    const ctx = createToolContext();
    return getAcademicPaper(ctx, inputData.paperId);
  },
});

/**
 * Search external academic databases (Semantic Scholar)
 */
export const searchExternalPapersTool = createTool({
  id: "search_external_papers",
  description: `Search external academic databases (Semantic Scholar) for papers on a topic.

Use this tool when:
- The internal knowledge base doesn't have relevant papers
- Looking for recent research (last 5 years)
- Exploring new research areas not yet in the system

Note: This makes external API calls and may be rate-limited.`,
  inputSchema: SearchExternalPapersInputSchema,
  outputSchema: SearchExternalPapersOutputSchema,
  execute: async (inputData) => {
    const ctx = createToolContext();
    return searchExternalPapers(
      ctx,
      inputData.topic,
      inputData.limit ?? 5,
      inputData.recentYearsOnly ?? false
    );
  },
});

/**
 * Ingest papers from external sources into HelixDB
 */
export const ingestAcademicPapersTool = createTool({
  id: "ingest_academic_papers",
  description: `Search for papers on a topic and ingest them into the knowledge base.

Use this tool to:
- Add relevant papers to the knowledge base for future reference
- Build up the paper collection for a specific research area
- Import papers that will be cited in hypothesis generation

This tool searches external databases and stores papers with embeddings for semantic search.`,
  inputSchema: IngestPapersInputSchema,
  outputSchema: IngestPapersOutputSchema,
  execute: async (inputData) => {
    const ctx = createToolContext();
    return ingestSemanticScholarPapers(ctx, inputData.topic, inputData.limit ?? 5);
  },
});
