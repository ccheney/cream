/**
 * HelixDB Ingestion for Filing Chunks
 *
 * Ingests filing chunks into HelixDB with embeddings.
 */

import { createHelixClientFromEnv, type HelixClient } from "@cream/helix";
import type { ChunkedFilingEvent, FilingChunkData } from "./types.js";

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
  chunk: FilingChunkData
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
 * Ingest multiple filing chunks into HelixDB.
 *
 * Processes chunks sequentially to avoid overwhelming HelixDB.
 */
export async function batchIngestFilingChunks(
  client: HelixClient,
  chunks: FilingChunkData[]
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
 * Ingest all chunks from a chunked filing event.
 */
export async function ingestChunkedFiling(
  client: HelixClient,
  filing: ChunkedFilingEvent
): Promise<BatchIngestionResult> {
  return batchIngestFilingChunks(client, filing.chunks);
}

/**
 * Ingest multiple chunked filing events.
 *
 * Returns aggregate statistics across all filings.
 */
export async function ingestChunkedFilings(
  client: HelixClient,
  filings: ChunkedFilingEvent[],
  onProgress?: (filing: ChunkedFilingEvent, result: BatchIngestionResult) => void
): Promise<{
  filingsProcessed: number;
  chunksIngested: number;
  chunksFailed: number;
  totalExecutionTimeMs: number;
}> {
  const startTime = Date.now();
  let chunksIngested = 0;
  let chunksFailed = 0;

  for (const filing of filings) {
    const result = await ingestChunkedFiling(client, filing);
    chunksIngested += result.successful.length;
    chunksFailed += result.failed.length;

    if (onProgress) {
      onProgress(filing, result);
    }
  }

  return {
    filingsProcessed: filings.length,
    chunksIngested,
    chunksFailed,
    totalExecutionTimeMs: Date.now() - startTime,
  };
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Create a HelixDB client from environment variables and ingest filings.
 *
 * This is a convenience wrapper that handles client creation.
 */
export async function ingestFilingsToHelix(
  filings: ChunkedFilingEvent[],
  onProgress?: (filing: ChunkedFilingEvent, result: BatchIngestionResult) => void
): Promise<{
  filingsProcessed: number;
  chunksIngested: number;
  chunksFailed: number;
  totalExecutionTimeMs: number;
}> {
  const client = createHelixClientFromEnv();

  try {
    return await ingestChunkedFilings(client, filings, onProgress);
  } finally {
    // HelixDB client cleanup if needed
  }
}
