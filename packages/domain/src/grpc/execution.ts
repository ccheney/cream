/**
 * ExecutionService gRPC Client
 *
 * Type-safe wrapper for the Rust execution engine ExecutionService.
 *
 * NOTE: This is a stub implementation. The actual gRPC client requires
 * regenerating protobuf stubs with matching versions of:
 * - @connectrpc/connect v2.x
 * - protoc-gen-connect-es v2.x (not v0.13.x)
 *
 * Run `buf generate` after updating buf.gen.yaml to use connect-es v2.
 */

import type {
  CheckConstraintsRequest,
  CheckConstraintsResponse,
  GetAccountStateRequest,
  GetAccountStateResponse,
  GetPositionsRequest,
  GetPositionsResponse,
  StreamExecutionsResponse,
  SubmitOrderRequest,
  SubmitOrderResponse,
} from "@cream/schema-gen/cream/v1/execution";
import { GrpcError } from "./errors.js";
import {
  DEFAULT_GRPC_CONFIG,
  type GrpcCallMetadata,
  type GrpcCallResult,
  type GrpcClientConfig,
} from "./types.js";

/**
 * ExecutionService client with error handling and retries
 *
 * This is a stub implementation that throws "not implemented" errors.
 * The actual implementation requires regenerating protobuf stubs.
 */
export class ExecutionServiceClient {
  private readonly config: Required<GrpcClientConfig>;

  constructor(config: GrpcClientConfig) {
    this.config = {
      ...DEFAULT_GRPC_CONFIG,
      ...config,
    };
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Create call metadata
   */
  private createMetadata(cycleId?: string): GrpcCallMetadata {
    return {
      requestId: this.generateRequestId(),
      cycleId,
      startTime: Date.now(),
    };
  }

  /**
   * Validate a decision plan against constraints
   */
  async checkConstraints(
    _request: CheckConstraintsRequest,
    cycleId?: string
  ): Promise<GrpcCallResult<CheckConstraintsResponse>> {
    const metadata = this.createMetadata(cycleId);

    if (this.config.enableLogging) {
    }

    throw new GrpcError(
      "ExecutionService gRPC client not implemented. Run `buf generate` to regenerate stubs.",
      "UNIMPLEMENTED",
      { requestId: metadata.requestId }
    );
  }

  /**
   * Submit an order for execution
   */
  async submitOrder(
    _request: SubmitOrderRequest,
    cycleId?: string
  ): Promise<GrpcCallResult<SubmitOrderResponse>> {
    const metadata = this.createMetadata(cycleId);

    if (this.config.enableLogging) {
    }

    throw new GrpcError(
      "ExecutionService gRPC client not implemented. Run `buf generate` to regenerate stubs.",
      "UNIMPLEMENTED",
      { requestId: metadata.requestId }
    );
  }

  /**
   * Get current account state
   */
  async getAccountState(
    _request: GetAccountStateRequest = {} as GetAccountStateRequest,
    cycleId?: string
  ): Promise<GrpcCallResult<GetAccountStateResponse>> {
    const metadata = this.createMetadata(cycleId);

    if (this.config.enableLogging) {
    }

    throw new GrpcError(
      "ExecutionService gRPC client not implemented. Run `buf generate` to regenerate stubs.",
      "UNIMPLEMENTED",
      { requestId: metadata.requestId }
    );
  }

  /**
   * Get current positions
   */
  async getPositions(
    _request: GetPositionsRequest = {} as GetPositionsRequest,
    cycleId?: string
  ): Promise<GrpcCallResult<GetPositionsResponse>> {
    const metadata = this.createMetadata(cycleId);

    if (this.config.enableLogging) {
    }

    throw new GrpcError(
      "ExecutionService gRPC client not implemented. Run `buf generate` to regenerate stubs.",
      "UNIMPLEMENTED",
      { requestId: metadata.requestId }
    );
  }

  /**
   * Stream order execution updates
   *
   * Note: Returns an async iterator that yields execution updates.
   * The caller should handle connection errors and reconnection.
   */
  async *streamExecutions(
    cycleId?: string,
    _orderIds?: string[]
  ): AsyncGenerator<GrpcCallResult<StreamExecutionsResponse>> {
    const metadata = this.createMetadata(cycleId);

    if (this.config.enableLogging) {
    }

    // biome-ignore lint/correctness/noUnreachable: yield needed for type inference before throw
    yield undefined as never;

    throw new GrpcError(
      "ExecutionService gRPC client not implemented. Run `buf generate` to regenerate stubs.",
      "UNIMPLEMENTED",
      { requestId: metadata.requestId }
    );
  }
}

/**
 * Create an ExecutionServiceClient with default configuration
 */
export function createExecutionClient(
  baseUrl: string,
  options?: Partial<Omit<GrpcClientConfig, "baseUrl">>
): ExecutionServiceClient {
  return new ExecutionServiceClient({ baseUrl, ...options });
}
