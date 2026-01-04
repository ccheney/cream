/**
 * WebSocket Schema Tests
 *
 * Validates all WebSocket message schemas.
 *
 * @see docs/plans/ui/06-websocket.md
 */

import { describe, expect, it } from "bun:test";
import {
  // Channels
  Channel,
  CHANNELS,
  AgentType,
  CyclePhase,
  OrderStatus,
  AlertSeverity,
  // Client messages
  ClientMessageSchema,
  SubscribeMessageSchema,
  UnsubscribeMessageSchema,
  SubscribeSymbolsMessageSchema,
  PingMessageSchema,
  // Server messages
  ServerMessageSchema,
  QuoteMessageSchema,
  OrderMessageSchema,
  AgentOutputMessageSchema,
  CycleProgressMessageSchema,
  AlertMessageSchema,
  SystemStatusMessageSchema,
  PongMessageSchema,
  ErrorMessageSchema,
  // Data payloads
  QuoteDataSchema,
  OrderDataSchema,
} from "./index.js";

// ============================================
// Channel Tests
// ============================================

describe("Channel Enum", () => {
  it("includes all expected channels", () => {
    expect(CHANNELS).toContain("quotes");
    expect(CHANNELS).toContain("orders");
    expect(CHANNELS).toContain("decisions");
    expect(CHANNELS).toContain("agents");
    expect(CHANNELS).toContain("cycles");
    expect(CHANNELS).toContain("alerts");
    expect(CHANNELS).toContain("system");
    expect(CHANNELS).toContain("portfolio");
  });

  it("validates valid channel", () => {
    expect(Channel.safeParse("quotes").success).toBe(true);
  });

  it("rejects invalid channel", () => {
    expect(Channel.safeParse("invalid").success).toBe(false);
  });
});

describe("AgentType Enum", () => {
  it("accepts all valid agent types", () => {
    const validTypes = [
      "technical_analyst",
      "news_analyst",
      "fundamentals_analyst",
      "bullish_researcher",
      "bearish_researcher",
      "trader",
      "risk_manager",
      "critic",
    ];

    for (const type of validTypes) {
      expect(AgentType.safeParse(type).success).toBe(true);
    }
  });

  it("rejects invalid agent type", () => {
    expect(AgentType.safeParse("unknown_agent").success).toBe(false);
  });
});

describe("CyclePhase Enum", () => {
  it("accepts OODA phases", () => {
    const phases = ["observe", "orient", "decide", "act", "complete", "error"];
    for (const phase of phases) {
      expect(CyclePhase.safeParse(phase).success).toBe(true);
    }
  });
});

// ============================================
// Client Message Tests
// ============================================

