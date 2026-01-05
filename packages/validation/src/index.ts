/**
 * @cream/validation - Research-to-Production Validation
 *
 * This package contains validation mechanisms to ensure backtesting
 * features match live trading capabilities, preventing look-ahead bias
 * and ensuring statistical parity.
 *
 * Reference: docs/plans/00-overview.md (Lines 197-201)
 *
 * @module @cream/validation
 */

export const PACKAGE_NAME = "@cream/validation";
export const VERSION = "0.0.1";

// Parity validation
export {
  type Candle,
  CandleSchema,
  checkLookAheadBias,
  compareFillModels,
  comparePerformanceMetrics,
  // Validation functions
  compareVersionRegistries,
  type DataConsistencyResult,
  type DataSourceMetadata,
  DataSourceMetadataSchema,
  // Constants
  DEFAULT_METRIC_TOLERANCES,
  type FillModelComparisonResult,
  type FillRecord,
  FillRecordSchema,
  type IndicatorVersion,
  // Schemas
  IndicatorVersionSchema,
  type LookAheadBiasResult,
  type ParityValidationResult,
  type PerformanceMetrics,
  PerformanceMetricsSchema,
  runParityValidation,
  type StatisticalParityResult,
  // Result types
  type VersionComparisonResult,
  type VersionRegistry,
  VersionRegistrySchema,
  validateAdjustedData,
  validateDataConsistency,
} from "./parity";
