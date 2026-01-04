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
  MockBrokerAdapter,
  createMockBroker,
  type OrderStatus,
  type OrderSide,
  type OrderType,
  type TimeInForce,
  type SubmitOrderRequest,
  type MockOrder,
  type MockPosition,
  type MockAccount,
  type FailureType,
  type MockBrokerConfig,
} from "./broker";

// ============================================
// Mock Market Data
// ============================================

export {
  MockPolygonAdapter,
  MockDatabentoAdapter,
  createMockPolygon,
  createMockDatabento,
  type Timeframe,
  type Quote,
  type Trade,
  type OptionChainEntry,
  type MarketDataFailureType,
  type MockMarketDataConfig,
} from "./marketdata";

// ============================================
// Mock HelixDB
// ============================================

export {
  MockHelixDB,
  createMockHelixDB,
  type GraphNode,
  type GraphEdge,
  type TradeMemory,
  type VectorSearchResult,
  type MockHelixDBConfig,
} from "./helixdb";

// ============================================
// Mock Turso
// ============================================

export {
  MockTursoClient,
  createMockTurso,
  type ResultSet,
  type Transaction,
  type MockTursoConfig,
} from "./turso";
