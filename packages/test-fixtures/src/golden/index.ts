/**
 * Golden Dataset Infrastructure
 *
 * Provides loaders and utilities for managing golden datasets used in agent testing.
 *
 * @see docs/plans/14-testing.md lines 328-364
 */

// Schema exports
export {
  GoldenAgentType,
  MarketRegime,
  ScenarioCategory,
  GoldenCaseMetadataSchema,
  GoldenDatasetMetadataSchema,
  STALENESS_THRESHOLDS,
  checkStaleness,
  type GoldenCaseMetadata,
  type GoldenDatasetMetadata,
  type StalenessCheckResult,
} from "./schema.js";

// Loader exports
export {
  loadGoldenMetadata,
  loadGoldenInput,
  loadGoldenOutput,
  loadGoldenCase,
  getAllGoldenCaseIds,
  getAllGoldenCases,
  checkGoldenStaleness,
  hasGoldenDataset,
  getGoldenDatasetStats,
} from "./loader.js";
