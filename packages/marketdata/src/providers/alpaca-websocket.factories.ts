import { AlpacaWebSocketClient } from "./alpaca-websocket.impl";
import type { AlpacaWsFeed, AlpacaWsMarket } from "./alpaca-websocket.schemas";

function getRequiredEnvCredentials(): { apiKey: string; apiSecret: string } {
	const apiKey = Bun.env.ALPACA_KEY;
	const apiSecret = Bun.env.ALPACA_SECRET;
	if (!apiKey || !apiSecret) {
		throw new Error("ALPACA_KEY and ALPACA_SECRET environment variables are required");
	}
	return { apiKey, apiSecret };
}

export function createAlpacaStocksClientFromEnv(feed: AlpacaWsFeed = "sip"): AlpacaWebSocketClient {
	const { apiKey, apiSecret } = getRequiredEnvCredentials();
	return new AlpacaWebSocketClient({
		apiKey,
		apiSecret,
		market: "stocks",
		feed,
	});
}

export function createAlpacaOptionsClientFromEnv(): AlpacaWebSocketClient {
	const { apiKey, apiSecret } = getRequiredEnvCredentials();
	return new AlpacaWebSocketClient({
		apiKey,
		apiSecret,
		market: "options",
		feed: "sip",
	});
}

export function createAlpacaNewsClientFromEnv(): AlpacaWebSocketClient {
	const { apiKey, apiSecret } = getRequiredEnvCredentials();
	return new AlpacaWebSocketClient({
		apiKey,
		apiSecret,
		market: "news",
		feed: "sip",
	});
}

export function createAlpacaWebSocketClientFromEnv(
	market: AlpacaWsMarket = "stocks",
	feed: AlpacaWsFeed = "sip",
): AlpacaWebSocketClient {
	const { apiKey, apiSecret } = getRequiredEnvCredentials();
	return new AlpacaWebSocketClient({
		apiKey,
		apiSecret,
		market,
		feed,
	});
}
