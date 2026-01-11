/**
 * gRPC Client for Rust Execution Engine
 *
 * Uses Connect with gRPC transport to call the Rust execution engine
 * at localhost:50053. Provides full type safety via Protobuf-ES generated types.
 */

import {
  type CallOptions,
  type Client,
  Code,
  ConnectError,
  createClient,
} from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import {
  type CancelOrderRequest,
  type CancelOrderResponse,
  type CheckConstraintsRequest,
  type CheckConstraintsResponse,
  ExecutionService,
  type GetAccountStateRequest,
  type GetAccountStateResponse,
  type GetOrderStateRequest,
  type GetOrderStateResponse,
  type GetPositionsRequest,
  type GetPositionsResponse,
  type SubmitOrderRequest,
  type SubmitOrderResponse,
} from "@cream/schema-gen/cream/v1/execution";
import { log } from "../logger.js";

// ============================================
// Configuration
// ============================================

/** Default execution engine address */
const DEFAULT_ADDRESS = "http://localhost:50053";

/** Default timeout for unary calls (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Maximum retry attempts for transient failures */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms) */
const RETRY_BASE_DELAY_MS = 100;

// ============================================
// Error Types
// ============================================

export class ExecutionEngineError extends Error {
  public readonly code: string;
  public readonly isRetryable: boolean;
  public override readonly cause?: Error;

  constructor(message: string, code: string, isRetryable: boolean, cause?: Error) {
    super(message);
    this.name = "ExecutionEngineError";
    this.code = code;
    this.isRetryable = isRetryable;
    this.cause = cause;
  }
}

// ============================================
// Retry Logic
// ============================================

/** Codes that indicate transient failures worth retrying */
const RETRYABLE_CODES = new Set([
  Code.Unavailable,
  Code.ResourceExhausted,
  Code.Aborted,
  Code.DeadlineExceeded,
]);

function isRetryable(error: unknown): boolean {
  if (error instanceof ConnectError) {
    return RETRYABLE_CODES.has(error.code);
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryable(error) || attempt === MAX_RETRIES - 1) {
        break;
      }

      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
      log.warn(
        {
          operationName,
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          delayMs: delay,
          error: lastError.message,
        },
        "ExecutionEngine operation failed, retrying"
      );
      await sleep(delay);
    }
  }

  // Convert to ExecutionEngineError
  if (lastError instanceof ConnectError) {
    throw new ExecutionEngineError(
      `${operationName} failed: ${lastError.message}`,
      lastError.code.toString(),
      isRetryable(lastError),
      lastError
    );
  }

  throw new ExecutionEngineError(
    `${operationName} failed: ${lastError?.message ?? "Unknown error"}`,
    "UNKNOWN",
    false,
    lastError
  );
}

// ============================================
// Client Interface
// ============================================

export interface ExecutionEngineClient {
  /** Validate a decision plan against risk constraints */
  checkConstraints(
    request: Partial<CheckConstraintsRequest>,
    options?: CallOptions
  ): Promise<CheckConstraintsResponse>;

  /** Submit an order for execution */
  submitOrder(
    request: Partial<SubmitOrderRequest>,
    options?: CallOptions
  ): Promise<SubmitOrderResponse>;

  /** Get current state of an order */
  getOrderState(
    request: Partial<GetOrderStateRequest>,
    options?: CallOptions
  ): Promise<GetOrderStateResponse>;

  /** Cancel an order */
  cancelOrder(
    request: Partial<CancelOrderRequest>,
    options?: CallOptions
  ): Promise<CancelOrderResponse>;

  /** Get current account state (equity, buying power, etc.) */
  getAccountState(
    request?: Partial<GetAccountStateRequest>,
    options?: CallOptions
  ): Promise<GetAccountStateResponse>;

  /** Get current positions */
  getPositions(
    request?: Partial<GetPositionsRequest>,
    options?: CallOptions
  ): Promise<GetPositionsResponse>;
}

// ============================================
// Client Implementation
// ============================================

class ExecutionEngineClientImpl implements ExecutionEngineClient {
  private readonly client: Client<typeof ExecutionService>;
  private readonly defaultOptions: CallOptions;

