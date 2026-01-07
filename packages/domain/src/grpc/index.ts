/**
 * gRPC Client Module
 *
 * Type-safe wrappers for Rust execution engine gRPC services.
 *
 * @example
 * ```typescript
 * import { createExecutionClient } from "@cream/domain/grpc";
 *
 * const client = createExecutionClient("http://localhost:50051");
 *
 * // Check constraints
 * const result = await client.checkConstraints({
 *   decisionPlan: plan,
 *   accountState: account,
 *   positions: positions,
 * });
 *
 * if (result.data.approved) {
 *   console.log("Plan approved!");
 * }
 * ```
 */

// Re-export generated types for convenience
export type {
  AccountState,
  CheckConstraintsRequest,
  CheckConstraintsResponse,
  ConstraintCheck,
  ExecutionAck,
  GetAccountStateRequest,
  GetAccountStateResponse,
  GetPositionsRequest,
  GetPositionsResponse,
  Position,
  StreamExecutionsRequest,
  StreamExecutionsResponse,
  SubmitOrderRequest,
  SubmitOrderResponse,
} from "@cream/schema-gen/cream/v1/execution";
export {
  ConstraintResult,
  OrderSide,
  OrderStatus,
} from "@cream/schema-gen/cream/v1/execution";
// Market data types
export type {
  Bar,
  GetOptionChainRequest,
  GetOptionChainResponse,
  GetSnapshotRequest,
  GetSnapshotResponse,
  MarketSnapshot,
  OptionChain,
  OptionQuote,
  Quote,
  SymbolSnapshot,
} from "@cream/schema-gen/cream/v1/market_snapshot";
// Errors
export { GrpcError, RetryBackoff, sleep } from "./errors.js";
// Clients
export {
  createExecutionClient,
  ExecutionServiceClient,
} from "./execution.js";
export {
  createMarketDataClient,
  MarketDataServiceClient,
} from "./marketdata.js";
// Types
export {
  DEFAULT_GRPC_CONFIG,
  type GrpcCallMetadata,
  type GrpcCallResult,
  type GrpcClientConfig,
  GrpcErrorCode,
  isRetryableErrorCode,
} from "./types.js";
