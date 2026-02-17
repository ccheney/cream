/**
 * Data Export/Import Utilities
 *
 * Provides data portability for HelixDB as a risk mitigation
 * strategy for the early-stage database.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

export {
	exportData,
	exportIncremental,
	exportToJson,
	importData,
	importFromJson,
	mergeExports,
	validateExport,
} from "./export-core";

export { createGraphDatabase, HelixGraphDatabase } from "./export-database";

export type {
	ExportOptions,
	HelixExport,
	IGraphDatabase,
	ImportOptions,
	ImportResult,
	IncrementalExport,
} from "./export-types";
