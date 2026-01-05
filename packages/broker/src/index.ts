/**
 * Broker Package
 *
 * Alpaca Markets integration for the Cream trading system.
 * Supports paper and live trading with multi-leg options.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { createAlpacaClient } from "@cream/broker";
 *
 * // Create client (defaults to paper trading)
 * const client = createAlpacaClient({
 *   apiKey: process.env.ALPACA_KEY!,
 *   apiSecret: process.env.ALPACA_SECRET!,
 *   environment: "PAPER",
 * });
 *
 * // Submit a limit order
 * const order = await client.submitOrder({
 *   clientOrderId: client.generateOrderId(),
 *   symbol: "AAPL",
 *   qty: 10,
 *   side: "buy",
 *   type: "limit",
 *   timeInForce: "day",
 *   limitPrice: 150.00,
 * });
 *
 * // Check positions
 * const positions = await client.getPositions();
 * ```
 *
 * ## Safety Features
 *
 * - Paper trading by default (PAPER environment)
 * - LIVE orders require explicit confirmation
 * - Order ID namespacing prevents collisions
 * - Leg ratio validation for multi-leg options
 *
 * @see docs/plans/07-execution.md
 */

// Client
export {
  createAlpacaClient,
  createAlpacaClientFromEnv,
  type AlpacaClient,
  type AlpacaClientConfig,
} from "./client.js";

// Types
export {
  BrokerError,
  type Account,
  type BrokerErrorCode,
  type Order,
  type OrderLeg,
  type OrderRequest,
  type OrderSide,
  type OrderStatus,
  type OrderType,
  type OptionType,
  type Position,
  type PositionSide,
  type TimeInForce,
  type TradingEnvironment,
} from "./types.js";

// Utilities
export {
  generateOrderId,
  gcd,
  gcdArray,
  validateLegRatios,
  simplifyLegRatios,
  parseOptionSymbol,
  buildOptionSymbol,
  validateQuantity,
  isOptionSymbol,
} from "./utils.js";
