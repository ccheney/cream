import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
	getCorporateActionsRepo,
	getFundamentalsRepo,
	getSentimentRepo,
	getShortInterestRepo,
} from "../db.js";

const app = new OpenAPIHono();

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

type DataQuality = z.infer<typeof DataQualitySchema>;
type BatchSnapshot = z.infer<typeof BatchIndicatorSnapshotSchema>;

const EMPTY_VALUE: z.infer<typeof ValueIndicatorsSchema> = {
	pe_ratio_ttm: null,
	pe_ratio_forward: null,
	pb_ratio: null,
	ev_ebitda: null,
	earnings_yield: null,
	dividend_yield: null,
	cape_10yr: null,
};

const EMPTY_QUALITY: z.infer<typeof QualityIndicatorsSchema> = {
	gross_profitability: null,
	roe: null,
	roa: null,
	asset_growth: null,
	accruals_ratio: null,
	cash_flow_quality: null,
	beneish_m_score: null,
};

const EMPTY_SHORT_INTEREST: z.infer<typeof ShortInterestIndicatorsSchema> = {
	short_interest: null,
	short_interest_ratio: null,
	days_to_cover: null,
	short_pct_float: null,
	short_interest_change: null,
};

const EMPTY_SENTIMENT: z.infer<typeof SentimentIndicatorsSchema> = {
	sentiment_score: null,
	sentiment_strength: null,
	news_volume: null,
	sentiment_momentum: null,
	event_risk_flag: null,
	news_sentiment: null,
	social_sentiment: null,
	analyst_sentiment: null,
};

const EMPTY_CORPORATE: z.infer<typeof CorporateIndicatorsSchema> = {
	trailing_dividend_yield: null,
	days_to_ex_dividend: null,
	dividend_growth: null,
	pending_split: null,
};

const EMPTY_MARKET: z.infer<typeof MarketContextSchema> = {
	market_cap: null,
	sector: null,
	industry: null,
};

function nullableNumber(value: unknown): number | null {
	return typeof value === "number" ? value : null;
}

function nullableString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
	return typeof value === "boolean" ? value : null;
}

function determineDataQuality(
	hasFundamentals: boolean,
	hasShortInterest: boolean,
	hasSentiment: boolean,
): DataQuality {
	const count = [hasFundamentals, hasShortInterest, hasSentiment].filter(Boolean).length;
	if (count >= 2) {
		return "COMPLETE";
	}
	if (count >= 1) {
		return "PARTIAL";
	}
	return "STALE";
}

function mapFundamentals(fundamentals: Record<string, unknown> | null) {
	if (!fundamentals) return { value: EMPTY_VALUE, quality: EMPTY_QUALITY, market: EMPTY_MARKET };
	const f = fundamentals;
	return {
		value: {
			pe_ratio_ttm: nullableNumber(f.peRatioTtm),
			pe_ratio_forward: nullableNumber(f.peRatioForward),
			pb_ratio: nullableNumber(f.pbRatio),
			ev_ebitda: nullableNumber(f.evEbitda),
			earnings_yield: nullableNumber(f.earningsYield),
			dividend_yield: nullableNumber(f.dividendYield),
			cape_10yr: nullableNumber(f.cape10yr),
		},
		quality: {
			gross_profitability: nullableNumber(f.grossProfitability),
			roe: nullableNumber(f.roe),
			roa: nullableNumber(f.roa),
			asset_growth: nullableNumber(f.assetGrowth),
			accruals_ratio: nullableNumber(f.accrualsRatio),
			cash_flow_quality: nullableNumber(f.cashFlowQuality),
			beneish_m_score: nullableNumber(f.beneishMScore),
		},
		market: {
			market_cap: nullableNumber(f.marketCap),
			sector: nullableString(f.sector),
			industry: nullableString(f.industry),
		},
	};
}

function mapShortInterest(shortInterest: Record<string, unknown> | null) {
	if (!shortInterest) {
		return EMPTY_SHORT_INTEREST;
	}
	return {
		short_interest: nullableNumber(shortInterest.shortInterest),
		short_interest_ratio: nullableNumber(shortInterest.shortInterestRatio),
		days_to_cover: nullableNumber(shortInterest.daysToCover),
		short_pct_float: nullableNumber(shortInterest.shortPctFloat),
		short_interest_change: nullableNumber(shortInterest.shortInterestChange),
	};
}

function mapSentiment(sentiment: Record<string, unknown> | null) {
	if (!sentiment) {
		return EMPTY_SENTIMENT;
	}
	return {
		sentiment_score: nullableNumber(sentiment.sentimentScore),
		sentiment_strength: nullableNumber(sentiment.sentimentStrength),
		news_volume: nullableNumber(sentiment.newsVolume),
		sentiment_momentum: nullableNumber(sentiment.sentimentMomentum),
		event_risk_flag: nullableBoolean(sentiment.eventRiskFlag),
		news_sentiment: nullableNumber(sentiment.newsSentiment),
		social_sentiment: nullableNumber(sentiment.socialSentiment),
		analyst_sentiment: nullableNumber(sentiment.analystSentiment),
	};
}

