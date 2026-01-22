/**
 * Event Payload Schemas
 *
 * Typed payload schemas for external events, mirroring the Protobuf definitions
 * in packages/proto/cream/v1/events.proto.
 *
 * These schemas provide type-safe payloads for each event type.
 */

import { z } from "zod";
import { Iso8601Schema } from "./time";

// ============================================
// Data Source Enum
// ============================================

/**
 * Data source for external events
 */
export const DataSource = z.enum(["ALPACA", "BENZINGA", "SEC_EDGAR", "SOCIAL", "INTERNAL", "FRED"]);
export type DataSource = z.infer<typeof DataSource>;

// ============================================
// Sentiment Enum
// ============================================

/**
 * Sentiment classification for extraction
 */
export const ExtractedSentiment = z.enum(["BULLISH", "BEARISH", "NEUTRAL"]);
export type ExtractedSentiment = z.infer<typeof ExtractedSentiment>;

// ============================================
// Extracted Entity
// ============================================

/**
 * Entity extracted from content
 */
export const ExtractedEntitySchema = z.object({
	/** Entity name as it appears */
	name: z.string().min(1),
	/** Entity type */
	entityType: z.enum(["company", "person", "product", "event", "location"]),
	/** Resolved ticker symbol (if company) */
	ticker: z.string().optional(),
});
export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;

// ============================================
// Event Payload Schemas
// ============================================

/**
 * Earnings event payload
 */
export const EarningsEventPayloadSchema = z.object({
	/** Symbol this earnings relates to */
	symbol: z.string().min(1),
	/** Fiscal quarter (e.g., "Q1", "Q2") */
	quarter: z.string().min(1),
	/** Fiscal year */
	year: z.number().int(),
	/** Actual EPS reported */
	epsActual: z.number().optional(),
	/** Expected/consensus EPS */
	epsExpected: z.number().optional(),
	/** EPS surprise percentage */
	epsSurprisePct: z.number().optional(),
	/** Actual revenue reported (in dollars) */
	revenueActual: z.number().optional(),
	/** Expected/consensus revenue */
	revenueExpected: z.number().optional(),
	/** Revenue surprise percentage */
	revenueSurprisePct: z.number().optional(),
	/** Management guidance update */
	guidanceSummary: z.string().optional(),
	/** Earnings call transcript available */
	transcriptAvailable: z.boolean().default(false),
});
export type EarningsEventPayload = z.infer<typeof EarningsEventPayloadSchema>;

/**
 * Macro economic event payload
 */
export const MacroEventPayloadSchema = z.object({
	/** Indicator name (e.g., "Non-Farm Payrolls", "CPI", "GDP") */
	indicatorName: z.string().min(1),
	/** Actual value released */
	value: z.number(),
	/** Previous period value */
	previousValue: z.number().optional(),
	/** Expected/consensus value */
	expectedValue: z.number().optional(),
	/** Surprise percentage */
	surprisePct: z.number().optional(),
	/** Unit of measurement */
	unit: z.string().default(""),
	/** Country (default: "US") */
	country: z.string().default("US"),
	/** Period this data covers */
	period: z.string().optional(),
});
export type MacroEventPayload = z.infer<typeof MacroEventPayloadSchema>;

/**
 * News event payload
 */
export const NewsEventPayloadSchema = z.object({
	/** Article headline */
	headline: z.string().min(1),
	/** Article body/summary */
	body: z.string().min(1),
	/** Source publication */
	source: z.string().min(1),
	/** URL to full article */
	url: z.string().url().optional(),
	/** Extracted entities */
	entities: z.array(ExtractedEntitySchema).default([]),
	/** LLM-extracted key insights */
	keyInsights: z.array(z.string()).default([]),
});
export type NewsEventPayload = z.infer<typeof NewsEventPayloadSchema>;

/**
 * Sentiment spike event payload
 */
export const SentimentEventPayloadSchema = z.object({
	/** Platform (Twitter/X, Reddit, StockTwits) */
	platform: z.string().min(1),
	/** Volume of mentions */
	mentionCount: z.number().int().nonnegative(),
	/** Normal average volume */
	averageVolume: z.number().int().nonnegative().optional(),
	/** Volume z-score */
	volumeZscore: z.number().optional(),
	/** Aggregate sentiment of mentions */
	aggregateSentiment: ExtractedSentiment,
	/** Time window in minutes */
	windowMinutes: z.number().int().positive().default(60),
});
export type SentimentEventPayload = z.infer<typeof SentimentEventPayloadSchema>;

