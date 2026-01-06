/**
 * Databento API Client
 *
 * Provides execution-grade market data:
 * - Real-time quotes (L1/L2/L3)
 * - Order book depth
 * - Trade messages
 * - Historical tick data
 *
 * Uses WebSocket for live streaming and HTTP for historical data.
 *
 * @see https://databento.com/docs
 * @see docs/plans/02-data-layer.md
 */

import WebSocket from "ws";
import { z } from "zod";

// ============================================
// API Configuration
// ============================================

const DATABENTO_LIVE_URL = "wss://live.databento.com";
const DATABENTO_HISTORICAL_URL = "https://hist.databento.com";

/**
 * Databento data schemas (message types).
 */
export type DatabentoSchema =
  | "mbo" // Market by Order (full order book)
  | "mbp-1" // Market by Price (1 level, BBO)
  | "mbp-10" // Market by Price (10 levels)
  | "tbbo" // Top of Book Best Bid/Offer
  | "trades" // Trade messages
  | "ohlcv-1s" // 1-second OHLCV bars
  | "ohlcv-1m" // 1-minute OHLCV bars
  | "ohlcv-1h" // 1-hour OHLCV bars
  | "ohlcv-1d"; // 1-day OHLCV bars

/**
 * Databento datasets (venues).
 */
export type DatabentoDataset =
  | "XNAS.ITCH" // NASDAQ TotalView-ITCH
  | "XNYS.TRADES" // NYSE Trades
  | "GLBX.MDP3" // CME Globex
  | "OPRA.PILLAR" // OPRA options data
  | "DBEQ.BASIC"; // Databento Equities Basic

/**
 * Symbol type for input/output.
 */
export type SymbolType =
  | "raw_symbol" // As provided
  | "instrument_id" // Databento instrument ID
  | "parent" // Parent symbol
  | "continuous"; // Continuous contract

// ============================================
// Message Schemas
// ============================================

/**
 * Base message fields common to all Databento messages.
 */
const BaseMessageSchema = z.object({
  ts_event: z.number(), // Event timestamp (nanoseconds)
  ts_recv: z.number().optional(), // Reception timestamp
  instrument_id: z.number().optional(),
  symbol: z.string().optional(),
});

/**
 * Trade message schema.
 */
export const TradeMessageSchema = BaseMessageSchema.extend({
  price: z.number(),
  size: z.number(),
  action: z.string().optional(),
  side: z.enum(["A", "B", "N"]).optional(), // Ask, Bid, None
  flags: z.number().optional(),
  depth: z.number().optional(),
  ts_in_delta: z.number().optional(),
  sequence: z.number().optional(),
});
export type TradeMessage = z.infer<typeof TradeMessageSchema>;

/**
 * Quote message schema (BBO / Level 1).
 */
export const QuoteMessageSchema = BaseMessageSchema.extend({
  bid_px: z.number(),
  ask_px: z.number(),
  bid_sz: z.number(),
  ask_sz: z.number(),
  bid_ct: z.number().optional(), // Bid order count
  ask_ct: z.number().optional(), // Ask order count
  flags: z.number().optional(),
  ts_in_delta: z.number().optional(),
  sequence: z.number().optional(),
});
export type QuoteMessage = z.infer<typeof QuoteMessageSchema>;

/**
 * Market by Price (MBP) level schema.
 */
const MBPLevelSchema = z.object({
  bid_px: z.number(),
  ask_px: z.number(),
  bid_sz: z.number(),
  ask_sz: z.number(),
  bid_ct: z.number().optional(),
  ask_ct: z.number().optional(),
});

/**
 * Market by Price (10 levels) message schema.
 */
export const MBP10MessageSchema = BaseMessageSchema.extend({
  levels: z.array(MBPLevelSchema).length(10),
  flags: z.number().optional(),
  ts_in_delta: z.number().optional(),
  sequence: z.number().optional(),
});
export type MBP10Message = z.infer<typeof MBP10MessageSchema>;

/**
 * OHLCV bar message schema.
 */
export const OHLCVMessageSchema = BaseMessageSchema.extend({
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});
export type OHLCVMessage = z.infer<typeof OHLCVMessageSchema>;