function mapCorporate(corporateActions: Record<string, unknown>[]) {
	const recentAction = corporateActions[0];
	if (!recentAction) {
		return { corporate: EMPTY_CORPORATE, recentAction: null };
	}
	const exDate = recentAction.exDate as string | undefined;
	const daysToExDividend = exDate
		? Math.max(0, Math.floor((new Date(exDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
		: null;
	return {
		corporate: {
			trailing_dividend_yield: nullableNumber(recentAction.amount),
			days_to_ex_dividend: daysToExDividend,
			dividend_growth: null,
			pending_split:
				recentAction.actionType === "split" || recentAction.actionType === "reverse_split",
		},
		recentAction,
	};
}

function buildSnapshot(
	symbol: string,
	fundamentals: Record<string, unknown> | null,
	shortInterest: Record<string, unknown> | null,
	sentiment: Record<string, unknown> | null,
	corporateActions: Record<string, unknown>[],
): BatchSnapshot {
	const fundamentalsMapped = mapFundamentals(fundamentals);
	const corporateMapped = mapCorporate(corporateActions);
	return {
		value: fundamentalsMapped.value,
		quality: fundamentalsMapped.quality,
		short_interest: mapShortInterest(shortInterest),
		sentiment: mapSentiment(sentiment),
		corporate: corporateMapped.corporate,
		market: fundamentalsMapped.market,
		metadata: {
			symbol,
			timestamp: new Date().toISOString(),
			data_quality: determineDataQuality(!!fundamentals, !!shortInterest, !!sentiment),
			last_fundamentals_update: nullableString(fundamentals?.computedAt),
			last_short_interest_update: nullableString(shortInterest?.fetchedAt),
			last_sentiment_update: nullableString(sentiment?.computedAt),
			last_corporate_actions_update: nullableString(corporateMapped.recentAction?.createdAt),
		},
	};
}

async function getSnapshotForSymbol(symbol: string): Promise<BatchSnapshot> {
	const [fundamentalsList, shortInterest, sentiment, corporateActions] = await Promise.all([
		getFundamentalsRepo().findBySymbol(symbol),
		getShortInterestRepo().findLatestBySymbol(symbol),
		getSentimentRepo().findLatestBySymbol(symbol),
		getCorporateActionsRepo().getForSymbol(symbol),
	]);
	return buildSnapshot(
		symbol,
		(fundamentalsList?.[0] as Record<string, unknown> | undefined) ?? null,
		(shortInterest as Record<string, unknown> | null) ?? null,
		(sentiment as Record<string, unknown> | null) ?? null,
		(corporateActions as Record<string, unknown>[] | undefined) ?? [],
	);
}

const getSnapshotRoute = createRoute({
	method: "get",
	path: "/:symbol",
	request: { params: z.object({ symbol: z.string() }) },
	responses: {
		200: {
			content: { "application/json": { schema: BatchIndicatorSnapshotSchema } },
			description: "Indicator snapshot for symbol",
		},
		503: {
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
			description: "Database service unavailable",
		},
	},
	tags: ["Snapshots"],
});

app.openapi(getSnapshotRoute, async (c) => {
	const { symbol } = c.req.valid("param");
	const upperSymbol = symbol.toUpperCase();
	try {
		return c.json(await getSnapshotForSymbol(upperSymbol), 200);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Failed to fetch indicator snapshot for ${upperSymbol}: ${message}`,
		});
	}
});

const batchSnapshotsRoute = createRoute({
	method: "post",
	path: "/batch",
	request: {
		body: {
			content: {
				"application/json": {
					schema: z.object({ symbols: z.array(z.string()).min(1).max(100) }),
				},
			},
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: BatchSnapshotsResponseSchema } },
			description: "Batch indicator snapshots",
		},
		503: {
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
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
		const results = await Promise.all(
			upperSymbols.map(async (symbol) => {
				try {
					return {
						symbol,
						snapshot: await getSnapshotForSymbol(symbol),
						error: null as string | null,
					};
				} catch (error) {
					const message = error instanceof Error ? error.message : "Unknown error";
					return { symbol, snapshot: null as BatchSnapshot | null, error: message };
				}
			}),
		);
		const snapshots: Record<string, BatchSnapshot> = {};
		const errors: Record<string, string> = {};
		for (const result of results) {
			if (result.snapshot) {
				snapshots[result.symbol] = result.snapshot;
			} else if (result.error) {
				errors[result.symbol] = result.error;
			}
		}
		const successful = Object.keys(snapshots).length;
		return c.json(
			{
				snapshots,
				errors: Object.keys(errors).length > 0 ? errors : undefined,
				metadata: {
					total: upperSymbols.length,
					successful,
					failed: upperSymbols.length - successful,
					execution_time_ms: Date.now() - startTime,
				},
			},
			200,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, { message: `Failed to fetch batch snapshots: ${message}` });
	}
});

export default app;
