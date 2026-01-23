/**
 * Alpaca Stream Proxy Client
 *
 * TypeScript gRPC client for the Alpaca stream proxy service.
 * Provides async generators for streaming market data and order updates.
 *
 * @see packages/proto/cream/v1/stream_proxy.proto
 */

import { type Client, Code, ConnectError, createClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import {
	type ConnectionStatus,
	type OptionQuoteUpdate,
	type OptionTrade,
	type OrderUpdate,
	type StockBar,
	type StockQuote,
	type StockTrade,
	StreamProxyService,
} from "@cream/schema-gen/cream/v1/stream_proxy";
import log from "../logger.js";

// ============================================
// Configuration
// ============================================

/**
 * URL of the Alpaca stream proxy service.
 */
export const STREAM_PROXY_URL = Bun.env.STREAM_PROXY_URL ?? "http://localhost:50052";

// Log configuration at module load
log.info({ proxyUrl: STREAM_PROXY_URL }, "Proxy client configured");

const DEFAULT_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;

// ============================================
// Types
// ============================================

export interface ProxyClientOptions {
	url?: string;
	reconnectDelayMs?: number;
	maxReconnectAttempts?: number;
}

export interface StreamOptions {
	signal?: AbortSignal;
	onReconnect?: (attempt: number) => void;
	onError?: (error: Error) => void;
}

// ============================================
// Transport & Client
// ============================================

let transport: ReturnType<typeof createGrpcTransport> | null = null;
let client: Client<typeof StreamProxyService> | null = null;

function getTransport(url: string = STREAM_PROXY_URL): ReturnType<typeof createGrpcTransport> {
	if (!transport) {
		transport = createGrpcTransport({
			baseUrl: url,
		});
	}
	return transport;
}

function getClient(url?: string): Client<typeof StreamProxyService> {
	if (!client) {
		client = createClient(StreamProxyService, getTransport(url));
	}
	return client;
}

// ============================================
// Helper Functions
// ============================================

function calculateBackoff(attempt: number): number {
	const delay = DEFAULT_RECONNECT_DELAY_MS * 2 ** attempt;
	return Math.min(delay, MAX_RECONNECT_DELAY_MS);
}

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown): boolean {
	if (error instanceof ConnectError) {
		return [
			Code.Unavailable,
			Code.DeadlineExceeded,
			Code.Aborted,
			Code.Internal,
			Code.Unknown,
		].includes(error.code);
	}
	return false;
}

// ============================================
// Streaming Functions
// ============================================

/**
 * Stream real-time stock quotes from the proxy.
 *
 * @param symbols - Stock symbols to subscribe to (empty = all)
 * @param options - Stream options including abort signal
 * @yields StockQuote updates
 */
export async function* streamQuotes(
	symbols: string[],
	options: StreamOptions = {},
): AsyncGenerator<StockQuote, void, unknown> {
	const { signal, onReconnect, onError } = options;
	const proxyClient = getClient();
	let attempt = 0;

	while (attempt < MAX_RECONNECT_ATTEMPTS) {
		try {
			const stream = proxyClient.streamQuotes({ symbols }, { signal });

			for await (const response of stream) {
				if (response.quote) {
					yield response.quote;
				}
				attempt = 0;
			}

			// Stream ended normally
			return;
		} catch (error) {
			if (signal?.aborted) {
				return;
			}

			if (isRetryableError(error) && attempt < MAX_RECONNECT_ATTEMPTS - 1) {
				attempt++;
				const backoff = calculateBackoff(attempt);
				log.warn({ attempt, backoffMs: backoff, error }, "Reconnecting quotes stream");
				onReconnect?.(attempt);
				await sleep(backoff);
			} else {
				const err = error instanceof Error ? error : new Error(String(error));
				onError?.(err);
				throw err;
			}
		}
	}
}

/**
 * Stream real-time stock trades from the proxy.
 *
 * @param symbols - Stock symbols to subscribe to (empty = all)
 * @param options - Stream options including abort signal
 * @yields StockTrade updates
 */
