/**
 * Execution Engine Integration Tests
 *
 * Tests the gRPC interface to the Rust Execution Engine using testcontainers.
 *
 * @see docs/plans/14-testing.md lines 132-168
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";

// ============================================
// Types
// ============================================

/**
 * gRPC client interface for Execution Engine.
 * Will be implemented with actual gRPC client in Phase 3.
 */
interface ExecutionEngineClient {
  validateConstraints(plan: DecisionPlan): Promise<ConstraintValidationResult>;
  submitOrder(order: OrderRequest): Promise<OrderResponse>;
  getOrderStatus(orderId: string): Promise<OrderStatus>;
}

interface DecisionPlan {
  instrument: { instrumentId: string; instrumentType: string };
  action: string;
  size: { quantity: number; unit: string };
  orderPlan: {
    entryOrderType: string;
    entryLimitPrice: number;
    timeInForce: string;
  };
  riskLevels: {
    stopLossLevel: number;
    takeProfitLevel: number;
    denomination: string;
  };
}

interface ConstraintValidationResult {
  valid: boolean;
  violations: Array<{
    constraint: string;
    message: string;
    severity: "ERROR" | "WARNING";
  }>;
}

interface OrderRequest {
  planId: string;
  instrument: { instrumentId: string; instrumentType: string };
  side: "BUY" | "SELL";
  quantity: number;
  orderType: "LIMIT" | "MARKET";
  limitPrice?: number;
}

interface OrderResponse {
  orderId: string;
  status: "PENDING" | "SUBMITTED" | "REJECTED";
  message?: string;
}

interface OrderStatus {
  orderId: string;
  status: "PENDING" | "SUBMITTED" | "FILLED" | "CANCELLED" | "REJECTED";
  filledQuantity: number;
  averagePrice?: number;
}

// ============================================
// Test Helpers
// ============================================

/**
 * Creates a decision plan that exceeds position limits.
 */
function createPlanExceedingLimits(): DecisionPlan {
  return {
    instrument: { instrumentId: "AAPL", instrumentType: "EQUITY" },
    action: "BUY",
    size: { quantity: 1000000, unit: "SHARES" }, // Exceeds typical limits
    orderPlan: {
      entryOrderType: "LIMIT",
      entryLimitPrice: 185.0,
      timeInForce: "DAY",
    },
    riskLevels: {
      stopLossLevel: 179.5,
      takeProfitLevel: 195.0,
      denomination: "UNDERLYING_PRICE",
    },
  };
}

/**
 * Creates a valid decision plan within all constraints.
 */
function createValidPlan(): DecisionPlan {
  return {
    instrument: { instrumentId: "AAPL", instrumentType: "EQUITY" },
    action: "BUY",
    size: { quantity: 100, unit: "SHARES" },
    orderPlan: {
      entryOrderType: "LIMIT",
      entryLimitPrice: 185.0,
      timeInForce: "DAY",
    },
    riskLevels: {
      stopLossLevel: 179.5,
      takeProfitLevel: 195.0,
      denomination: "UNDERLYING_PRICE",
    },
  };
}

/**
 * Mock Execution Engine client for testing.
 * Will be replaced with actual gRPC client when Execution Engine is built.
 */
function createMockClient(): ExecutionEngineClient {
  const orderStore = new Map<string, OrderStatus>();
  let orderCounter = 0;

  return {
    async validateConstraints(plan: DecisionPlan): Promise<ConstraintValidationResult> {
      const violations: ConstraintValidationResult["violations"] = [];

      // Check position size limits
      if (plan.size.quantity > 10000) {
        violations.push({
          constraint: "MAX_POSITION_SIZE",
          message: `Position size ${plan.size.quantity} exceeds maximum of 10000`,
          severity: "ERROR",
        });
      }

      // Check risk levels
      if (plan.riskLevels.stopLossLevel >= plan.orderPlan.entryLimitPrice) {
        violations.push({
          constraint: "STOP_LOSS_INVALID",
          message: "Stop loss must be below entry price for long positions",
          severity: "ERROR",
        });
      }

      return {
        valid: violations.filter((v) => v.severity === "ERROR").length === 0,
        violations,
      };
    },

    async submitOrder(order: OrderRequest): Promise<OrderResponse> {
      const orderId = `order-${++orderCounter}`;

      // Simple validation
      if (order.quantity <= 0) {
        return {
          orderId,
          status: "REJECTED",
          message: "Quantity must be positive",
        };
      }

      // Store order status
      orderStore.set(orderId, {
        orderId,
        status: "SUBMITTED",
        filledQuantity: 0,
      });

      return {
        orderId,
        status: "SUBMITTED",
      };
    },

    async getOrderStatus(orderId: string): Promise<OrderStatus> {
      const status = orderStore.get(orderId);
      if (!status) {
        return {
          orderId,
          status: "REJECTED",
          filledQuantity: 0,
        };
      }
      return status;
    },
  };
}

