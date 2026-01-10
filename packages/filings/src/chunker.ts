/**
 * Filing Chunker
 *
 * Section-based document chunking for RAG (Retrieval Augmented Generation).
 * Splits parsed filings into overlapping chunks for vector embedding.
 */

import type { FilingChunk, ParsedFiling } from "./types.js";

// ============================================
// Constants
// ============================================

/** Target chunk size in characters (~500-1000 tokens) */
const _TARGET_CHUNK_SIZE = 4000;

/** Maximum chunk size (hard limit) */
const MAX_CHUNK_SIZE = 8000;

/** Characters to overlap between chunks for context preservation */
const CHUNK_OVERLAP = 200;

/** Minimum section length to create chunks (skip tiny sections) */
const MIN_SECTION_LENGTH = 100;

// ============================================
// Section Name Mapping
// ============================================

/**
 * Human-readable section names for chunking.
 */
export const SECTION_NAMES: Record<string, string> = {
  // 10-K sections
  business: "Business Description",
  risk_factors: "Risk Factors",
  properties: "Properties",
  legal_proceedings: "Legal Proceedings",
  mda: "Management Discussion and Analysis",
  financial_statements: "Financial Statements",
  selected_financial_data: "Selected Financial Data",
  quantitative_disclosures: "Quantitative Disclosures",
  controls_procedures: "Controls and Procedures",

  // 10-Q sections (with Q suffix to distinguish if needed)
  financial_statements_q: "Quarterly Financial Statements",
  mda_q: "Quarterly MD&A",
  quantitative_q: "Quantitative and Qualitative Disclosures",
  controls_q: "Controls and Procedures",
  legal_q: "Legal Proceedings",
};

// ============================================
// Utility Functions
// ============================================

/**
 * Create a unique chunk ID.
 *
 * @param filingId - Accession number of the filing
 * @param section - Section name
 * @param index - Chunk index within section
 * @returns Unique chunk ID
 *
 * @example
 * createChunkId("0000320193-24-000081", "business", 0)
 * // Returns: "chunk_000032019324000081_business_000"
 */
export function createChunkId(filingId: string, section: string, index: number): string {
  const cleanFilingId = filingId.replace(/[-/]/g, "");
  const cleanSection = section.toLowerCase().replace(/\s+/g, "_");
  const paddedIndex = index.toString().padStart(3, "0");
  return `chunk_${cleanFilingId}_${cleanSection}_${paddedIndex}`;
}

/**
 * Estimate token count from text.
 *
 * Uses rough approximation of ~4 characters per token for English.
 *
 * @param text - Text to estimate tokens for
 * @returns Approximate token count
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Format a date as ISO string (YYYY-MM-DD).
 */
function formatDate(date: Date): string {
  const isoString = date.toISOString();
  return isoString.split("T")[0] ?? isoString.slice(0, 10);
}

/**
 * Get display name for a section.
 */
function getSectionDisplayName(sectionKey: string): string {
  // Check mapping first
  const mappedName = SECTION_NAMES[sectionKey];
  if (mappedName) {
    return mappedName;
  }

  // Handle 8-K item keys (e.g., "item_2_02" -> "Item 2.02")
  if (sectionKey.startsWith("item_")) {
    const itemNumber = sectionKey.replace("item_", "").replace("_", ".");
    return `Item ${itemNumber}`;
  }

  // Fallback: title case the key
  return sectionKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ============================================
// Chunking Functions
// ============================================

/**
 * Split text into overlapping chunks.
 *
 * Algorithm:
 * 1. If text fits in maxSize, return as single chunk
 * 2. Split on paragraph boundaries (double newlines)
 * 3. Accumulate paragraphs until maxSize exceeded
 * 4. Use overlap from end of previous chunk
 * 5. For oversized paragraphs, split on sentences
 *
 * @param text - Text to split
 * @param maxSize - Maximum chunk size (default: 8000)
 * @param overlap - Characters to overlap (default: 200)
 * @returns Array of chunk strings
 */
export function splitTextWithOverlap(
  text: string,
  maxSize = MAX_CHUNK_SIZE,
  overlap = CHUNK_OVERLAP
): string[] {
  // Single chunk if fits
  if (text.length <= maxSize) {
    return [text];
  }

  const chunks: string[] = [];

  // Split on paragraph boundaries
  const paragraphs = text.split(/\n\n+/);

  let currentChunk = "";
  let previousOverlap = "";

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) {
      continue;
    }

    // Check if adding this paragraph exceeds limit
    const potentialChunk = currentChunk
      ? `${currentChunk}\n\n${trimmedParagraph}`
      : `${previousOverlap}${previousOverlap ? "\n\n" : ""}${trimmedParagraph}`;

    if (potentialChunk.length > maxSize && currentChunk) {
      // Save current chunk
      chunks.push(currentChunk);

      // Get overlap from end of current chunk
      previousOverlap = currentChunk.slice(-overlap);

      // Start new chunk with overlap and current paragraph
      currentChunk = `${previousOverlap}\n\n${trimmedParagraph}`;
    } else if (trimmedParagraph.length > maxSize) {
      // Handle oversized paragraph by splitting on sentences
      const sentences = splitOnSentences(trimmedParagraph);

      for (const sentence of sentences) {
        const potentialWithSentence = currentChunk
          ? `${currentChunk} ${sentence}`
          : `${previousOverlap}${previousOverlap ? " " : ""}${sentence}`;

        if (potentialWithSentence.length > maxSize && currentChunk) {
          chunks.push(currentChunk);
          previousOverlap = currentChunk.slice(-overlap);
          currentChunk = `${previousOverlap} ${sentence}`;
        } else {
          currentChunk = potentialWithSentence;
        }
      }
    } else {
      currentChunk = potentialChunk;
    }
  }

  // Add final chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Split text on sentence boundaries.
 */