/**
 * Merger/acquisition event payload
 */
export const MergerAcquisitionPayloadSchema = z.object({
	/** Type: "merger", "acquisition", "spinoff", "divestiture" */
	transactionType: z.enum(["merger", "acquisition", "spinoff", "divestiture"]),
	/** Acquirer symbol (if acquisition) */
	acquirerSymbol: z.string().optional(),
	/** Target symbol (if acquisition) */
	targetSymbol: z.string().optional(),
	/** Deal value (if disclosed) */
	dealValue: z.number().positive().optional(),
	/** Currency of deal value */
	currency: z.string().default("USD"),
	/** Expected close date */
	expectedCloseDate: z.string().optional(),
	/** Deal status */
	status: z.enum(["announced", "pending", "approved", "closed", "terminated"]),
});
export type MergerAcquisitionPayload = z.infer<typeof MergerAcquisitionPayloadSchema>;

/**
 * Analyst rating event payload
 */
export const AnalystRatingPayloadSchema = z.object({
	/** Analyst firm name */
	firm: z.string().min(1),
	/** Analyst name (if available) */
	analystName: z.string().optional(),
	/** Previous rating (if upgrade/downgrade) */
	previousRating: z.string().optional(),
	/** New rating */
	newRating: z.string().min(1),
	/** Previous price target */
	previousTarget: z.number().positive().optional(),
	/** New price target */
	newTarget: z.number().positive().optional(),
	/** Action type */
	actionType: z.enum(["initiated", "upgrade", "downgrade", "reiterated"]),
});
export type AnalystRatingPayload = z.infer<typeof AnalystRatingPayloadSchema>;

/**
 * Regulatory event payload
 */
export const RegulatoryPayloadSchema = z.object({
	/** Regulatory body (FDA, SEC, FTC, DOJ, etc.) */
	regulatoryBody: z.string().min(1),
	/** Action type (approval, rejection, investigation, settlement, etc.) */
	actionType: z.string().min(1),
	/** Product or matter name (if applicable) */
	subject: z.string().optional(),
	/** Decision or status */
	decision: z.string().min(1),
	/** Next steps or timeline */
	nextSteps: z.string().optional(),
});
export type RegulatoryPayload = z.infer<typeof RegulatoryPayloadSchema>;

/**
 * Dividend event payload
 */
export const DividendPayloadSchema = z.object({
	/** Dividend amount per share */
	amount: z.number().positive(),
	/** Currency */
	currency: z.string().default("USD"),
	/** Ex-dividend date */
	exDate: z.string().min(1),
	/** Record date */
	recordDate: z.string().optional(),
	/** Payment date */
	paymentDate: z.string().optional(),
	/** Dividend type */
	dividendType: z.enum(["regular", "special", "variable"]).default("regular"),
	/** Year-over-year change percentage */
	yoyChangePct: z.number().optional(),
});
export type DividendPayload = z.infer<typeof DividendPayloadSchema>;

/**
 * Stock split event payload
 */
export const SplitPayloadSchema = z.object({
	/** Split ratio numerator (e.g., 4 for 4:1) */
	splitFrom: z.number().int().positive(),
	/** Split ratio denominator (e.g., 1 for 4:1) */
	splitTo: z.number().int().positive(),
	/** Effective date */
	effectiveDate: z.string().min(1),
	/** Announcement date */
	announcementDate: z.string().optional(),
});
export type SplitPayload = z.infer<typeof SplitPayloadSchema>;

// ============================================
// Typed Event Type (Extended)
// ============================================

/**
 * Extended event type with all categories from Protobuf
 */
export const ExtendedEventType = z.enum([
	"EARNINGS",
	"GUIDANCE",
	"MACRO",
	"NEWS",
	"SENTIMENT_SPIKE",
	"SEC_FILING",
	"DIVIDEND",
	"SPLIT",
	"M_AND_A",
	"ANALYST_RATING",
	"CONFERENCE",
	"PRODUCT_LAUNCH",
	"REGULATORY",
	"EXECUTIVE_CHANGE",
	"LEGAL",
	"OTHER",
]);
export type ExtendedEventType = z.infer<typeof ExtendedEventType>;

// ============================================
// Typed External Event
// ============================================

/**
 * Base fields for all typed events
 */
