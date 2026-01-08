/**
 * Broker Client Factory
 *
 * Creates the appropriate broker client based on ExecutionContext environment.
 *
 * @example
 * ```typescript
 * import { createContext } from "@cream/domain";
 *
 * const ctx = createContext("PAPER", "scheduled");
 * const client = createBrokerClient(ctx);
 *
 * // ctx.environment=BACKTEST -> BacktestAdapter
 * // ctx.environment=PAPER -> AlpacaClient (paper endpoint)
 * // ctx.environment=LIVE -> AlpacaClient (live endpoint with safety checks)
 * ```
 */

import type { ExecutionContext } from "@cream/domain";
import { type BacktestAdapterConfig, createBacktestAdapter } from "./adapters/backtest.js";
import type { AlpacaClient } from "./client.js";
import { createAlpacaClient } from "./client.js";
import { BrokerError } from "./types.js";

/**
 * Broker client factory configuration.
 */
export interface BrokerClientConfig {
  /** Alpaca API key (required for PAPER/LIVE) */
  apiKey?: string;
  /** Alpaca API secret (required for PAPER/LIVE) */
  apiSecret?: string;
  /** Backtest configuration (for BACKTEST environment) */
  backtest?: BacktestAdapterConfig;
}

/**
 * Create a broker client based on ExecutionContext environment.
 *
 * @param ctx - ExecutionContext providing environment
 * @param config - Optional configuration overrides
 * @returns Broker client appropriate for the environment
 *
 * @example
 * ```typescript
 * import { createContext } from "@cream/domain";
 *
 * // Create context at system boundary
 * const ctx = createContext("PAPER", "scheduled");
 * const client = createBrokerClient(ctx);
 *
 * // With backtest configuration
 * const backtestCtx = createContext("BACKTEST", "backtest");
 * const backtestClient = createBrokerClient(backtestCtx, {
 *   backtest: {
 *     initialCash: 100000,
 *     slippageBps: 5,
 *   },
 * });
 * ```
 */
export function createBrokerClient(
  ctx: ExecutionContext,
  config: BrokerClientConfig = {}
): AlpacaClient {
  switch (ctx.environment) {
    case "BACKTEST":
      return createBacktestAdapter(config.backtest);

    case "PAPER":
    case "LIVE": {
      const apiKey = config.apiKey ?? process.env.ALPACA_KEY;
      const apiSecret = config.apiSecret ?? process.env.ALPACA_SECRET;

      if (!apiKey || !apiSecret) {
        throw new BrokerError(
          `ALPACA_KEY and ALPACA_SECRET are required for ${ctx.environment} trading`,
          "INVALID_CREDENTIALS"
        );
      }

      return createAlpacaClient({
        apiKey,
        apiSecret,
        environment: ctx.environment,
      });
    }

    default:
      throw new BrokerError(
        `Unknown environment: ${ctx.environment}. Use BACKTEST, PAPER, or LIVE.`,
        "ENVIRONMENT_MISMATCH"
      );
  }
}
