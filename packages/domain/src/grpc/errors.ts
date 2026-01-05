/**
 * gRPC Error Handling
 *
 * Error types and utilities for handling gRPC/Connect errors.
 */

import { GrpcErrorCode, isRetryableErrorCode } from "./types.js";

/**
 * gRPC-specific error class
 */
export class GrpcError extends Error {
  /** gRPC error code */
  readonly code: GrpcErrorCode;

  /** Whether this error is retryable */
  readonly retryable: boolean;

  /** Original error details */
  readonly details?: unknown;

  /** Request ID for tracing */
  readonly requestId?: string;

  constructor(
    message: string,
    code: GrpcErrorCode,
    options?: {
      details?: unknown;
      requestId?: string;
      cause?: Error;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = "GrpcError";
    this.code = code;
    this.retryable = isRetryableErrorCode(code);
    this.details = options?.details;
    this.requestId = options?.requestId;
  }

  /**
   * Create from a Connect error
   */
  static fromConnectError(error: unknown, requestId?: string): GrpcError {
    // Handle Connect errors
    if (error && typeof error === "object" && "code" in error) {
      const connectError = error as { code: string; message?: string; rawMessage?: string };
      const code = mapConnectCodeToGrpcCode(connectError.code);
      const message = connectError.rawMessage || connectError.message || "Unknown gRPC error";

      return new GrpcError(message, code, {
        details: error,
        requestId,
        cause: error instanceof Error ? error : undefined,
      });
    }

    // Handle generic errors
    if (error instanceof Error) {
      return new GrpcError(error.message, GrpcErrorCode.UNKNOWN, {
        cause: error,
        requestId,
      });
    }

    // Handle unknown errors
    return new GrpcError(String(error), GrpcErrorCode.UNKNOWN, {
      details: error,
      requestId,
    });
  }

  /**
   * Check if error indicates server is unavailable
   */
  isUnavailable(): boolean {
    return this.code === GrpcErrorCode.UNAVAILABLE;
  }

  /**
   * Check if error indicates rate limiting
   */
  isRateLimited(): boolean {
    return this.code === GrpcErrorCode.RESOURCE_EXHAUSTED;
  }

  /**
   * Check if error indicates timeout
   */
  isTimeout(): boolean {
    return this.code === GrpcErrorCode.DEADLINE_EXCEEDED;
  }

  /**
   * Check if error indicates invalid input
   */
  isInvalidInput(): boolean {
    return this.code === GrpcErrorCode.INVALID_ARGUMENT;
  }

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      retryable: this.retryable,
      requestId: this.requestId,
      details: this.details,
    };
  }
}

/**
 * Map Connect error code to GrpcErrorCode
 */
function mapConnectCodeToGrpcCode(code: string): GrpcErrorCode {
  // Connect uses numeric codes internally but exposes string names
  const codeMap: Record<string, GrpcErrorCode> = {
    canceled: GrpcErrorCode.CANCELLED,
    unknown: GrpcErrorCode.UNKNOWN,
    invalid_argument: GrpcErrorCode.INVALID_ARGUMENT,
    deadline_exceeded: GrpcErrorCode.DEADLINE_EXCEEDED,
    not_found: GrpcErrorCode.NOT_FOUND,
    already_exists: GrpcErrorCode.ALREADY_EXISTS,
    permission_denied: GrpcErrorCode.PERMISSION_DENIED,
    resource_exhausted: GrpcErrorCode.RESOURCE_EXHAUSTED,
    failed_precondition: GrpcErrorCode.FAILED_PRECONDITION,
    aborted: GrpcErrorCode.ABORTED,
    out_of_range: GrpcErrorCode.OUT_OF_RANGE,
    unimplemented: GrpcErrorCode.UNIMPLEMENTED,
    internal: GrpcErrorCode.INTERNAL,
    unavailable: GrpcErrorCode.UNAVAILABLE,
    data_loss: GrpcErrorCode.DATA_LOSS,
    unauthenticated: GrpcErrorCode.UNAUTHENTICATED,
  };

  const normalizedCode = code.toLowerCase().replace(/-/g, "_");
  return codeMap[normalizedCode] || GrpcErrorCode.UNKNOWN;
}

/**
 * Exponential backoff calculator for retries
 */
export class RetryBackoff {
  private attempt = 0;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitterFactor: number;

  constructor(options?: {
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitterFactor?: number;
  }) {
    this.baseDelayMs = options?.baseDelayMs ?? 100;
    this.maxDelayMs = options?.maxDelayMs ?? 30000;
    this.jitterFactor = options?.jitterFactor ?? 0.2;
  }

  /**
   * Get next backoff delay in milliseconds
   */
  nextDelay(): number {
    const exponentialDelay = this.baseDelayMs * Math.pow(2, this.attempt);
    const cappedDelay = Math.min(exponentialDelay, this.maxDelayMs);

    // Add jitter
    const jitterRange = cappedDelay * this.jitterFactor;
    const jitter = (Math.random() * 2 - 1) * jitterRange;

    this.attempt++;
    return Math.max(0, cappedDelay + jitter);
  }

  /**
   * Reset backoff state
   */
  reset(): void {
    this.attempt = 0;
  }

  /**
   * Get current attempt number
   */
  getAttempt(): number {
    return this.attempt;
  }
}

/**
 * Wait for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
