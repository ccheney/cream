/**
 * External Context Types
 *
 * Shared types for the external context extraction pipeline.
 */

import { z } from "zod";

// ============================================
// Parser Output Types
// ============================================

/**
 * Parsed news article
 */
export interface ParsedNews {
	headline: string;
	body: string;
	publishedAt: Date;
	source: string;
	url?: string;
	symbols?: string[];
}

/**
 * Parsed press release
 */
export interface ParsedPressRelease {
	title: string;
	content: string;
	filingDate: Date;
	source: string;
	symbols?: string[];
}

/**
 * Parsed transcript
 */
export interface ParsedTranscript {
	speakers: TranscriptSpeaker[];
	quarter: string;
	year: number;
	symbol: string;
	date: Date;
}

/**
 * Transcript speaker segment
 */
export interface TranscriptSpeaker {
	speaker: string;
	role?: string;
	text: string;
}

/**
 * Parsed macro release
 */
export interface ParsedMacroRelease {
	indicator: string;
	value: number;
	previousValue?: number;
	date: Date;
	unit?: string;
	source: string;
}

// ============================================
// Extraction Output Types (LLM Structured Outputs)
// ============================================

/**
 * Sentiment classification
 */
export const SentimentSchema = z.enum(["bullish", "bearish", "neutral"]);
export type Sentiment = z.infer<typeof SentimentSchema>;

/**
 * Entity types
 */
export const EntityTypeSchema = z.enum(["company", "person", "product", "event", "location"]);
export type EntityType = z.infer<typeof EntityTypeSchema>;

/**
 * Extracted entity
 */
export const ExtractedEntitySchema = z.object({
	name: z.string().describe("The entity name as it appears in the text"),
	type: EntityTypeSchema.describe("The category of entity"),
	ticker: z.string().optional().describe("Stock ticker if applicable"),
});
export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;

/**
 * Extracted data point
 */
export const DataPointSchema = z.object({
	metric: z.string().describe("The metric name (e.g., revenue, growth rate)"),
	value: z.number().describe("The numeric value"),
	unit: z.string().describe("The unit of measurement"),
	period: z.string().optional().describe("Time period if applicable (e.g., Q1 2026)"),
});
export type DataPoint = z.infer<typeof DataPointSchema>;

/**
 * Event type classification
 */
export const EventTypeSchema = z.enum([
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
]);
export type EventType = z.infer<typeof EventTypeSchema>;

/**
 * Full extraction result from Claude
 */
export const ExtractionResultSchema = z.object({
	sentiment: SentimentSchema.describe("Overall sentiment of the content"),
	confidence: z.number().min(0).max(1).describe("Confidence in sentiment classification (0-1)"),
	entities: z.array(ExtractedEntitySchema).describe("Entities mentioned in the content"),
	dataPoints: z.array(DataPointSchema).describe("Numeric data points extracted"),
	eventType: EventTypeSchema.describe("Primary event type classification"),
	importance: z.number().min(1).max(5).describe("Importance/urgency on 1-5 scale"),
	summary: z.string().describe("Brief summary of the content (1-2 sentences)"),
	keyInsights: z.array(z.string()).describe("Key actionable insights (max 3)"),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// ============================================
// Scoring Types
// ============================================

/**
 * Computed numeric scores for extracted content
 */
export interface ContentScores {
	/** Sentiment score from -1.0 (bearish) to 1.0 (bullish) */
	sentimentScore: number;
	/** Importance score from 0.0 to 1.0 */
	importanceScore: number;
	/** Surprise score from -1.0 to 1.0 (actual vs expected) */
	surpriseScore: number;
}

// ============================================
// Entity Linking Types
// ============================================

/**
 * Entity link result
 */
export interface EntityLink {
	/** Original entity name from extraction */
	entityName: string;
	/** Resolved ticker symbol */
	ticker: string;
	/** Match confidence (0-1) */
	confidence: number;
	/** Match method used */
	method: "exact" | "fuzzy" | "alias";
}

// ============================================
// Pipeline Types
// ============================================

/**
 * Source content type
 */
export type ContentSourceType = "news" | "press_release" | "transcript" | "macro";

/**
 * Pipeline input
 */
export interface PipelineInput {
	sourceType: ContentSourceType;
	rawContent: string;
	metadata: Record<string, unknown>;
}

/**
 * Pipeline output (extracted event ready for storage)
 */
export interface ExtractedEvent {
	/** Unique event ID */
	eventId: string;
	/** Source type */
	sourceType: ContentSourceType;
	/** Event type classification */
	eventType: EventType;
	/** Event timestamp */
	eventTime: Date;
	/** Extraction result */
	extraction: ExtractionResult;
	/** Computed scores */
	scores: ContentScores;
	/** Related instrument IDs (tickers) */
	relatedInstrumentIds: string[];
	/** Original content for reference */
	originalContent: string;
	/** Processing metadata */
	processedAt: Date;
}

// ============================================
// Input Types (Provider-agnostic)
// ============================================

/**
 * News article input for the extraction pipeline
 */
export interface NewsArticle {
	symbol?: string;
	publishedDate: string;
	title: string;
	image?: string;
	site: string;
	text: string;
	url: string;
}

/**
 * Transcript input for the extraction pipeline
 */
export interface TranscriptInput {
	symbol: string;
	quarter: number;
	year: number;
	date: string;
	content: string;
}

/**
 * Company search result for entity resolution
 */
export interface CompanySearchResult {
	symbol: string;
	name: string;
	currency?: string;
	stockExchange?: string;
	exchangeShortName?: string;
}

// ============================================
// Extraction Client Interface
// ============================================

/**
 * Extraction client interface for dependency injection.
 *
 * Allows the pipeline to work with different LLM providers
 * (Gemini, Claude, etc.) without hard-coding the implementation.
 */
export interface IExtractionClient {
	/**
	 * Extract structured data from content
	 */
	extract(
		content: string,
		sourceType: ContentSourceType,
		metadata?: Record<string, unknown>,
	): Promise<ExtractionResult>;

	/**
	 * Test connection to the LLM provider
	 */
	testConnection(): Promise<boolean>;
}
