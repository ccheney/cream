/**
 * Research-to-Production Feature Parity Validation
 *
 * @module @cream/domain/parity
 */

export {
	type DataConsistencyResult,
	type DataSourceMetadata,
	DataSourceMetadataSchema,
	validateDataConsistency,
} from "./parity/data-consistency";
export {
	compareFillModels,
	type FillModelComparisonResult,
	type FillRecord,
	FillRecordSchema,
} from "./parity/fill-models";
export {
	checkLookAheadBias,
	type LookAheadBiasResult,
	type ParityCandle,
	ParityCandleSchema,
	validateAdjustedData,
} from "./parity/look-ahead";

export {
	comparePerformanceMetrics,
	DEFAULT_METRIC_TOLERANCES,
	type ParityPerformanceMetrics,
	ParityPerformanceMetricsSchema,
	type StatisticalParityResult,
} from "./parity/performance-metrics";
export { type ParityValidationResult, runParityValidation } from "./parity/validation-workflow";
export {
	compareVersionRegistries,
	type IndicatorVersion,
	IndicatorVersionSchema,
	type VersionComparisonResult,
	type VersionRegistry,
	VersionRegistrySchema,
} from "./parity/version-registry";
