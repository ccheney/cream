/**
 * Filings Package Types
 *
 * TypeScript interfaces for SEC filings ingestion and IPC protocol.
 */

import { z } from "zod";

// ============================================
// Filing Types
// ============================================

export const FilingTypeSchema = z.enum(["10-K", "10-Q", "8-K", "DEF14A"]);
export type FilingType = z.infer<typeof FilingTypeSchema>;

// ============================================
// IPC Protocol Types (Python ↔ TypeScript)
// ============================================

/**
 * Request to Python subprocess
 */
export interface PythonRequest {
  command: "fetch_filings" | "get_company" | "list_filings" | "ping";
  params: Record<string, unknown>;
}

/**
 * Fetch filings parameters
 */
export interface FetchFilingsParams {
  symbols: string[];
  filing_types?: string[];
  start_date?: string;
  end_date?: string;
  limit_per_symbol?: number;
  parse?: boolean;
  chunk?: boolean;
}

/**
 * Base response from Python subprocess
 */
export interface PythonResponse {
  type: string;
}

/**
 * Progress event during fetching
 */
export interface ProgressEvent extends PythonResponse {
  type: "progress";
  symbol: string;
  processed: number;
  total: number;
  phase: "fetching" | "parsing" | "chunking";
}

/**
 * Chunked filing data from Python
 */
export interface ChunkedFilingEvent extends PythonResponse {
  type: "filing_chunked";
  symbol: string;
  accession_number: string;
  filing_type: string;
  filed_date: string;
  chunks: FilingChunkData[];
  chunk_count: number;
}

/**
 * Filing chunk data from Python
 */
export interface FilingChunkData {
  chunk_id: string;
  filing_id: string;
  company_symbol: string;
  filing_type: string;
  filing_date: string;
  section_name: string;
  chunk_index: number;
  chunk_text: string;
  total_chunks: number;
}

/**
 * Filing metadata event
 */
export interface FilingMetadataEvent extends PythonResponse {
  type: "filing_metadata";
  symbol: string;
  data: {
    accession_number: string;
    filing_type: string;
    filed_date: string;
    report_date: string | null;
    company: {
      cik: string;
      name: string;
      ticker: string | null;
    };
    primary_document: string;
    items: string[];
  };
}

/**
 * Completion event
 */
export interface CompleteEvent extends PythonResponse {
  type: "complete";
  symbols_processed: number;
  filings_fetched: number;
  filings_parsed: number;
  chunks_created: number;
}

/**
 * Error event
 */
export interface ErrorEvent extends PythonResponse {
  type: "error";
  code: string;
  message: string;
}

/**
 * Symbol-specific error
 */
export interface SymbolErrorEvent extends PythonResponse {
  type: "symbol_error";
  symbol: string;
  error: string;
}

/**
 * Parse error for a specific filing
 */
export interface ParseErrorEvent extends PythonResponse {
  type: "parse_error";
  symbol: string;
  accession_number: string;
  error: string;
}

/**
 * Union of all Python response types
 */
export type PythonEvent =
  | ProgressEvent
  | ChunkedFilingEvent
  | FilingMetadataEvent
  | CompleteEvent
  | ErrorEvent
  | SymbolErrorEvent
  | ParseErrorEvent;

// ============================================
// Ingestion Configuration
// ============================================

/**
 * Configuration for filing sync
 */
export interface FilingSyncConfig {
  /** Symbols to fetch filings for */
  symbols: string[];
  /** Filing types to fetch */
  filingTypes: FilingType[];
  /** Start date for filings (ISO format) */
  startDate?: string;
  /** End date for filings (ISO format) */
  endDate?: string;
  /** Max filings per symbol */
  limitPerSymbol?: number;
  /** Trigger source for tracking */
  triggerSource: "scheduled" | "manual" | "dashboard";
  /** Environment */
  environment: "BACKTEST" | "PAPER" | "LIVE";
}

/**
 * Result of filing sync operation
 */
export interface FilingSyncResult {
  runId: string;
  success: boolean;
  symbolsProcessed: number;
  filingsFetched: number;
  filingsIngested: number;
  chunksCreated: number;
  durationMs: number;
  errors: string[];
}

// ============================================
// Progress Callbacks
// ============================================

/**
 * Progress callback for sync operations
 */
export type ProgressCallback = (progress: {
  phase: "fetching" | "parsing" | "chunking" | "embedding" | "storing";
  symbol: string;
  symbolsProcessed: number;
  symbolsTotal: number;
  filingsIngested: number;
  chunksCreated: number;
}) => void;
