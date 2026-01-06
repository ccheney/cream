/**
 * External Context Types
 *
 * Types for news, sentiment, and fundamentals context that agents use
 * for trading decisions. Provides structured access to external data.
 *
 * @see docs/plans/03-market-snapshot.md - externalContext
 */

import { z } from "zod";
import { Iso8601Schema } from "./time";

// ============================================
// Event Types
// ============================================

/**
 * Type of external event
 */
export const EventType = z.enum([
  "EARNINGS",
  "MACRO",
  "NEWS",
  "SENTIMENT_SPIKE",
  "SEC_FILING",
  "DIVIDEND",
  "SPLIT",
  "M_AND_A",
  "ANALYST_RATING",
  "CONFERENCE",
  "GUIDANCE",
  "PREDICTION_MARKET",
  "OTHER",
]);
export type EventType = z.infer<typeof EventType>;

/**
 * Type of influence on trading decision
 */
export const InfluenceType = z.enum(["NEWS", "SENTIMENT", "FUNDAMENTAL", "MACRO"]);
export type InfluenceType = z.infer<typeof InfluenceType>;

/**
 * Sentiment direction
 */
export const SentimentDirection = z.enum(["BULLISH", "BEARISH", "NEUTRAL", "MIXED"]);
export type SentimentDirection = z.infer<typeof SentimentDirection>;

// ============================================
// External Event
// ============================================

/**
 * A discrete external event (earnings, news, macro)
 */
export const ExternalEventSchema = z.object({
  /** Unique identifier */
  eventId: z.string().min(1),

  /** Category of event */
  eventType: EventType,

  /** When the event occurred (may be empty for ongoing events) */
  eventTime: Iso8601Schema.optional(),

  /** Event details (structure varies by eventType) */
  payload: z.record(z.string(), z.unknown()),

  /** Affected instrument IDs (empty for macro events) */
  relatedInstrumentIds: z.array(z.string()).default([]),

  /** Source of the event (FMP, Alpha Vantage, etc.) */
  source: z.string().optional(),

  /** Headline or summary */
  headline: z.string().optional(),
});
export type ExternalEvent = z.infer<typeof ExternalEventSchema>;

// ============================================
// Numeric Scores
// ============================================

/**
 * Standard numeric score names
 */
export const StandardScoreNames = z.enum([
  "sentiment",
  "volume_zscore",
  "news_intensity",
  "social_volume",
  "analyst_consensus",
  "earnings_surprise",
  "momentum",
  "volatility_percentile",
]);
export type StandardScoreNames = z.infer<typeof StandardScoreNames>;

/**
 * Map of score name to value
 * Values are typically normalized to a standard range (e.g., -1 to 1 for sentiment)
 */
export const NumericScoresSchema = z.record(z.string(), z.number());
export type NumericScores = z.infer<typeof NumericScoresSchema>;

// ============================================
// News Context
// ============================================

/**
 * A single news item
 */
export const NewsItemSchema = z.object({
  /** Unique identifier */
  id: z.string().min(1),

  /** Headline */
  headline: z.string().min(1),

  /** Source (Reuters, Bloomberg, etc.) */
  source: z.string().min(1),

  /** Publication timestamp */
  publishedAt: Iso8601Schema,

  /** Summary text */
  summary: z.string().optional(),

  /** URL to full article */
  url: z.string().url().optional(),

  /** Related ticker symbols */
  tickers: z.array(z.string()).default([]),

  /** LLM-derived sentiment score (-1 to 1) */
  sentimentScore: z.number().min(-1).max(1).optional(),

  /** Sentiment direction */
  sentimentDirection: SentimentDirection.optional(),

  /** Importance/relevance score (0 to 1) */
  relevanceScore: z.number().min(0).max(1).optional(),
});
export type NewsItem = z.infer<typeof NewsItemSchema>;

/**
 * Aggregated news context
 */
