/**
 * Extraction Client
 *
 * Uses LLM with tool use to extract structured data from unstructured text content.
 *
 * TODO: Migrate from Anthropic SDK to Gemini SDK to use global model.
 * Currently uses Claude for extraction due to tool use API compatibility.
 * When migrating, update to use @google/generative-ai with function calling.
 *
 * @see trading_config.global_model for target model selection
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Tool, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages.js";
import { DEFAULT_GLOBAL_MODEL } from "@cream/domain";
import { type ContentSourceType, type ExtractionResult, ExtractionResultSchema } from "../types.js";

/**
 * Extraction client configuration
 */
export interface ExtractionClientConfig {
  /** Anthropic API key */
  apiKey?: string;
  /**
   * Model to use
   * TODO: Currently ignored - uses Claude. Migrate to Gemini to use global model.
   */
  model?: string;
  /** Maximum tokens for response (default: 2048) */
  maxTokens?: number;
  /** Temperature for extraction (default: 0.1 for consistency) */
  temperature?: number;
  /** Request timeout in ms (default: 60000) */
  timeout?: number;
}

/**
 * TODO: Migrate to Gemini. Currently uses Claude for tool use compatibility.
 */
const DEFAULT_CONFIG: Required<ExtractionClientConfig> = {
  apiKey: "",
  model: DEFAULT_GLOBAL_MODEL, // Target model (not yet used - still on Claude)
  maxTokens: 2048,
  temperature: 0.1,
  timeout: 60000,
};

/**
 * Extraction prompts for different content types
 */
const EXTRACTION_PROMPTS: Record<ContentSourceType, string> = {
  news: `You are analyzing a news article about financial markets or companies.
Extract structured information focusing on:
- Overall market sentiment (bullish/bearish/neutral)
- Companies, people, and products mentioned
- Any numeric data points (revenue, growth rates, prices)
- The primary event type being reported
- How urgent/important this news is for trading decisions

Be precise with numbers and entity names. If information is unclear, mark confidence lower.
You MUST use the submit_extraction tool to provide your analysis.`,

  press_release: `You are analyzing a corporate press release.
Extract structured information focusing on:
- Official sentiment and tone of the release
- The issuing company and any other mentioned entities
- Specific metrics, financial figures, or guidance numbers
- The type of announcement (earnings, product, M&A, etc.)
- Strategic importance to investors

Press releases are official sources - extract exact figures when provided.
You MUST use the submit_extraction tool to provide your analysis.`,

  transcript: `You are analyzing an earnings call transcript.
Extract structured information focusing on:
- Management's overall tone and outlook (bullish/bearish/neutral)
- Key executives and analysts mentioned
- Specific guidance numbers, growth rates, margins
- Topics discussed (earnings, guidance, strategy, M&A, etc.)
- Confidence level and any cautionary language

Pay attention to forward-looking statements and guidance changes.
You MUST use the submit_extraction tool to provide your analysis.`,

  macro: `You are analyzing macroeconomic data or central bank communications.
Extract structured information focusing on:
- Policy stance or economic outlook
- Key institutions or officials mentioned
- Specific economic figures and indicators
- Event type (rate decision, employment data, GDP, etc.)
- Market impact significance

Focus on data-driven insights and policy implications.
You MUST use the submit_extraction tool to provide your analysis.`,
};

/**
 * Tool definition for extraction
 */
const EXTRACTION_TOOL: Tool = {
  name: "submit_extraction",
  description: "Submit the structured extraction results from the analyzed content",
  input_schema: {
    type: "object" as const,
    properties: {
      sentiment: {
        type: "string",
        enum: ["bullish", "bearish", "neutral"],
        description: "Overall sentiment of the content",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence in sentiment classification (0-1)",
      },
      entities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "The entity name as it appears in the text" },
            type: {
              type: "string",
              enum: ["company", "person", "product", "event", "location"],
              description: "The category of entity",
            },
            ticker: { type: "string", description: "Stock ticker if applicable" },
          },
          required: ["name", "type"],
        },
        description: "Entities mentioned in the content",
      },
      dataPoints: {
        type: "array",
        items: {
          type: "object",
          properties: {
            metric: { type: "string", description: "The metric name (e.g., revenue, growth rate)" },
            value: { type: "number", description: "The numeric value" },
            unit: { type: "string", description: "The unit of measurement" },
            period: { type: "string", description: "Time period if applicable (e.g., Q1 2026)" },
          },
          required: ["metric", "value", "unit"],
        },
        description: "Numeric data points extracted",
      },
      eventType: {
        type: "string",
        enum: [
          "earnings",
          "guidance",
          "merger_acquisition",
          "product_launch",
          "regulatory",
          "macro_release",
          "analyst_rating",
          "insider_trade",
          "dividend",
          "stock_split",
          "layoffs",
          "executive_change",
          "legal",
          "other",
        ],
        description: "Primary event type classification",
      },
      importance: {
        type: "number",
        minimum: 1,
        maximum: 5,
        description: "Importance/urgency on 1-5 scale",
      },
      summary: {
        type: "string",
        description: "Brief summary of the content (1-2 sentences)",
      },
      keyInsights: {
        type: "array",
        items: { type: "string" },
        description: "Key actionable insights (max 3)",
      },
    },
    required: [
      "sentiment",
      "confidence",
      "entities",
      "dataPoints",
      "eventType",
      "importance",
      "summary",
      "keyInsights",
    ],
  },
};

