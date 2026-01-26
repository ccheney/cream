/**
 * Search Academic Papers Tools
 *
 * Search for academic papers in the knowledge base and external sources.
 */

import {
	ingestSemanticScholarPapers,
	searchAcademicPapers as searchAcademicPapersImpl,
	searchExternalPapers as searchExternalPapersImpl,
} from "@cream/agents/implementations";
import { createContext, requireEnv } from "@cream/domain";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

function createToolContext() {
	return createContext(requireEnv(), "scheduled");
}

// Search Internal Papers

const SearchPapersInputSchema = z.object({
	query: z
		.string()
		.min(5)
		.max(500)
		.describe("Search query describing the topic or research question"),
	limit: z
		.number()
		.int()
		.min(1)
		.max(20)
		.optional()
		.describe("Maximum number of papers (default: 5)"),
});

const PaperSearchResultSchema = z.object({
	paperId: z.string(),
	title: z.string(),
	authors: z.string(),
	abstract: z.string(),
	url: z.string().optional(),
	publicationYear: z.number().optional(),
	citationCount: z.number(),
	similarity: z.number(),
});

const SearchPapersOutputSchema = z.object({
	query: z.string(),
	papers: z.array(PaperSearchResultSchema),
	totalFound: z.number(),
	executionTimeMs: z.number(),
});

export const searchAcademicPapers = createTool({
	id: "searchAcademicPapers",
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
		return searchAcademicPapersImpl(ctx, inputData.query, inputData.limit ?? 5);
	},
});

// Search External Papers

const SearchExternalPapersInputSchema = z.object({
	topic: z.string().min(5).max(200).describe("Research topic to search for"),
	recentYearsOnly: z.boolean().optional().describe("Only search papers from last 5 years"),
	limit: z
		.number()
		.int()
		.min(1)
		.max(10)
		.optional()
		.describe("Maximum number of papers (default: 5)"),
});

const ExternalPaperSchema = z.object({
	paperId: z.string(),
	title: z.string(),
	authors: z.string(),
	abstract: z.string().optional(),
	year: z.number().optional(),
	citationCount: z.number().optional(),
	url: z.string().optional(),
});

const SearchExternalPapersOutputSchema = z.object({
	topic: z.string(),
	papers: z.array(ExternalPaperSchema),
	source: z.string(),
	executionTimeMs: z.number(),
});

export const searchExternalPapers = createTool({
	id: "searchExternalPapers",
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
		return searchExternalPapersImpl(
			ctx,
			inputData.topic,
			inputData.limit ?? 5,
			inputData.recentYearsOnly ?? false,
		);
	},
});

// Ingest Papers

const IngestPapersInputSchema = z.object({
	topic: z.string().min(5).max(200).describe("Topic to search and ingest papers for"),
	limit: z
		.number()
		.int()
		.min(1)
		.max(10)
		.optional()
		.describe("Maximum papers to ingest (default: 5)"),
});

const IngestPapersOutputSchema = z.object({
	topic: z.string(),
	papersIngested: z.number(),
	duplicatesSkipped: z.number(),
	errors: z.array(z.string()),
	executionTimeMs: z.number(),
});

export const ingestAcademicPapers = createTool({
	id: "ingestAcademicPapers",
	description: `Search for papers on a topic and ingest them into the knowledge base.

Use this tool to:
- Add relevant papers to the knowledge base for future reference
- Build up the paper collection for a specific research area
- Import papers that will be cited in hypothesis generation`,
	inputSchema: IngestPapersInputSchema,
	outputSchema: IngestPapersOutputSchema,
	execute: async (inputData) => {
		const ctx = createToolContext();
		return ingestSemanticScholarPapers(ctx, inputData.topic, inputData.limit ?? 5);
	},
});

export {
	SearchPapersInputSchema,
	SearchPapersOutputSchema,
	SearchExternalPapersInputSchema,
	SearchExternalPapersOutputSchema,
	IngestPapersInputSchema,
	IngestPapersOutputSchema,
};
