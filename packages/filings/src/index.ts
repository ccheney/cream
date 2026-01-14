/**
 * @cream/filings
 *
 * SEC filings ingestion pipeline for HelixDB.
 *
 * @example
 * ```typescript
 * import { FilingsIngestionService, createFilingsIngestionService } from "@cream/filings";
 *
 * const service = createFilingsIngestionService(tursoClient);
 *
 * const result = await service.syncFilings({
 *   symbols: ["AAPL", "MSFT"],
 *   filingTypes: ["10-K", "10-Q"],
 *   triggerSource: "dashboard",
 *   environment: "PAPER",
 * });
 * ```
 */

// Chunker
export {
	chunkParsedFiling,
	chunksToObjects,
	createChunkId,
	estimateTokens,
	SECTION_NAMES,
	splitTextWithOverlap,
} from "./chunker.js";
// Edgar Client
export { EdgarClient, type EdgarClientConfig, type GetFilingsParams } from "./edgar-client.js";
// HelixDB Ingestion
export {
	type BatchIngestionResult,
	batchIngestChunks,
	batchIngestFilingChunks,
	type ChunkIngestionResult,
	type FilingsIngestionResult,
	ingestChunk,
	ingestChunksToHelix,
	ingestFilingChunk,
	ingestFilingChunks,
} from "./helix-ingest.js";
// Parsers
export {
	COMMON_SECTIONS,
	FilingParser,
	Form8KParser,
	Form10KParser,
	Form10QParser,
	getParser,
	ITEMS_8K,
	parseFiling,
	parseFilingWithParser,
	SECTIONS_10K,
	SECTIONS_10Q,
} from "./parsers/index.js";

// Service
export {
	createFilingsIngestionService,
	FilingsIngestionService,
} from "./service.js";

// Types
export type {
	Company,
	Filing,
	FilingChunk,
	FilingChunkData,
	FilingSyncConfig,
	FilingSyncResult,
	FilingType,
	Form8KItem,
	ParsedFiling,
	ProgressCallback,
} from "./types.js";

export {
	FilingTypeSchema,
	fromFilingChunkData,
	toFilingChunkData,
} from "./types.js";
