/**
 * Filings Package Types
 *
 * TypeScript interfaces for SEC filings ingestion.
 */

import { z } from "zod";

// ============================================
// Filing Types
// ============================================

export const FilingTypeSchema = z.enum(["10-K", "10-Q", "8-K", "DEF14A"]);
export type FilingType = z.infer<typeof FilingTypeSchema>;

// ============================================
// Core Domain Types
// ============================================

/**
 * Company information from SEC EDGAR
 */
export interface Company {
	/** CIK (Central Index Key), padded to 10 digits */
	cik: string;
	/** Company name */
	name: string;
	/** Stock ticker symbol */
	ticker?: string;
	/** Stock exchange (e.g., "NYSE", "NASDAQ") */
	exchange?: string;
	/** Standard Industrial Classification code */
	sic?: string;
	/** SIC description */
	sicDescription?: string;
	/** Fiscal year end (MMDD format) */
	fiscalYearEnd?: string;
	/** State of incorporation */
	stateOfIncorporation?: string;
}

/**
 * SEC filing metadata
 */
export interface Filing {
	/** Unique filing ID (e.g., "0000320193-24-000081") */
	accessionNumber: string;
	/** Filing type (10-K, 10-Q, 8-K, DEF14A) */
	filingType: FilingType;
	/** Date filed with SEC */
	filedDate: Date;
	/** Period covered by the filing */
	reportDate?: Date;
	/** Company information */
	company: Company;
	/** Filename of main document */
	primaryDocument: string;
	/** For 8-K: item numbers (e.g., ["2.02", "9.01"]) */
	items?: string[];
}

/**
 * Parsed filing with extracted content
 */
export interface ParsedFiling {
	/** Original filing metadata */
	filing: Filing;
	/** Raw HTML content */
	rawHtml?: string;
	/** Plain text extraction (max 100k chars) */
	extractedText?: string;
	/** Extracted sections by name */
	sections: Record<string, string>;
	/** Extracted financial tables */
	financialTables: Array<{
		headers: string[];
		rows: string[][];
	}>;
	/** When the filing was parsed */
	extractedAt: Date;
}

/**
 * 8-K form item
 */
export interface Form8KItem {
	/** Item number (e.g., "2.02", "5.02") */
	itemNumber: string;
	/** Item title */
	itemTitle: string;
	/** Item content (max 10k chars) */
	content: string;
}

// ============================================
// Chunking Types
// ============================================

/**
 * Filing chunk for RAG ingestion
 */
export interface FilingChunk {
	/** Unique chunk ID */
	chunkId: string;
	/** Filing accession number */
	filingId: string;
	/** Company ticker or CIK */
	companySymbol: string;
	/** Filing type */
	filingType: string;
	/** Filing date (ISO format) */
	filingDate: string;
	/** Section name (e.g., "Business Description") */
	sectionName: string;
	/** Chunk index within the filing */
	chunkIndex: number;
	/** Chunk text content with header */
	chunkText: string;
	/** Total chunks in the filing */
	totalChunks: number;
}

/**
 * Filing chunk data for HelixDB ingestion (snake_case for compatibility)
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

// ============================================
// Conversion Utilities
// ============================================

/**
 * Convert FilingChunk to FilingChunkData (camelCase to snake_case)
 */
export function toFilingChunkData(chunk: FilingChunk): FilingChunkData {
	return {
		chunk_id: chunk.chunkId,
		filing_id: chunk.filingId,
		company_symbol: chunk.companySymbol,
		filing_type: chunk.filingType,
		filing_date: chunk.filingDate,
		section_name: chunk.sectionName,
		chunk_index: chunk.chunkIndex,
		chunk_text: chunk.chunkText,
		total_chunks: chunk.totalChunks,
	};
}

/**
 * Convert FilingChunkData to FilingChunk (snake_case to camelCase)
 */
export function fromFilingChunkData(data: FilingChunkData): FilingChunk {
	return {
		chunkId: data.chunk_id,
		filingId: data.filing_id,
		companySymbol: data.company_symbol,
		filingType: data.filing_type,
		filingDate: data.filing_date,
		sectionName: data.section_name,
		chunkIndex: data.chunk_index,
		chunkText: data.chunk_text,
		totalChunks: data.total_chunks,
	};
}