export async function* streamTrades(
	symbols: string[],
	options: StreamOptions = {},
): AsyncGenerator<StockTrade, void, unknown> {
	const { signal, onReconnect, onError } = options;
	const proxyClient = getClient();
	let attempt = 0;

	while (attempt < MAX_RECONNECT_ATTEMPTS) {
		try {
			const stream = proxyClient.streamTrades({ symbols }, { signal });

			for await (const response of stream) {
				if (response.trade) {
					yield response.trade;
				}
				attempt = 0;
			}

			return;
		} catch (error) {
			if (signal?.aborted) {
				return;
			}

			if (isRetryableError(error) && attempt < MAX_RECONNECT_ATTEMPTS - 1) {
				attempt++;
				const backoff = calculateBackoff(attempt);
				log.warn({ attempt, backoffMs: backoff, error }, "Reconnecting trades stream");
				onReconnect?.(attempt);
				await sleep(backoff);
			} else {
				const err = error instanceof Error ? error : new Error(String(error));
				onError?.(err);
				throw err;
			}
		}
	}
}

/**
 * Stream real-time stock bars from the proxy.
 *
 * @param symbols - Stock symbols to subscribe to (empty = all)
 * @param options - Stream options including abort signal
 * @yields StockBar updates
 */
export async function* streamBars(
	symbols: string[],
	options: StreamOptions = {},
): AsyncGenerator<StockBar, void, unknown> {
	const { signal, onReconnect, onError } = options;
	const proxyClient = getClient();
	let attempt = 0;

	while (attempt < MAX_RECONNECT_ATTEMPTS) {
		try {
			const stream = proxyClient.streamBars({ symbols }, { signal });

			for await (const response of stream) {
				if (response.bar) {
					yield response.bar;
				}
				attempt = 0;
			}

			return;
		} catch (error) {
			if (signal?.aborted) {
				return;
			}

			if (isRetryableError(error) && attempt < MAX_RECONNECT_ATTEMPTS - 1) {
				attempt++;
				const backoff = calculateBackoff(attempt);
				log.warn({ attempt, backoffMs: backoff, error }, "Reconnecting bars stream");
				onReconnect?.(attempt);
				await sleep(backoff);
			} else {
				const err = error instanceof Error ? error : new Error(String(error));
				onError?.(err);
				throw err;
			}
		}
	}
}

/**
 * Stream real-time option quotes from the proxy.
 *
 * @param contracts - OCC option symbols to subscribe to
 * @param underlyings - Underlying symbols (subscribe to all options for these)
 * @param options - Stream options including abort signal
 * @yields OptionQuoteUpdate updates
 */
export async function* streamOptionQuotes(
	contracts: string[],
	underlyings: string[] = [],
	options: StreamOptions = {},
): AsyncGenerator<OptionQuoteUpdate, void, unknown> {
	const { signal, onReconnect, onError } = options;
	const proxyClient = getClient();
	let attempt = 0;

	while (attempt < MAX_RECONNECT_ATTEMPTS) {
		try {
			const stream = proxyClient.streamOptionQuotes(
				{ symbols: contracts, underlyings },
				{ signal },
			);

			for await (const response of stream) {
				if (response.quote) {
					yield response.quote;
				}
				attempt = 0;
			}

			return;
		} catch (error) {
			if (signal?.aborted) {
				return;
			}

			if (isRetryableError(error) && attempt < MAX_RECONNECT_ATTEMPTS - 1) {
				attempt++;
				const backoff = calculateBackoff(attempt);
				log.warn({ attempt, backoffMs: backoff, error }, "Reconnecting option quotes stream");
				onReconnect?.(attempt);
				await sleep(backoff);
			} else {
				const err = error instanceof Error ? error : new Error(String(error));
				onError?.(err);
				throw err;
			}
		}
	}
}

