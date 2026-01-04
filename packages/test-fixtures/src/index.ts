/**
 * @cream/test-fixtures - Test data factories and fixtures
 *
 * This package contains:
 * - Factory functions for generating test data with sensible defaults
 * - JSON fixtures for snapshots, decisions, and memory contexts
 * - Support for partial overrides with deep merge
 */

export const PACKAGE_NAME = "@cream/test-fixtures";
export const VERSION = "0.0.1";

// ============================================
// Factory Functions
// ============================================

// Metadata
export { createMetadata, type FixtureMetadata } from "./factories";

// Instruments
export {
  createEquityInstrument,
  createOptionContract,
  createOptionInstrument,
} from "./factories";

// Size
export { createSize, createOptionsSize } from "./factories";

// Order Plan
export { createOrderPlan, createMarketOrderPlan } from "./factories";

// Risk Levels
export { createRiskLevels, createShortRiskLevels } from "./factories";

// References
export { createReferences } from "./factories";

// Decisions
export {
  createDecision,
  createShortDecision,
  createHoldDecision,
  createOptionsSpreadDecision,
} from "./factories";

// Decision Plans
export {
  createDecisionPlan,
  createEmptyDecisionPlan,
  createMultiDecisionPlan,
} from "./factories";

// Invalid decisions (for validation testing)
export {
  createInvalidDecisionMissingSize,
  createInvalidDecisionMissingStop,
  createInvalidDecisionBadRiskLevels,
} from "./factories";

// Candles and Indicators
export {
  createCandle,
  createIndicators,
  type Candle,
  type Indicators,
} from "./factories";

// Symbol Snapshots
export { createSymbolSnapshot, type SymbolSnapshot } from "./factories";

// Market Snapshots
export {
  createMarketSnapshot,
  createBullTrendSnapshot,
  createBearTrendSnapshot,
  createHighVolSnapshot,
  createRangeBoundSnapshot,
  type MarketSnapshot,
} from "./factories";

// Memory Context
export {
  createPastTradeCase,
  createMemoryContext,
  type PastTradeCase,
  type MemoryContext,
} from "./factories";

// Portfolio State
export {
  createPosition,
  createPortfolioState,
  createEmptyPortfolioState,
  type Position,
  type PortfolioState,
} from "./factories";
