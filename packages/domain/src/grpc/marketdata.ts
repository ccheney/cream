/**
 * MarketDataService gRPC Client
 *
 * Type-safe wrapper for the MarketDataService.
 *
 * NOTE: This is a stub implementation. The actual gRPC client requires
 * regenerating protobuf stubs with matching versions of:
 * - @connectrpc/connect v2.x
 * - protoc-gen-connect-es v2.x (not v0.13.x)
 *
 * Run `buf generate` after updating buf.gen.yaml to use connect-es v2.
 */

import {
  GetOptionChainRequest,
  type GetOptionChainResponse,
  GetSnapshotRequest,
  type GetSnapshotResponse,
} from "@cream/schema-gen/cream/v1/market_snapshot";
import { GrpcError } from "./errors.js";
import {
  DEFAULT_GRPC_CONFIG,
  type GrpcCallMetadata,
  type GrpcCallResult,
  type GrpcClientConfig,
} from "./types.js";

/**
 * Input for getSnapshot - plain object form
 */
export interface GetSnapshotInput {
  symbols: string[];
  includeBars?: boolean;
  barTimeframes?: number[];
}

/**
 * Input for getOptionChain - plain object form
 */
export interface GetOptionChainInput {
  underlying: string;
  expirations?: string[];
  minStrike?: number;
  maxStrike?: number;
}

/**
 * MarketDataService client with error handling
 *
 * This is a stub implementation that throws "not implemented" errors.
 * The actual implementation requires regenerating protobuf stubs.
 */
export class MarketDataServiceClient {
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
   * Get current market snapshot for symbols
   */
  async getSnapshot(
    input: GetSnapshotInput,
    cycleId?: string
  ): Promise<GrpcCallResult<GetSnapshotResponse>> {
    const metadata = this.createMetadata(cycleId);

    // Convert plain object to protobuf message
    const _request = new GetSnapshotRequest({
      symbols: input.symbols,
      includeBars: input.includeBars ?? false,
      barTimeframes: input.barTimeframes ?? [],
    });

    if (this.config.enableLogging) {
    }

    throw new GrpcError(
      "MarketDataService gRPC client not implemented. Run `buf generate` to regenerate stubs.",
      "UNIMPLEMENTED",
      { requestId: metadata.requestId }
    );
  }

  /**
   * Get option chain for underlying
   */
  async getOptionChain(
    input: GetOptionChainInput,
    cycleId?: string
  ): Promise<GrpcCallResult<GetOptionChainResponse>> {
    const metadata = this.createMetadata(cycleId);

    // Convert plain object to protobuf message
    const _request = new GetOptionChainRequest({
      underlying: input.underlying,
      expirations: input.expirations ?? [],
      minStrike: input.minStrike,
      maxStrike: input.maxStrike,
    });

    if (this.config.enableLogging) {
    }

    throw new GrpcError(
      "MarketDataService gRPC client not implemented. Run `buf generate` to regenerate stubs.",
      "UNIMPLEMENTED",
      { requestId: metadata.requestId }
    );
  }
}

/**
 * Create a MarketDataServiceClient with default configuration
 */
export function createMarketDataClient(
  baseUrl: string,
  options?: Partial<Omit<GrpcClientConfig, "baseUrl">>
): MarketDataServiceClient {
  return new MarketDataServiceClient({ baseUrl, ...options });
}
