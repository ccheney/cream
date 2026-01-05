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

// Types
export {
  DEFAULT_GRPC_CONFIG,
  GrpcErrorCode,
  isRetryableErrorCode,
  type GrpcCallMetadata,
  type GrpcCallResult,
  type GrpcClientConfig,
} from "./types.js";

// Errors
export { GrpcError, RetryBackoff, sleep } from "./errors.js";

// Clients
export {
  ExecutionServiceClient,
  createExecutionClient,
} from "./execution.js";

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
} from "@cream/schema-gen/ts/cream/v1/execution_pb.js";

export {
  ConstraintResult,
  OrderSide,
  OrderStatus,
} from "@cream/schema-gen/ts/cream/v1/execution_pb.js";