/**
 * System message schema (errors, status, etc.).
 */
export const SystemMessageSchema = z.object({
  msg: z.string(),
  code: z.string().optional(),
  is_heartbeat: z.boolean().optional(),
});
export type SystemMessage = z.infer<typeof SystemMessageSchema>;

/**
 * Symbol mapping message schema.
 */
export const SymbolMappingMessageSchema = z.object({
  stype_in_symbol: z.string(),
  stype_out_symbol: z.string(),
  start_ts: z.number(),
  end_ts: z.number(),
});
export type SymbolMappingMessage = z.infer<typeof SymbolMappingMessageSchema>;

/**
 * Union of all possible message types.
 */
export type DatabentoMessage =
  | TradeMessage
  | QuoteMessage
  | MBP10Message
  | OHLCVMessage
  | SystemMessage
  | SymbolMappingMessage;

// ============================================
// Client Configuration
// ============================================

/**
 * Databento client configuration.
 */
export interface DatabentoClientConfig {
  /** Databento API key */
  apiKey: string;
  /** Live WebSocket URL (default: wss://live.databento.com) */
  liveUrl?: string;
  /** Historical API URL (default: https://hist.databento.com) */
  historicalUrl?: string;
  /** Heartbeat interval in seconds (default: 30) */
  heartbeatIntervalS?: number;
  /** Enable auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Max reconnection attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Reconnection delay in milliseconds (default: 1000) */
  reconnectDelayMs?: number;
}

/**
 * Subscription configuration.
 */
export interface SubscriptionConfig {
  /** Dataset to subscribe to */
  dataset: DatabentoDataset;
  /** Data schema (message type) */
  schema: DatabentoSchema;
  /** Symbols to subscribe to */
  symbols: string[];
  /** Input symbol type (default: raw_symbol) */
  stypeIn?: SymbolType;
  /** Output symbol type (default: raw_symbol) */
  stypeOut?: SymbolType;
  /** Request initial snapshot (default: false) */
  snapshot?: boolean;
}

// ============================================
// Databento Client
// ============================================

/**
 * Connection state.
 */
export enum ConnectionState {
  DISCONNECTED = "DISCONNECTED",
  CONNECTING = "CONNECTING",
  AUTHENTICATING = "AUTHENTICATING",
  AUTHENTICATED = "AUTHENTICATED",
  SUBSCRIBED = "SUBSCRIBED",
  ERROR = "ERROR",
}

/**
 * Event types emitted by the client.
 */
export type DatabentoEvent =
  | { type: "connected" }
  | { type: "authenticated"; sessionId: string }
  | { type: "subscribed"; subscriptionId: string }
  | { type: "message"; message: DatabentoMessage; schema: DatabentoSchema }
  | { type: "error"; error: Error }
  | { type: "disconnected"; reason: string }
  | { type: "reconnecting"; attempt: number };

/**
 * Event handler type.
 */
export type EventHandler = (event: DatabentoEvent) => void | Promise<void>;

/**
 * Databento Live API client.
 *
 * Manages WebSocket connections for real-time market data streaming.
 * Supports automatic reconnection, subscription management, and event-driven
 * message handling.
 */
