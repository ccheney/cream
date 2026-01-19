/**
 * AI Routes
 *
 * Provides AI-powered endpoints for the dashboard, including
 * status narrative generation using Gemini Flash.
 *
 * @see docs/plans/ui/41-reasoning-trace-ux.md
 */

import { google } from "@ai-sdk/google";
import { getLLMModelId } from "@cream/domain";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { generateText, Output } from "ai";

// ============================================
// App Setup
// ============================================

const app = new OpenAPIHono();

// ============================================
// Schema
// ============================================

/**
 * Semantic thought types for agent reasoning display.
 * Each type maps to a specific color from the design system.
 */
const ThoughtTypeSchema = z.enum([
	"observation", // stone - gathering facts, noting data
	"analysis", // violet - working through patterns
	"hypothesis", // indigo - forming predictions
	"concern", // orange - caution, uncertainty, caveats
	"insight", // pink - aha moments, realizations
	"synthesis", // amber - pulling together factors
	"conclusion", // emerald - final recommendation
	"question", // teal - self-reflection, alternatives
]);

const SummarizeReasoningRequestSchema = z.object({
	reasoning: z.string().describe("The current reasoning text to summarize"),
});

const SummarizeReasoningResponseSchema = z.object({
	summary: z.string().describe("A short (max 8 words) summary of what the agent is doing"),
	type: ThoughtTypeSchema.describe("The semantic type of this reasoning"),
	confidence: z.number().min(0).max(1).describe("Classification confidence (0-1)"),
});

// ============================================
// Route Definition
// ============================================

const summarizeReasoningRoute = createRoute({
	method: "post",
	path: "/summarize-reasoning",
	tags: ["AI"],
	summary: "Generate a short status summary from reasoning text",
	description:
		"Uses Gemini Flash to generate a concise, contextual status message describing what the agent is currently thinking about. Responses are optimized for low latency (<100ms).",
	request: {
		body: {
			content: {
				"application/json": {
					schema: SummarizeReasoningRequestSchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: "Successfully generated summary",
			content: {
				"application/json": {
					schema: SummarizeReasoningResponseSchema,
				},
			},
		},
	},
});

// ============================================
// Implementation
// ============================================

const STATUS_PROMPT = `Analyze this AI agent's reasoning and provide:
1. A concise summary (8-15 words) of what it's currently thinking about
2. The semantic type of reasoning being done
3. Your confidence in the classification (0-1)

## Summary Guidelines
Use present continuous tense. Be specific about domain concepts and data.

Good summaries:
- "Analyzing RSI divergence patterns to identify potential reversal points..."
- "Weighing earnings growth against macro headwinds for position sizing..."
- "Checking Fed policy implications on rate-sensitive sectors..."

Bad summaries:
- "Thinking..."
- "Analyzing data..."
- "Processing..."

## Reasoning Types
- observation: Gathering facts, noting data, reading information
- analysis: Working through patterns, examining relationships, evaluating data
- hypothesis: Forming predictions, making assumptions, proposing theories
- concern: Expressing caution, noting risks, identifying uncertainties
- insight: Key realizations, aha moments, important discoveries
- synthesis: Pulling together multiple factors, weighing tradeoffs
- conclusion: Final recommendations, decisions, actionable outcomes
- question: Self-reflection, considering alternatives, exploring "what if"

Current reasoning:
{reasoning}`;

const SummaryOutputSchema = z.object({
	summary: z.string().describe("A concise 8-15 word summary ending with ellipsis"),
	type: ThoughtTypeSchema.describe("The semantic type of this reasoning"),
	confidence: z.number().min(0).max(1).describe("Classification confidence (0-1)"),
});

app.openapi(summarizeReasoningRoute, async (c) => {
	const { reasoning } = c.req.valid("json");

	const defaultResponse = { summary: "Thinking...", type: "observation" as const, confidence: 0.3 };

	// Return default for short/empty reasoning
	if (!reasoning || reasoning.length < 50) {
		return c.json(defaultResponse);
	}

	// Check if Google API key is available
	if (!Bun.env.GOOGLE_GENERATIVE_AI_API_KEY) {
		// Fallback: extract key phrases from reasoning without LLM
		const summary = extractKeyPhrase(reasoning);
		return c.json({ summary, type: "observation" as const, confidence: 0.3 });
	}

	try {
		const { output } = await generateText({
			model: google(getLLMModelId()),
			prompt: STATUS_PROMPT.replace("{reasoning}", reasoning.slice(-500)),
			output: Output.object({ schema: SummaryOutputSchema }),
		});

		// Ensure summary ends with ellipsis for consistency
		let summary = output?.summary?.trim() ?? "Processing...";
		if (!summary.endsWith("...")) {
			summary = summary.replace(/[.!?]*$/, "...");
		}

		return c.json({
			summary,
			type: output?.type ?? ("observation" as const),
			confidence: Math.min(1, Math.max(0, output?.confidence ?? 0.3)),
		});
	} catch (_error) {
		// Fallback to simple extraction
		const summary = extractKeyPhrase(reasoning);
		return c.json({ summary, type: "observation" as const, confidence: 0.3 });
	}
});

/**
 * Fallback: Extract a key phrase from reasoning without using LLM.
 * Used when GOOGLE_GENERATIVE_AI_API_KEY is not available or LLM call fails.
 */
function extractKeyPhrase(reasoning: string): string {
	// Get the last ~200 characters for context
	const recent = reasoning.slice(-200).trim();

	// Look for action verbs at start of sentences
	const actionPatterns = [
		/(?:I(?:'m| am| will| need to| should))\s+([^.!?]{10,50})/i,
		/(?:Let me|Now|First|Next)\s+([^.!?]{10,40})/i,
		/(?:Looking at|Checking|Analyzing|Evaluating|Considering)\s+([^.!?]{5,35})/i,
	];

	for (const pattern of actionPatterns) {
		const match = recent.match(pattern);
		if (match?.[1]) {
			const phrase = match[1].trim();
			// Convert to present continuous if needed
			const summary = phrase.charAt(0).toUpperCase() + phrase.slice(1);
			return summary.length > 40 ? `${summary.slice(0, 40)}...` : `${summary}...`;
		}
	}

	// Fallback: use last sentence fragment
	const sentences = recent.split(/[.!?]+/);
	const lastSentence = sentences.filter((s) => s.trim().length > 10).pop();

	if (lastSentence) {
		const trimmed = lastSentence.trim();
		return trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : `${trimmed}...`;
	}

	return "Processing...";
}

export default app;
