/**
 * gRPC Client for Rust Execution Engine
 *
 * Connects to the Rust execution engine at localhost:50051
 * to call CheckConstraints and SubmitOrders.
 */

import { createChannel, createClient } from "nice-grpc";

// ============================================
// Types (will be generated from protobuf)
// ============================================

export interface CheckConstraintsRequest {
  plan: unknown;
}

export interface CheckConstraintsResponse {
  passed: boolean;
  violations: string[];
}

export interface SubmitOrdersRequest {
  orders: unknown[];
}

export interface SubmitOrdersResponse {
  submitted: boolean;
  orderIds: string[];
  errors: string[];
}

export interface GetOrderStateRequest {
  orderId: string;
}

export interface GetOrderStateResponse {
  orderId: string;
  status: string;
  filledQty: number;
  avgPrice: number;
}

// ============================================
// Service Definition (stub until protobuf)
// ============================================

// This will be replaced with generated service definition from protobuf
const ExecutionServiceDefinition = {
  name: "ExecutionService",
  fullName: "cream.execution.v1.ExecutionService",
  methods: {
    checkConstraints: {
      name: "CheckConstraints",
      requestType: {} as CheckConstraintsRequest,
      requestStream: false,
      responseType: {} as CheckConstraintsResponse,
      responseStream: false,
      options: {},
    },
    submitOrders: {
      name: "SubmitOrders",
      requestType: {} as SubmitOrdersRequest,
      requestStream: false,
      responseType: {} as SubmitOrdersResponse,
      responseStream: false,
      options: {},
    },
    getOrderState: {
      name: "GetOrderState",
      requestType: {} as GetOrderStateRequest,
      requestStream: false,
      responseType: {} as GetOrderStateResponse,
      responseStream: false,
      options: {},
    },
  },
} as const;

// ============================================
// Client Implementation
// ============================================

export interface ExecutionEngineClient {
  checkConstraints(request: CheckConstraintsRequest): Promise<CheckConstraintsResponse>;
  submitOrders(request: SubmitOrdersRequest): Promise<SubmitOrdersResponse>;
  getOrderState(request: GetOrderStateRequest): Promise<GetOrderStateResponse>;
  close(): void;
}

/**
 * Create a gRPC client connected to the Rust execution engine.
 *
 * @param address - Server address (default: localhost:50051)
 */
export function createExecutionEngineClient(
  address: string = "localhost:50051"
): ExecutionEngineClient {
  const channel = createChannel(address);

  // For now, return a mock client
  // Real implementation will use: const client = createClient(ExecutionServiceDefinition, channel);

  return {
    async checkConstraints(request: CheckConstraintsRequest): Promise<CheckConstraintsResponse> {
      console.log(`[gRPC] CheckConstraints called with plan`);

      // STUB: Return success for all plans
      // Real implementation: return await client.checkConstraints(request);
      return {
        passed: true,
        violations: [],
      };
    },

    async submitOrders(request: SubmitOrdersRequest): Promise<SubmitOrdersResponse> {
      console.log(`[gRPC] SubmitOrders called with ${request.orders.length} orders`);

      // STUB: Return success
      // Real implementation: return await client.submitOrders(request);
      return {
        submitted: true,
        orderIds: request.orders.map((_, i) => `order-${Date.now()}-${i}`),
        errors: [],
      };
    },

    async getOrderState(request: GetOrderStateRequest): Promise<GetOrderStateResponse> {
      console.log(`[gRPC] GetOrderState called for ${request.orderId}`);

      // STUB: Return filled status
      // Real implementation: return await client.getOrderState(request);
      return {
        orderId: request.orderId,
        status: "FILLED",
        filledQty: 100,
        avgPrice: 150.0,
      };
    },

    close(): void {
      // channel.close() when using real gRPC
      console.log("[gRPC] Client closed");
    },
  };
}

/**
 * Global client instance (singleton)
 */
let globalClient: ExecutionEngineClient | null = null;

export function getExecutionEngineClient(): ExecutionEngineClient {
  if (!globalClient) {
    const address = Bun.env.EXECUTION_ENGINE_ADDRESS ?? "localhost:50051";
    globalClient = createExecutionEngineClient(address);
  }
  return globalClient;
}

export function closeExecutionEngineClient(): void {
  if (globalClient) {
    globalClient.close();
    globalClient = null;
  }
}
