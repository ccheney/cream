/**
 * Alpaca Sentiment Adapter
 *
 * Sentiment data provider using Alpaca news API.
 */

import type { ExtractedSentiment, SentimentDataProvider } from "@cream/indicators";
import { log } from "../../../shared/logger.js";

const ALPACA_NEWS_URL = "https://data.alpaca.markets/v1beta1/news";

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
			// Convert date strings to RFC3339 timestamps (Alpaca requires full timestamps)
			const startTimestamp = startDate.includes("T") ? startDate : `${startDate}T00:00:00Z`;
			const endTimestamp = endDate.includes("T") ? endDate : `${endDate}T23:59:59Z`;

			const url = new URL(ALPACA_NEWS_URL);
			url.searchParams.set("symbols", symbols.join(","));
			url.searchParams.set("start", startTimestamp);
			url.searchParams.set("end", endTimestamp);
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

export function createSentimentProviderFromEnv(): AlpacaSentimentAdapter {
	const apiKey = Bun.env.ALPACA_KEY;
	const apiSecret = Bun.env.ALPACA_SECRET;
	if (!apiKey || !apiSecret) {
		throw new Error(
			"ALPACA_KEY and ALPACA_SECRET environment variables are required for sentiment provider"
		);
	}
	return new AlpacaSentimentAdapter(apiKey, apiSecret);
}