// ============================================
// Integration Tests
// ============================================

describe("Execution Engine Integration", () => {
  const container: StartedTestContainer | null = null;
  let client: ExecutionEngineClient;

  // NOTE: Container-based tests are skipped until the Execution Engine Docker image exists.
  // For now, we use a mock client to validate the test structure.

  beforeAll(async () => {
    // TODO: Uncomment when cream/execution-engine:test image is available
    // container = await new GenericContainer("cream/execution-engine:test")
    //   .withExposedPorts(50051)
    //   .withWaitStrategy(Wait.forLogMessage("gRPC server listening"))
    //   .start();
    //
    // client = new ExecutionEngineClient(
    //   `localhost:${container.getMappedPort(50051)}`
    // );

    // Use mock client for now
    client = createMockClient();
  });

  afterAll(async () => {
    if (container) {
      await container.stop();
    }
  });

  describe("Constraint Validation", () => {
    it("validates a plan within constraints", async () => {
      const plan = createValidPlan();
      const result = await client.validateConstraints(plan);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("rejects a plan exceeding position limits", async () => {
      const plan = createPlanExceedingLimits();
      const result = await client.validateConstraints(plan);

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations.some((v) => v.constraint === "MAX_POSITION_SIZE")).toBe(true);
    });

    it("detects invalid stop loss level", async () => {
      const plan = createValidPlan();
      plan.riskLevels.stopLossLevel = 200; // Above entry price

      const result = await client.validateConstraints(plan);

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.constraint === "STOP_LOSS_INVALID")).toBe(true);
    });
  });

  describe("Order Routing", () => {
    it("submits a valid order successfully", async () => {
      const order: OrderRequest = {
        planId: "plan-1",
        instrument: { instrumentId: "AAPL", instrumentType: "EQUITY" },
        side: "BUY",
        quantity: 100,
        orderType: "LIMIT",
        limitPrice: 185.0,
      };

      const response = await client.submitOrder(order);

      expect(response.status).toBe("SUBMITTED");
      expect(response.orderId).toBeDefined();
    });

    it("rejects an order with invalid quantity", async () => {
      const order: OrderRequest = {
        planId: "plan-2",
        instrument: { instrumentId: "AAPL", instrumentType: "EQUITY" },
        side: "BUY",
        quantity: -10,
        orderType: "MARKET",
      };

      const response = await client.submitOrder(order);

      expect(response.status).toBe("REJECTED");
      expect(response.message).toBeDefined();
    });

    it("retrieves order status after submission", async () => {
      const order: OrderRequest = {
        planId: "plan-3",
        instrument: { instrumentId: "MSFT", instrumentType: "EQUITY" },
        side: "SELL",
        quantity: 50,
        orderType: "MARKET",
      };

      const submitResponse = await client.submitOrder(order);
      const status = await client.getOrderStatus(submitResponse.orderId);

      expect(status.orderId).toBe(submitResponse.orderId);
      expect(status.status).toBe("SUBMITTED");
    });

    it("returns rejected status for unknown order", async () => {
      const status = await client.getOrderStatus("unknown-order-id");

      expect(status.status).toBe("REJECTED");
    });
  });
});

describe("Execution Engine Container", () => {
  // These tests validate the container lifecycle when the image is available
  it.skip("starts and stops container", async () => {
    const container = await new GenericContainer("cream/execution-engine:test")
      .withExposedPorts(50051)
      .withWaitStrategy(Wait.forLogMessage("gRPC server listening"))
      .start();

    expect(container.getMappedPort(50051)).toBeDefined();

    await container.stop();
  });

  it.skip("exposes gRPC port", async () => {
    const container = await new GenericContainer("cream/execution-engine:test")
      .withExposedPorts(50051)
      .start();

    const port = container.getMappedPort(50051);
    expect(port).toBeGreaterThan(0);

    await container.stop();
  });
});