function splitOnSentences(text: string): string[] {
  // Split on period followed by space or newline, keeping the period
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
}

// ============================================
// Main Chunking Function
// ============================================

/**
 * Chunk a parsed filing into FilingChunk objects.
 *
 * Creates overlapping chunks from each section, with headers prepended.
 *
 * @param parsed - Parsed filing with sections
 * @returns Array of FilingChunk objects
 *
 * @example
 * ```typescript
 * const chunks = chunkParsedFiling(parsed);
 * console.log(chunks.length);
 * console.log(chunks[0].sectionName); // "Business Description"
 * ```
 */
export function chunkParsedFiling(parsed: ParsedFiling): FilingChunk[] {
  const chunks: FilingChunk[] = [];
  let globalChunkIndex = 0;

  const { filing, sections } = parsed;

  // Extract filing metadata
  const filingId = filing.accessionNumber;
  const companySymbol = filing.company.ticker ?? filing.company.cik;
  const filingType = filing.filingType;
  const filingDate = formatDate(filing.filedDate);

  // Process each section
  for (const [sectionKey, sectionContent] of Object.entries(sections)) {
    // Skip tiny sections
    if (sectionContent.length < MIN_SECTION_LENGTH) {
      continue;
    }

    const sectionName = getSectionDisplayName(sectionKey);

    // Split section into chunks
    const sectionChunks = splitTextWithOverlap(sectionContent);

    // Create chunk objects
    for (let i = 0; i < sectionChunks.length; i++) {
      const chunkText = sectionChunks[i];

      // Prepend header
      let header = `## ${sectionName}`;
      if (sectionChunks.length > 1) {
        header += ` (Part ${i + 1} of ${sectionChunks.length})`;
      }

      const formattedChunk = `${header}\n\n${chunkText}`;

      chunks.push({
        chunkId: createChunkId(filingId, sectionKey, globalChunkIndex),
        filingId,
        companySymbol,
        filingType,
        filingDate,
        sectionName,
        chunkIndex: globalChunkIndex,
        chunkText: formattedChunk,
        totalChunks: 0, // Updated after all chunks created
      });

      globalChunkIndex++;
    }
  }

  // Update totalChunks on all chunks
  for (const chunk of chunks) {
    chunk.totalChunks = chunks.length;
  }

  return chunks;
}

/**
 * Convert FilingChunk array to plain objects for serialization.
 *
 * @param chunks - Array of FilingChunk objects
 * @returns Array of plain objects
 */
export function chunksToObjects(chunks: FilingChunk[]): Array<Record<string, unknown>> {
  return chunks.map((chunk) => ({
    chunk_id: chunk.chunkId,
    filing_id: chunk.filingId,
    company_symbol: chunk.companySymbol,
    filing_type: chunk.filingType,
    filing_date: chunk.filingDate,
    section_name: chunk.sectionName,
    chunk_index: chunk.chunkIndex,
    chunk_text: chunk.chunkText,
    total_chunks: chunk.totalChunks,
  }));
}
