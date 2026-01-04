/**
 * @cream/mocks - Mock adapters for testing
 *
 * This package provides mock implementations of external services
 * for fast, deterministic testing without API calls.
 */

export const PACKAGE_NAME = "@cream/mocks";
export const VERSION = "0.0.1";

// ============================================
// Mock Broker
// ============================================

export {
  createMockBroker,
  type FailureType,
  type MockAccount,
  MockBrokerAdapter,
  type MockBrokerConfig,
  type MockOrder,
  type MockPosition,
  type OrderSide,
  type OrderStatus,
  type OrderType,
  type SubmitOrderRequest,
  type TimeInForce,
} from "./broker";

// ============================================
// Mock Market Data
// ============================================

export {
  createMockDatabento,
  createMockPolygon,
  type MarketDataFailureType,
  MockDatabentoAdapter,
  type MockMarketDataConfig,
  MockPolygonAdapter,
  type OptionChainEntry,
  type Quote,
  type Timeframe,
  type Trade,
} from "./marketdata";

// ============================================
// Mock HelixDB
// ============================================

export {
  createMockHelixDB,
  type GraphEdge,
  type GraphNode,
  MockHelixDB,
  type MockHelixDBConfig,
  type TradeMemory,
  type VectorSearchResult,
} from "./helixdb";

// ============================================
// Mock Turso
// ============================================

export {
  type BatchStatement,
  createMockTurso,
  MockTursoClient,
  type MockTursoConfig,
  type ResultSet,
  type Row,
  type Transaction,
} from "./turso";

// ============================================
// Mock LLM
// ============================================

export {
  type CompletionOptions,
  createMockLLM,
  createMockLLMRecorder,
  createMockLLMWithDefaults,
  extractKeyHash,
  extractKeyPattern,
  extractPromptKey,
  type LLMInterface,
  MockLLM,
  type MockLLMConfig,
  MockLLMRecorder,
  type MockResponse,
  type RecordedCall,
  type ResponseMap,
} from "./llm";
