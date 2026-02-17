import { type AlpacaClient, createAlpacaClient } from "@cream/broker";
import { HTTPException } from "hono/http-exception";
import { getCurrentEnvironment } from "../system.js";

interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

let brokerClient: AlpacaClient | null = null;
const historyCache = new Map<string, CacheEntry<unknown>>();
const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;

export function isAlpacaConfigured(): boolean {
	return Boolean(Bun.env.ALPACA_KEY && Bun.env.ALPACA_SECRET);
}

export function getBrokerCredentials(): { apiKey: string; apiSecret: string } {
	if (!isAlpacaConfigured()) {
		throw new HTTPException(503, {
			message: "Trading service unavailable: ALPACA_KEY/ALPACA_SECRET not configured",
		});
	}

	return {
		apiKey: Bun.env.ALPACA_KEY as string,
		apiSecret: Bun.env.ALPACA_SECRET as string,
	};
}

export function getBrokerClient(): AlpacaClient {
	if (brokerClient) {
		return brokerClient;
	}

	try {
		const { apiKey, apiSecret } = getBrokerCredentials();
		brokerClient = createAlpacaClient({
			apiKey,
			apiSecret,
			environment: getCurrentEnvironment(),
		});
		return brokerClient;
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, {
			message: `Trading service unavailable: ${message}`,
		});
	}
}

export function getCached<T>(key: string): T | null {
	const entry = historyCache.get(key);
	if (!entry) {
		return null;
	}

	if (Date.now() > entry.expiresAt) {
		historyCache.delete(key);
		return null;
	}

	return entry.data as T;
}

export function setCache<T>(key: string, data: T): void {
	historyCache.set(key, {
		data,
		expiresAt: Date.now() + HISTORY_CACHE_TTL_MS,
	});
}

export function extractSymbolFromPositionId(id: string): string {
	return id.startsWith("alpaca-") ? id.slice(7) : id;
}