describe("Client Messages", () => {
  describe("SubscribeMessage", () => {
    it("validates valid subscribe message", () => {
      const msg = { type: "subscribe", channels: ["quotes", "orders"] };
      const result = SubscribeMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it("rejects empty channels array", () => {
      const msg = { type: "subscribe", channels: [] };
      const result = SubscribeMessageSchema.safeParse(msg);
      expect(result.success).toBe(false);
    });

    it("rejects invalid channel name", () => {
      const msg = { type: "subscribe", channels: ["invalid_channel"] };
      const result = SubscribeMessageSchema.safeParse(msg);
      expect(result.success).toBe(false);
    });
  });

  describe("UnsubscribeMessage", () => {
    it("validates valid unsubscribe message", () => {
      const msg = { type: "unsubscribe", channels: ["quotes"] };
      const result = UnsubscribeMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
    });
  });

  describe("SubscribeSymbolsMessage", () => {
    it("validates valid symbol subscription", () => {
      const msg = { type: "subscribe_symbols", symbols: ["AAPL", "MSFT"] };
      const result = SubscribeSymbolsMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it("rejects too many symbols", () => {
      const symbols = Array.from({ length: 101 }, (_, i) => `SYM${i}`);
      const msg = { type: "subscribe_symbols", symbols };
      const result = SubscribeSymbolsMessageSchema.safeParse(msg);
      expect(result.success).toBe(false);
    });

    it("rejects empty symbol", () => {
      const msg = { type: "subscribe_symbols", symbols: [""] };
      const result = SubscribeSymbolsMessageSchema.safeParse(msg);
      expect(result.success).toBe(false);
    });
  });

  describe("PingMessage", () => {
    it("validates ping message", () => {
      const msg = { type: "ping" };
      const result = PingMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
    });
  });

  describe("ClientMessage discriminated union", () => {
    it("parses subscribe message", () => {
      const msg = { type: "subscribe", channels: ["quotes"] };
      const result = ClientMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("subscribe");
      }
    });

    it("parses ping message", () => {
      const msg = { type: "ping" };
      const result = ClientMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it("rejects unknown message type", () => {
      const msg = { type: "unknown" };
      const result = ClientMessageSchema.safeParse(msg);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================
// Server Message Tests
// ============================================

describe("Server Messages", () => {
  describe("QuoteMessage", () => {
    it("validates valid quote message", () => {
      const msg = {
        type: "quote",
        data: {
          symbol: "AAPL",
          bid: 185.0,
          ask: 185.05,
          last: 185.02,
          volume: 1000000,
          timestamp: "2026-01-04T14:00:00Z",
        },
      };
      const result = QuoteMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it("rejects negative price", () => {
      const msg = {
        type: "quote",
        data: {
          symbol: "AAPL",
          bid: -10,
          ask: 185.05,
          last: 185.02,
          volume: 1000000,
          timestamp: "2026-01-04T14:00:00Z",
        },
      };
      const result = QuoteMessageSchema.safeParse(msg);
      expect(result.success).toBe(false);
    });
  });

  describe("OrderMessage", () => {
    it("validates valid order message", () => {
      const msg = {
        type: "order",
        data: {
          id: "550e8400-e29b-41d4-a716-446655440000",
          symbol: "AAPL",
          side: "buy",
          orderType: "limit",
          status: "filled",
          quantity: 100,
          filledQty: 100,
          avgPrice: 185.0,
          timestamp: "2026-01-04T14:00:00Z",
        },
      };
      const result = OrderMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it("rejects invalid order status", () => {
      const msg = {
        type: "order",
        data: {
          id: "550e8400-e29b-41d4-a716-446655440000",
          symbol: "AAPL",
          side: "buy",
          orderType: "limit",
          status: "invalid_status",
          quantity: 100,
          filledQty: 0,
          timestamp: "2026-01-04T14:00:00Z",
        },
      };
      const result = OrderMessageSchema.safeParse(msg);
      expect(result.success).toBe(false);
    });
  });

  describe("AgentOutputMessage", () => {
    it("validates valid agent output", () => {
      const msg = {
        type: "agent_output",
        data: {
          cycleId: "cycle-2026-01-04-14",
          agentType: "trader",
          status: "complete",
          output: "Bullish setup detected for AAPL",
          confidence: 0.78,
          timestamp: "2026-01-04T14:00:00Z",
        },
      };
      const result = AgentOutputMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it("rejects confidence > 1", () => {
      const msg = {
        type: "agent_output",
        data: {
          cycleId: "cycle-2026-01-04-14",
          agentType: "trader",
          status: "complete",
          output: "Test",
          confidence: 1.5,
          timestamp: "2026-01-04T14:00:00Z",
        },
      };
      const result = AgentOutputMessageSchema.safeParse(msg);
      expect(result.success).toBe(false);
    });
  });

  describe("CycleProgressMessage", () => {
    it("validates valid cycle progress", () => {
      const msg = {
        type: "cycle_progress",
        data: {
          cycleId: "cycle-2026-01-04-14",
          phase: "decide",
          step: "Trader Agent",
          progress: 75,
          message: "Processing trader decision",
          timestamp: "2026-01-04T14:00:00Z",
        },
      };
      const result = CycleProgressMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it("rejects progress > 100", () => {
      const msg = {
        type: "cycle_progress",
        data: {
          cycleId: "cycle-2026-01-04-14",
          phase: "decide",
          step: "Test",
          progress: 150,
          message: "Test",
          timestamp: "2026-01-04T14:00:00Z",
        },
      };
      const result = CycleProgressMessageSchema.safeParse(msg);
      expect(result.success).toBe(false);
    });

    it("rejects progress < 0", () => {
      const msg = {
        type: "cycle_progress",
        data: {
          cycleId: "cycle-2026-01-04-14",
          phase: "decide",
          step: "Test",
          progress: -10,
          message: "Test",
          timestamp: "2026-01-04T14:00:00Z",
        },
      };
      const result = CycleProgressMessageSchema.safeParse(msg);
      expect(result.success).toBe(false);
    });
  });

  describe("AlertMessage", () => {
    it("validates valid alert", () => {
      const msg = {
        type: "alert",
        data: {
          id: "550e8400-e29b-41d4-a716-446655440000",
          severity: "warning",
          title: "Position Size Warning",
          message: "Position size exceeds recommended limit",
          timestamp: "2026-01-04T14:00:00Z",
        },
      };
      const result = AlertMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it("rejects invalid severity", () => {
      const msg = {
        type: "alert",
        data: {
          id: "550e8400-e29b-41d4-a716-446655440000",
          severity: "super_critical",
          title: "Test",
          message: "Test",
          timestamp: "2026-01-04T14:00:00Z",
        },
      };
      const result = AlertMessageSchema.safeParse(msg);
      expect(result.success).toBe(false);
    });
  });

  describe("SystemStatusMessage", () => {
    it("validates valid system status", () => {
      const msg = {
        type: "system_status",
        data: {
          health: "healthy",
          uptimeSeconds: 3600,
          activeConnections: 5,
          services: {
            api: {
              status: "healthy",
              latencyMs: 50,
              lastCheck: "2026-01-04T14:00:00Z",
            },
          },
          environment: "PAPER",
          timestamp: "2026-01-04T14:00:00Z",
        },
      };
      const result = SystemStatusMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
    });
  });

  describe("PongMessage", () => {
    it("validates pong message", () => {
      const msg = {
        type: "pong",
        timestamp: "2026-01-04T14:00:00Z",
      };
      const result = PongMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
    });

    it("rejects invalid timestamp format", () => {
      const msg = {
        type: "pong",
        timestamp: "not-a-timestamp",
      };
      const result = PongMessageSchema.safeParse(msg);
      expect(result.success).toBe(false);
    });
  });

  describe("ErrorMessage", () => {
    it("validates error message", () => {
      const msg = {
        type: "error",
        code: "INVALID_MESSAGE",
        message: "Could not parse message",
      };
      const result = ErrorMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
    });
  });

  describe("ServerMessage discriminated union", () => {
    it("parses quote message", () => {
      const msg = {
        type: "quote",
        data: {
          symbol: "AAPL",
          bid: 185.0,
          ask: 185.05,
          last: 185.02,
          volume: 1000000,
          timestamp: "2026-01-04T14:00:00Z",
        },
      };
      const result = ServerMessageSchema.safeParse(msg);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("quote");
      }
    });

    it("rejects unknown message type", () => {
      const msg = { type: "unknown_type" };
      const result = ServerMessageSchema.safeParse(msg);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================
// Data Payload Tests
// ============================================

describe("Data Payloads", () => {
  describe("QuoteData", () => {
    it("validates complete quote data", () => {
      const data = {
        symbol: "AAPL",
        bid: 185.0,
        ask: 185.05,
        last: 185.02,
        bidSize: 100,
        askSize: 200,
        volume: 1000000,
        prevClose: 184.0,
        changePercent: 0.55,
        timestamp: "2026-01-04T14:00:00Z",
      };
      const result = QuoteDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("validates minimal quote data", () => {
      const data = {
        symbol: "AAPL",
        bid: 185.0,
        ask: 185.05,
        last: 185.02,
        volume: 1000000,
        timestamp: "2026-01-04T14:00:00Z",
      };
      const result = QuoteDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("rejects empty symbol", () => {
      const data = {
        symbol: "",
        bid: 185.0,
        ask: 185.05,
        last: 185.02,
        volume: 1000000,
        timestamp: "2026-01-04T14:00:00Z",
      };
      const result = QuoteDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe("OrderData", () => {
    it("validates complete order data", () => {
      const data = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        clientOrderId: "client-123",
        symbol: "AAPL",
        side: "buy",
        orderType: "limit",
        status: "filled",
        quantity: 100,
        filledQty: 100,
        remainingQty: 0,
        limitPrice: 185.0,
        avgPrice: 184.98,
        timeInForce: "day",
        timestamp: "2026-01-04T14:00:00Z",
      };
      const result = OrderDataSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it("rejects negative quantity", () => {
      const data = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        symbol: "AAPL",
        side: "buy",
        orderType: "market",
        status: "pending",
        quantity: -10,
        filledQty: 0,
        timestamp: "2026-01-04T14:00:00Z",
      };
      const result = OrderDataSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});
