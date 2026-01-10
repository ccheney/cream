/**
 * gRPC Client Types
 *
 * Configuration and type definitions for gRPC clients.
 */

/**
 * gRPC client configuration
 */
export interface GrpcClientConfig {
  /** Base URL for the gRPC server (e.g., "http://localhost:50053") */
  baseUrl: string;

  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;

  /** Maximum retry attempts for transient failures (default: 3) */
  maxRetries?: number;

  /** Enable request/response logging (default: false) */
  enableLogging?: boolean;

  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
}

/**
 * Default gRPC client configuration
 */
export const DEFAULT_GRPC_CONFIG: Required<Omit<GrpcClientConfig, "baseUrl">> = {
  timeoutMs: 30000,
  maxRetries: 3,
  enableLogging: false,
  headers: {},
};

/**
 * gRPC call metadata
 */
export interface GrpcCallMetadata {
  /** Unique request ID for tracing */
  requestId: string;

  /** Cycle ID for trading context */
  cycleId?: string;

  /** Request start timestamp */
  startTime: number;
}

/**
 * gRPC call result with metadata
 */
export interface GrpcCallResult<T> {
  /** Response data */
  data: T;

  /** Call metadata */
  metadata: GrpcCallMetadata;

  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * gRPC error codes (mapped from Connect error codes)
 */
export const GrpcErrorCode = {
  /** Operation was cancelled */
  CANCELLED: "CANCELLED",
  /** Unknown error */
  UNKNOWN: "UNKNOWN",
  /** Client specified an invalid argument */
  INVALID_ARGUMENT: "INVALID_ARGUMENT",
  /** Deadline expired before operation completed */
  DEADLINE_EXCEEDED: "DEADLINE_EXCEEDED",
  /** Some requested entity was not found */
  NOT_FOUND: "NOT_FOUND",
  /** Entity already exists */
  ALREADY_EXISTS: "ALREADY_EXISTS",
  /** Permission denied */
  PERMISSION_DENIED: "PERMISSION_DENIED",
  /** Resource exhausted (rate limiting) */
  RESOURCE_EXHAUSTED: "RESOURCE_EXHAUSTED",
  /** Failed precondition */
  FAILED_PRECONDITION: "FAILED_PRECONDITION",
  /** Operation was aborted */
  ABORTED: "ABORTED",
  /** Operation out of range */
  OUT_OF_RANGE: "OUT_OF_RANGE",
  /** Operation not implemented */
  UNIMPLEMENTED: "UNIMPLEMENTED",
  /** Internal error */
  INTERNAL: "INTERNAL",
  /** Service unavailable */
  UNAVAILABLE: "UNAVAILABLE",
  /** Data loss */
  DATA_LOSS: "DATA_LOSS",
  /** Unauthenticated */
  UNAUTHENTICATED: "UNAUTHENTICATED",
} as const;

export type GrpcErrorCode = (typeof GrpcErrorCode)[keyof typeof GrpcErrorCode];

/**
 * Check if an error code is retryable
 */
export function isRetryableErrorCode(code: GrpcErrorCode): boolean {
  return (
    code === GrpcErrorCode.UNAVAILABLE ||
    code === GrpcErrorCode.RESOURCE_EXHAUSTED ||
    code === GrpcErrorCode.DEADLINE_EXCEEDED ||
    code === GrpcErrorCode.ABORTED
  );
}
