/**
 * Message Routing
 *
 * Routes incoming WebSocket messages to appropriate handlers.
 */

import { requireEnv } from "@cream/domain";
import {
  CHANNELS,
  type Channel,
  type ClientMessage,
  ClientMessageSchema,
  type PingMessage,
  type RequestStateMessage,
  type SubscribeMessage,
  type UnsubscribeMessage,
} from "../../../../packages/domain/src/websocket/index.js";
import { getCachedQuote } from "../streaming/market-data.js";
import { getConnectionCount, sendError, sendMessage } from "./channels.js";
import {
  handleAcknowledgeAlert,
  handleAgentsState,
  handleAlertsState,
  handleOrdersState,
  handlePortfolioState,
  handleSubscribeBacktest,
  handleSubscribeOptions,
  handleSubscribeSymbols,
  handleUnsubscribeBacktest,
  handleUnsubscribeOptions,
  handleUnsubscribeSymbols,
} from "./handlers/index.js";
import type { WebSocketWithMetadata } from "./types.js";

/**
 * Handle subscribe message.
 */
function handleSubscribe(ws: WebSocketWithMetadata, message: SubscribeMessage): void {
  const metadata = ws.data;

  for (const channelName of message.channels) {
    if (CHANNELS.includes(channelName as Channel)) {
      metadata.channels.add(channelName as Channel);
    } else {
      sendError(ws, `Invalid channel: ${channelName}`);
    }
  }

  sendMessage(ws, {
    type: "subscribed",
    channels: Array.from(metadata.channels),
  });
}

/**
 * Handle unsubscribe message.
 */
function handleUnsubscribe(ws: WebSocketWithMetadata, message: UnsubscribeMessage): void {
  const metadata = ws.data;

  for (const channelName of message.channels) {
    metadata.channels.delete(channelName as Channel);
  }

  sendMessage(ws, {
    type: "unsubscribed",
    channels: message.channels,
  });
}

/**
 * Handle ping message.
 */
function handlePing(ws: WebSocketWithMetadata, _message: PingMessage): void {
  const metadata = ws.data;
  metadata.lastPing = new Date();

  sendMessage(ws, {
    type: "pong",
    timestamp: new Date().toISOString(),
  });
}

/**
 * Handle request state message.
 * Sends current state snapshot for the requested channel.
 */
async function handleRequestState(
  ws: WebSocketWithMetadata,
  message: RequestStateMessage
): Promise<void> {
  const { channel } = message;

  switch (channel) {
    case "system": {
      sendMessage(ws, {
        type: "system_status",
        data: {
          health: "healthy",
          uptimeSeconds: Math.floor(process.uptime()),
          activeConnections: getConnectionCount(),
          services: {},
          environment: requireEnv(),
          timestamp: new Date().toISOString(),
        },
      });
      break;
    }
    case "portfolio": {
      await handlePortfolioState(ws);
      break;
    }
    case "alerts": {
      await handleAlertsState(ws);
      break;
    }
    case "orders": {
      await handleOrdersState(ws);
      break;
    }
    case "quotes": {
      const metadata = ws.data;
      for (const symbol of metadata.symbols) {
        const cached = getCachedQuote(symbol);
        if (cached) {
          sendMessage(ws, {
            type: "quote",
            data: {
              symbol,
              bid: cached.bid,
              ask: cached.ask,
              last: cached.last,
              volume: cached.volume,
              timestamp: cached.timestamp.toISOString(),
            },
          });
        }
      }
      break;
    }
    case "agents": {
      await handleAgentsState(ws);
      break;
    }
    default:
      sendMessage(ws, {
        type: "subscribed",
        channels: [channel],
      });
  }
}

/**
 * Route incoming message to appropriate handler.
 */
export function handleMessage(ws: WebSocketWithMetadata, rawMessage: string): void {
  let message: ClientMessage;

  try {
    const parsed = JSON.parse(rawMessage);
    const result = ClientMessageSchema.safeParse(parsed);

    if (!result.success) {
      sendError(ws, `Invalid message format: ${result.error.message}`);
      return;
    }

    message = result.data;
  } catch {
    sendError(ws, "Invalid JSON format");
    return;
  }

  ws.data.lastPing = new Date();

  switch (message.type) {
    case "subscribe":
      handleSubscribe(ws, message);
      break;
    case "unsubscribe":
      handleUnsubscribe(ws, message);
      break;
    case "subscribe_symbols":
      handleSubscribeSymbols(ws, message);
      break;
    case "unsubscribe_symbols":
      handleUnsubscribeSymbols(ws, message);
      break;
    case "subscribe_options":
      handleSubscribeOptions(ws, message);
      break;
    case "unsubscribe_options":
      handleUnsubscribeOptions(ws, message);
      break;
    case "subscribe_backtest":
      handleSubscribeBacktest(ws, message);
      break;
    case "unsubscribe_backtest":
      handleUnsubscribeBacktest(ws, message);
      break;
    case "ping":
      handlePing(ws, message);
      break;
    case "request_state":
      handleRequestState(ws, message);
      break;
    case "acknowledge_alert":
      handleAcknowledgeAlert(ws, message);
      break;
    default:
      sendError(ws, `Unknown message type: ${(message as ClientMessage).type}`);
  }
}
