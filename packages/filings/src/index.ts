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

// HelixDB Ingestion
export {
  type BatchIngestionResult,
  batchIngestFilingChunks,
  type ChunkIngestionResult,
  ingestChunkedFiling,
  ingestChunkedFilings,
  ingestFilingChunk,
  ingestFilingsToHelix,
} from "./helix-ingest.js";
// Python Bridge
export {
  FilingsPythonBridge,
  fetchAndChunkFilings,
} from "./python-bridge.js";
// Service
export {
  createFilingsIngestionService,
  FilingsIngestionService,
} from "./service.js";
// Types
export type {
  ChunkedFilingEvent,
  CompleteEvent,
  ErrorEvent,
  FetchFilingsParams,
  FilingChunkData,
  FilingMetadataEvent,
  FilingSyncConfig,
  FilingSyncResult,
  FilingType,
  ParseErrorEvent,
  ProgressCallback,
  ProgressEvent,
  PythonEvent,
  PythonRequest,
  SymbolErrorEvent,
} from "./types.js";
export { FilingTypeSchema } from "./types.js";
