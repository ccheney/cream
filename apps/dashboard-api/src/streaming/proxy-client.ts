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
	return Bun.sleep(ms);
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

interface ReconnectingStreamOptions<TResponse, TValue> {
	signal?: AbortSignal;
	onReconnect?: (attempt: number) => void;
	onError?: (error: Error) => void;
	logMessage: string;
	createStream: (signal?: AbortSignal) => AsyncIterable<TResponse>;
	extractValue: (response: TResponse) => TValue | undefined;
}

interface StreamErrorContext {
	attempt: number;
	signal?: AbortSignal;
	onReconnect?: (attempt: number) => void;
	onError?: (error: Error) => void;
	logMessage: string;
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

async function handleStreamError(
	error: unknown,
	{ attempt, signal, onReconnect, onError, logMessage }: StreamErrorContext,
): Promise<number | null> {
	if (signal?.aborted) {
		return null;
	}
	if (isRetryableError(error) && attempt < MAX_RECONNECT_ATTEMPTS - 1) {
		const nextAttempt = attempt + 1;
		const backoff = calculateBackoff(nextAttempt);
		log.warn({ attempt: nextAttempt, backoffMs: backoff, error }, logMessage);
		onReconnect?.(nextAttempt);
		await sleep(backoff);
		return nextAttempt;
	}
	const err = asError(error);
	onError?.(err);
	throw err;
}

async function* streamWithReconnect<TResponse, TValue>({
	signal,
	onReconnect,
	onError,
	logMessage,
	createStream,
	extractValue,
}: ReconnectingStreamOptions<TResponse, TValue>): AsyncGenerator<TValue, void, unknown> {
	let attempt = 0;
	while (attempt < MAX_RECONNECT_ATTEMPTS) {
		try {
			for await (const response of createStream(signal)) {
				const value = extractValue(response);
				if (value !== undefined) {
					yield value;
				}
				attempt = 0;
			}
			return;
		} catch (error) {
			const nextAttempt = await handleStreamError(error, {
				attempt,
				signal,
				onReconnect,
				onError,
				logMessage,
			});
			if (nextAttempt === null) {
				return;
			}
			attempt = nextAttempt;
		}
	}
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
	yield* streamWithReconnect({
		signal,
		onReconnect,
		onError,
		logMessage: "Reconnecting quotes stream",
		createStream: (abortSignal) => proxyClient.streamQuotes({ symbols }, { signal: abortSignal }),
		extractValue: (response) => response.quote,
	});
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
	yield* streamWithReconnect({
		signal,
		onReconnect,
		onError,
		logMessage: "Reconnecting trades stream",
		createStream: (abortSignal) => proxyClient.streamTrades({ symbols }, { signal: abortSignal }),
		extractValue: (response) => response.trade,
	});
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
	yield* streamWithReconnect({
		signal,
		onReconnect,
		onError,
		logMessage: "Reconnecting bars stream",
		createStream: (abortSignal) => proxyClient.streamBars({ symbols }, { signal: abortSignal }),
		extractValue: (response) => response.bar,
	});
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
	yield* streamWithReconnect({
		signal,
		onReconnect,
		onError,
		logMessage: "Reconnecting option quotes stream",
		createStream: (abortSignal) =>
			proxyClient.streamOptionQuotes({ symbols: contracts, underlyings }, { signal: abortSignal }),
		extractValue: (response) => response.quote,
	});
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
	yield* streamWithReconnect({
		signal,
		onReconnect,
		onError,
		logMessage: "Reconnecting option trades stream",
		createStream: (abortSignal) =>
			proxyClient.streamOptionTrades({ symbols: contracts, underlyings }, { signal: abortSignal }),
		extractValue: (response) => response.trade,
	});
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
	yield* streamWithReconnect({
		signal,
		onReconnect,
		onError,
		logMessage: "Reconnecting order updates stream",
		createStream: (abortSignal) =>
			proxyClient.streamOrderUpdates({ orderIds, symbols }, { signal: abortSignal }),
		extractValue: (response) => response.update,
	});
}

// ============================================
// Status & Management
// ============================================

/**
 * Get the current connection status of the proxy.
 * Returns null if the proxy is not reachable.
 */
export async function getConnectionStatus(): Promise<ConnectionStatus | null> {
	try {
		const proxyClient = getClient();
		const response = await proxyClient.getConnectionStatus({});
		return response.status ?? null;
	} catch {
		// Connection failures are expected during startup - don't log as error
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

const DEFAULT_WAIT_INTERVAL_MS = 2000;
const DEFAULT_MAX_WAIT_MS = 60000;

export interface WaitForProxyOptions {
	maxWaitMs?: number;
	intervalMs?: number;
	signal?: AbortSignal;
	silent?: boolean;
}

/**
 * Wait for the proxy to become available.
 * Polls the proxy health endpoint until it responds or timeout is reached.
 *
 * @returns true if proxy became available, false if timeout or aborted
 */
export async function waitForProxy(options: WaitForProxyOptions = {}): Promise<boolean> {
	const {
		maxWaitMs = DEFAULT_MAX_WAIT_MS,
		intervalMs = DEFAULT_WAIT_INTERVAL_MS,
		signal,
		silent = false,
	} = options;

	const startTime = Date.now();
	let attempt = 0;

	while (Date.now() - startTime < maxWaitMs) {
		if (signal?.aborted) {
			return false;
		}

		attempt++;
		const healthy = await isProxyHealthy();

		if (healthy) {
			if (attempt > 1 && !silent) {
				log.info(
					{ attempts: attempt, elapsedMs: Date.now() - startTime },
					"Proxy is now available",
				);
			}
			return true;
		}

		if (attempt === 1 && !silent) {
			log.info("Waiting for stream proxy to become available...");
		}

		await sleep(intervalMs);
	}

	if (!silent) {
		log.warn({ maxWaitMs, attempts: attempt }, "Timed out waiting for proxy");
	}
	return false;
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
	waitForProxy,
	resetClient,
};
