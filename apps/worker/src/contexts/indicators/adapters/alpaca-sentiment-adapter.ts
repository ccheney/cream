/**
 * Alpaca Sentiment Adapter
 *
 * Sentiment data provider using Alpaca news API.
 */

import type { ExtractedSentiment, SentimentDataProvider } from "@cream/indicators";
import { log } from "../../../shared/logger.js";

const ALPACA_NEWS_URL = "https://data.alpaca.markets/v1beta1/news";

const POSITIVE_WORDS = [
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

const NEGATIVE_WORDS = [
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

interface AlpacaNewsItem {
	id: number;
	headline: string;
	summary?: string;
	created_at: string;
	symbols: string[];
	source: string;
}

export class AlpacaSentimentAdapter implements SentimentDataProvider {
	private readonly apiKey: string;
	private readonly apiSecret: string;

	constructor(apiKey: string, apiSecret: string) {
		this.apiKey = apiKey;
		this.apiSecret = apiSecret;
	}

	private toRfc3339(dateValue: string, endOfDay: boolean): string {
		if (dateValue.includes("T")) {
			return dateValue;
		}

		return endOfDay ? `${dateValue}T23:59:59Z` : `${dateValue}T00:00:00Z`;
	}

	private buildNewsUrl(symbols: string[], startDate: string, endDate: string): string {
		const url = new URL(ALPACA_NEWS_URL);
		url.searchParams.set("symbols", symbols.join(","));
		url.searchParams.set("start", this.toRfc3339(startDate, false));
		url.searchParams.set("end", this.toRfc3339(endDate, true));
		url.searchParams.set("limit", "50");
		return url.toString();
	}

	private analyzeSentiment(text: string): {
		sentiment: "bullish" | "bearish" | "neutral";
		confidence: number;
	} {
		const normalized = text.toLowerCase();
		const positiveCount = POSITIVE_WORDS.filter((word) => normalized.includes(word)).length;
		const negativeCount = NEGATIVE_WORDS.filter((word) => normalized.includes(word)).length;

		if (positiveCount > negativeCount) {
			return {
				sentiment: "bullish",
				confidence: Math.min(0.9, 0.5 + positiveCount * 0.1),
			};
		}

		if (negativeCount > positiveCount) {
			return {
				sentiment: "bearish",
				confidence: Math.min(0.9, 0.5 + negativeCount * 0.1),
			};
		}

		return { sentiment: "neutral", confidence: 0.5 };
	}

	private parseNewsResponse(data: unknown): AlpacaNewsItem[] {
		const typed = data as { news?: AlpacaNewsItem[] };
		return typed.news ?? [];
	}

	private toSentimentEntries(
		item: AlpacaNewsItem,
		targetSymbols: Set<string>,
	): ExtractedSentiment[] {
		const analysis = this.analyzeSentiment(`${item.headline} ${item.summary ?? ""}`);
		const eventTime = new Date(item.created_at);
		const entries: ExtractedSentiment[] = [];

		for (const symbol of item.symbols) {
			if (!targetSymbols.has(symbol)) {
				continue;
			}

			entries.push({
				symbol,
				sourceType: "news",
				sentiment: analysis.sentiment,
				confidence: analysis.confidence,
				eventTime,
			});
		}

		return entries;
	}

	async getSentimentData(
		symbols: string[],
		startDate: string,
		endDate: string,
	): Promise<ExtractedSentiment[]> {
		const results: ExtractedSentiment[] = [];
		const targetSymbols = new Set(symbols);

		try {
			const response = await fetch(this.buildNewsUrl(symbols, startDate, endDate), {
				headers: {
					"APCA-API-KEY-ID": this.apiKey,
					"APCA-API-SECRET-KEY": this.apiSecret,
				},
			});

			if (!response.ok) {
				log.warn({ status: response.status }, "Alpaca news API returned non-OK status");
				return results;
			}

			const news = this.parseNewsResponse(await response.json());
			for (const item of news) {
				results.push(...this.toSentimentEntries(item, targetSymbols));
			}
		} catch (error) {
			log.warn(
				{ error: error instanceof Error ? error.message : String(error) },
				"Failed to fetch sentiment data from Alpaca",
			);
		}

		return results;
	}

	async getHistoricalSentiment(
		_symbol: string,
		_lookbackDays: number,
	): Promise<Array<{ date: string; score: number }>> {
		return [];
	}
}

export function createSentimentProviderFromEnv(): AlpacaSentimentAdapter {
	const apiKey = Bun.env.ALPACA_KEY;
	const apiSecret = Bun.env.ALPACA_SECRET;
	if (!apiKey || !apiSecret) {
		throw new Error(
			"ALPACA_KEY and ALPACA_SECRET environment variables are required for sentiment provider",
		);
	}
	return new AlpacaSentimentAdapter(apiKey, apiSecret);
}
