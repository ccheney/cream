/**
 * Execution Schema Tests
 */

import { describe, expect, test } from "bun:test";
import {
  AccountStateSchema,
  CheckConstraintsRequestSchema,
  CheckConstraintsResponseSchema,
  ConstraintCheckSchema,
  ConstraintResult,
  ExecutionAckSchema,
  GetAccountStateRequestSchema,
  GetPositionsRequestSchema,
  GetPositionsResponseSchema,
  OrderSide,
  OrderStatus,
  PositionSchema,
  StreamExecutionsRequestSchema,
  SubmitOrderRequestSchema,
  SubmitOrderResponseSchema,
} from "./execution";

// ============================================
// Test Fixtures
// ============================================

const validTimestamp = "2026-01-04T16:30:00Z";

const validInstrument = {
  instrumentId: "AAPL",
  instrumentType: "EQUITY" as const,
};

const validOptionInstrument = {
  instrumentId: "AAPL260117C00190000",
  instrumentType: "OPTION" as const,
  optionContract: {
    underlying: "AAPL",
    expiration: "2026-01-17",
    strike: 190.0,
    optionType: "CALL" as const,
  },
};

const validAccountState = {
  accountId: "ACC123",
  equity: 100000.0,
  buyingPower: 50000.0,
  marginUsed: 10000.0,
  dayTradeCount: 2,
  isPdtRestricted: false,
  asOf: validTimestamp,
};

const validPosition = {
  instrument: validInstrument,
  quantity: 100,
  avgEntryPrice: 180.0,
  marketValue: 18500.0,
  unrealizedPnl: 500.0,
  unrealizedPnlPct: 2.78,
  costBasis: 18000.0,
};

// ============================================
// Enum Tests
// ============================================

describe("ConstraintResult", () => {
  test("accepts valid values", () => {
    expect(ConstraintResult.safeParse("PASS").success).toBe(true);
    expect(ConstraintResult.safeParse("FAIL").success).toBe(true);
    expect(ConstraintResult.safeParse("WARN").success).toBe(true);
  });

  test("rejects invalid values", () => {
    expect(ConstraintResult.safeParse("INVALID").success).toBe(false);
  });
});

describe("OrderStatus", () => {
  test("accepts all valid statuses", () => {
    const statuses = [
      "PENDING",
      "ACCEPTED",
      "PARTIAL_FILL",
      "FILLED",
      "CANCELLED",
      "REJECTED",
      "EXPIRED",
    ];
    for (const status of statuses) {
      expect(OrderStatus.safeParse(status).success).toBe(true);
    }
  });
});

describe("OrderSide", () => {
  test("accepts valid sides", () => {
    expect(OrderSide.safeParse("BUY").success).toBe(true);
    expect(OrderSide.safeParse("SELL").success).toBe(true);
  });
});

// ============================================
// Account State Tests
// ============================================

describe("AccountStateSchema", () => {
  test("accepts valid account state", () => {
    const result = AccountStateSchema.safeParse(validAccountState);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.equity).toBe(100000.0);
      expect(result.data.isPdtRestricted).toBe(false);
    }
  });

  test("accepts zero buying power", () => {
    const result = AccountStateSchema.safeParse({
      ...validAccountState,
      buyingPower: 0,
    });
    expect(result.success).toBe(true);
  });

  test("rejects negative equity", () => {
    const result = AccountStateSchema.safeParse({
      ...validAccountState,
      equity: -1000,
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-integer day trade count", () => {
    const result = AccountStateSchema.safeParse({
      ...validAccountState,
      dayTradeCount: 2.5,
    });
    expect(result.success).toBe(false);
  });

  test("accepts PDT restricted account", () => {
    const result = AccountStateSchema.safeParse({
      ...validAccountState,
      isPdtRestricted: true,
    });
    expect(result.success).toBe(true);
  });
});

// ============================================
// Position Tests
// ============================================

describe("PositionSchema", () => {
  test("accepts valid long position", () => {
    const result = PositionSchema.safeParse(validPosition);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantity).toBe(100);
    }
  });

  test("accepts short position (negative quantity)", () => {
    const result = PositionSchema.safeParse({
      ...validPosition,
      quantity: -50,
      unrealizedPnl: -200,
    });
    expect(result.success).toBe(true);
  });

  test("accepts option position", () => {
    const result = PositionSchema.safeParse({
      ...validPosition,
      instrument: validOptionInstrument,
      quantity: 10,
    });
    expect(result.success).toBe(true);
  });

  test("accepts negative unrealized P&L", () => {
    const result = PositionSchema.safeParse({
      ...validPosition,
      unrealizedPnl: -500.0,
      unrealizedPnlPct: -2.78,
    });
    expect(result.success).toBe(true);
  });
});

