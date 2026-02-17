import { z } from "zod";

export const ALPACA_WS_ENDPOINTS = {
	stocks: {
		sip: "wss://stream.data.alpaca.markets/v2/sip",
		iex: "wss://stream.data.alpaca.markets/v2/iex",
		test: "wss://stream.data.alpaca.markets/v2/test",
	},
	options: {
		opra: "wss://stream.data.alpaca.markets/v1beta1/opra",
		indicative: "wss://stream.data.alpaca.markets/v1beta1/indicative",
	},
	news: {
		default: "wss://stream.data.alpaca.markets/v1beta1/news",
	},
	crypto: {
		us: "wss://stream.data.alpaca.markets/v1beta3/crypto/us",
	},
} as const;

export const AlpacaWsQuoteMessageSchema = z.object({
	T: z.literal("q").describe("Message type: 'q' for quote"),
	S: z.string().describe("Ticker symbol (e.g., AAPL, MSFT)"),
	bx: z.string().optional().describe("Bid exchange code (e.g., 'V' for IEX)"),
	bp: z.number().describe("Best bid price"),
	bs: z.number().describe("Bid size in round lots"),
	ax: z.string().optional().describe("Ask exchange code (e.g., 'Q' for NASDAQ)"),
	ap: z.number().describe("Best ask price"),
	as: z.number().describe("Ask size in round lots"),
	t: z.string().describe("Quote timestamp in RFC-3339 format"),
	c: z.array(z.string()).optional().describe("Quote condition codes"),
	z: z.string().optional().describe("Tape: A (NYSE), B (ARCA/regional), C (NASDAQ)"),
});
export type AlpacaWsQuoteMessage = z.infer<typeof AlpacaWsQuoteMessageSchema>;

export const AlpacaWsTradeMessageSchema = z.object({
	T: z.literal("t").describe("Message type: 't' for trade"),
	S: z.string().describe("Ticker symbol (e.g., AAPL, MSFT)"),
	i: z.number().optional().describe("Unique trade ID"),
	x: z.string().optional().describe("Exchange code where trade executed"),
	p: z.number().describe("Trade price"),
	s: z.number().describe("Trade size in shares"),
	t: z.string().describe("Trade timestamp in RFC-3339 format"),
	c: z.array(z.string()).optional().describe("Trade condition codes (e.g., '@' for regular sale)"),
	z: z.string().optional().describe("Tape: A (NYSE), B (ARCA/regional), C (NASDAQ)"),
});
export type AlpacaWsTradeMessage = z.infer<typeof AlpacaWsTradeMessageSchema>;

export const AlpacaWsBarMessageSchema = z.object({
	T: z.enum(["b", "d", "u"]).describe("Bar type: 'b' (minute), 'd' (daily), 'u' (updated)"),
	S: z.string().describe("Ticker symbol (e.g., AAPL, MSFT)"),
	o: z.number().describe("Opening price of the bar"),
	h: z.number().describe("Highest price during the bar"),
	l: z.number().describe("Lowest price during the bar"),
	c: z.number().describe("Closing price of the bar"),
	v: z.number().describe("Total volume traded during the bar"),
	t: z.string().describe("Bar timestamp in RFC-3339 format"),
	vw: z.number().optional().describe("Volume-weighted average price (VWAP)"),
	n: z.number().optional().describe("Number of trades during the bar"),
});
export type AlpacaWsBarMessage = z.infer<typeof AlpacaWsBarMessageSchema>;

export const AlpacaWsStatusMessageSchema = z.object({
	T: z.literal("s").describe("Message type: 's' for trading status"),
	S: z.string().describe("Ticker symbol (e.g., AAPL, MSFT)"),
	sc: z.string().optional().describe("Status code (e.g., 'T' for trading, 'H' for halted)"),
	sm: z.string().optional().describe("Status message text"),
	rc: z.string().optional().describe("Reason code for status change"),
	rm: z.string().optional().describe("Reason message explaining status change"),
	t: z.string().optional().describe("Status timestamp in RFC-3339 format"),
	z: z.string().optional().describe("Tape: A (NYSE), B (ARCA/regional), C (NASDAQ)"),
});
export type AlpacaWsStatusMessage = z.infer<typeof AlpacaWsStatusMessageSchema>;