export const NewsContextSchema = z.object({
  /** Recent news items */
  items: z.array(NewsItemSchema),

  /** Aggregate sentiment across all items */
  aggregateSentiment: z.number().min(-1).max(1).optional(),

  /** Number of items analyzed */
  itemCount: z.number().int().nonnegative(),

  /** Time range of news (lookback period) */
  periodHours: z.number().positive().default(24),
});
export type NewsContext = z.infer<typeof NewsContextSchema>;

// ============================================
// Sentiment Context
// ============================================

/**
 * Social media sentiment metrics
 */
export const SocialSentimentSchema = z.object({
  /** Platform (Twitter/X, Reddit, StockTwits) */
  platform: z.string().min(1),

  /** Sentiment score (-1 to 1) */
  score: z.number().min(-1).max(1),

  /** Volume of mentions */
  mentionCount: z.number().int().nonnegative(),

  /** Volume change vs average */
  volumeZScore: z.number().optional(),

  /** Timestamp of analysis */
  asOf: Iso8601Schema,
});
export type SocialSentiment = z.infer<typeof SocialSentimentSchema>;

/**
 * Complete sentiment context
 */
export const SentimentContextSchema = z.object({
  /** News-derived sentiment */
  newsSentiment: z.number().min(-1).max(1).optional(),

  /** Social media sentiments by platform */
  socialSentiments: z.array(SocialSentimentSchema).default([]),

  /** Combined sentiment score */
  combinedScore: z.number().min(-1).max(1).optional(),

  /** Sentiment direction */
  direction: SentimentDirection.optional(),

  /** Confidence in sentiment reading (0 to 1) */
  confidence: z.number().min(0).max(1).optional(),
});
export type SentimentContext = z.infer<typeof SentimentContextSchema>;

// ============================================
// Fundamentals Context
// ============================================

/**
 * Earnings-related data
 */
export const EarningsDataSchema = z.object({
  /** Last reported EPS */
  lastEps: z.number().optional(),

  /** EPS surprise percentage */
  epsSurprise: z.number().optional(),

  /** Next earnings date */
  nextEarningsDate: z.string().optional(),

  /** Days until next earnings */
  daysToEarnings: z.number().int().optional(),

  /** Analyst EPS estimate */
  epsEstimate: z.number().optional(),

  /** Revenue (last reported) */
  lastRevenue: z.number().optional(),

  /** Revenue surprise percentage */
  revenueSurprise: z.number().optional(),
});
export type EarningsData = z.infer<typeof EarningsDataSchema>;

/**
 * Valuation metrics
 */
export const ValuationMetricsSchema = z.object({
  /** Price to Earnings ratio */
  peRatio: z.number().optional(),

  /** Forward P/E */
  forwardPe: z.number().optional(),

  /** Price to Sales */
  psRatio: z.number().optional(),

  /** Price to Book */
  pbRatio: z.number().optional(),

  /** Enterprise Value to EBITDA */
  evToEbitda: z.number().optional(),

  /** Market capitalization */
  marketCap: z.number().positive().optional(),

  /** Dividend yield */
  dividendYield: z.number().min(0).optional(),
});
export type ValuationMetrics = z.infer<typeof ValuationMetricsSchema>;

/**
 * Analyst ratings
 */
export const AnalystRatingsSchema = z.object({
  /** Average analyst rating (1-5 scale: 1=Strong Buy, 5=Strong Sell) */
  averageRating: z.number().min(1).max(5).optional(),

  /** Number of analysts */
  analystCount: z.number().int().nonnegative().optional(),

  /** Buy ratings */
  buyCount: z.number().int().nonnegative().optional(),

  /** Hold ratings */
  holdCount: z.number().int().nonnegative().optional(),

  /** Sell ratings */
  sellCount: z.number().int().nonnegative().optional(),

  /** Average price target */
  priceTarget: z.number().positive().optional(),

  /** Price target upside % */
  priceTargetUpside: z.number().optional(),
});
export type AnalystRatings = z.infer<typeof AnalystRatingsSchema>;

/**
 * Complete fundamentals context
 */
