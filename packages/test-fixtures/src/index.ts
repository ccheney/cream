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
// Instruments
// Size
// Order Plan
// Risk Levels
// References
// Decisions
// Decision Plans
// Invalid decisions (for validation testing)
// Candles and Indicators
// Symbol Snapshots
// Market Snapshots
// Memory Context
// Portfolio State
export {
  type Candle,
  createBearTrendSnapshot,
  createBullTrendSnapshot,
  createCandle,
  createDecision,
  createDecisionPlan,
  createEmptyDecisionPlan,
  createEmptyPortfolioState,
  createEquityInstrument,
  createHighVolSnapshot,
  createHoldDecision,
  createIndicators,
  createInvalidDecisionBadRiskLevels,
  createInvalidDecisionMissingSize,
  createInvalidDecisionMissingStop,
  createMarketOrderPlan,
  createMarketSnapshot,
  createMemoryContext,
  createMetadata,
  createMultiDecisionPlan,
  createOptionContract,
  createOptionInstrument,
  createOptionsSize,
  createOptionsSpreadDecision,
  createOrderPlan,
  createPastTradeCase,
  createPortfolioState,
  createPosition,
  createRangeBoundSnapshot,
  createReferences,
  createRiskLevels,
  createShortDecision,
  createShortRiskLevels,
  createSize,
  createSymbolSnapshot,
  type FixtureMetadata,
  type Indicators,
  type MarketSnapshot,
  type MemoryContext,
  type PastTradeCase,
  type PortfolioState,
  type Position,
  type SymbolSnapshot,
} from "./factories";

// ============================================
// Golden Dataset Infrastructure
// ============================================

export {
  checkGoldenStaleness,
  checkStaleness,
  // Schema
  GoldenAgentType,
  type GoldenCaseMetadata,
  GoldenCaseMetadataSchema,
  type GoldenDatasetMetadata,
  GoldenDatasetMetadataSchema,
  getAllGoldenCaseIds,
  getAllGoldenCases,
  getGoldenDatasetStats,
  hasGoldenDataset,
  loadGoldenCase,
  loadGoldenInput,
  // Loaders
  loadGoldenMetadata,
  loadGoldenOutput,
  MarketRegime,
  ScenarioCategory,
  STALENESS_THRESHOLDS,
  type StalenessCheckResult,
} from "./golden/index.js";