export class DatabentoClient {
  private config: Required<DatabentoClientConfig>;
  private ws: WebSocket | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private eventHandlers: EventHandler[] = [];
  private activeSubscriptions: Map<string, SubscriptionConfig> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: DatabentoClientConfig) {
    this.config = {
      liveUrl: config.liveUrl ?? DATABENTO_LIVE_URL,
      historicalUrl: config.historicalUrl ?? DATABENTO_HISTORICAL_URL,
      heartbeatIntervalS: config.heartbeatIntervalS ?? 30,
      autoReconnect: config.autoReconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      reconnectDelayMs: config.reconnectDelayMs ?? 1000,
      apiKey: config.apiKey,
    };
  }

  /**
   * Get current connection state.
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected and authenticated.
   */
  isConnected(): boolean {
    return (
      this.state === ConnectionState.AUTHENTICATED || this.state === ConnectionState.SUBSCRIBED
    );
  }

  /**
   * Add an event handler.
   */
  on(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove an event handler.
   */
  off(handler: EventHandler): void {
    this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
  }

  /**
   * Emit an event to all handlers.
   */
  private emit(event: DatabentoEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        void handler(event);
      } catch (_error) {}
    }
  }

  /**
   * Connect to the live WebSocket feed.
   */
  async connect(): Promise<void> {
    if (this.state !== ConnectionState.DISCONNECTED) {
      throw new Error(`Cannot connect in state: ${this.state}`);
    }

    this.state = ConnectionState.CONNECTING;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.liveUrl);

        this.ws.on("open", () => {
          this.state = ConnectionState.AUTHENTICATING;
          this.emit({ type: "connected" });
          this.authenticate();
          resolve();
        });

        this.ws.on("message", (data: Buffer) => {
          this.handleMessage(data);
        });

        this.ws.on("error", (error: Error) => {
          this.handleError(error);
          if (this.state === ConnectionState.CONNECTING) {
            reject(error);
          }
        });

        this.ws.on("close", (code: number, reason: Buffer) => {
          this.handleClose(code, reason.toString());
        });
      } catch (error) {
        this.state = ConnectionState.ERROR;
        reject(error);
      }
    });
  }

  /**
   * Authenticate with the API key.
   */
  private authenticate(): void {
    if (!this.ws) {
      throw new Error("WebSocket not connected");
    }

    const authMessage = {
      message_type: "authentication",
      api_key: this.config.apiKey,
      client_id: `cream-${Date.now()}`,
    };

    this.send(authMessage);
  }

  /**
   * Subscribe to market data.
   */
  async subscribe(config: SubscriptionConfig): Promise<void> {
    if (!this.isConnected()) {
      throw new Error("Not connected. Call connect() first.");
    }

    const subscriptionMessage = {
      message_type: "subscription",
      dataset: config.dataset,
      schema: config.schema,
      symbols: config.symbols,
      stype_in: config.stypeIn ?? "raw_symbol",
      stype_out: config.stypeOut ?? "raw_symbol",
      snapshot: config.snapshot ?? false,
    };

    this.send(subscriptionMessage);

    // Store subscription for reconnection
    const key = `${config.dataset}-${config.schema}-${config.symbols.join(",")}`;
    this.activeSubscriptions.set(key, config);
  }

  /**
   * Unsubscribe from market data.
   */
  async unsubscribe(dataset: DatabentoDataset, symbols: string[]): Promise<void> {
    if (!this.isConnected()) {
      throw new Error("Not connected");
    }

    const unsubscribeMessage = {
      message_type: "unsubscribe",
      dataset,
      symbols,
    };

    this.send(unsubscribeMessage);

    // Remove from active subscriptions
    for (const [key, config] of this.activeSubscriptions.entries()) {
      if (config.dataset === dataset && config.symbols.some((s) => symbols.includes(s))) {
        this.activeSubscriptions.delete(key);
      }
    }
  }

  /**
   * Disconnect from the WebSocket.
   */
  disconnect(): void {
    this.clearTimers();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.state = ConnectionState.DISCONNECTED;
    this.sessionId = null;
    this.reconnectAttempts = 0;
  }

  /**
   * Send a message over the WebSocket.
   */
  private send(message: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not ready");
    }

    // Databento expects JSON messages for control/subscription
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Handle incoming WebSocket messages.
   */
  private handleMessage(data: Buffer): void {
    try {
      // Databento sends binary DBN format for market data
      // and JSON for control messages
      const text = data.toString("utf-8");

      // Try to parse as JSON first (control messages)
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        // Not JSON, skip
        return;
      }

      if (typeof json !== "object" || json === null) {
        return;
      }

      const jsonObj = json as Record<string, unknown>;

      if (text.startsWith("{")) {
        // Handle authentication response
        if (jsonObj.message_type === "authentication_response") {
          if (jsonObj.status === "authenticated") {
            this.state = ConnectionState.AUTHENTICATED;
            this.sessionId = jsonObj.session_id as string;
            this.emit({ type: "authenticated", sessionId: jsonObj.session_id as string });
            this.startHeartbeat();
          } else {
            throw new Error(
              `Authentication failed: ${(jsonObj.error as string) ?? "Unknown error"}`
            );
          }
          return;
        }

        // Handle subscription confirmation
        if (jsonObj.message_type === "subscription_confirmation") {
          this.state = ConnectionState.SUBSCRIBED;
          this.emit({
            type: "subscribed",
            subscriptionId: (jsonObj.subscription_id as string) ?? "unknown",
          });
          return;
        }

        // Handle system messages
        if (jsonObj.message_type === "system" || jsonObj.msg) {
          const systemMsg = SystemMessageSchema.parse(jsonObj);
          if (!systemMsg.is_heartbeat) {
            this.emit({ type: "message", message: systemMsg, schema: "tbbo" });
          }
          return;
        }

        // Handle symbol mapping
        if (jsonObj.stype_in_symbol || jsonObj.stype_out_symbol) {
          const symbolMsg = SymbolMappingMessageSchema.parse(jsonObj);
          this.emit({ type: "message", message: symbolMsg, schema: "tbbo" });
          return;
        }
      }

      // Detect schema from message structure
      let schema: DatabentoSchema = "tbbo";
      let message: DatabentoMessage;

      if ("price" in jsonObj && "size" in jsonObj && !("bid_px" in jsonObj)) {
        schema = "trades";
        message = TradeMessageSchema.parse(jsonObj);
      } else if ("bid_px" in jsonObj && "ask_px" in jsonObj && "levels" in jsonObj) {
        schema = "mbp-10";
        message = MBP10MessageSchema.parse(jsonObj);
      } else if ("bid_px" in jsonObj && "ask_px" in jsonObj) {
        schema = "mbp-1";
        message = QuoteMessageSchema.parse(jsonObj);
      } else if ("open" in jsonObj && "high" in jsonObj) {
        schema = "ohlcv-1m";
        message = OHLCVMessageSchema.parse(jsonObj);
      } else {
        return;
      }

      this.emit({ type: "message", message, schema });
    } catch (error) {
      this.emit({
        type: "error",
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Handle WebSocket errors.
   */
  private handleError(error: Error): void {
    this.state = ConnectionState.ERROR;
    this.emit({ type: "error", error });
  }

  /**
   * Handle WebSocket close.
   */
  private handleClose(code: number, reason: string): void {
    this.clearTimers();
    this.ws = null;

    const message = reason || `Connection closed with code ${code}`;
    this.emit({ type: "disconnected", reason: message });

    if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else {
      this.state = ConnectionState.DISCONNECTED;
    }
  }

  /**
   * Schedule a reconnection attempt.
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = this.config.reconnectDelayMs * 2 ** (this.reconnectAttempts - 1);

    this.emit({ type: "reconnecting", attempt: this.reconnectAttempts });

    this.reconnectTimer = setTimeout(() => {
      this.reconnect().catch((_error) => {
        if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.state = ConnectionState.DISCONNECTED;
          this.emit({
            type: "error",
            error: new Error("Max reconnection attempts reached"),
          });
        }
      });
    }, delay);
  }

  /**
   * Attempt to reconnect.
   */
  private async reconnect(): Promise<void> {
    this.state = ConnectionState.DISCONNECTED;

    await this.connect();

    // Resubscribe to all active subscriptions
    for (const config of this.activeSubscriptions.values()) {
      await this.subscribe(config);
    }

    this.reconnectAttempts = 0;
  }

  /**
   * Start heartbeat timer.
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.config.heartbeatIntervalS * 1000);
  }

  /**
   * Clear all timers.
   */
  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

// ============================================
// Factory
// ============================================

/**
 * Create a Databento client from environment variables.
 */
export function createDatabentoClientFromEnv(): DatabentoClient {
  const apiKey = process.env.DATABENTO_KEY ?? Bun.env.DATABENTO_KEY;
  if (!apiKey) {
    throw new Error("DATABENTO_KEY environment variable is required");
  }

  return new DatabentoClient({ apiKey });
}
