/**
 * Indicator Batch Job Adapters
 *
 * Bridges between external data provider clients and the batch job interfaces.
 * These adapters implement the interfaces expected by @cream/indicators batch jobs.
 *
 * @see packages/indicators/src/batch
 */

import type {
	AlpacaCorporateAction,
	AlpacaCorporateActionsClient,
	ExtractedSentiment,
	FINRAClient,
	FINRAQueryRequest,
	FINRAShortInterestRecord,
	SentimentDataProvider,
} from "@cream/indicators";
import { z } from "zod";
import { log } from "../logger";

// ============================================
// FINRA Client Adapter
// ============================================

const FINRA_API_URL = "https://api.finra.org/data/group/otcMarket/name/shortInterest";

/**
 * FINRA API adapter implementing FINRAClient interface.
 * Fetches short interest data from FINRA's public API.
 */
export class FINRAClientAdapter implements FINRAClient {
	async queryShortInterest(request?: FINRAQueryRequest): Promise<FINRAShortInterestRecord[]> {
		const response = await fetch(FINRA_API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				fields: [
					"symbolCode",
					"issueName",
					"marketClassCode",
					"settlementDate",
					"currentShortPositionQuantity",
					"previousShortPositionQuantity",
					"changePreviousNumber",
					"changePercent",
					"averageDailyVolumeQuantity",
					"daysToCoverQuantity",
					"stockSplitFlag",
					"revisionFlag",
				],
				compareFilters: request?.compareFilters?.map((f) => ({
					fieldName: f.fieldName,
					compareType: f.compareType,
					fieldValue: f.fieldValue,
				})),
				orFilters: request?.orFilters,
				limit: request?.limit ?? 100,
				offset: request?.offset ?? 0,
			}),
		});

		if (!response.ok) {
			throw new Error(`FINRA API error: ${response.status} ${response.statusText}`);
		}

		const data = (await response.json()) as Array<{
			symbolCode?: string;
			issueName?: string;
			marketClassCode?: string;
			settlementDate?: string;
			currentShortPositionQuantity?: number;
			previousShortPositionQuantity?: number;
			changePreviousNumber?: number;
			changePercent?: number;
			averageDailyVolumeQuantity?: number;
			daysToCoverQuantity?: number;
			stockSplitFlag?: string;
			revisionFlag?: string;
		}>;

		return data.map((record) => ({
			symbolCode: record.symbolCode ?? "",
			issueName: record.issueName ?? "",
			marketClassCode: record.marketClassCode ?? "",
			settlementDate: record.settlementDate ?? "",
			currentShortPositionQuantity: record.currentShortPositionQuantity ?? 0,
			previousShortPositionQuantity: record.previousShortPositionQuantity ?? null,
			changePreviousNumber: record.changePreviousNumber ?? null,
			changePercent: record.changePercent ?? null,
			averageDailyVolumeQuantity: record.averageDailyVolumeQuantity ?? null,
			daysToCoverQuantity: record.daysToCoverQuantity ?? null,
			stockSplitFlag: record.stockSplitFlag ?? null,
			revisionFlag: record.revisionFlag ?? null,
		}));
	}

	async getShortInterestBySymbols(
		symbols: string[],
		settlementDate?: string
	): Promise<FINRAShortInterestRecord[]> {
		const filters: FINRAQueryRequest["compareFilters"] = [
			{
				fieldName: "symbolCode",
				compareType: "IN",
				fieldValue: symbols,
			},
		];

		if (settlementDate) {
			filters.push({
				fieldName: "settlementDate",
				compareType: "EQUAL",
				fieldValue: settlementDate,
			});
		}

		return this.queryShortInterest({
			compareFilters: filters,
			limit: symbols.length * 2,
		});
	}

	async getLatestSettlementDate(): Promise<string> {
		const records = await this.queryShortInterest({ limit: 1 });
		if (records.length === 0) {
			throw new Error("No short interest records found to determine latest settlement date");
		}
		return records[0]?.settlementDate ?? "";
	}
}

// ============================================
// Sentiment Data Provider Adapter (Alpaca)
// ============================================

const ALPACA_NEWS_URL = "https://data.alpaca.markets/v1beta1/news";

/**
 * Sentiment data provider using Alpaca news API.
 */
export class AlpacaSentimentAdapter implements SentimentDataProvider {
	private readonly apiKey: string;
	private readonly apiSecret: string;

