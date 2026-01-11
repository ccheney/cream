/**
 * Trading Handlers
 *
 * Handlers for trading cycle events, agent status, and backtest subscriptions.
 */

import type {
  SubscribeBacktestMessage,
  UnsubscribeBacktestMessage,
} from "../../../../../packages/domain/src/websocket/index.js";
import { subscribeToBacktest, unsubscribeFromBacktest } from "../backtest-channel.js";
import { sendError, sendMessage } from "../channels.js";
import type { WebSocketWithMetadata } from "../types.js";

/**
 * Handle subscribe backtest message.
 * Subscribes the connection to receive progress updates for a specific backtest.
 */
export function handleSubscribeBacktest(
  ws: WebSocketWithMetadata,
  message: SubscribeBacktestMessage
): void {
  const metadata = ws.data;

  subscribeToBacktest(ws, message.backtestId);
  metadata.channels.add("backtests");

  sendMessage(ws, {
    type: "subscribed",
    channels: ["backtests"],
  });
}

/**
 * Handle unsubscribe backtest message.
 */
export function handleUnsubscribeBacktest(
  ws: WebSocketWithMetadata,
  message: UnsubscribeBacktestMessage
): void {
  unsubscribeFromBacktest(ws, message.backtestId);

  sendMessage(ws, {
    type: "unsubscribed",
    channels: [],
  });
}

/**
 * Handle agents state request.
 * Returns current agent status for all agent types.
 */
export async function handleAgentsState(ws: WebSocketWithMetadata): Promise<void> {
  try {
    const { getAgentOutputsRepo } = await import("../../db.js");
    const repo = await getAgentOutputsRepo();
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    const agentDefs = [
      { type: "technical", displayName: "Technical Analyst" },
      { type: "news", displayName: "News & Sentiment" },
      { type: "fundamentals", displayName: "Fundamentals & Macro" },
      { type: "bullish", displayName: "Bullish Research" },
      { type: "bearish", displayName: "Bearish Research" },
      { type: "trader", displayName: "Trader" },
      { type: "risk", displayName: "Risk Manager" },
      { type: "critic", displayName: "Critic" },
    ] as const;

    for (const def of agentDefs) {
      const outputs = await repo.findByAgentType(def.type, 100);
      const todayOutputs = outputs.filter((o) => o.createdAt.startsWith(today));
      const approves = outputs.filter((o) => o.vote === "APPROVE").length;
      const approvalRate = outputs.length > 0 ? approves / outputs.length : 0;
      const avgConfidence =
        outputs.length > 0 ? outputs.reduce((sum, o) => sum + o.confidence, 0) / outputs.length : 0;
      const lastOutput = outputs[0];

      sendMessage(ws, {
        type: "agent_status",
        data: {
          type: def.type,
          displayName: def.displayName,
          status: "idle",
          lastOutputAt: lastOutput?.createdAt ?? null,
          outputsToday: todayOutputs.length,
          avgConfidence: Math.round(avgConfidence * 100) / 100,
          approvalRate: Math.round(approvalRate * 100) / 100,
          timestamp: now,
        },
      });
    }
  } catch (error) {
    sendError(
      ws,
      `Failed to get agents state: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