const TypedEventBaseSchema = z.object({
	/** Unique identifier (UUID v4) */
	eventId: z.string().uuid(),
	/** When the event occurred */
	eventTime: Iso8601Schema,
	/** Affected instrument IDs (tickers) */
	relatedInstrumentIds: z.array(z.string()).default([]),
	/** Data source */
	source: DataSource.optional(),
	/** Headline or summary */
	headline: z.string().optional(),
	/** Sentiment score (-1.0 to 1.0) */
	sentimentScore: z.number().min(-1).max(1).optional(),
	/** Importance score (0.0 to 1.0) */
	importanceScore: z.number().min(0).max(1).optional(),
	/** Surprise score (-1.0 to 1.0) */
	surpriseScore: z.number().min(-1).max(1).optional(),
	/** Confidence in extraction (0.0 to 1.0) */
	confidence: z.number().min(0).max(1).optional(),
	/** When the event was processed */
	processedAt: Iso8601Schema.optional(),
	/** Original content (for reference) */
	originalContent: z.string().optional(),
});

/**
 * Typed earnings event
 */
export const TypedEarningsEventSchema = TypedEventBaseSchema.extend({
	eventType: z.literal("EARNINGS"),
	payload: EarningsEventPayloadSchema,
});
export type TypedEarningsEvent = z.infer<typeof TypedEarningsEventSchema>;

/**
 * Typed macro event
 */
export const TypedMacroEventSchema = TypedEventBaseSchema.extend({
	eventType: z.literal("MACRO"),
	payload: MacroEventPayloadSchema,
});
export type TypedMacroEvent = z.infer<typeof TypedMacroEventSchema>;

/**
 * Typed news event
 */
export const TypedNewsEventSchema = TypedEventBaseSchema.extend({
	eventType: z.literal("NEWS"),
	payload: NewsEventPayloadSchema,
});
export type TypedNewsEvent = z.infer<typeof TypedNewsEventSchema>;

/**
 * Typed sentiment spike event
 */
export const TypedSentimentEventSchema = TypedEventBaseSchema.extend({
	eventType: z.literal("SENTIMENT_SPIKE"),
	payload: SentimentEventPayloadSchema,
});
export type TypedSentimentEvent = z.infer<typeof TypedSentimentEventSchema>;

/**
 * Typed M&A event
 */
export const TypedMergerAcquisitionEventSchema = TypedEventBaseSchema.extend({
	eventType: z.literal("M_AND_A"),
	payload: MergerAcquisitionPayloadSchema,
});
export type TypedMergerAcquisitionEvent = z.infer<typeof TypedMergerAcquisitionEventSchema>;

/**
 * Typed analyst rating event
 */
export const TypedAnalystRatingEventSchema = TypedEventBaseSchema.extend({
	eventType: z.literal("ANALYST_RATING"),
	payload: AnalystRatingPayloadSchema,
});
export type TypedAnalystRatingEvent = z.infer<typeof TypedAnalystRatingEventSchema>;

/**
 * Typed regulatory event
 */
export const TypedRegulatoryEventSchema = TypedEventBaseSchema.extend({
	eventType: z.literal("REGULATORY"),
	payload: RegulatoryPayloadSchema,
});
export type TypedRegulatoryEvent = z.infer<typeof TypedRegulatoryEventSchema>;

/**
 * Typed dividend event
 */
export const TypedDividendEventSchema = TypedEventBaseSchema.extend({
	eventType: z.literal("DIVIDEND"),
	payload: DividendPayloadSchema,
});
export type TypedDividendEvent = z.infer<typeof TypedDividendEventSchema>;

/**
 * Typed split event
 */
export const TypedSplitEventSchema = TypedEventBaseSchema.extend({
	eventType: z.literal("SPLIT"),
	payload: SplitPayloadSchema,
});
export type TypedSplitEvent = z.infer<typeof TypedSplitEventSchema>;

/**
 * Generic typed event (for other types without specific payload)
 */
export const TypedGenericEventSchema = TypedEventBaseSchema.extend({
	eventType: z.enum([
		"GUIDANCE",
		"SEC_FILING",
		"CONFERENCE",
		"PRODUCT_LAUNCH",
		"EXECUTIVE_CHANGE",
		"LEGAL",
		"OTHER",
	]),
	payload: z.record(z.string(), z.unknown()).optional(),
});
export type TypedGenericEvent = z.infer<typeof TypedGenericEventSchema>;

/**
 * Union of all typed events
 */