	constructor(apiKey: string, apiSecret: string) {
		this.apiKey = apiKey;
		this.apiSecret = apiSecret;
	}

	async getSentimentData(
		symbols: string[],
		startDate: string,
		endDate: string
	): Promise<ExtractedSentiment[]> {
		const results: ExtractedSentiment[] = [];

		try {
			const url = new URL(ALPACA_NEWS_URL);
			url.searchParams.set("symbols", symbols.join(","));
			url.searchParams.set("start", startDate);
			url.searchParams.set("end", endDate);
			url.searchParams.set("limit", "50");

			const response = await fetch(url.toString(), {
				headers: {
					"APCA-API-KEY-ID": this.apiKey,
					"APCA-API-SECRET-KEY": this.apiSecret,
				},
			});

			if (!response.ok) {
				log.warn({ status: response.status }, "Alpaca news API returned non-OK status");
				return results;
			}

			const data = (await response.json()) as {
				news?: Array<{
					id: number;
					headline: string;
					summary?: string;
					created_at: string;
					symbols: string[];
					source: string;
				}>;
			};

			for (const item of data.news ?? []) {
				const text = `${item.headline} ${item.summary ?? ""}`.toLowerCase();
				let sentiment: "bullish" | "bearish" | "neutral" = "neutral";
				let confidence = 0.5;

				const positiveWords = [
					"beat",
					"upgrade",
					"growth",
					"profit",
					"gain",
					"bullish",
					"buy",
					"surge",
					"rally",
				];
				const negativeWords = [
					"miss",
					"downgrade",
					"loss",
					"decline",
					"bearish",
					"sell",
					"warning",
					"plunge",
					"crash",
				];

				const positiveCount = positiveWords.filter((w) => text.includes(w)).length;
				const negativeCount = negativeWords.filter((w) => text.includes(w)).length;

				if (positiveCount > negativeCount) {
					sentiment = "bullish";
					confidence = Math.min(0.9, 0.5 + positiveCount * 0.1);
				} else if (negativeCount > positiveCount) {
					sentiment = "bearish";
					confidence = Math.min(0.9, 0.5 + negativeCount * 0.1);
				}

				for (const symbol of item.symbols) {
					if (symbols.includes(symbol)) {
						results.push({
							symbol,
							sourceType: "news",
							sentiment,
							confidence,
							eventTime: new Date(item.created_at),
						});
					}
				}
			}
		} catch (error) {
			log.warn(
				{ error: error instanceof Error ? error.message : String(error) },
				"Failed to fetch sentiment data from Alpaca"
			);
		}

		return results;
	}

	async getHistoricalSentiment(
		_symbol: string,
		_lookbackDays: number
	): Promise<Array<{ date: string; score: number }>> {
		return [];
	}
}

// ============================================
// Alpaca Corporate Actions Adapter
// ============================================

const ALPACA_CORPORATE_ACTIONS_URL = "https://data.alpaca.markets/v1beta1/corporate-actions";

const AlpacaCorporateActionsResponseSchema = z.object({
	corporate_actions: z.record(
		z.string(),
		z.array(
			z.object({
				corporate_action_type: z.string(),
				symbol: z.string(),
				ex_date: z.string(),
				record_date: z.string().nullable(),
				payment_date: z.string().nullable(),
				cash: z.number().optional(),
				new_rate: z.number().optional(),
				old_rate: z.number().optional(),
				description: z.string().optional(),
			})
		)
	),
});

/**
 * Alpaca Markets corporate actions API adapter.
 */
export class AlpacaCorporateActionsAdapter implements AlpacaCorporateActionsClient {
	private readonly apiKey: string;
	private readonly apiSecret: string;

	constructor(apiKey: string, apiSecret: string) {
		this.apiKey = apiKey;
		this.apiSecret = apiSecret;
	}

	async getCorporateActions(params: {
		symbol?: string;
		startDate?: string;
		endDate?: string;
		limit?: number;
	}): Promise<AlpacaCorporateAction[]> {
		const url = new URL(ALPACA_CORPORATE_ACTIONS_URL);
		if (params.symbol) {
			url.searchParams.set("symbols", params.symbol);
		}
		if (params.startDate) {
			url.searchParams.set("start", params.startDate);
		}
		if (params.endDate) {
			url.searchParams.set("end", params.endDate);
		}
		if (params.limit) {
			url.searchParams.set("limit", params.limit.toString());
		}

		const response = await fetch(url.toString(), {
			headers: {
				"APCA-API-KEY-ID": this.apiKey,
				"APCA-API-SECRET-KEY": this.apiSecret,
			},
		});

		if (!response.ok) {
			throw new Error(`Alpaca API error: ${response.status} ${response.statusText}`);
		}

		const data = AlpacaCorporateActionsResponseSchema.parse(await response.json());
		return this.flattenCorporateActions(data.corporate_actions);
	}

