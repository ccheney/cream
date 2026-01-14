/**
 * Indicator Snapshot Routes
 *
 * API endpoints for retrieving unified indicator snapshots combining
 * real-time and batch indicator data.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import {
	CorporateActionsRepository,
	FundamentalsRepository,
	SentimentRepository,
	ShortInterestRepository,
} from "@cream/storage";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDbClient } from "../db.js";

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const DataQualitySchema = z.enum(["COMPLETE", "PARTIAL", "STALE"]);

const ValueIndicatorsSchema = z.object({
	pe_ratio_ttm: z.number().nullable(),
	pe_ratio_forward: z.number().nullable(),
	pb_ratio: z.number().nullable(),
	ev_ebitda: z.number().nullable(),
	earnings_yield: z.number().nullable(),
	dividend_yield: z.number().nullable(),
	cape_10yr: z.number().nullable(),
});

const QualityIndicatorsSchema = z.object({
	gross_profitability: z.number().nullable(),
	roe: z.number().nullable(),
	roa: z.number().nullable(),
	asset_growth: z.number().nullable(),
	accruals_ratio: z.number().nullable(),
	cash_flow_quality: z.number().nullable(),
	beneish_m_score: z.number().nullable(),
});

const ShortInterestIndicatorsSchema = z.object({
	short_interest: z.number().nullable(),
	short_interest_ratio: z.number().nullable(),
	days_to_cover: z.number().nullable(),
	short_pct_float: z.number().nullable(),
	short_interest_change: z.number().nullable(),
});

const SentimentIndicatorsSchema = z.object({
	sentiment_score: z.number().nullable(),
	sentiment_strength: z.number().nullable(),
	news_volume: z.number().nullable(),
	sentiment_momentum: z.number().nullable(),
	event_risk_flag: z.boolean().nullable(),
	news_sentiment: z.number().nullable(),
	social_sentiment: z.number().nullable(),
	analyst_sentiment: z.number().nullable(),
});

const CorporateIndicatorsSchema = z.object({
	trailing_dividend_yield: z.number().nullable(),
	days_to_ex_dividend: z.number().nullable(),
	dividend_growth: z.number().nullable(),
	pending_split: z.boolean().nullable(),
});

const MarketContextSchema = z.object({
	market_cap: z.number().nullable(),
	sector: z.string().nullable(),
	industry: z.string().nullable(),
});

const SnapshotMetadataSchema = z.object({
	symbol: z.string(),
	timestamp: z.string(),
	data_quality: DataQualitySchema,
	last_fundamentals_update: z.string().nullable(),
	last_short_interest_update: z.string().nullable(),
	last_sentiment_update: z.string().nullable(),
	last_corporate_actions_update: z.string().nullable(),
});

const BatchIndicatorSnapshotSchema = z.object({
	value: ValueIndicatorsSchema,
	quality: QualityIndicatorsSchema,
	short_interest: ShortInterestIndicatorsSchema,
	sentiment: SentimentIndicatorsSchema,
	corporate: CorporateIndicatorsSchema,
	market: MarketContextSchema,
	metadata: SnapshotMetadataSchema,
});

const BatchSnapshotsResponseSchema = z.object({
	snapshots: z.record(z.string(), BatchIndicatorSnapshotSchema),
	errors: z.record(z.string(), z.string()).optional(),
	metadata: z.object({
		total: z.number(),
		successful: z.number(),
		failed: z.number(),
		execution_time_ms: z.number(),
	}),
});

// ============================================
// Helper Functions
// ============================================

function createEmptyValueIndicators(): z.infer<typeof ValueIndicatorsSchema> {
	return {
		pe_ratio_ttm: null,
		pe_ratio_forward: null,
		pb_ratio: null,
		ev_ebitda: null,
		earnings_yield: null,
		dividend_yield: null,
		cape_10yr: null,
	};
}

function createEmptyQualityIndicators(): z.infer<typeof QualityIndicatorsSchema> {
	return {
		gross_profitability: null,
		roe: null,
		roa: null,
		asset_growth: null,
		accruals_ratio: null,
		cash_flow_quality: null,
		beneish_m_score: null,
	};
}

function createEmptyShortInterestIndicators(): z.infer<typeof ShortInterestIndicatorsSchema> {
	return {
		short_interest: null,
		short_interest_ratio: null,
		days_to_cover: null,
		short_pct_float: null,
		short_interest_change: null,
	};
}

function createEmptySentimentIndicators(): z.infer<typeof SentimentIndicatorsSchema> {
	return {
		sentiment_score: null,
		sentiment_strength: null,
		news_volume: null,
		sentiment_momentum: null,
		event_risk_flag: null,
		news_sentiment: null,
		social_sentiment: null,
		analyst_sentiment: null,
	};
}

function createEmptyCorporateIndicators(): z.infer<typeof CorporateIndicatorsSchema> {
	return {
		trailing_dividend_yield: null,
		days_to_ex_dividend: null,
		dividend_growth: null,
		pending_split: null,
	};
}

function createEmptyMarketContext(): z.infer<typeof MarketContextSchema> {
	return {
		market_cap: null,
		sector: null,
		industry: null,
	};
}

function determineDataQuality(
	hasFundamentals: boolean,
	hasShortInterest: boolean,
	hasSentiment: boolean
): z.infer<typeof DataQualitySchema> {
	const count = [hasFundamentals, hasShortInterest, hasSentiment].filter(Boolean).length;
	if (count >= 2) {
		return "COMPLETE";
	}
	if (count >= 1) {
		return "PARTIAL";
	}
	return "STALE";
}

// ============================================
// Route Definitions
// ============================================

// GET /api/snapshots/:symbol - Get indicator snapshot for a single symbol
const getSnapshotRoute = createRoute({
	method: "get",
	path: "/:symbol",
	request: {
		params: z.object({
			symbol: z.string(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: BatchIndicatorSnapshotSchema,
				},
			},
			description: "Indicator snapshot for symbol",
		},
		503: {
			content: {
				"application/json": {
					schema: z.object({
						error: z.string(),
					}),
				},
			},
			description: "Database service unavailable",
		},
	},
	tags: ["Snapshots"],
});

app.openapi(getSnapshotRoute, async (c) => {
	const { symbol } = c.req.valid("param");
	const upperSymbol = symbol.toUpperCase();

	try {
		const db = await getDbClient();

		// Fetch all batch data in parallel
		const [fundamentalsRepo, shortInterestRepo, sentimentRepo, corporateActionsRepo] =
			await Promise.all([
				Promise.resolve(new FundamentalsRepository(db)),
				Promise.resolve(new ShortInterestRepository(db)),
				Promise.resolve(new SentimentRepository(db)),
				Promise.resolve(new CorporateActionsRepository(db)),
			]);

		const [fundamentalsList, shortInterest, sentiment, corporateActions] = await Promise.all([
			fundamentalsRepo.findBySymbol(upperSymbol),
			shortInterestRepo.findLatestBySymbol(upperSymbol),
			sentimentRepo.findLatestBySymbol(upperSymbol),
			corporateActionsRepo.getForSymbol(upperSymbol),
		]);
		const fundamentals = fundamentalsList?.[0] ?? null;

		// Map to output format
		const value = fundamentals
			? {
					pe_ratio_ttm: fundamentals.peRatioTtm,
					pe_ratio_forward: fundamentals.peRatioForward,
					pb_ratio: fundamentals.pbRatio,
					ev_ebitda: fundamentals.evEbitda,
					earnings_yield: fundamentals.earningsYield,
					dividend_yield: fundamentals.dividendYield,
					cape_10yr: fundamentals.cape10yr,
				}
			: createEmptyValueIndicators();

		const quality = fundamentals
			? {
					gross_profitability: fundamentals.grossProfitability,
					roe: fundamentals.roe,
					roa: fundamentals.roa,
					asset_growth: fundamentals.assetGrowth,
					accruals_ratio: fundamentals.accrualsRatio,
					cash_flow_quality: fundamentals.cashFlowQuality,
					beneish_m_score: fundamentals.beneishMScore,
				}
			: createEmptyQualityIndicators();

		const shortInterestData = shortInterest
			? {
					short_interest: shortInterest.shortInterest,
					short_interest_ratio: shortInterest.shortInterestRatio,
					days_to_cover: shortInterest.daysToCover,
					short_pct_float: shortInterest.shortPctFloat,
					short_interest_change: shortInterest.shortInterestChange,
				}
			: createEmptyShortInterestIndicators();

		const sentimentData = sentiment
			? {
					sentiment_score: sentiment.sentimentScore,
					sentiment_strength: sentiment.sentimentStrength,
					news_volume: sentiment.newsVolume,
					sentiment_momentum: sentiment.sentimentMomentum,
					event_risk_flag: sentiment.eventRiskFlag,
					news_sentiment: sentiment.newsSentiment,
					social_sentiment: sentiment.socialSentiment,
					analyst_sentiment: sentiment.analystSentiment,
				}
			: createEmptySentimentIndicators();

		// Corporate actions - calculate from recent actions
		const recentAction = corporateActions?.[0];
		const corporate = recentAction
			? {
					trailing_dividend_yield: recentAction.amount ? recentAction.amount : null,
					days_to_ex_dividend: recentAction.exDate
						? Math.max(
								0,
								Math.floor(
									(new Date(recentAction.exDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
								)
							)
						: null,
					dividend_growth: null,
					pending_split:
						recentAction.actionType === "split" || recentAction.actionType === "reverse_split",
				}
			: createEmptyCorporateIndicators();

		const market = fundamentals
			? {
					market_cap: fundamentals.marketCap,
					sector: fundamentals.sector,
					industry: fundamentals.industry,
				}
			: createEmptyMarketContext();

		const metadata = {
			symbol: upperSymbol,
			timestamp: new Date().toISOString(),
			data_quality: determineDataQuality(!!fundamentals, !!shortInterest, !!sentiment),
			last_fundamentals_update: fundamentals?.computedAt ?? null,
			last_short_interest_update: shortInterest?.fetchedAt ?? null,
			last_sentiment_update: sentiment?.computedAt ?? null,
			last_corporate_actions_update: recentAction?.createdAt ?? null,
		};

		return c.json(
			{
				value,
				quality,
				short_interest: shortInterestData,
				sentiment: sentimentData,
				corporate,
				market,
				metadata,
			},
			200
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Failed to fetch indicator snapshot for ${upperSymbol}: ${message}`,
		});
	}
});

// POST /api/snapshots/batch - Get indicator snapshots for multiple symbols
const batchSnapshotsRoute = createRoute({
	method: "post",
	path: "/batch",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({
						symbols: z.array(z.string()).min(1).max(100),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: BatchSnapshotsResponseSchema,
				},
			},
			description: "Batch indicator snapshots",
		},
		503: {
			content: {
				"application/json": {
					schema: z.object({
						error: z.string(),
					}),
				},
			},
			description: "Database service unavailable",
		},
	},
	tags: ["Snapshots"],
});

app.openapi(batchSnapshotsRoute, async (c) => {
	const { symbols } = c.req.valid("json");
	const startTime = Date.now();
	const upperSymbols = symbols.map((s) => s.toUpperCase());

	try {
		const db = await getDbClient();
		const fundamentalsRepo = new FundamentalsRepository(db);
		const shortInterestRepo = new ShortInterestRepository(db);
		const sentimentRepo = new SentimentRepository(db);
		const corporateActionsRepo = new CorporateActionsRepository(db);

		const snapshots: Record<string, z.infer<typeof BatchIndicatorSnapshotSchema>> = {};
		const errors: Record<string, string> = {};
		let successCount = 0;

		// Process each symbol
		await Promise.all(
			upperSymbols.map(async (symbol) => {
				try {
					const [fundamentalsList, shortInterest, sentiment, corporateActions] = await Promise.all([
						fundamentalsRepo.findBySymbol(symbol),
						shortInterestRepo.findLatestBySymbol(symbol),
						sentimentRepo.findLatestBySymbol(symbol),
						corporateActionsRepo.getForSymbol(symbol),
					]);
					const fundamentals = fundamentalsList?.[0] ?? null;

					const value = fundamentals
						? {
								pe_ratio_ttm: fundamentals.peRatioTtm,
								pe_ratio_forward: fundamentals.peRatioForward,
								pb_ratio: fundamentals.pbRatio,
								ev_ebitda: fundamentals.evEbitda,
								earnings_yield: fundamentals.earningsYield,
								dividend_yield: fundamentals.dividendYield,
								cape_10yr: fundamentals.cape10yr,
							}
						: createEmptyValueIndicators();

					const quality = fundamentals
						? {
								gross_profitability: fundamentals.grossProfitability,
								roe: fundamentals.roe,
								roa: fundamentals.roa,
								asset_growth: fundamentals.assetGrowth,
								accruals_ratio: fundamentals.accrualsRatio,
								cash_flow_quality: fundamentals.cashFlowQuality,
								beneish_m_score: fundamentals.beneishMScore,
							}
						: createEmptyQualityIndicators();

					const shortInterestData = shortInterest
						? {
								short_interest: shortInterest.shortInterest,
								short_interest_ratio: shortInterest.shortInterestRatio,
								days_to_cover: shortInterest.daysToCover,
								short_pct_float: shortInterest.shortPctFloat,
								short_interest_change: shortInterest.shortInterestChange,
							}
						: createEmptyShortInterestIndicators();

					const sentimentData = sentiment
						? {
								sentiment_score: sentiment.sentimentScore,
								sentiment_strength: sentiment.sentimentStrength,
								news_volume: sentiment.newsVolume,
								sentiment_momentum: sentiment.sentimentMomentum,
								event_risk_flag: sentiment.eventRiskFlag,
								news_sentiment: sentiment.newsSentiment,
								social_sentiment: sentiment.socialSentiment,
								analyst_sentiment: sentiment.analystSentiment,
							}
						: createEmptySentimentIndicators();

					const recentAction = corporateActions?.[0];
					const corporate = recentAction
						? {
								trailing_dividend_yield: recentAction.amount ? recentAction.amount : null,
								days_to_ex_dividend: recentAction.exDate
									? Math.max(
											0,
											Math.floor(
												(new Date(recentAction.exDate).getTime() - Date.now()) /
													(24 * 60 * 60 * 1000)
											)
										)
									: null,
								dividend_growth: null,
								pending_split:
									recentAction.actionType === "split" ||
									recentAction.actionType === "reverse_split",
							}
						: createEmptyCorporateIndicators();

					const market = fundamentals
						? {
								market_cap: fundamentals.marketCap,
								sector: fundamentals.sector,
								industry: fundamentals.industry,
							}
						: createEmptyMarketContext();

					const metadata = {
						symbol,
						timestamp: new Date().toISOString(),
						data_quality: determineDataQuality(!!fundamentals, !!shortInterest, !!sentiment),
						last_fundamentals_update: fundamentals?.computedAt ?? null,
						last_short_interest_update: shortInterest?.fetchedAt ?? null,
						last_sentiment_update: sentiment?.computedAt ?? null,
						last_corporate_actions_update: recentAction?.createdAt ?? null,
					};

					snapshots[symbol] = {
						value,
						quality,
						short_interest: shortInterestData,
						sentiment: sentimentData,
						corporate,
						market,
						metadata,
					};
					successCount++;
				} catch (error) {
					const message = error instanceof Error ? error.message : "Unknown error";
					errors[symbol] = message;
				}
			})
		);

		const executionTimeMs = Date.now() - startTime;

		return c.json(
			{
				snapshots,
				errors: Object.keys(errors).length > 0 ? errors : undefined,
				metadata: {
					total: upperSymbols.length,
					successful: successCount,
					failed: upperSymbols.length - successCount,
					execution_time_ms: executionTimeMs,
				},
			},
			200
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Failed to fetch batch snapshots: ${message}`,
		});
	}
});

export default app;
