/**
 * MarketDataService gRPC Client
 *
 * Type-safe wrapper for the MarketDataService.
 * Uses Connect-ES with gRPC transport for communication.
 */

import { create } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import {
  GetOptionChainRequestSchema,
  type GetOptionChainResponse,
  GetSnapshotRequestSchema,
  type GetSnapshotResponse,
  MarketDataService,
  SubscribeMarketDataRequestSchema,
  type SubscribeMarketDataResponse,
} from "@cream/schema-gen/cream/v1/market_snapshot";
import { log } from "../logger.js";
import { GrpcError, RetryBackoff, sleep } from "./errors.js";
import {
  DEFAULT_GRPC_CONFIG,
  type GrpcCallMetadata,
  type GrpcCallResult,
  type GrpcClientConfig,
  isRetryableErrorCode,
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
 * Input for subscribeMarketData - plain object form
 */
export interface SubscribeMarketDataInput {
  symbols: string[];
  includeOptions?: boolean;
  barTimeframes?: number[];
}

/**
 * MarketDataService client with error handling
 */
export class MarketDataServiceClient {
  private readonly config: Required<GrpcClientConfig>;
  private readonly client: ReturnType<typeof createClient<typeof MarketDataService>>;

  constructor(config: GrpcClientConfig) {
    this.config = {
      ...DEFAULT_GRPC_CONFIG,
      ...config,
    };

    // Create gRPC transport (HTTP/2 is the default and required for gRPC)
    const transport = createGrpcTransport({
      baseUrl: this.config.baseUrl,
    });

    // Create Connect client
    this.client = createClient(MarketDataService, transport);
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
   * Execute a gRPC call with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    metadata: GrpcCallMetadata
  ): Promise<GrpcCallResult<T>> {
    const backoff = new RetryBackoff();
    let lastError: GrpcError | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const data = await operation();
        const durationMs = Date.now() - metadata.startTime;

        if (this.config.enableLogging) {
          log.info({ requestId: metadata.requestId, durationMs }, "gRPC call completed");
        }

        return { data, metadata, durationMs };
      } catch (error) {
        lastError = GrpcError.fromConnectError(error, metadata.requestId);

        if (this.config.enableLogging) {
          log.warn(
            { requestId: metadata.requestId, attempt: attempt + 1, error: lastError.message },
            "gRPC call attempt failed"
          );
        }

        // Don't retry if error is not retryable or we've exhausted retries
        if (!isRetryableErrorCode(lastError.code) || attempt >= this.config.maxRetries) {
          break;
        }

        // Wait before retrying
        const delay = backoff.nextDelay();
        await sleep(delay);
      }
    }

    // Throw the last error if all retries failed
    throw lastError ?? new GrpcError("Unknown error", "UNKNOWN", { requestId: metadata.requestId });
  }

  /**
   * Get current market snapshot for symbols
   */
  async getSnapshot(
    input: GetSnapshotInput,
    cycleId?: string
  ): Promise<GrpcCallResult<GetSnapshotResponse>> {
    const metadata = this.createMetadata(cycleId);

    if (this.config.enableLogging) {
      log.info(
        { requestId: metadata.requestId, symbolCount: input.symbols.length },
        "gRPC getSnapshot"
      );
    }

    // Convert plain object to protobuf message
    const request = create(GetSnapshotRequestSchema, {
      symbols: input.symbols,
      includeBars: input.includeBars ?? false,
      barTimeframes: input.barTimeframes ?? [],
    });

    return this.executeWithRetry(() => this.client.getSnapshot(request), metadata);
  }

  /**
   * Get option chain for underlying
   */
  async getOptionChain(
    input: GetOptionChainInput,
    cycleId?: string
  ): Promise<GrpcCallResult<GetOptionChainResponse>> {
    const metadata = this.createMetadata(cycleId);

    if (this.config.enableLogging) {
      log.info(
        { requestId: metadata.requestId, underlying: input.underlying },
        "gRPC getOptionChain"
      );
    }

    // Convert plain object to protobuf message
    const request = create(GetOptionChainRequestSchema, {
      underlying: input.underlying,
      expirations: input.expirations ?? [],
      minStrike: input.minStrike,
      maxStrike: input.maxStrike,
    });

    return this.executeWithRetry(() => this.client.getOptionChain(request), metadata);
  }

  /**
   * Subscribe to real-time market data updates
   *
   * Returns an async iterator that yields market data updates.
   * The caller should handle connection errors and reconnection.
   */
  async *subscribeMarketData(
    input: SubscribeMarketDataInput,
    cycleId?: string
  ): AsyncGenerator<GrpcCallResult<SubscribeMarketDataResponse>> {
    const metadata = this.createMetadata(cycleId);

    if (this.config.enableLogging) {
      log.info(
        { requestId: metadata.requestId, symbolCount: input.symbols.length },
        "gRPC subscribeMarketData"
      );
    }

    const request = create(SubscribeMarketDataRequestSchema, {
      symbols: input.symbols,
      includeOptions: input.includeOptions ?? false,
      barTimeframes: input.barTimeframes ?? [],
    });

    try {
      for await (const response of this.client.subscribeMarketData(request)) {
        const durationMs = Date.now() - metadata.startTime;
        yield { data: response, metadata, durationMs };
      }
    } catch (error) {
      throw GrpcError.fromConnectError(error, metadata.requestId);
    }
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