/**
 * Client for extracting structured data using Claude
 */
export class ExtractionClient {
  private client: Anthropic;
  private config: Required<ExtractionClientConfig>;

  constructor(config: ExtractionClientConfig = {}) {
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || "";
    this.config = { ...DEFAULT_CONFIG, ...config, apiKey };

    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      timeout: this.config.timeout,
    });
  }

  /**
   * Extract structured data from content using Claude
   */
  async extract(
    content: string,
    sourceType: ContentSourceType,
    metadata?: Record<string, unknown>
  ): Promise<ExtractionResult> {
    const systemPrompt = EXTRACTION_PROMPTS[sourceType];

    // Build the user message with context
    let userMessage = `Extract structured information from the following ${sourceType} content:\n\n`;

    if (metadata) {
      userMessage += "Context:\n";
      for (const [key, value] of Object.entries(metadata)) {
        userMessage += `- ${key}: ${value}\n`;
      }
      userMessage += "\n";
    }

    userMessage += `Content:\n${content}\n\n`;
    userMessage +=
      "Analyze this content and use the submit_extraction tool to provide your structured analysis.";

    // Call Claude with tool use
    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "submit_extraction" },
    });

    // Find the tool use block
    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === "submit_extraction") {
        const toolBlock = block as ToolUseBlock;
        // Validate with Zod schema
        const parsed = ExtractionResultSchema.safeParse(toolBlock.input);
        if (parsed.success) {
          return parsed.data;
        }
        // If validation fails, try to use the raw input with defaults
        return this.sanitizeExtraction(toolBlock.input as Record<string, unknown>);
      }
    }

    // Fallback: return a minimal extraction if tool wasn't called
    return this.createFallbackExtraction(content);
  }

  /**
   * Sanitize and fill in defaults for extraction input
   */
  private sanitizeExtraction(input: Record<string, unknown>): ExtractionResult {
    return {
      sentiment: (input.sentiment as "bullish" | "bearish" | "neutral") ?? "neutral",
      confidence: typeof input.confidence === "number" ? input.confidence : 0.5,
      entities: Array.isArray(input.entities) ? input.entities : [],
      dataPoints: Array.isArray(input.dataPoints) ? input.dataPoints : [],
      eventType: (input.eventType as ExtractionResult["eventType"]) ?? "other",
      importance: typeof input.importance === "number" ? input.importance : 3,
      summary: typeof input.summary === "string" ? input.summary : "",
      keyInsights: Array.isArray(input.keyInsights) ? input.keyInsights : [],
    };
  }

  /**
   * Extract from multiple content items (batched)
   */
  async extractBatch(
    items: Array<{
      content: string;
      sourceType: ContentSourceType;
      metadata?: Record<string, unknown>;
    }>,
    concurrency = 3
  ): Promise<Array<ExtractionResult | Error>> {
    const results: Array<ExtractionResult | Error> = [];

    // Process in batches to respect rate limits
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchPromises = batch.map((item) =>
        this.extract(item.content, item.sourceType, item.metadata).catch((err) => err as Error)
      );
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Create a fallback extraction when Claude doesn't use the tool
   */
  private createFallbackExtraction(content: string): ExtractionResult {
    return {
      sentiment: "neutral",
      confidence: 0.3,
      entities: [],
      dataPoints: [],
      eventType: "other",
      importance: 2,
      summary: content.slice(0, 200) + (content.length > 200 ? "..." : ""),
      keyInsights: [],
    };
  }

  /**
   * Test connection to Claude API
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: 10,
        messages: [{ role: "user", content: "Hello" }],
      });
      return response.content.length > 0;
    } catch {
      return false;
    }
  }
}

/**
 * Create extraction client with environment configuration
 */
export function createExtractionClient(config?: ExtractionClientConfig): ExtractionClient {
  return new ExtractionClient(config);
}