/**
 * Stream real-time option trades from the proxy.
 *
 * @param contracts - OCC option symbols to subscribe to
 * @param underlyings - Underlying symbols (subscribe to all options for these)
 * @param options - Stream options including abort signal
 * @yields OptionTrade updates
 */
export async function* streamOptionTrades(
	contracts: string[],
	underlyings: string[] = [],
	options: StreamOptions = {},
): AsyncGenerator<OptionTrade, void, unknown> {
	const { signal, onReconnect, onError } = options;
	const proxyClient = getClient();
	let attempt = 0;

	while (attempt < MAX_RECONNECT_ATTEMPTS) {
		try {
			const stream = proxyClient.streamOptionTrades(
				{ symbols: contracts, underlyings },
				{ signal },
			);

			for await (const response of stream) {
				if (response.trade) {
					yield response.trade;
				}
				attempt = 0;
			}

			return;
		} catch (error) {
			if (signal?.aborted) {
				return;
			}

			if (isRetryableError(error) && attempt < MAX_RECONNECT_ATTEMPTS - 1) {
				attempt++;
				const backoff = calculateBackoff(attempt);
				log.warn({ attempt, backoffMs: backoff, error }, "Reconnecting option trades stream");
				onReconnect?.(attempt);
				await sleep(backoff);
			} else {
				const err = error instanceof Error ? error : new Error(String(error));
				onError?.(err);
				throw err;
			}
		}
	}
}

/**
 * Stream real-time order updates from the proxy.
 *
 * @param orderIds - Optional filter by order IDs
 * @param symbols - Optional filter by symbols
 * @param options - Stream options including abort signal
 * @yields OrderUpdate events
 */
export async function* streamOrderUpdates(
	orderIds: string[] = [],
	symbols: string[] = [],
	options: StreamOptions = {},
): AsyncGenerator<OrderUpdate, void, unknown> {
	const { signal, onReconnect, onError } = options;
	const proxyClient = getClient();
	let attempt = 0;

	while (attempt < MAX_RECONNECT_ATTEMPTS) {
		try {
			const stream = proxyClient.streamOrderUpdates({ orderIds, symbols }, { signal });

			for await (const response of stream) {
				if (response.update) {
					yield response.update;
				}
				attempt = 0;
			}

			return;
		} catch (error) {
			if (signal?.aborted) {
				return;
			}

			if (isRetryableError(error) && attempt < MAX_RECONNECT_ATTEMPTS - 1) {
				attempt++;
				const backoff = calculateBackoff(attempt);
				log.warn({ attempt, backoffMs: backoff, error }, "Reconnecting order updates stream");
				onReconnect?.(attempt);
				await sleep(backoff);
			} else {
				const err = error instanceof Error ? error : new Error(String(error));
				onError?.(err);
				throw err;
			}
		}
	}
}

// ============================================
// Status & Management
// ============================================

/**
 * Get the current connection status of the proxy.
 */
export async function getConnectionStatus(): Promise<ConnectionStatus | null> {
	try {
		const proxyClient = getClient();
		const response = await proxyClient.getConnectionStatus({});
		return response.status ?? null;
	} catch (error) {
		log.error({ error }, "Failed to get proxy connection status");
		return null;
	}
}

/**
 * Check if the proxy is reachable and healthy.
 */
export async function isProxyHealthy(): Promise<boolean> {
	const status = await getConnectionStatus();
	return status !== null;
}

/**
 * Reset the client connection (forces new transport on next call).
 */
export function resetClient(): void {
	client = null;
	transport = null;
}

// ============================================
// Exports
// ============================================

export type {
	StockQuote,
	StockTrade,
	StockBar,
	OptionQuoteUpdate,
	OptionTrade,
	OrderUpdate,
	ConnectionStatus,
};

export default {
	// Configuration
	STREAM_PROXY_URL,
	// Streaming
	streamQuotes,
	streamTrades,
	streamBars,
	streamOptionQuotes,
	streamOptionTrades,
	streamOrderUpdates,
	// Status
	getConnectionStatus,
	isProxyHealthy,
	resetClient,
};
