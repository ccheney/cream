/**
 * Extraction Client
 *
 * Uses LLM function calling to extract structured data from
 * unstructured text content (news, transcripts, etc.).
 *
 * Uses the global model configuration from @cream/domain.
 *
 * Implements IExtractionClient from @cream/external-context for
 * dependency injection into the extraction pipeline.
 */

import { type GlobalModel, getDefaultGlobalModel } from "@cream/domain";
import {
	type ContentSourceType,
	type ExtractionResult,
	ExtractionResultSchema,
	type IExtractionClient,
} from "@cream/external-context";
import {
	FunctionCallingConfigMode,
	type FunctionDeclaration,
	GoogleGenAI,
	Type,
} from "@google/genai";

/**
 * Gemini extraction client configuration
 */
export interface ExtractionClientConfig {
	/** Google API key (defaults to GOOGLE_GENERATIVE_AI_API_KEY env var) */
	apiKey?: string;
	/** Model to use (defaults to global model) */
	model?: GlobalModel;
	/** Request timeout in ms (default: 60000) */
	timeout?: number;
}

function getDefaultConfig(): Required<Omit<ExtractionClientConfig, "apiKey">> {
	return {
		model: getDefaultGlobalModel(),
		timeout: 60000,
	};
}

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
You MUST use the submit_extraction function to provide your analysis.`,

	press_release: `You are analyzing a corporate press release.
Extract structured information focusing on:
- Official sentiment and tone of the release
- The issuing company and any other mentioned entities
- Specific metrics, financial figures, or guidance numbers
- The type of announcement (earnings, product, M&A, etc.)
- Strategic importance to investors

Press releases are official sources - extract exact figures when provided.
You MUST use the submit_extraction function to provide your analysis.`,

	transcript: `You are analyzing an earnings call transcript.
Extract structured information focusing on:
- Management's overall tone and outlook (bullish/bearish/neutral)
- Key executives and analysts mentioned
- Specific guidance numbers, growth rates, margins
- Topics discussed (earnings, guidance, strategy, M&A, etc.)
- Confidence level and any cautionary language

Pay attention to forward-looking statements and guidance changes.
You MUST use the submit_extraction function to provide your analysis.`,

	macro: `You are analyzing macroeconomic data or central bank communications.
Extract structured information focusing on:
- Policy stance or economic outlook
- Key institutions or officials mentioned
- Specific economic figures and indicators
- Event type (rate decision, employment data, GDP, etc.)
- Market impact significance

Focus on data-driven insights and policy implications.
You MUST use the submit_extraction function to provide your analysis.`,
};

/**
 * Function declaration for extraction tool
 */
const EXTRACTION_FUNCTION: FunctionDeclaration = {
	name: "submit_extraction",
	description: "Submit the structured extraction results from the analyzed content",
	parameters: {
		type: Type.OBJECT,
		properties: {
			sentiment: {
				type: Type.STRING,
				enum: ["bullish", "bearish", "neutral"],
				description: "Overall sentiment of the content",
			},
			confidence: {
				type: Type.NUMBER,
				description: "Confidence in sentiment classification (0-1)",
			},
			entities: {
				type: Type.ARRAY,
				items: {
					type: Type.OBJECT,
					properties: {
						name: { type: Type.STRING, description: "The entity name as it appears in the text" },
						type: {
							type: Type.STRING,
							enum: ["company", "person", "product", "event", "location"],
							description: "The category of entity",
						},
						ticker: { type: Type.STRING, description: "Stock ticker if applicable" },
					},
					required: ["name", "type"],
				},
				description: "Entities mentioned in the content",
			},
			dataPoints: {
				type: Type.ARRAY,
				items: {
					type: Type.OBJECT,
					properties: {
						metric: {
							type: Type.STRING,
							description: "The metric name (e.g., revenue, growth rate)",
						},
						value: { type: Type.NUMBER, description: "The numeric value" },
						unit: { type: Type.STRING, description: "The unit of measurement" },
						period: { type: Type.STRING, description: "Time period if applicable (e.g., Q1 2026)" },
					},
					required: ["metric", "value", "unit"],
				},
				description: "Numeric data points extracted",
			},
			eventType: {
				type: Type.STRING,
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
				type: Type.NUMBER,
				description: "Importance/urgency on 1-5 scale",
			},
			summary: {
				type: Type.STRING,
				description: "Brief summary of the content (1-2 sentences)",
			},
			keyInsights: {
				type: Type.ARRAY,
				items: { type: Type.STRING },
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
 * Gemini-based extraction client implementing IExtractionClient
 */
export class ExtractionClient implements IExtractionClient {
	private client: GoogleGenAI;
	private model: GlobalModel;

	constructor(config: ExtractionClientConfig = {}) {
		const apiKey = config.apiKey ?? Bun.env.GOOGLE_GENERATIVE_AI_API_KEY;
		if (!apiKey) {
			throw new Error("GOOGLE_GENERATIVE_AI_API_KEY environment variable not set");
		}

		this.client = new GoogleGenAI({ apiKey });
		this.model = config.model ?? getDefaultConfig().model;
	}

	/**
	 * Extract structured data from content using Gemini function calling
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
			"Analyze this content and use the submit_extraction function to provide your structured analysis.";

		// Call Gemini with function calling
		const response = await this.client.models.generateContent({
			model: this.model,
			contents: userMessage,
			config: {
				systemInstruction: systemPrompt,
				tools: [{ functionDeclarations: [EXTRACTION_FUNCTION] }],
				toolConfig: {
					functionCallingConfig: {
						mode: FunctionCallingConfigMode.ANY,
						allowedFunctionNames: ["submit_extraction"],
					},
				},
			},
		});

		// Extract function call result
		if (response.functionCalls && response.functionCalls.length > 0) {
			const functionCall = response.functionCalls[0];
			if (functionCall?.name === "submit_extraction" && functionCall.args) {
				// Validate with Zod schema
				const parsed = ExtractionResultSchema.safeParse(functionCall.args);
				if (parsed.success) {
					return parsed.data;
				}
				// If validation fails, try to use the raw input with defaults
				return this.sanitizeExtraction(functionCall.args as Record<string, unknown>);
			}
		}

		// Fallback: return a minimal extraction if function wasn't called
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
	 * Create a fallback extraction when Gemini doesn't call the function
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
	 * Test connection to Gemini API
	 */
	async testConnection(): Promise<boolean> {
		try {
			const response = await this.client.models.generateContent({
				model: this.model,
				contents: "Hello",
			});
			return (response.text?.length ?? 0) > 0;
		} catch {
			return false;
		}
	}
}

/**
 * Create Gemini extraction client with environment configuration
 */
export function createExtractionClient(config?: ExtractionClientConfig): ExtractionClient {
	return new ExtractionClient(config);
}
