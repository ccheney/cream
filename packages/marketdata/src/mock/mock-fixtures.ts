// Local types for fixture data (matches legacy format in fixtures)
export interface FixtureAggregateBar {
	o: number;
	h: number;
	l: number;
	c: number;
	v: number;
	vw?: number;
	t: number;
	n?: number;
}

export interface FixtureAggregatesResponse {
	ticker: string;
	queryCount: number;
	resultsCount: number;
	adjusted: boolean;
	status: string;
	results: FixtureAggregateBar[];
}

export interface FixtureSnapshot {
	ticker: string;
	day?: {
		o: number;
		h: number;
		l: number;
		c: number;
		v: number;
		vw?: number;
	};
	lastQuote?: {
		P: number;
		S: number;
		p: number;
		s: number;
		t: number;
	};
	lastTrade?: {
		p: number;
		s: number;
		t: number;
	};
	todaysChange?: number;
	todaysChangePerc?: number;
	updated: number;
}

import alpacaAccount from "../../fixtures/alpaca/account.json";
import candlesAAPL from "../../fixtures/alpaca/candles-1h-AAPL.json";
import alpacaOrders from "../../fixtures/alpaca/orders.json";
import alpacaPositions from "../../fixtures/alpaca/positions.json";
import quoteAAPL from "../../fixtures/alpaca/quote-AAPL.json";
import tradesAAPL from "../../fixtures/alpaca/trades-AAPL.json";

/**
 * All mock data fixtures organized by provider.
 */
export const mockData = {
	alpacaMarketData: {
		candles: {
			AAPL: {
				"1h": candlesAAPL,
			},
		},
		quotes: {
			AAPL: quoteAAPL,
		},
		trades: {
			AAPL: tradesAAPL,
		},
	},
	alpaca: {
		account: alpacaAccount,
		positions: alpacaPositions,
		orders: alpacaOrders,
	},
} as const;