export const AlpacaWsNewsMessageSchema = z.object({
	T: z.literal("n").describe("Message type: 'n' for news"),
	id: z.number().describe("Unique article identifier"),
	headline: z.string().describe("Article headline/title"),
	summary: z.string().optional().describe("Brief article summary"),
	author: z.string().optional().describe("Article author name"),
	created_at: z.string().describe("Publication timestamp in RFC-3339 format"),
	updated_at: z.string().optional().describe("Last update timestamp in RFC-3339 format"),
	url: z.string().optional().describe("Full URL to the article"),
	content: z.string().optional().describe("Full article content (may include HTML markup)"),
	symbols: z
		.array(z.string())
		.describe("Ticker symbols mentioned in article (e.g., ['AAPL', 'MSFT'])"),
	source: z.string().describe("News source name (e.g., 'Benzinga', 'GlobeNewswire')"),
});
export type AlpacaWsNewsMessage = z.infer<typeof AlpacaWsNewsMessageSchema>;

export const AlpacaWsSuccessMessageSchema = z.object({
	T: z.literal("success"),
	msg: z.enum(["connected", "authenticated"]),
});
export type AlpacaWsSuccessMessage = z.infer<typeof AlpacaWsSuccessMessageSchema>;

export const AlpacaWsErrorMessageSchema = z.object({
	T: z.literal("error"),
	code: z.number(),
	msg: z.string(),
});
export type AlpacaWsErrorMessage = z.infer<typeof AlpacaWsErrorMessageSchema>;

export const AlpacaWsSubscriptionMessageSchema = z.object({
	T: z.literal("subscription"),
	trades: z.array(z.string()).optional(),
	quotes: z.array(z.string()).optional(),
	bars: z.array(z.string()).optional(),
	dailyBars: z.array(z.string()).optional(),
	updatedBars: z.array(z.string()).optional(),
	statuses: z.array(z.string()).optional(),
	lulds: z.array(z.string()).optional(),
	news: z.array(z.string()).optional(),
});
export type AlpacaWsSubscriptionMessage = z.infer<typeof AlpacaWsSubscriptionMessageSchema>;

export type AlpacaWsMessage =
	| AlpacaWsQuoteMessage
	| AlpacaWsTradeMessage
	| AlpacaWsBarMessage
	| AlpacaWsStatusMessage
	| AlpacaWsNewsMessage
	| AlpacaWsSuccessMessage
	| AlpacaWsErrorMessage
	| AlpacaWsSubscriptionMessage;

export type AlpacaWsFeed = "sip" | "iex" | "test";
export type AlpacaWsMarket = "stocks" | "options" | "news" | "crypto";

export interface AlpacaWebSocketConfig {
	apiKey: string;
	apiSecret: string;
	market?: AlpacaWsMarket;
	feed?: AlpacaWsFeed;
	autoReconnect?: boolean;
	maxReconnectAttempts?: number;
	reconnectDelayMs?: number;
	pingIntervalS?: number;
}

export enum AlpacaConnectionState {
	DISCONNECTED = "DISCONNECTED",
	CONNECTING = "CONNECTING",
	CONNECTED = "CONNECTED",
	AUTHENTICATING = "AUTHENTICATING",
	AUTHENTICATED = "AUTHENTICATED",
	ERROR = "ERROR",
}

export type AlpacaWsEvent =
	| { type: "connected" }
	| { type: "authenticated" }
	| { type: "subscribed"; subscriptions: AlpacaWsSubscriptionMessage }
	| { type: "quote"; message: AlpacaWsQuoteMessage }
	| { type: "trade"; message: AlpacaWsTradeMessage }
	| { type: "bar"; message: AlpacaWsBarMessage }
	| { type: "status"; message: AlpacaWsStatusMessage }
	| { type: "news"; message: AlpacaWsNewsMessage }
	| { type: "error"; code: number; message: string }
	| { type: "disconnected"; reason: string }
	| { type: "reconnecting"; attempt: number };

export type AlpacaWsEventHandler = (event: AlpacaWsEvent) => void | Promise<void>;

export type AlpacaWsData = string | ArrayBuffer | Buffer;