// ============================================
// Constraint Check Tests
// ============================================

describe("ConstraintCheckSchema", () => {
  const validCheck = {
    name: "MaxPositionSize",
    result: "PASS" as const,
    description: "Position size within limit",
    actualValue: 5000.0,
    threshold: 10000.0,
  };

  test("accepts valid constraint check", () => {
    const result = ConstraintCheckSchema.safeParse(validCheck);
    expect(result.success).toBe(true);
  });

  test("accepts check without optional fields", () => {
    const result = ConstraintCheckSchema.safeParse({
      name: "MarketOpen",
      result: "PASS" as const,
      description: "Market is open",
    });
    expect(result.success).toBe(true);
  });

  test("accepts WARN result", () => {
    const result = ConstraintCheckSchema.safeParse({
      ...validCheck,
      result: "WARN",
    });
    expect(result.success).toBe(true);
  });
});

describe("CheckConstraintsRequestSchema", () => {
  const validDecisionPlan = {
    cycleId: "cycle-123",
    asOfTimestamp: validTimestamp,
    environment: "PAPER" as const,
    decisions: [],
  };

  test("accepts valid request", () => {
    const result = CheckConstraintsRequestSchema.safeParse({
      decisionPlan: validDecisionPlan,
      accountState: validAccountState,
      positions: [validPosition],
    });
    expect(result.success).toBe(true);
  });

  test("accepts request with empty positions", () => {
    const result = CheckConstraintsRequestSchema.safeParse({
      decisionPlan: validDecisionPlan,
      accountState: validAccountState,
      positions: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("CheckConstraintsResponseSchema", () => {
  test("accepts approved response", () => {
    const result = CheckConstraintsResponseSchema.safeParse({
      approved: true,
      checks: [
        {
          name: "MaxExposure",
          result: "PASS",
          description: "Within exposure limits",
        },
      ],
      validatedAt: validTimestamp,
    });
    expect(result.success).toBe(true);
  });

  test("accepts rejected response with reason", () => {
    const result = CheckConstraintsResponseSchema.safeParse({
      approved: false,
      checks: [
        {
          name: "MaxExposure",
          result: "FAIL",
          description: "Exceeded exposure limits",
        },
      ],
      validatedAt: validTimestamp,
      rejectionReason: "Position size exceeds maximum allowed",
    });
    expect(result.success).toBe(true);
  });
});

// ============================================
// Order Execution Tests
// ============================================

describe("SubmitOrderRequestSchema", () => {
  const validOrderRequest = {
    instrument: validInstrument,
    side: "BUY" as const,
    quantity: 100,
    orderType: "LIMIT" as const,
    limitPrice: 185.0,
    timeInForce: "DAY" as const,
    clientOrderId: "client-order-123",
    cycleId: "cycle-456",
  };

  test("accepts valid limit order", () => {
    const result = SubmitOrderRequestSchema.safeParse(validOrderRequest);
    expect(result.success).toBe(true);
  });

  test("accepts valid market order without limit price", () => {
    const { limitPrice, ...marketOrder } = validOrderRequest;
    const result = SubmitOrderRequestSchema.safeParse({
      ...marketOrder,
      orderType: "MARKET",
    });
    expect(result.success).toBe(true);
  });

  test("rejects limit order without limit price", () => {
    const { limitPrice, ...orderWithoutPrice } = validOrderRequest;
    const result = SubmitOrderRequestSchema.safeParse(orderWithoutPrice);
    expect(result.success).toBe(false);
  });

  test("rejects zero quantity", () => {
    const result = SubmitOrderRequestSchema.safeParse({
      ...validOrderRequest,
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  test("accepts all time in force values", () => {
    const tifs = ["DAY", "GTC", "IOC", "FOK"] as const;
    for (const tif of tifs) {
      const result = SubmitOrderRequestSchema.safeParse({
        ...validOrderRequest,
        timeInForce: tif,
      });
      expect(result.success).toBe(true);
    }
  });

  test("accepts option instrument", () => {
    const result = SubmitOrderRequestSchema.safeParse({
      ...validOrderRequest,
      instrument: validOptionInstrument,
      quantity: 5,
    });
    expect(result.success).toBe(true);
  });
});

describe("SubmitOrderResponseSchema", () => {
  test("accepts successful submission", () => {
    const result = SubmitOrderResponseSchema.safeParse({
      orderId: "broker-order-789",
      clientOrderId: "client-order-123",
      status: "ACCEPTED",
      submittedAt: validTimestamp,
    });
    expect(result.success).toBe(true);
  });

  test("accepts rejected order with error", () => {
    const result = SubmitOrderResponseSchema.safeParse({
      orderId: "broker-order-789",
      clientOrderId: "client-order-123",
      status: "REJECTED",
      submittedAt: validTimestamp,
      errorMessage: "Insufficient buying power",
    });
    expect(result.success).toBe(true);
  });
});

describe("ExecutionAckSchema", () => {
  test("accepts filled execution", () => {
    const result = ExecutionAckSchema.safeParse({
      orderId: "broker-order-789",
      clientOrderId: "client-order-123",
      status: "FILLED",
      filledQuantity: 100,
      avgFillPrice: 185.25,
      remainingQuantity: 0,
      updatedAt: validTimestamp,
      commission: 0.0,
    });
    expect(result.success).toBe(true);
  });

  test("accepts partial fill", () => {
    const result = ExecutionAckSchema.safeParse({
      orderId: "broker-order-789",
      clientOrderId: "client-order-123",
      status: "PARTIAL_FILL",
      filledQuantity: 50,
      avgFillPrice: 185.25,
      remainingQuantity: 50,
      updatedAt: validTimestamp,
      commission: 0.0,
    });
    expect(result.success).toBe(true);
  });

  test("accepts pending order with zero fill", () => {
    const result = ExecutionAckSchema.safeParse({
      orderId: "broker-order-789",
      clientOrderId: "client-order-123",
      status: "PENDING",
      filledQuantity: 0,
      avgFillPrice: 0,
      remainingQuantity: 100,
      updatedAt: validTimestamp,
      commission: 0,
    });
    expect(result.success).toBe(true);
  });
});

// ============================================
// Service Request/Response Tests
// ============================================

describe("StreamExecutionsRequestSchema", () => {
  test("accepts request with cycle filter", () => {
    const result = StreamExecutionsRequestSchema.safeParse({
      cycleId: "cycle-123",
    });
    expect(result.success).toBe(true);
  });

  test("accepts request with order IDs filter", () => {
    const result = StreamExecutionsRequestSchema.safeParse({
      orderIds: ["order-1", "order-2"],
    });
    expect(result.success).toBe(true);
  });

  test("accepts empty request", () => {
    const result = StreamExecutionsRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("GetAccountStateRequestSchema", () => {
  test("accepts request with account ID", () => {
    const result = GetAccountStateRequestSchema.safeParse({
      accountId: "ACC123",
    });
    expect(result.success).toBe(true);
  });

  test("accepts empty request (uses default)", () => {
    const result = GetAccountStateRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("GetPositionsRequestSchema", () => {
  test("accepts request with symbols filter", () => {
    const result = GetPositionsRequestSchema.safeParse({
      symbols: ["AAPL", "GOOGL"],
    });
    expect(result.success).toBe(true);
  });

  test("accepts empty request", () => {
    const result = GetPositionsRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("GetPositionsResponseSchema", () => {
  test("accepts response with positions", () => {
    const result = GetPositionsResponseSchema.safeParse({
      positions: [validPosition],
      asOf: validTimestamp,
    });
    expect(result.success).toBe(true);
  });

  test("accepts empty positions", () => {
    const result = GetPositionsResponseSchema.safeParse({
      positions: [],
      asOf: validTimestamp,
    });
    expect(result.success).toBe(true);
  });
});

// ============================================
// Action Semantics and Broker Order Mapping Tests
// ============================================

import { ActionMappingError, deriveActionFromPositions, mapActionToBrokerOrder } from "./execution";

describe("mapActionToBrokerOrder", () => {
  describe("BUY action", () => {
    test("maps flat to long position", () => {
      const result = mapActionToBrokerOrder("BUY", 0, 100);
      expect(result).not.toBeNull();
      expect(result?.side).toBe("BUY");
      expect(result?.quantity).toBe(100);
    });

    test("throws if not flat", () => {
      expect(() => mapActionToBrokerOrder("BUY", 50, 150)).toThrow(ActionMappingError);
    });

    test("throws if target not positive", () => {
      expect(() => mapActionToBrokerOrder("BUY", 0, 0)).toThrow(ActionMappingError);
      expect(() => mapActionToBrokerOrder("BUY", 0, -100)).toThrow(ActionMappingError);
    });
  });

  describe("SELL action", () => {
    test("maps flat to short position", () => {
      const result = mapActionToBrokerOrder("SELL", 0, -100);
      expect(result).not.toBeNull();
      expect(result?.side).toBe("SELL");
      expect(result?.quantity).toBe(100);
    });

    test("throws if not flat", () => {
      expect(() => mapActionToBrokerOrder("SELL", -50, -150)).toThrow(ActionMappingError);
    });

    test("throws if target not negative", () => {
      expect(() => mapActionToBrokerOrder("SELL", 0, 0)).toThrow(ActionMappingError);
      expect(() => mapActionToBrokerOrder("SELL", 0, 100)).toThrow(ActionMappingError);
    });
  });

  describe("INCREASE action", () => {
    test("increases long position with broker BUY", () => {
      const result = mapActionToBrokerOrder("INCREASE", 100, 200);
      expect(result?.side).toBe("BUY");
      expect(result?.quantity).toBe(100);
    });

    test("increases short position with broker SELL", () => {
      const result = mapActionToBrokerOrder("INCREASE", -100, -200);
      expect(result?.side).toBe("SELL");
      expect(result?.quantity).toBe(100);
    });

    test("throws if flat", () => {
      expect(() => mapActionToBrokerOrder("INCREASE", 0, 100)).toThrow(ActionMappingError);
    });

    test("throws if reducing instead of increasing", () => {
      expect(() => mapActionToBrokerOrder("INCREASE", 100, 50)).toThrow(ActionMappingError);
      expect(() => mapActionToBrokerOrder("INCREASE", -100, -50)).toThrow(ActionMappingError);
    });
  });

  describe("REDUCE action", () => {
    test("reduces long position with broker SELL", () => {
      const result = mapActionToBrokerOrder("REDUCE", 100, 50);
      expect(result?.side).toBe("SELL");
      expect(result?.quantity).toBe(50);
    });

    test("reduces short position with broker BUY", () => {
      const result = mapActionToBrokerOrder("REDUCE", -100, -50);
      expect(result?.side).toBe("BUY");
      expect(result?.quantity).toBe(50);
    });

    test("closes long position to flat", () => {
      const result = mapActionToBrokerOrder("REDUCE", 100, 0);
      expect(result?.side).toBe("SELL");
      expect(result?.quantity).toBe(100);
    });

    test("covers short position to flat", () => {
      const result = mapActionToBrokerOrder("REDUCE", -100, 0);
      expect(result?.side).toBe("BUY");
      expect(result?.quantity).toBe(100);
    });

    test("throws if flat", () => {
      expect(() => mapActionToBrokerOrder("REDUCE", 0, 0)).toThrow(ActionMappingError);
    });

    test("throws if increasing instead of reducing", () => {
      expect(() => mapActionToBrokerOrder("REDUCE", 100, 150)).toThrow(ActionMappingError);
      expect(() => mapActionToBrokerOrder("REDUCE", -100, -150)).toThrow(ActionMappingError);
    });

    test("throws if crossing zero", () => {
      expect(() => mapActionToBrokerOrder("REDUCE", 100, -50)).toThrow(ActionMappingError);
      expect(() => mapActionToBrokerOrder("REDUCE", -100, 50)).toThrow(ActionMappingError);
    });
  });

  describe("HOLD and NO_TRADE", () => {
    test("HOLD returns null (no order)", () => {
      expect(mapActionToBrokerOrder("HOLD", 100, 100)).toBeNull();
    });

    test("NO_TRADE returns null (no order)", () => {
      expect(mapActionToBrokerOrder("NO_TRADE", 0, 0)).toBeNull();
    });
  });
});

describe("deriveActionFromPositions", () => {
  test("NO_TRADE when flat and staying flat", () => {
    expect(deriveActionFromPositions(0, 0)).toBe("NO_TRADE");
  });

  test("HOLD when holding position", () => {
    expect(deriveActionFromPositions(100, 100)).toBe("HOLD");
    expect(deriveActionFromPositions(-100, -100)).toBe("HOLD");
  });

  test("BUY when going flat to long", () => {
    expect(deriveActionFromPositions(0, 100)).toBe("BUY");
  });

  test("SELL when going flat to short", () => {
    expect(deriveActionFromPositions(0, -100)).toBe("SELL");
  });

  test("INCREASE when adding to long", () => {
    expect(deriveActionFromPositions(100, 200)).toBe("INCREASE");
  });

  test("INCREASE when adding to short", () => {
    expect(deriveActionFromPositions(-100, -200)).toBe("INCREASE");
  });

  test("REDUCE when reducing long", () => {
    expect(deriveActionFromPositions(100, 50)).toBe("REDUCE");
    expect(deriveActionFromPositions(100, 0)).toBe("REDUCE");
  });

  test("REDUCE when covering short", () => {
    expect(deriveActionFromPositions(-100, -50)).toBe("REDUCE");
    expect(deriveActionFromPositions(-100, 0)).toBe("REDUCE");
  });

  test("throws when flipping from long to short", () => {
    expect(() => deriveActionFromPositions(100, -100)).toThrow(ActionMappingError);
  });

  test("throws when flipping from short to long", () => {
    expect(() => deriveActionFromPositions(-100, 100)).toThrow(ActionMappingError);
  });
});
