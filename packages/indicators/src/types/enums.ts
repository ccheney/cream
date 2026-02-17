import { z } from "zod";

export const EarningsQuality = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type EarningsQuality = z.infer<typeof EarningsQuality>;

export const SentimentClassification = z.enum([
	"STRONG_BULLISH",
	"BULLISH",
	"NEUTRAL",
	"BEARISH",
	"STRONG_BEARISH",
]);
export type SentimentClassification = z.infer<typeof SentimentClassification>;

export const MarketCapCategory = z.enum(["MEGA", "LARGE", "MID", "SMALL", "MICRO"]);
export type MarketCapCategory = z.infer<typeof MarketCapCategory>;

export const DataQuality = z.enum(["COMPLETE", "PARTIAL", "STALE"]);
export type DataQuality = z.infer<typeof DataQuality>;

export const TradingSession = z.enum(["PRE_MARKET", "RTH", "AFTER_HOURS", "CLOSED"]);
export type TradingSession = z.infer<typeof TradingSession>;

export const SyncRunType = z.enum([
	"fundamentals",
	"short_interest",
	"sentiment",
	"corporate_actions",
]);
export type SyncRunType = z.infer<typeof SyncRunType>;

export const SyncRunStatus = z.enum(["running", "completed", "failed"]);
export type SyncRunStatus = z.infer<typeof SyncRunStatus>;
