/**
 * Arrow Flight Module
 *
 * TypeScript client for Arrow Flight bulk data transport.
 * Retrieves historical data from the Rust execution engine.
 *
 * @example
 * ```typescript
 * import { createFlightClient } from "@cream/domain/arrow";
 *
 * const client = createFlightClient("grpc://localhost:50052");
 * await client.connect();
 *
 * // Get historical candles
 * const candles = await client.getCandles("AAPL", "1h", {
 *   from: new Date("2026-01-01"),
 *   to: new Date("2026-01-05"),
 * });
 *
 * console.log(`Retrieved ${candles.rowCount} candles`);
 *
 * await client.disconnect();
 * ```
 */

// Types
export {
  DEFAULT_FLIGHT_CONFIG,
  FlightError,
  FlightPaths,
  type CandleRow,
  type FlightClientConfig,
  type FlightResult,
  type OptionContractRow,
  type PortfolioHistoryRow,
  type TickRow,
} from "./types.js";

// Client
export { ArrowFlightClient, createFlightClient } from "./client.js";