  constructor(address: string, timeoutMs: number) {
    const transport = createGrpcTransport({
      baseUrl: address,
    });

    this.client = createClient(ExecutionService, transport);
    this.defaultOptions = {
      timeoutMs,
    };
  }

  async checkConstraints(
    request: CheckConstraintsRequest,
    options?: CallOptions
  ): Promise<CheckConstraintsResponse> {
    return withRetry(
      () =>
        this.client.checkConstraints(request, {
          ...this.defaultOptions,
          ...options,
        }),
      "checkConstraints"
    );
  }

  async submitOrder(
    request: SubmitOrderRequest,
    options?: CallOptions
  ): Promise<SubmitOrderResponse> {
    return withRetry(
      () =>
        this.client.submitOrder(request, {
          ...this.defaultOptions,
          ...options,
        }),
      "submitOrder"
    );
  }

  async getOrderState(
    request: GetOrderStateRequest,
    options?: CallOptions
  ): Promise<GetOrderStateResponse> {
    return withRetry(
      () =>
        this.client.getOrderState(request, {
          ...this.defaultOptions,
          ...options,
        }),
      "getOrderState"
    );
  }

  async cancelOrder(
    request: CancelOrderRequest,
    options?: CallOptions
  ): Promise<CancelOrderResponse> {
    return withRetry(
      () =>
        this.client.cancelOrder(request, {
          ...this.defaultOptions,
          ...options,
        }),
      "cancelOrder"
    );
  }

  async getAccountState(
    request: GetAccountStateRequest,
    options?: CallOptions
  ): Promise<GetAccountStateResponse> {
    return withRetry(
      () =>
        this.client.getAccountState(request, {
          ...this.defaultOptions,
          ...options,
        }),
      "getAccountState"
    );
  }

  async getPositions(
    request: GetPositionsRequest,
    options?: CallOptions
  ): Promise<GetPositionsResponse> {
    return withRetry(
      () =>
        this.client.getPositions(request, {
          ...this.defaultOptions,
          ...options,
        }),
      "getPositions"
    );
  }

  // Note: Connect transport does not require explicit cleanup.
  // Unlike traditional gRPC clients, there's no close() method needed.
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a gRPC client connected to the Rust execution engine.
 *
 * @param address - Server address (default: http://localhost:50051)
 * @param timeoutMs - Default timeout for calls (default: 30000ms)
 */
export function createExecutionEngineClient(
  address = DEFAULT_ADDRESS,
  timeoutMs = DEFAULT_TIMEOUT_MS
): ExecutionEngineClient {
  return new ExecutionEngineClientImpl(address, timeoutMs);
}

// ============================================
// Singleton Instance
// ============================================

let globalClient: ExecutionEngineClient | null = null;

/**
 * Get the global execution engine client (singleton).
 * Uses EXECUTION_ENGINE_ADDRESS env var or defaults to localhost:50051.
 */
export function getExecutionEngineClient(): ExecutionEngineClient {
  if (!globalClient) {
    const address = Bun.env.EXECUTION_ENGINE_ADDRESS ?? DEFAULT_ADDRESS;
    globalClient = createExecutionEngineClient(address);
    log.info({ address }, "ExecutionEngine connected");
  }
  return globalClient;
}

/**
 * Reset the global execution engine client.
 * Connect transport does not require explicit cleanup, so this simply
 * clears the singleton reference to allow a new client to be created.
 */
export function closeExecutionEngineClient(): void {
  if (globalClient) {
    globalClient = null;
    log.info({}, "ExecutionEngine client reset");
  }
}

// ============================================
// Re-export Types
// ============================================

export type {
  CheckConstraintsRequest,
  CheckConstraintsResponse,
  SubmitOrderRequest,
  SubmitOrderResponse,
  GetOrderStateRequest,
  GetOrderStateResponse,
  CancelOrderRequest,
  CancelOrderResponse,
  GetAccountStateRequest,
  GetAccountStateResponse,
  GetPositionsRequest,
  GetPositionsResponse,
};

// Also export message types that might be needed
export {
  type AccountState,
  type ConstraintCheck,
  type ConstraintViolation,
  OrderSide,
  OrderStatus,
  type Position,
} from "@cream/schema-gen/cream/v1/execution";