	async getCorporateActionsForSymbols(
		symbols: string[],
		startDate: string,
		endDate: string
	): Promise<AlpacaCorporateAction[]> {
		const url = new URL(ALPACA_CORPORATE_ACTIONS_URL);
		url.searchParams.set("symbols", symbols.join(","));
		url.searchParams.set("start", startDate);
		url.searchParams.set("end", endDate);

		const response = await fetch(url.toString(), {
			headers: {
				"APCA-API-KEY-ID": this.apiKey,
				"APCA-API-SECRET-KEY": this.apiSecret,
			},
		});

		if (!response.ok) {
			throw new Error(`Alpaca API error: ${response.status} ${response.statusText}`);
		}

		const data = AlpacaCorporateActionsResponseSchema.parse(await response.json());
		return this.flattenCorporateActions(data.corporate_actions);
	}

	private flattenCorporateActions(
		actions: z.infer<typeof AlpacaCorporateActionsResponseSchema>["corporate_actions"]
	): AlpacaCorporateAction[] {
		const results: AlpacaCorporateAction[] = [];

		for (const [_type, items] of Object.entries(actions)) {
			for (const item of items) {
				let actionType: AlpacaCorporateAction["corporate_action_type"];
				switch (item.corporate_action_type.toLowerCase()) {
					case "dividend":
					case "cash_dividend":
						actionType = "Dividend";
						break;
					case "special_dividend":
						actionType = "SpecialDividend";
						break;
					case "stock_split":
					case "forward_split":
						actionType = "Split";
						break;
					case "reverse_split":
						actionType = "ReverseSplit";
						break;
					case "spinoff":
					case "spin_off":
						actionType = "Spinoff";
						break;
					case "merger":
						actionType = "Merger";
						break;
					case "acquisition":
						actionType = "Acquisition";
						break;
					case "name_change":
					case "symbol_change":
						actionType = "NameChange";
						break;
					default:
						actionType = "Dividend";
				}

				let value = 0;
				if (item.cash !== undefined) {
					value = item.cash;
				} else if (item.new_rate !== undefined && item.old_rate !== undefined) {
					value = item.old_rate !== 0 ? item.new_rate / item.old_rate : 1;
				}

				results.push({
					corporate_action_type: actionType,
					symbol: item.symbol,
					ex_date: item.ex_date,
					record_date: item.record_date,
					payment_date: item.payment_date,
					value,
					description: item.description,
				});
			}
		}

		return results;
	}
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create FINRA client adapter.
 */
export function createFINRAClient(): FINRAClientAdapter {
	return new FINRAClientAdapter();
}

/**
 * Create sentiment data provider using Alpaca.
 */
export function createSentimentProviderFromEnv(): AlpacaSentimentAdapter {
	const apiKey = process.env.ALPACA_KEY ?? Bun.env.ALPACA_KEY;
	const apiSecret = process.env.ALPACA_SECRET ?? Bun.env.ALPACA_SECRET;
	if (!apiKey || !apiSecret) {
		throw new Error(
			"ALPACA_KEY and ALPACA_SECRET environment variables are required for sentiment provider"
		);
	}
	return new AlpacaSentimentAdapter(apiKey, apiSecret);
}

/**
 * Create Alpaca corporate actions adapter from environment.
 */
export function createAlpacaCorporateActionsFromEnv(): AlpacaCorporateActionsAdapter {
	const apiKey = process.env.ALPACA_KEY ?? Bun.env.ALPACA_KEY;
	const apiSecret = process.env.ALPACA_SECRET ?? Bun.env.ALPACA_SECRET;
	if (!apiKey || !apiSecret) {
		throw new Error(
			"ALPACA_KEY and ALPACA_SECRET environment variables are required for corporate actions batch job"
		);
	}
	return new AlpacaCorporateActionsAdapter(apiKey, apiSecret);
}
