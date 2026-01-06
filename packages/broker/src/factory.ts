/**
 * Broker Client Factory
 *
 * Creates the appropriate broker client based on CREAM_ENV environment variable.
 *
 * @example
 * ```typescript
 * // Automatically uses the right adapter based on CREAM_ENV
 * const client = createBrokerClient();
 *
 * // CREAM_ENV=BACKTEST -> BacktestAdapter
 * // CREAM_ENV=PAPER -> AlpacaClient (paper endpoint)
 * // CREAM_ENV=LIVE -> AlpacaClient (live endpoint with safety checks)
 * ```
 */

import { type BacktestAdapterConfig, createBacktestAdapter } from "./adapters/backtest.js";
import type { AlpacaClient } from "./client.js";
import { createAlpacaClient } from "./client.js";
import type { TradingEnvironment } from "./types.js";
import { BrokerError } from "./types.js";

/**
 * Broker client factory configuration.
 */
export interface BrokerClientConfig {
  /** Override environment (default: CREAM_ENV) */
  environment?: TradingEnvironment;
  /** Alpaca API key (required for PAPER/LIVE) */
  apiKey?: string;
  /** Alpaca API secret (required for PAPER/LIVE) */
  apiSecret?: string;
  /** Backtest configuration (for BACKTEST environment) */
  backtest?: BacktestAdapterConfig;
}

/**
 * Create a broker client based on environment.
 *
 * @param config - Optional configuration overrides
 * @returns Broker client appropriate for the environment
 *
 * @example
 * ```typescript
 * // Use environment variables
 * const client = createBrokerClient();
 *
 * // Override environment
 * const backtestClient = createBrokerClient({ environment: "BACKTEST" });
 *
 * // With backtest configuration
 * const backtestClient = createBrokerClient({
 *   environment: "BACKTEST",
 *   backtest: {
 *     initialCash: 100000,
 *     slippageBps: 5,
 *   },
 * });
 * ```
 */
export function createBrokerClient(config: BrokerClientConfig = {}): AlpacaClient {
  const environment =
    config.environment ?? (process.env.CREAM_ENV as TradingEnvironment) ?? "PAPER";

  switch (environment) {
    case "BACKTEST":
      return createBacktestAdapter(config.backtest);

    case "PAPER":
    case "LIVE": {
      const apiKey = config.apiKey ?? process.env.ALPACA_KEY;
      const apiSecret = config.apiSecret ?? process.env.ALPACA_SECRET;

      if (!apiKey || !apiSecret) {
        throw new BrokerError(
          `ALPACA_KEY and ALPACA_SECRET are required for ${environment} trading`,
          "INVALID_CREDENTIALS"
        );
      }

      return createAlpacaClient({
        apiKey,
        apiSecret,
        environment,
      });
    }

    default:
      throw new BrokerError(
        `Unknown environment: ${environment}. Use BACKTEST, PAPER, or LIVE.`,
        "ENVIRONMENT_MISMATCH"
      );
  }
}
