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
  AgentType,
  AgentVote,
  AlertSeverity,
  CHANNEL_DESCRIPTIONS,
  CHANNELS,
  Channel,
  CyclePhase,
  OrderStatus,
  SystemHealthStatus,
} from "./channel.js";

// ============================================
// Data Payloads
// ============================================

export {
  type AgentOutputData,
  AgentOutputDataSchema,
  type AlertData,
  AlertDataSchema,
  type CycleProgressData,
  CycleProgressDataSchema,
  type OrderData,
  OrderDataSchema,
  type PortfolioData,
  PortfolioDataSchema,
  type QuoteData,
  QuoteDataSchema,
  type SystemStatusData,
  SystemStatusDataSchema,
} from "./data-payloads.js";

// ============================================
// Client Messages
// ============================================

export {
  type AcknowledgeAlertMessage,
  AcknowledgeAlertMessageSchema,
  type ClientMessage,
  ClientMessageSchema,
  type PingMessage,
  PingMessageSchema,
  type RequestStateMessage,
  RequestStateMessageSchema,
  type SubscribeMessage,
  SubscribeMessageSchema,
  type SubscribeSymbolsMessage,
  SubscribeSymbolsMessageSchema,
  type UnsubscribeMessage,
  UnsubscribeMessageSchema,
  type UnsubscribeSymbolsMessage,
  UnsubscribeSymbolsMessageSchema,
} from "./client-messages.js";

// ============================================
// Server Messages
// ============================================

export {
  type AgentOutputMessage,
  AgentOutputMessageSchema,
  type AlertMessage,
  AlertMessageSchema,
  type CycleProgressMessage,
  CycleProgressMessageSchema,
  type DecisionMessage,
  DecisionMessageSchema,
  type DecisionPlanMessage,
  DecisionPlanMessageSchema,
  type ErrorMessage,
  ErrorMessageSchema,
  type OrderMessage,
  OrderMessageSchema,
  type PongMessage,
  PongMessageSchema,
  type PortfolioMessage,
  PortfolioMessageSchema,
  type QuoteMessage,
  QuoteMessageSchema,
  type ServerMessage,
  ServerMessageSchema,
  type SubscribedMessage,
  SubscribedMessageSchema,
  type SystemStatusMessage,
  SystemStatusMessageSchema,
  type UnsubscribedMessage,
  UnsubscribedMessageSchema,
} from "./server-messages.js";
