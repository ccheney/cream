/**
 * Alpaca Portfolio History Client
 *
 * Wraps Alpaca's portfolio history API endpoint for fetching equity curves.
 */

import type { TradingEnvironment } from "./types.js";

export type PortfolioHistoryPeriod = "1D" | "1W" | "1M" | "3M" | "6M" | "1A" | "all";

export type PortfolioHistoryTimeframe = "1Min" | "5Min" | "15Min" | "1H" | "1D";

export interface PortfolioHistoryOptions {
	period: PortfolioHistoryPeriod;
	timeframe?: PortfolioHistoryTimeframe;
	dateStart?: string;
	dateEnd?: string;
	extendedHours?: boolean;
}

export interface PortfolioHistory {
	timestamp: number[];
	equity: number[];
	profitLoss: number[];
	profitLossPct: number[];
	timeframe: PortfolioHistoryTimeframe;
	baseValue: number;
}

interface AlpacaPortfolioHistoryResponse {
	timestamp: number[];
	equity: number[];
	profit_loss: number[];
	profit_loss_pct: number[];
	timeframe: string;
	base_value: number;
}

export interface PortfolioHistoryClientConfig {
	apiKey: string;
	apiSecret: string;
	environment: TradingEnvironment;
}

export class PortfolioHistoryError extends Error {
	constructor(
		message: string,
		public readonly statusCode?: number,
		public override readonly cause?: Error,
	) {
		super(message);
		this.name = "PortfolioHistoryError";
	}
}

export async function getPortfolioHistory(
	config: PortfolioHistoryClientConfig,
	options: PortfolioHistoryOptions,
): Promise<PortfolioHistory> {
	const baseUrl =
		config.environment === "LIVE"
			? "https://api.alpaca.markets"
			: "https://paper-api.alpaca.markets";

	const params = new URLSearchParams();
	params.set("period", options.period);

	if (options.timeframe) {
		params.set("timeframe", options.timeframe);
	}
	if (options.dateStart) {
		params.set("date_start", options.dateStart);
	}
	if (options.dateEnd) {
		params.set("date_end", options.dateEnd);
	}
	if (options.extendedHours !== undefined) {
		params.set("extended_hours", String(options.extendedHours));
	}

	const url = `${baseUrl}/v2/account/portfolio/history?${params.toString()}`;

	const response = await fetch(url, {
		headers: {
			"APCA-API-KEY-ID": config.apiKey,
			"APCA-API-SECRET-KEY": config.apiSecret,
		},
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new PortfolioHistoryError(
			`Failed to fetch portfolio history: ${response.status} ${errorText}`,
			response.status,
		);
	}

	const data = (await response.json()) as AlpacaPortfolioHistoryResponse;

	return {
		timestamp: data.timestamp ?? [],
		equity: data.equity ?? [],
		profitLoss: data.profit_loss ?? [],
		profitLossPct: data.profit_loss_pct ?? [],
		timeframe: (options.timeframe ?? "1D") as PortfolioHistoryTimeframe,
		baseValue: data.base_value ?? 0,
	};
}
