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
  // Schemas
  IndicatorVersionSchema,
  type IndicatorVersion,
  VersionRegistrySchema,
  type VersionRegistry,
  CandleSchema,
  type Candle,
  FillRecordSchema,
  type FillRecord,
  PerformanceMetricsSchema,
  type PerformanceMetrics,
  DataSourceMetadataSchema,
  type DataSourceMetadata,
  // Result types
  type VersionComparisonResult,
  type LookAheadBiasResult,
  type FillModelComparisonResult,
  type StatisticalParityResult,
  type DataConsistencyResult,
  type ParityValidationResult,
  // Validation functions
  compareVersionRegistries,
  checkLookAheadBias,
  validateAdjustedData,
  compareFillModels,
  comparePerformanceMetrics,
  validateDataConsistency,
  runParityValidation,
  // Constants
  DEFAULT_METRIC_TOLERANCES,
} from "./parity";
