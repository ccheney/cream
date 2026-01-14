/**
 * AI Routes
 *
 * Provides AI-powered endpoints for the dashboard, including
 * status narrative generation using Gemini Flash.
 *
 * @see docs/plans/ui/41-reasoning-trace-ux.md
 */

import { google } from "@ai-sdk/google";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { generateText } from "ai";

// ============================================
// App Setup
// ============================================

const app = new OpenAPIHono();

// ============================================
// Schema
// ============================================

const SummarizeReasoningRequestSchema = z.object({
  reasoning: z.string().describe("The current reasoning text to summarize"),
});

const SummarizeReasoningResponseSchema = z.object({
  summary: z.string().describe("A short (max 8 words) summary of what the agent is doing"),
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

const STATUS_PROMPT = `Summarize what this AI agent is currently thinking about in ONE short phrase (max 8 words). Use present continuous tense. Be specific about the domain concepts mentioned.

Examples of good summaries:
- "Analyzing RSI divergence patterns..."
- "Weighing earnings vs macro risk..."
- "Checking Fed policy implications..."
- "Evaluating sector momentum signals..."
- "Reviewing options Greeks data..."
- "Assessing position sizing limits..."

Bad examples (too generic):
- "Thinking about the data..."
- "Processing information..."
- "Analyzing the situation..."

Current reasoning (analyze the most recent content):
{reasoning}

Output ONLY the summary phrase, nothing else.`;

app.openapi(summarizeReasoningRoute, async (c) => {
  const { reasoning } = c.req.valid("json");

  // Return default for short/empty reasoning
  if (!reasoning || reasoning.length < 50) {
    return c.json({ summary: "Thinking..." });
  }

  // Check if Google API key is available
  if (!process.env.GOOGLE_API_KEY) {
    // Fallback: extract key phrases from reasoning without LLM
    const summary = extractKeyPhrase(reasoning);
    return c.json({ summary });
  }

  try {
    const { text } = await generateText({
      model: google("gemini-3-flash-preview"),
      prompt: STATUS_PROMPT.replace("{reasoning}", reasoning.slice(-500)),
      maxOutputTokens: 20,
      temperature: 0.3,
    });

    // Clean up the response
    let summary = text.trim();

    // Ensure it ends with ellipsis for consistency
    if (!summary.endsWith("...")) {
      summary = summary.replace(/[.!?]*$/, "...");
    }

    return c.json({ summary });
  } catch (error) {
    console.error("Failed to generate status summary:", error);
    // Fallback to simple extraction
    const summary = extractKeyPhrase(reasoning);
    return c.json({ summary });
  }
});

/**
 * Fallback: Extract a key phrase from reasoning without using LLM.
 * Used when GOOGLE_API_KEY is not available or LLM call fails.
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
