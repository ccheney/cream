/**
 * WebSocket Schema Exports
 *
 * Comprehensive type-safe schemas for WebSocket communication.
 *
 * @see docs/plans/ui/06-websocket.md
 */

// ============================================
// Channel Types
// ============================================

export {
  Channel,
  CHANNELS,
  CHANNEL_DESCRIPTIONS,
  AgentType,
  CyclePhase,
  OrderStatus,
  AlertSeverity,
  SystemHealthStatus,
  AgentVote,
} from "./channel.js";

// ============================================
// Data Payloads
// ============================================

export {
  QuoteDataSchema,
  OrderDataSchema,
  AgentOutputDataSchema,
  CycleProgressDataSchema,
  AlertDataSchema,
  SystemStatusDataSchema,
  PortfolioDataSchema,
  type QuoteData,
  type OrderData,
  type AgentOutputData,
  type CycleProgressData,
  type AlertData,
  type SystemStatusData,
  type PortfolioData,
} from "./data-payloads.js";

// ============================================
// Client Messages
// ============================================

export {
  SubscribeMessageSchema,
  UnsubscribeMessageSchema,
  SubscribeSymbolsMessageSchema,
  UnsubscribeSymbolsMessageSchema,
  PingMessageSchema,
  RequestStateMessageSchema,
  AcknowledgeAlertMessageSchema,
  ClientMessageSchema,
  type SubscribeMessage,
  type UnsubscribeMessage,
  type SubscribeSymbolsMessage,
  type UnsubscribeSymbolsMessage,
  type PingMessage,
  type RequestStateMessage,
  type AcknowledgeAlertMessage,
  type ClientMessage,
} from "./client-messages.js";

// ============================================
// Server Messages
// ============================================

export {
  QuoteMessageSchema,
  OrderMessageSchema,
  DecisionMessageSchema,
  DecisionPlanMessageSchema,
  AgentOutputMessageSchema,
  CycleProgressMessageSchema,
  AlertMessageSchema,
  SystemStatusMessageSchema,
  PortfolioMessageSchema,
  PongMessageSchema,
  SubscribedMessageSchema,
  UnsubscribedMessageSchema,
  ErrorMessageSchema,
  ServerMessageSchema,
  type QuoteMessage,
  type OrderMessage,
  type DecisionMessage,
  type DecisionPlanMessage,
  type AgentOutputMessage,
  type CycleProgressMessage,
  type AlertMessage,
  type SystemStatusMessage,
  type PortfolioMessage,
  type PongMessage,
  type SubscribedMessage,
  type UnsubscribedMessage,
  type ErrorMessage,
  type ServerMessage,
} from "./server-messages.js";
