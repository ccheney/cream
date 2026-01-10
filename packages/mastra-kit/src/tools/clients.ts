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
import { createFMPClient, type FMPClient } from "@cream/universe";

// ============================================
// gRPC Client Singletons
// ============================================

// gRPC services (MarketDataService, ExecutionService) run on port 50053
// HTTP REST endpoints run on port 50051
// Arrow Flight runs on port 50052
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
// FMP Client Singleton
// ============================================

let fmpClient: FMPClient | null = null;

export function getFMPClient(): FMPClient | null {
  if (fmpClient) {
    return fmpClient;
  }

  // Only initialize if API key is available
  const apiKey = process.env.FMP_KEY;
  if (!apiKey) {
    return null;
  }

  fmpClient = createFMPClient({ apiKey });
  return fmpClient;
}
