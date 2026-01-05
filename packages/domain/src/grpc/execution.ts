/**
 * ExecutionService gRPC Client
 *
 * Type-safe wrapper for the Rust execution engine ExecutionService.
 */

import { createClient, type Client, type Transport } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { ExecutionService } from "@cream/schema-gen/ts/cream/v1/execution_connect.js";
import type {
  CheckConstraintsRequest,
  CheckConstraintsResponse,
  GetAccountStateRequest,
  GetAccountStateResponse,
  GetPositionsRequest,
  GetPositionsResponse,
  SubmitOrderRequest,
  SubmitOrderResponse,
} from "@cream/schema-gen/ts/cream/v1/execution_pb.js";
import { GrpcError, RetryBackoff, sleep } from "./errors.js";
import {
  DEFAULT_GRPC_CONFIG,
  type GrpcCallMetadata,
  type GrpcCallResult,
  type GrpcClientConfig,
} from "./types.js";

/**
 * ExecutionService client with error handling and retries
 */
export class ExecutionServiceClient {
  private readonly client: Client<typeof ExecutionService>;
  private readonly config: Required<GrpcClientConfig>;

  constructor(config: GrpcClientConfig) {
    this.config = {
      ...DEFAULT_GRPC_CONFIG,
      ...config,
    };

    const transport = this.createTransport();
    this.client = createClient(ExecutionService, transport);
  }

  /**
   * Create the gRPC transport
   */
  private createTransport(): Transport {
    return createGrpcTransport({
      baseUrl: this.config.baseUrl,
      httpVersion: "2",
    });
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
   * Execute a call with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    metadata: GrpcCallMetadata
  ): Promise<GrpcCallResult<T>> {
    const backoff = new RetryBackoff();
    let lastError: GrpcError | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = backoff.nextDelay();
          if (this.config.enableLogging) {
            console.log(
              `[gRPC] Retry attempt ${attempt} for ${metadata.requestId}, waiting ${delay}ms`
            );
          }
          await sleep(delay);
        }

        const data = await operation();
        const durationMs = Date.now() - metadata.startTime;

        if (this.config.enableLogging) {
          console.log(
            `[gRPC] Request ${metadata.requestId} completed in ${durationMs}ms`
          );
        }

        return { data, metadata, durationMs };
      } catch (error) {
        lastError = GrpcError.fromConnectError(error, metadata.requestId);

        if (this.config.enableLogging) {
          console.error(
            `[gRPC] Request ${metadata.requestId} failed:`,
            lastError.toJSON()
          );
        }

        // Don't retry non-retryable errors
        if (!lastError.retryable) {
          throw lastError;
        }
      }
    }

    // All retries exhausted
    throw lastError ?? new GrpcError("Unknown error after retries", "UNKNOWN");
  }

  /**
   * Validate a decision plan against constraints
   */
  async checkConstraints(
    request: CheckConstraintsRequest,
    cycleId?: string
  ): Promise<GrpcCallResult<CheckConstraintsResponse>> {
    const metadata = this.createMetadata(cycleId);

    if (this.config.enableLogging) {
      console.log(`[gRPC] CheckConstraints ${metadata.requestId}`);
    }

    return this.executeWithRetry(
      () =>
        this.client.checkConstraints(request, {
          timeoutMs: this.config.timeoutMs,
          headers: this.config.headers,
        }),
      metadata
    );
  }

  /**
   * Submit an order for execution
   */
  async submitOrder(
    request: SubmitOrderRequest,
    cycleId?: string
  ): Promise<GrpcCallResult<SubmitOrderResponse>> {
    const metadata = this.createMetadata(cycleId);

    if (this.config.enableLogging) {
      console.log(
        `[gRPC] SubmitOrder ${metadata.requestId} for ${request.instrument?.symbol}`
      );
    }

    return this.executeWithRetry(
      () =>
        this.client.submitOrder(request, {
          timeoutMs: this.config.timeoutMs,
          headers: this.config.headers,
        }),
      metadata
    );
  }

  /**
   * Get current account state
   */
  async getAccountState(
    request: GetAccountStateRequest = {},
    cycleId?: string
  ): Promise<GrpcCallResult<GetAccountStateResponse>> {
    const metadata = this.createMetadata(cycleId);

    if (this.config.enableLogging) {
      console.log(`[gRPC] GetAccountState ${metadata.requestId}`);
    }

    return this.executeWithRetry(
      () =>
        this.client.getAccountState(request, {
          timeoutMs: this.config.timeoutMs,
          headers: this.config.headers,
        }),
      metadata
    );
  }

  /**
   * Get current positions
   */
  async getPositions(
    request: GetPositionsRequest = {},
    cycleId?: string
  ): Promise<GrpcCallResult<GetPositionsResponse>> {
    const metadata = this.createMetadata(cycleId);

    if (this.config.enableLogging) {
      console.log(`[gRPC] GetPositions ${metadata.requestId}`);
    }

    return this.executeWithRetry(
      () =>
        this.client.getPositions(request, {
          timeoutMs: this.config.timeoutMs,
          headers: this.config.headers,
        }),
      metadata
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
    orderIds?: string[]
  ): AsyncGenerator<GrpcCallResult<import("@cream/schema-gen/ts/cream/v1/execution_pb.js").StreamExecutionsResponse>> {
    const metadata = this.createMetadata(cycleId);

    if (this.config.enableLogging) {
      console.log(`[gRPC] StreamExecutions ${metadata.requestId}`);
    }

    try {
      const stream = this.client.streamExecutions(
        { cycleId, orderIds: orderIds ?? [] },
        {
          timeoutMs: 0, // No timeout for streaming
          headers: this.config.headers,
        }
      );

      for await (const response of stream) {
        const durationMs = Date.now() - metadata.startTime;
        yield { data: response, metadata, durationMs };
      }
    } catch (error) {
      throw GrpcError.fromConnectError(error, metadata.requestId);
    }
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
