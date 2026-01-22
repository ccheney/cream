/**
 * HelixDB Ingestion for Filing Chunks
 *
 * Ingests filing chunks into HelixDB with embeddings.
 */

import { createHelixClientFromEnv, type HelixClient } from "@cream/helix";
import type { FilingChunk, FilingChunkData } from "./types.js";

// ============================================
// Types
// ============================================

/**
 * Result of a single chunk ingestion
 */
export interface ChunkIngestionResult {
	chunkId: string;
	success: boolean;
	error?: string;
}

/**
 * Result of batch chunk ingestion
 */
export interface BatchIngestionResult {
	successful: ChunkIngestionResult[];
	failed: ChunkIngestionResult[];
	totalProcessed: number;
	executionTimeMs: number;
}

/**
 * Aggregated ingestion result for multiple filings
 */
export interface FilingsIngestionResult {
	filingsProcessed: number;
	chunksIngested: number;
	chunksFailed: number;
	totalExecutionTimeMs: number;
}

// ============================================
// Ingestion Functions
// ============================================

/**
 * Ingest a single filing chunk into HelixDB.
 *
 * Uses the InsertFilingChunk query which embeds the chunk_text.
 */
export async function ingestFilingChunk(
	client: HelixClient,
	chunk: FilingChunkData,
): Promise<ChunkIngestionResult> {
	try {
		await client.query("InsertFilingChunk", {
			chunk_id: chunk.chunk_id,
			filing_id: chunk.filing_id,
			company_symbol: chunk.company_symbol,
			filing_type: chunk.filing_type,
			filing_date: chunk.filing_date,
			chunk_text: chunk.chunk_text,
			chunk_index: chunk.chunk_index,
		});

		return {
			chunkId: chunk.chunk_id,
			success: true,
		};
	} catch (error) {
		return {
			chunkId: chunk.chunk_id,
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Ingest a FilingChunk (camelCase) into HelixDB.
 *
 * Converts to snake_case format for HelixDB.
 */
export async function ingestChunk(
	client: HelixClient,
	chunk: FilingChunk,
): Promise<ChunkIngestionResult> {
	const chunkData: FilingChunkData = {
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

	return ingestFilingChunk(client, chunkData);
}

/**
 * Ingest multiple filing chunks into HelixDB.
 *
 * Processes chunks sequentially to avoid overwhelming HelixDB.
 */
export async function batchIngestFilingChunks(
	client: HelixClient,
	chunks: FilingChunkData[],
): Promise<BatchIngestionResult> {
	const startTime = Date.now();
	const successful: ChunkIngestionResult[] = [];
	const failed: ChunkIngestionResult[] = [];

	for (const chunk of chunks) {
		const result = await ingestFilingChunk(client, chunk);
		if (result.success) {
			successful.push(result);
		} else {
			failed.push(result);
		}
	}

	return {
		successful,
		failed,
		totalProcessed: chunks.length,
		executionTimeMs: Date.now() - startTime,
	};
}

/**
 * Ingest multiple FilingChunk objects (camelCase) into HelixDB.
 */
export async function batchIngestChunks(
	client: HelixClient,
	chunks: FilingChunk[],
): Promise<BatchIngestionResult> {
	const startTime = Date.now();
	const successful: ChunkIngestionResult[] = [];
	const failed: ChunkIngestionResult[] = [];

	for (const chunk of chunks) {
		const result = await ingestChunk(client, chunk);
		if (result.success) {
			successful.push(result);
		} else {
			failed.push(result);
		}
	}

	return {
		successful,
		failed,
		totalProcessed: chunks.length,
		executionTimeMs: Date.now() - startTime,
	};
}

/**
 * Ingest chunks from multiple filings.
 *
 * @param client - HelixDB client
 * @param filingChunks - Array of arrays, each containing chunks for one filing
 * @param onProgress - Optional callback after each filing is processed
 * @returns Aggregated statistics
 */
export async function ingestFilingChunks(
	client: HelixClient,
	filingChunks: FilingChunk[][],
	onProgress?: (filingIndex: number, result: BatchIngestionResult) => void,
): Promise<FilingsIngestionResult> {
	const startTime = Date.now();
	let chunksIngested = 0;
	let chunksFailed = 0;

	for (let i = 0; i < filingChunks.length; i++) {
		const chunks = filingChunks[i];
		if (!chunks) {
			continue;
		}
		const result = await batchIngestChunks(client, chunks);
		chunksIngested += result.successful.length;
		chunksFailed += result.failed.length;

		if (onProgress) {
			onProgress(i, result);
		}
	}

	return {
		filingsProcessed: filingChunks.length,
		chunksIngested,
		chunksFailed,
		totalExecutionTimeMs: Date.now() - startTime,
	};
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Create a HelixDB client from environment variables and ingest chunks.
 *
 * @param filingChunks - Array of arrays, each containing chunks for one filing
 * @param onProgress - Optional callback after each filing is processed
 * @returns Aggregated statistics
 */
export async function ingestChunksToHelix(
	filingChunks: FilingChunk[][],
	onProgress?: (filingIndex: number, result: BatchIngestionResult) => void,
): Promise<FilingsIngestionResult> {
	const client = createHelixClientFromEnv();

	try {
		return await ingestFilingChunks(client, filingChunks, onProgress);
	} finally {
		// HelixDB client cleanup if needed
	}
}
