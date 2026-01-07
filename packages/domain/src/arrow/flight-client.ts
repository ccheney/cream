/**
 * Arrow Flight gRPC Client
 *
 * Type-safe wrapper for the Arrow Flight service.
 * Uses Connect-ES with gRPC transport for communication.
 */

// biome-ignore-all lint/suspicious/noConsole: Intentional logging controlled by enableLogging config

import { createClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import {
  Action,
  Criteria,
  Empty,
  type FlightData,
  FlightDescriptor,
  FlightDescriptor_DescriptorType,
  type FlightInfo,
  Ticket,
} from "@cream/schema-gen/arrow/flight/protocol";
import { FlightService } from "@cream/schema-gen/arrow/flight/protocol_connect";
import { tableFromIPC } from "apache-arrow";
import { GrpcError, RetryBackoff, sleep } from "../grpc/errors.js";
import {
  DEFAULT_GRPC_CONFIG,
  type GrpcCallMetadata,
  type GrpcCallResult,
  type GrpcClientConfig,
  isRetryableErrorCode,
} from "../grpc/types.js";

/**
 * Decoded Arrow table from Flight response
 */
export interface FlightTableResult<T = Record<string, unknown>> {
  /** Decoded rows from the Arrow table */
  rows: T[];
  /** Number of rows */
  rowCount: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Schema field names */
  fields: string[];
}

/**
 * Arrow Flight client with error handling and retries
 */
export class FlightServiceClient {
  private readonly config: Required<GrpcClientConfig>;
  private readonly client: ReturnType<typeof createClient<typeof FlightService>>;

  constructor(config: GrpcClientConfig) {
    this.config = {
      ...DEFAULT_GRPC_CONFIG,
      ...config,
    };

    // Create gRPC transport (httpVersion "2" is required for gRPC)
    const transport = createGrpcTransport({
      baseUrl: this.config.baseUrl,
      httpVersion: "2",
    });

    // Create Connect client
    this.client = createClient(FlightService, transport);
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `flight-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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
          console.log(`[Flight] ${metadata.requestId} completed in ${durationMs}ms`);
        }

        return { data, metadata, durationMs };
      } catch (error) {
        lastError = GrpcError.fromConnectError(error, metadata.requestId);

        if (this.config.enableLogging) {
          console.warn(
            `[Flight] ${metadata.requestId} attempt ${attempt + 1} failed:`,
            lastError.message
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

    throw lastError ?? new GrpcError("Unknown error", "UNKNOWN", { requestId: metadata.requestId });
  }

  /**
   * List available flights
   */
  async listFlights(
    criteria?: Uint8Array,
    cycleId?: string
  ): Promise<GrpcCallResult<FlightInfo[]>> {
    const metadata = this.createMetadata(cycleId);

    if (this.config.enableLogging) {
      console.log(`[Flight] ${metadata.requestId} listFlights`);
    }

    const request = new Criteria({
      expression: criteria ? new Uint8Array(criteria) : new Uint8Array(0),
    });

    return this.executeWithRetry(async () => {
      const flights: FlightInfo[] = [];
      for await (const flight of this.client.listFlights(request)) {
        flights.push(flight);
      }
      return flights;
    }, metadata);
  }

  /**
   * Get flight info for a path
   */
  async getFlightInfo(path: string[], cycleId?: string): Promise<GrpcCallResult<FlightInfo>> {
    const metadata = this.createMetadata(cycleId);

    if (this.config.enableLogging) {
      console.log(`[Flight] ${metadata.requestId} getFlightInfo for ${path.join("/")}`);
    }

    const descriptor = new FlightDescriptor({
      type: FlightDescriptor_DescriptorType.PATH,
      path,
    });

    return this.executeWithRetry(() => this.client.getFlightInfo(descriptor), metadata);
  }

  /**
   * Get data from a flight ticket
   *
   * Returns raw FlightData messages. Use doGetAndDecode for automatic Arrow IPC decoding.
   */
  async doGet(
    ticketData: string | Uint8Array,
    cycleId?: string
  ): Promise<GrpcCallResult<FlightData[]>> {
    const metadata = this.createMetadata(cycleId);

    const ticketBytes =
      typeof ticketData === "string"
        ? new TextEncoder().encode(ticketData)
        : new Uint8Array(ticketData);

    if (this.config.enableLogging) {
      console.log(`[Flight] ${metadata.requestId} doGet`);
    }

    const ticket = new Ticket({
      ticket: ticketBytes,
    });

    return this.executeWithRetry(async () => {
      const data: FlightData[] = [];
      for await (const chunk of this.client.doGet(ticket)) {
        data.push(chunk);
      }
      return data;
    }, metadata);
  }

  /**
   * Get data from a flight ticket and decode as Arrow table
   *
   * Combines FlightData messages into an Arrow IPC stream and decodes to rows.
   */
  async doGetAndDecode<T = Record<string, unknown>>(
    ticketData: string | Uint8Array,
    cycleId?: string
  ): Promise<FlightTableResult<T>> {
    const startTime = Date.now();

    // Get raw flight data
    const result = await this.doGet(ticketData, cycleId);

    // Combine data_header and data_body from all FlightData messages
    // Arrow Flight sends schema in first message's data_header, then batches in data_body
    const ipcBuffers: Uint8Array[] = [];

    for (const flightData of result.data) {
      // Add data_header (contains schema or dictionary batches)
      if (flightData.dataHeader.length > 0) {
        ipcBuffers.push(flightData.dataHeader);
      }
      // Add data_body (contains record batches)
      if (flightData.dataBody.length > 0) {
        ipcBuffers.push(flightData.dataBody);
      }
    }

    // If no data, return empty result
    if (ipcBuffers.length === 0) {
      return {
        rows: [],
        rowCount: 0,
        durationMs: Date.now() - startTime,
        fields: [],
      };
    }

    // Combine buffers into single IPC stream
    const totalLength = ipcBuffers.reduce((sum, buf) => sum + buf.length, 0);
    const combinedBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of ipcBuffers) {
      combinedBuffer.set(buf, offset);
      offset += buf.length;
    }

    // Decode Arrow IPC
    const table = tableFromIPC(combinedBuffer);

    // Convert to row objects
    const rows = table.toArray() as T[];
    const fields = table.schema.fields.map((f) => f.name);

    return {
      rows,
      rowCount: rows.length,
      durationMs: Date.now() - startTime,
      fields,
    };
  }

  /**
   * Execute an action on the server
   */
  async doAction(
    actionType: string,
    body?: Uint8Array,
    cycleId?: string
  ): Promise<GrpcCallResult<Uint8Array[]>> {
    const metadata = this.createMetadata(cycleId);

    if (this.config.enableLogging) {
      console.log(`[Flight] ${metadata.requestId} doAction: ${actionType}`);
    }

    const action = new Action({
      type: actionType,
      body: body ? new Uint8Array(body) : new Uint8Array(0),
    });

    return this.executeWithRetry(async () => {
      const results: Uint8Array[] = [];
      for await (const result of this.client.doAction(action)) {
        results.push(result.body);
      }
      return results;
    }, metadata);
  }

  /**
   * List available actions
   */
  async listActions(
    cycleId?: string
  ): Promise<GrpcCallResult<Array<{ type: string; description: string }>>> {
    const metadata = this.createMetadata(cycleId);

    if (this.config.enableLogging) {
      console.log(`[Flight] ${metadata.requestId} listActions`);
    }

    return this.executeWithRetry(async () => {
      const actions: Array<{ type: string; description: string }> = [];
      for await (const action of this.client.listActions(new Empty())) {
        actions.push({
          type: action.type,
          description: action.description,
        });
      }
      return actions;
    }, metadata);
  }

  /**
   * Health check action
   */
  async healthCheck(
    cycleId?: string
  ): Promise<GrpcCallResult<{ status: string; cacheSize: number }>> {
    const result = await this.doAction("health_check", undefined, cycleId);

    // Parse JSON response from health_check action
    const responseText = new TextDecoder().decode(result.data[0] ?? new Uint8Array());
    const parsed = JSON.parse(responseText) as { status: string; cache_size: number };

    return {
      data: {
        status: parsed.status,
        cacheSize: parsed.cache_size,
      },
      metadata: result.metadata,
      durationMs: result.durationMs,
    };
  }
}

/**
 * Create a FlightServiceClient with default configuration
 */
export function createFlightServiceClient(
  baseUrl: string,
  options?: Partial<Omit<GrpcClientConfig, "baseUrl">>
): FlightServiceClient {
  return new FlightServiceClient({ baseUrl, ...options });
}