export const FundamentalsContextSchema = z.object({
  /** Earnings data */
  earnings: EarningsDataSchema.optional(),

  /** Valuation metrics */
  valuation: ValuationMetricsSchema.optional(),

  /** Analyst ratings */
  analystRatings: AnalystRatingsSchema.optional(),

  /** Sector */
  sector: z.string().optional(),

  /** Industry */
  industry: z.string().optional(),

  /** Company name */
  companyName: z.string().optional(),
});
export type FundamentalsContext = z.infer<typeof FundamentalsContextSchema>;

// ============================================
// Macro Context
// ============================================

/**
 * Macro economic indicators
 */
export const MacroIndicatorsSchema = z.object({
  /** VIX index level */
  vix: z.number().nonnegative().optional(),

  /** 10-year Treasury yield */
  treasury10y: z.number().optional(),

  /** 2-year Treasury yield */
  treasury2y: z.number().optional(),

  /** Fed Funds Rate */
  fedFundsRate: z.number().optional(),

  /** DXY (Dollar Index) */
  dxy: z.number().positive().optional(),

  /** Crude oil price */
  crudeOil: z.number().positive().optional(),

  /** Gold price */
  gold: z.number().positive().optional(),

  /** Latest CPI reading */
  cpi: z.number().optional(),

  /** Latest GDP growth */
  gdpGrowth: z.number().optional(),

  /** Unemployment rate */
  unemployment: z.number().min(0).max(100).optional(),
});
export type MacroIndicators = z.infer<typeof MacroIndicatorsSchema>;

// ============================================
// Complete External Context
// ============================================

/**
 * Structured summary from LLM processing
 */
export const StructuredSummarySchema = z.object({
  /** Overall market sentiment narrative */
  marketSentiment: z.string().optional(),

  /** Key themes identified */
  keyThemes: z.array(z.string()).default([]),

  /** Risks identified */
  risks: z.array(z.string()).default([]),

  /** Opportunities identified */
  opportunities: z.array(z.string()).default([]),

  /** Summary timestamp */
  generatedAt: Iso8601Schema.optional(),
});
export type StructuredSummary = z.infer<typeof StructuredSummarySchema>;

/**
 * Complete external context for trading decisions
 */
export const ExternalContextSchema = z.object({
  /** Structured summary from LLM */
  structuredSummary: StructuredSummarySchema.optional(),

  /** Numeric scores for various signals */
  numericScores: NumericScoresSchema.default({}),

  /** Discrete events (earnings, news, etc.) */
  extractedEvents: z.array(ExternalEventSchema).default([]),

  /** News context */
  news: NewsContextSchema.optional(),

  /** Sentiment context */
  sentiment: SentimentContextSchema.optional(),

  /** Fundamentals context */
  fundamentals: FundamentalsContextSchema.optional(),

  /** Macro indicators */
  macro: MacroIndicatorsSchema.optional(),
});
export type ExternalContext = z.infer<typeof ExternalContextSchema>;

// ============================================
// Helpers
// ============================================

/**
 * Create an empty external context
 */
export function createEmptyExternalContext(): ExternalContext {
  return {
    numericScores: {},
    extractedEvents: [],
  };
}

/**
 * Check if external context has meaningful content
 */
export function hasExternalContext(ctx: ExternalContext): boolean {
  return (
    Object.keys(ctx.numericScores).length > 0 ||
    ctx.extractedEvents.length > 0 ||
    ctx.news !== undefined ||
    ctx.sentiment !== undefined ||
    ctx.fundamentals !== undefined ||
    ctx.macro !== undefined ||
    ctx.structuredSummary !== undefined
  );
}

/**
 * Get sentiment score from context (combined if available, or news-derived)
 */
export function getSentimentScore(ctx: ExternalContext): number | undefined {
  // First check numeric scores
  if (ctx.numericScores.sentiment !== undefined) {
    return ctx.numericScores.sentiment;
  }

  // Then check sentiment context
  if (ctx.sentiment?.combinedScore !== undefined) {
    return ctx.sentiment.combinedScore;
  }

  if (ctx.sentiment?.newsSentiment !== undefined) {
    return ctx.sentiment.newsSentiment;
  }

  // Finally check news context
  return ctx.news?.aggregateSentiment;
}