export const TypedExternalEventSchema = z.discriminatedUnion("eventType", [
	TypedEarningsEventSchema,
	TypedMacroEventSchema,
	TypedNewsEventSchema,
	TypedSentimentEventSchema,
	TypedMergerAcquisitionEventSchema,
	TypedAnalystRatingEventSchema,
	TypedRegulatoryEventSchema,
	TypedDividendEventSchema,
	TypedSplitEventSchema,
	TypedGenericEventSchema,
]);
export type TypedExternalEvent = z.infer<typeof TypedExternalEventSchema>;

// ============================================
// Event Collection
// ============================================

/**
 * Collection of external events
 */
export const ExternalEventListSchema = z.object({
	/** Events in the collection */
	events: z.array(TypedExternalEventSchema),
	/** Total count (may exceed list if paginated) */
	totalCount: z.number().int().nonnegative(),
	/** Pagination cursor for next page */
	nextCursor: z.string().optional(),
});
export type ExternalEventList = z.infer<typeof ExternalEventListSchema>;

/**
 * Event query request
 */
export const EventQueryRequestSchema = z.object({
	/** Filter by event types */
	eventTypes: z.array(ExtendedEventType).optional(),
	/** Filter by instrument IDs */
	instrumentIds: z.array(z.string()).optional(),
	/** Start time (inclusive) */
	startTime: Iso8601Schema.optional(),
	/** End time (exclusive) */
	endTime: Iso8601Schema.optional(),
	/** Maximum events to return */
	limit: z.number().int().positive().max(1000).default(100),
	/** Pagination cursor */
	cursor: z.string().optional(),
	/** Minimum importance score */
	minImportance: z.number().min(0).max(1).optional(),
});
export type EventQueryRequest = z.infer<typeof EventQueryRequestSchema>;

// ============================================
// Helpers
// ============================================

/**
 * Create an earnings event
 */
export function createEarningsEvent(
	eventId: string,
	eventTime: string,
	payload: EarningsEventPayload,
	options: Partial<TypedEarningsEvent> = {},
): TypedEarningsEvent {
	return {
		eventId,
		eventType: "EARNINGS",
		eventTime,
		payload,
		relatedInstrumentIds: options.relatedInstrumentIds ?? [payload.symbol],
		...options,
	};
}

/**
 * Create a macro event
 */
export function createMacroEvent(
	eventId: string,
	eventTime: string,
	payload: MacroEventPayload,
	options: Partial<TypedMacroEvent> = {},
): TypedMacroEvent {
	return {
		eventId,
		eventType: "MACRO",
		eventTime,
		payload,
		relatedInstrumentIds: options.relatedInstrumentIds ?? [],
		...options,
	};
}

/**
 * Create a news event
 */
export function createNewsEvent(
	eventId: string,
	eventTime: string,
	payload: NewsEventPayload,
	relatedInstrumentIds: string[],
	options: Partial<TypedNewsEvent> = {},
): TypedNewsEvent {
	return {
		eventId,
		eventType: "NEWS",
		eventTime,
		payload,
		relatedInstrumentIds,
		headline: options.headline ?? payload.headline,
		...options,
	};
}

/**
 * Check if event is earnings-related
 */
export function isEarningsEvent(event: TypedExternalEvent): event is TypedEarningsEvent {
	return event.eventType === "EARNINGS";
}

/**
 * Check if event is macro-related
 */
export function isMacroEvent(event: TypedExternalEvent): event is TypedMacroEvent {
	return event.eventType === "MACRO";
}

/**
 * Check if event is news-related
 */
export function isNewsEvent(event: TypedExternalEvent): event is TypedNewsEvent {
	return event.eventType === "NEWS";
}

/**
 * Get surprise score from event payload (earnings or macro)
 */
export function getEventSurpriseScore(event: TypedExternalEvent): number | undefined {
	if (event.surpriseScore !== undefined) {
		return event.surpriseScore;
	}

	if (isEarningsEvent(event) && event.payload.epsSurprisePct !== undefined) {
		// Normalize EPS surprise to -1 to 1 range (cap at ±50%)
		return Math.max(-1, Math.min(1, event.payload.epsSurprisePct / 50));
	}

	if (isMacroEvent(event) && event.payload.surprisePct !== undefined) {
		// Normalize macro surprise to -1 to 1 range (cap at ±50%)
		return Math.max(-1, Math.min(1, event.payload.surprisePct / 50));
	}

	return undefined;
}
