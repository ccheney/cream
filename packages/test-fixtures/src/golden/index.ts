/**
 * Golden Dataset Infrastructure
 *
 * Provides loaders and utilities for managing golden datasets used in agent testing.
 *
 * @see docs/plans/14-testing.md lines 328-364
 */

// Loader exports
export {
  checkGoldenStaleness,
  getAllGoldenCaseIds,
  getAllGoldenCases,
  getGoldenDatasetStats,
  hasGoldenDataset,
  loadGoldenCase,
  loadGoldenInput,
  loadGoldenMetadata,
  loadGoldenOutput,
} from "./loader.js";
// Schema exports
export {
  checkStaleness,
  GoldenAgentType,
  type GoldenCaseMetadata,
  GoldenCaseMetadataSchema,
  type GoldenDatasetMetadata,
  GoldenDatasetMetadataSchema,
  MarketRegime,
  ScenarioCategory,
  STALENESS_THRESHOLDS,
  type StalenessCheckResult,
} from "./schema.js";
