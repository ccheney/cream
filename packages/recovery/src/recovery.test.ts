/**
 * Recovery Package Tests
 *
 * Tests for checkpoint save/load, cycle detection, reconciliation,
 * and recovery decision logic.
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.CREAM_BROKER = "ALPACA";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "@cream/storage";
import { Checkpointer, createCheckpointer } from "./checkpointer.js";
import { CycleDetector, createCycleDetector } from "./detector.js";
import {
  createMockBrokerFetcher,
  createOrderReconciler,
  OrderReconciler,
} from "./reconciler.js";
import {
  createRecoveryManager,
  RecoveryManager,
} from "./recovery.js";
import type {
  AgentsState,
  BrokerOrder,
  DataFetchState,
  ExecutionState,
  OrderCheckpoint,
  SynthesisState,
} from "./types.js";

// ============================================
// Test Setup
// ============================================

let db: TursoClient;
let checkpointer: Checkpointer;
let detector: CycleDetector;

beforeEach(async () => {
  db = await createInMemoryClient();
  checkpointer = createCheckpointer(db);
  await checkpointer.initialize();
  detector = createCycleDetector(checkpointer);
});

afterEach(async () => {
  db.close();
});

// ============================================
// Checkpointer Tests
// ============================================

describe("Checkpointer", () => {
  describe("checkpoint operations", () => {
    test("saves and loads checkpoint", async () => {
      const cycleId = "test-cycle-1";
      const state: DataFetchState = {
        symbols: ["AAPL", "MSFT"],
        dataTimestamp: "2026-01-05T10:00:00Z",
        complete: true,
      };

      await checkpointer.saveCheckpoint(cycleId, "data_fetch", state);

      const loaded = await checkpointer.loadCheckpoint(cycleId);
      expect(loaded).not.toBeNull();
      expect(loaded!.cycleId).toBe(cycleId);
      expect(loaded!.phase).toBe("data_fetch");
      expect(loaded!.state).toEqual(state);
    });

    test("updates checkpoint on save", async () => {
      const cycleId = "test-cycle-1";
      const state1: DataFetchState = {
        symbols: ["AAPL"],
        dataTimestamp: "2026-01-05T10:00:00Z",
        complete: false,
      };
      const state2: AgentsState = {
        agentOutputs: [{ agentId: "tech", output: {}, completedAt: "2026-01-05T10:01:00Z" }],
        totalAgents: 8,
        complete: false,
      };

      await checkpointer.saveCheckpoint(cycleId, "data_fetch", state1);
      await checkpointer.saveCheckpoint(cycleId, "agents", state2);

      const loaded = await checkpointer.loadCheckpoint(cycleId);
      expect(loaded!.phase).toBe("agents");
      expect(loaded!.state).toEqual(state2);
    });

    test("loads latest checkpoint", async () => {
      const state1: DataFetchState = {
        symbols: ["AAPL"],
        dataTimestamp: "2026-01-05T10:00:00Z",
        complete: true,
      };
      const state2: DataFetchState = {
        symbols: ["MSFT"],
        dataTimestamp: "2026-01-05T11:00:00Z",
        complete: true,
      };

      await checkpointer.saveCheckpoint("cycle-1", "data_fetch", state1);
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      await checkpointer.saveCheckpoint("cycle-2", "data_fetch", state2);

      const latest = await checkpointer.loadLatestCheckpoint();
      expect(latest!.cycleId).toBe("cycle-2");
    });

    test("deletes checkpoint", async () => {
      const cycleId = "test-cycle-1";
      const state: DataFetchState = {
        symbols: ["AAPL"],
        dataTimestamp: "2026-01-05T10:00:00Z",
        complete: true,
      };

      await checkpointer.saveCheckpoint(cycleId, "data_fetch", state);
      await checkpointer.deleteCheckpoint(cycleId);

      const loaded = await checkpointer.loadCheckpoint(cycleId);
      expect(loaded).toBeNull();
    });
  });

  describe("cycle events", () => {
    test("records and retrieves cycle events", async () => {
      const cycleId = "test-cycle-1";

      await checkpointer.markCycleStarted(cycleId, { trigger: "scheduled" });
      await checkpointer.markCycleCompleted(cycleId, { ordersSubmitted: 5 });

      const events = await checkpointer.getCycleEvents(cycleId);
      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe("cycle_started");
      expect(events[1].eventType).toBe("cycle_completed");
    });

    test("checks for cycle events", async () => {
      const cycleId = "test-cycle-1";

      await checkpointer.markCycleStarted(cycleId);

      expect(await checkpointer.hasCycleEvent(cycleId, "cycle_started")).toBe(true);
      expect(await checkpointer.hasCycleEvent(cycleId, "cycle_completed")).toBe(false);
    });

    test("finds incomplete cycles", async () => {
      // Cycle 1: Complete
      await checkpointer.markCycleStarted("cycle-1");
      await checkpointer.markCycleCompleted("cycle-1");

      // Cycle 2: Incomplete
      await checkpointer.markCycleStarted("cycle-2");

      // Cycle 3: Incomplete
      await checkpointer.markCycleStarted("cycle-3");

      const incomplete = await checkpointer.findIncompleteCycles();
      expect(incomplete).toHaveLength(2);
      expect(incomplete).toContain("cycle-2");
      expect(incomplete).toContain("cycle-3");
      expect(incomplete).not.toContain("cycle-1");
    });
  });

  describe("cleanup", () => {
    test("deletes old checkpoints", async () => {
      // Create a checkpointer with very short max age
      const shortLivedCheckpointer = createCheckpointer(db, {
        maxCheckpointAge: 50, // 50ms
      });
      await shortLivedCheckpointer.initialize();

      const state: DataFetchState = {
        symbols: ["AAPL"],
        dataTimestamp: "2026-01-05T10:00:00Z",
        complete: true,
      };

      await shortLivedCheckpointer.saveCheckpoint("old-cycle", "data_fetch", state);

      // Wait for checkpoint to become old
      await new Promise((r) => setTimeout(r, 100));

      const result = await shortLivedCheckpointer.cleanup();
      expect(result.checkpointsDeleted).toBeGreaterThanOrEqual(1);

      const loaded = await shortLivedCheckpointer.loadCheckpoint("old-cycle");
      expect(loaded).toBeNull();
    });
  });
});

// ============================================
// Detector Tests
// ============================================

describe("CycleDetector", () => {
  test("detects incomplete cycle", async () => {
    await checkpointer.markCycleStarted("incomplete-cycle");
    const state: DataFetchState = {
      symbols: ["AAPL"],
      dataTimestamp: "2026-01-05T10:00:00Z",
      complete: true,
    };
    await checkpointer.saveCheckpoint("incomplete-cycle", "data_fetch", state);

    const incomplete = await detector.detectIncompleteCycle();
    expect(incomplete).not.toBeNull();
    expect(incomplete!.cycleId).toBe("incomplete-cycle");
    expect(incomplete!.lastPhase).toBe("data_fetch");
    expect(incomplete!.checkpoint).not.toBeNull();
  });

  test("returns null when no incomplete cycles", async () => {
    await checkpointer.markCycleStarted("complete-cycle");
    await checkpointer.markCycleCompleted("complete-cycle");

    const incomplete = await detector.detectIncompleteCycle();
    expect(incomplete).toBeNull();
  });

  test("detects all incomplete cycles", async () => {
    await checkpointer.markCycleStarted("cycle-1");
    await checkpointer.markCycleStarted("cycle-2");
    await checkpointer.markCycleCompleted("cycle-2");
    await checkpointer.markCycleStarted("cycle-3");

    const incomplete = await detector.detectAllIncompleteCycles();
    expect(incomplete).toHaveLength(2);
  });

  test("counts incomplete cycles", async () => {
    await checkpointer.markCycleStarted("cycle-1");
    await checkpointer.markCycleStarted("cycle-2");

    const count = await detector.countIncompleteCycles();
    expect(count).toBe(2);
  });

  test("checks if specific cycle is incomplete", async () => {
    await checkpointer.markCycleStarted("test-cycle");

    expect(await detector.isCycleIncomplete("test-cycle")).toBe(true);

    await checkpointer.markCycleCompleted("test-cycle");

    expect(await detector.isCycleIncomplete("test-cycle")).toBe(false);
  });
});

// ============================================
// Reconciler Tests
// ============================================

describe("OrderReconciler", () => {
  const makeCheckpointOrder = (overrides: Partial<OrderCheckpoint> = {}): OrderCheckpoint => ({
    clientOrderId: "client-1",
    symbol: "AAPL",
    side: "buy",
    quantity: 100,
    orderType: "limit",
    limitPrice: 150.00,
    status: "submitted",
    submittedAt: "2026-01-05T10:00:00Z",
    ...overrides,
  });

  const makeBrokerOrder = (overrides: Partial<BrokerOrder> = {}): BrokerOrder => ({
    orderId: "broker-1",
    clientOrderId: "client-1",
    symbol: "AAPL",
    side: "buy",
    quantity: 100,
    status: "filled",
    createdAt: "2026-01-05T10:00:00Z",
    ...overrides,
  });

  test("matches orders by client ID", async () => {
    const checkpointOrder = makeCheckpointOrder();
    const brokerOrder = makeBrokerOrder();

    const fetcher = createMockBrokerFetcher([brokerOrder]);
    const reconciler = createOrderReconciler(fetcher);

    const state: ExecutionState = {
      orders: [checkpointOrder],
      complete: false,
    };

    const result = await reconciler.reconcile(state);
    expect(result.matchedOrders).toHaveLength(1);
    expect(result.missingFromBroker).toHaveLength(0);
    expect(result.orphanedOrders).toHaveLength(0);
  });

  test("identifies missing orders from broker", async () => {
    const checkpointOrder = makeCheckpointOrder({ clientOrderId: "missing-order" });

    const fetcher = createMockBrokerFetcher([]); // No broker orders
    const reconciler = createOrderReconciler(fetcher);

    const state: ExecutionState = {
      orders: [checkpointOrder],
      complete: false,
    };

    const result = await reconciler.reconcile(state);
    expect(result.missingFromBroker).toHaveLength(1);
    expect(result.discrepancies.length).toBeGreaterThan(0);
  });

  test("identifies orphaned orders at broker", async () => {
    const brokerOrder = makeBrokerOrder({ clientOrderId: "orphan-order" });

    const fetcher = createMockBrokerFetcher([brokerOrder]);
    const reconciler = createOrderReconciler(fetcher);

    const state: ExecutionState = {
      orders: [], // No checkpoint orders
      complete: false,
    };

    const result = await reconciler.reconcile(state);
    expect(result.orphanedOrders).toHaveLength(1);
  });

  test("detects discrepancies", async () => {
    const checkpointOrder = makeCheckpointOrder({ quantity: 100 });
    const brokerOrder = makeBrokerOrder({ quantity: 50 }); // Different quantity

    const fetcher = createMockBrokerFetcher([brokerOrder]);
    const reconciler = createOrderReconciler(fetcher);

    const state: ExecutionState = {
      orders: [checkpointOrder],
      complete: false,
    };

    const result = await reconciler.reconcile(state);
    expect(result.discrepancies.length).toBeGreaterThan(0);
    expect(result.discrepancies.some((d) => d.includes("Quantity mismatch"))).toBe(true);
  });

  test("determines all orders processed", async () => {
    const checkpointOrder = makeCheckpointOrder({ status: "submitted" });
    const brokerOrder = makeBrokerOrder({ status: "filled" });

    const fetcher = createMockBrokerFetcher([brokerOrder]);
    const reconciler = createOrderReconciler(fetcher);

    const state: ExecutionState = {
      orders: [checkpointOrder],
      complete: false,
    };

    const allProcessed = await reconciler.areAllOrdersProcessed(state);
    expect(allProcessed).toBe(true);
  });

  test("gets pending orders", async () => {
    const order1 = makeCheckpointOrder({ clientOrderId: "order-1", status: "pending" });
    const order2 = makeCheckpointOrder({ clientOrderId: "order-2", status: "submitted" });

    const brokerOrder = makeBrokerOrder({ clientOrderId: "order-2", status: "filled" });

    const fetcher = createMockBrokerFetcher([brokerOrder]);
    const reconciler = createOrderReconciler(fetcher);

    const state: ExecutionState = {
      orders: [order1, order2],
      complete: false,
    };

    const pending = await reconciler.getPendingOrders(state);
    expect(pending).toHaveLength(1);
    expect(pending[0].clientOrderId).toBe("order-1");
  });
});

// ============================================
// Recovery Manager Tests
// ============================================

describe("RecoveryManager", () => {
  let reconciler: OrderReconciler;
  let manager: RecoveryManager;

  beforeEach(() => {
    const fetcher = createMockBrokerFetcher([]);
    reconciler = createOrderReconciler(fetcher);
    manager = createRecoveryManager(checkpointer, detector, reconciler);
  });

  test("returns none when no incomplete cycles", async () => {
    const action = await manager.checkAndRecover();
    expect(action.type).toBe("none");
  });

  test("recommends restart for data_fetch phase crash", async () => {
    await checkpointer.markCycleStarted("test-cycle");
    const state: DataFetchState = {
      symbols: ["AAPL"],
      dataTimestamp: "2026-01-05T10:00:00Z",
      complete: false,
    };
    await checkpointer.saveCheckpoint("test-cycle", "data_fetch", state);

    const action = await manager.checkAndRecover();
    expect(action.type).toBe("restart");
  });

  test("recommends restart for agents phase crash", async () => {
    await checkpointer.markCycleStarted("test-cycle");
    const state: AgentsState = {
      agentOutputs: [],
      totalAgents: 8,
      complete: false,
    };
    await checkpointer.saveCheckpoint("test-cycle", "agents", state);

    const action = await manager.checkAndRecover();
    expect(action.type).toBe("restart");
  });

  test("recommends restart for synthesis phase crash", async () => {
    await checkpointer.markCycleStarted("test-cycle");
    const state: SynthesisState = {
      decisionPlan: null,
      complete: false,
    };
    await checkpointer.saveCheckpoint("test-cycle", "synthesis", state);

    const action = await manager.checkAndRecover();
    expect(action.type).toBe("restart");
  });

  test("recommends complete when all execution orders processed", async () => {
    // Set up broker with filled order
    const brokerOrder: BrokerOrder = {
      orderId: "broker-1",
      clientOrderId: "order-1",
      symbol: "AAPL",
      side: "buy",
      quantity: 100,
      status: "filled",
      createdAt: "2026-01-05T10:00:00Z",
    };

    const fetcher = createMockBrokerFetcher([brokerOrder]);
    reconciler = createOrderReconciler(fetcher);
    manager = createRecoveryManager(checkpointer, detector, reconciler);

    await checkpointer.markCycleStarted("test-cycle");
    const state: ExecutionState = {
      orders: [
        {
          clientOrderId: "order-1",
          symbol: "AAPL",
          side: "buy",
          quantity: 100,
          orderType: "limit",
          status: "submitted",
        },
      ],
      complete: false,
    };
    await checkpointer.saveCheckpoint("test-cycle", "execution", state);

    const action = await manager.checkAndRecover();
    expect(action.type).toBe("complete");
  });

  test("recommends resume when execution has pending orders", async () => {
    // Set up broker with no orders (simulating orders not yet submitted)
    const fetcher = createMockBrokerFetcher([]);
    reconciler = createOrderReconciler(fetcher);
    manager = createRecoveryManager(checkpointer, detector, reconciler);

    await checkpointer.markCycleStarted("test-cycle");
    const state: ExecutionState = {
      orders: [
        {
          clientOrderId: "order-1",
          symbol: "AAPL",
          side: "buy",
          quantity: 100,
          orderType: "limit",
          status: "pending",
        },
      ],
      complete: false,
    };
    await checkpointer.saveCheckpoint("test-cycle", "execution", state);

    const action = await manager.checkAndRecover();
    expect(action.type).toBe("resume");
    if (action.type === "resume") {
      expect(action.fromPhase).toBe("execution");
    }
  });

  test("generates unique cycle IDs", () => {
    const id1 = RecoveryManager.generateCycleId();
    const id2 = RecoveryManager.generateCycleId();

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^cycle-/);
  });
});
