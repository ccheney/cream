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
  type CycleResultData,
  CycleResultDataSchema,
  type DecisionSummary,
  DecisionSummarySchema,
  type OrderData,
  OrderDataSchema,
  type OrderSummary,
  OrderSummarySchema,
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
  type SubscribeOptionsMessage,
  SubscribeOptionsMessageSchema,
  type SubscribeSymbolsMessage,
  SubscribeSymbolsMessageSchema,
  type UnsubscribeMessage,
  UnsubscribeMessageSchema,
  type UnsubscribeOptionsMessage,
  UnsubscribeOptionsMessageSchema,
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
  type CycleResultMessage,
  CycleResultMessageSchema,
  type DecisionMessage,
  DecisionMessageSchema,
  type DecisionPlanMessage,
  DecisionPlanMessageSchema,
  type ErrorMessage,
  ErrorMessageSchema,
  type OptionsAggregateData,
  OptionsAggregateDataSchema,
  type OptionsAggregateMessage,
  OptionsAggregateMessageSchema,
  type OptionsQuoteData,
  OptionsQuoteDataSchema,
  type OptionsQuoteMessage,
  OptionsQuoteMessageSchema,
  type OptionsTradeData,
  OptionsTradeDataSchema,
  type OptionsTradeMessage,
  OptionsTradeMessageSchema,
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
  type TradeData,
  TradeDataSchema,
  type TradeMessage,
  TradeMessageSchema,
  type UnsubscribedMessage,
  UnsubscribedMessageSchema,
} from "./server-messages.js";

// ============================================
// Error Protocol
// ============================================

export {
  // Convenience creators
  authError,
  channelError,
  connectionError,
  // Factory functions
  createErrorDetails,
  createErrorMessage,
  type EnhancedErrorMessage,
  EnhancedErrorMessageSchema,
  ERROR_CODE_DESCRIPTIONS,
  ERROR_RECOVERY,
  ERROR_SEVERITY,
  // Error codes
  ErrorCode,
  // Schemas
  type ErrorDetails,
  ErrorDetailsSchema,
  // Severity
  ErrorSeverity,
  getRetryDelay,
  internalError,
  isCritical,
  // Classification
  isRetryable,
  limitError,
  messageError,
  // Recovery actions
  RecoveryAction,
  rateLimitError,
  requiresAuthRefresh,
} from "./errors.js";
