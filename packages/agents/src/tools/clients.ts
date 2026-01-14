/**
 * Tool Clients
 *
 * gRPC and broker client singletons for tool implementations.
 */

import { type AlpacaClient, createBrokerClient } from "@cream/broker";
import type { ExecutionContext } from "@cream/domain";
import {
	createExecutionClient,
	createMarketDataClient,
	type ExecutionServiceClient,
	type MarketDataServiceClient,
} from "@cream/domain/grpc";
import { createHelixClientFromEnv, type HelixClient } from "@cream/helix";
import {
	type AlpacaMarketDataClient,
	createAlpacaClientFromEnv,
	isAlpacaConfigured,
} from "@cream/marketdata";
import { createFREDClient, type FMPClient, type FREDClient } from "@cream/universe";

// ============================================
// gRPC Client Singletons
// ============================================

// gRPC services (MarketDataService, ExecutionService) run on port 50053
// HTTP REST endpoints run on port 50051
const DEFAULT_MARKET_DATA_URL = process.env.MARKET_DATA_SERVICE_URL ?? "http://localhost:50053";
const DEFAULT_EXECUTION_URL = process.env.EXECUTION_SERVICE_URL ?? "http://localhost:50053";

let marketDataClient: MarketDataServiceClient | null = null;
let executionClient: ExecutionServiceClient | null = null;

export function getMarketDataClient(): MarketDataServiceClient {
	if (!marketDataClient) {
		marketDataClient = createMarketDataClient(DEFAULT_MARKET_DATA_URL);
	}
	return marketDataClient;
}

export function getExecutionClient(): ExecutionServiceClient {
	if (!executionClient) {
		executionClient = createExecutionClient(DEFAULT_EXECUTION_URL);
	}
	return executionClient;
}

// ============================================
// Helix Client Singleton
// ============================================

let helixClient: HelixClient | null = null;

export function getHelixClient(): HelixClient {
	if (!helixClient) {
		helixClient = createHelixClientFromEnv();
	}
	return helixClient;
}

// ============================================
// Broker Client Singleton
// ============================================

let brokerClient: AlpacaClient | null = null;
let brokerClientEnvironment: string | null = null;

/**
 * Get broker client for Alpaca API access.
 * Returns null if credentials are not configured.
 */
export function getBrokerClient(ctx: ExecutionContext): AlpacaClient | null {
	// Re-create client if environment changed
	if (brokerClient && brokerClientEnvironment === ctx.environment) {
		return brokerClient;
	}

	// Check for required credentials
	const apiKey = process.env.ALPACA_KEY;
	const apiSecret = process.env.ALPACA_SECRET;

	if (!apiKey || !apiSecret) {
		return null;
	}

	brokerClient = createBrokerClient(ctx);
	brokerClientEnvironment = ctx.environment;
	return brokerClient;
}

// ============================================
// Alpaca Market Data Client Singleton
// ============================================

let alpacaMarketDataClient: AlpacaMarketDataClient | null = null;

export function getAlpacaMarketDataClient(): AlpacaMarketDataClient | null {
	if (alpacaMarketDataClient) {
		return alpacaMarketDataClient;
	}

	if (!isAlpacaConfigured()) {
		return null;
	}

	alpacaMarketDataClient = createAlpacaClientFromEnv();
	return alpacaMarketDataClient;
}

// ============================================
// FMP Client Singleton
// ============================================

// DISABLED: FMP free tier doesn't support most endpoints we need.
// TODO: Remove FMP dependency entirely or upgrade to paid plan.
export function getFMPClient(): FMPClient | null {
	return null;
}

// ============================================
// FRED Client Singleton
// ============================================

let fredClient: FREDClient | null = null;
let fredClientOverride: FREDClient | null | undefined;

export function getFREDClient(): FREDClient | null {
	// Return test override if explicitly set (including null)
	if (fredClientOverride !== undefined) {
		return fredClientOverride;
	}

	if (fredClient) {
		return fredClient;
	}

	// Only initialize if API key is available
	const apiKey = process.env.FRED_API_KEY;
	if (!apiKey) {
		return null;
	}

	fredClient = createFREDClient({ apiKey });
	return fredClient;
}

/**
 * Set a mock FRED client for testing.
 * Pass null to force getFREDClient to return null.
 * Pass undefined or call resetFREDClient to clear override.
 */
export function setFREDClientForTesting(client: FREDClient | null): void {
	fredClientOverride = client;
}

/**
 * Reset FRED client state (for testing cleanup).
 */
export function resetFREDClient(): void {
	fredClient = null;
	fredClientOverride = undefined;
}
