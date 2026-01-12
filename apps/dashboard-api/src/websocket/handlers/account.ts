/**
 * Account Handlers
 *
 * Handlers for Alpaca trade stream events (account/position/order updates).
 * Wires up the AlpacaTradingStreamService to broadcast to dashboard clients.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.2
 */

import log from "../../logger.js";
import type { TradingStreamEvent } from "../../services/alpaca-streaming.js";
import {
  getTradingStreamService,
  shutdownTradingStreamService,
} from "../../services/alpaca-streaming.js";
import { broadcastOrderUpdate, broadcastPositionUpdate } from "../channels.js";

let isInitialized = false;

/**
 * Handle trade update events from Alpaca.
 * Maps Alpaca trade_updates to dashboard WebSocket messages.
 */
function handleTradeUpdate(event: TradingStreamEvent): void {
  if (event.type !== "trade_update") {
    return;
  }

  const { order } = event.data;
  const timestamp = new Date().toISOString();

  // Determine cache keys to invalidate based on order event
  const orderInvalidates = ["orders", "orders.recent"];
  if (event.data.event === "fill" || event.data.event === "partial_fill") {
    orderInvalidates.push("portfolio.positions", "portfolio.summary", "portfolio.account");
  }

  // Broadcast order update to orders channel with cache invalidation hints
  const orderUpdateSent = broadcastOrderUpdate({
    type: "order_update",
    data: {
      orderId: order.id,
      clientOrderId: order.client_order_id,
      symbol: order.symbol,
      side: order.side,
      orderType: order.order_type,
      status: order.status,
      qty: order.qty,
      filledQty: order.filled_qty,
      filledAvgPrice: order.filled_avg_price,
      event: event.data.event,
      timestamp,
    },
    invalidates: orderInvalidates,
  });

  log.debug(
    {
      orderId: order.id,
      symbol: order.symbol,
      event: event.data.event,
      clientsSent: orderUpdateSent,
    },
    "Broadcasted order update"
  );

  // For fill events, also broadcast position update
  if (event.data.event === "fill" || event.data.event === "partial_fill") {
    const fillPrice = event.data.price ? Number.parseFloat(event.data.price) : null;
    const fillQty = event.data.qty ? Number.parseFloat(event.data.qty) : null;
    const positionQty = event.data.position_qty ? Number.parseFloat(event.data.position_qty) : 0;

    // Determine position side based on filled quantity
    // Positive qty = long, negative = short (though Alpaca typically reports absolute values)
    const side = positionQty >= 0 ? "LONG" : "SHORT";
    const qty = Math.abs(positionQty);

    // Calculate market value (approximate - client should refetch for accuracy)
    const avgEntry = order.filled_avg_price ? Number.parseFloat(order.filled_avg_price) : 0;
    const marketValue = qty * (fillPrice ?? avgEntry);

    // Cache keys to invalidate for position changes
    const positionInvalidates = [
      "portfolio.positions",
      "portfolio.summary",
      "portfolio.account",
      `portfolio.positions.${order.symbol}`,
    ];

    const positionUpdateSent = broadcastPositionUpdate({
      type: "position_update",
      data: {
        symbol: order.symbol,
        side,
        qty,
        avgEntry,
        marketValue,
        unrealizedPnl: 0, // Client should calculate from live price
        event: event.data.event === "fill" ? "fill" : "partial_fill",
        orderId: order.id,
        timestamp,
      },
      invalidates: positionInvalidates,
    });

    log.debug(
      {
        symbol: order.symbol,
        event: event.data.event,
        qty,
        fillPrice,
        fillQty,
        clientsSent: positionUpdateSent,
      },
      "Broadcasted position update"
    );
  }
}

/**
 * Initialize the Alpaca trade stream integration.
 * Connects to Alpaca trading stream and sets up event handlers.
 *
 * @param paper - Use paper trading endpoint (default: true)
 */
export async function initAlpacaTradeStream(paper = true): Promise<void> {
  if (isInitialized) {
    log.warn("Alpaca trade stream already initialized");
    return;
  }

  try {
    const service = await getTradingStreamService(paper);

    service.on((event) => {
      switch (event.type) {
        case "connected":
          log.info("Alpaca trading stream connected");
          break;
        case "authenticated":
          log.info("Alpaca trading stream authenticated");
          break;
        case "listening": {
          log.info({ streams: event.streams }, "Alpaca trading stream listening");
          break;
        }
        case "trade_update":
          handleTradeUpdate(event);
          break;
        case "error":
          log.error({ message: event.message }, "Alpaca trading stream error");
          break;
        case "disconnected":
          log.warn({ reason: event.reason }, "Alpaca trading stream disconnected");
          break;
        case "reconnecting":
          log.info({ attempt: event.attempt }, "Alpaca trading stream reconnecting");
          break;
        case "heartbeat_sent":
          log.trace("Alpaca trading stream heartbeat sent");
          break;
        case "heartbeat_timeout":
          log.warn("Alpaca trading stream heartbeat timeout - forcing reconnect");
          break;
      }
    });

    isInitialized = true;
    log.info({ paper }, "Alpaca trade stream integration initialized");
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to initialize Alpaca trade stream"
    );
    throw error;
  }
}

/**
 * Shutdown the Alpaca trade stream integration.
 */
export function shutdownAlpacaTradeStream(): void {
  if (!isInitialized) {
    return;
  }

  shutdownTradingStreamService();
  isInitialized = false;
  log.info("Alpaca trade stream integration shutdown");
}

/**
 * Check if the Alpaca trade stream is initialized.
 */
export function isAlpacaTradeStreamInitialized(): boolean {
  return isInitialized;
}
