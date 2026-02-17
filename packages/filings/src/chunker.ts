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
		const itemNumber = sectionKey.replace("item_", "").replaceAll("_", ".");
		return `Item ${itemNumber}`;
	}

	// Fallback: title case the key
	return sectionKey.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface SplitState {
	chunks: string[];
	currentChunk: string;
	previousOverlap: string;
}

interface FilingChunkMeta {
	filingId: string;
	companySymbol: string;
	filingType: ParsedFiling["filing"]["filingType"];
	filingDate: string;
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
	overlap = CHUNK_OVERLAP,
): string[] {
	if (text.length <= maxSize) {
		return [text];
	}

	const state: SplitState = {
		chunks: [],
		currentChunk: "",
		previousOverlap: "",
	};

	for (const paragraph of getNonEmptyParagraphs(text)) {
		const trimmedParagraph = paragraph.trim();
		processParagraph(state, trimmedParagraph, maxSize, overlap);
	}

	pushCurrentChunkIfPresent(state);
	return state.chunks;
}

function getNonEmptyParagraphs(text: string): string[] {
	return text.split(/\n\n+/).filter((paragraph) => paragraph.trim());
}

function processParagraph(
	state: SplitState,
	paragraph: string,
	maxSize: number,
	overlap: number,
): void {
	const paragraphChunk = buildChunkText(
		state.currentChunk,
		state.previousOverlap,
		paragraph,
		"\n\n",
	);
	if (paragraphChunk.length > maxSize && state.currentChunk) {
		startNextChunk(state, overlap, paragraph, "\n\n");
		return;
	}

	if (paragraph.length > maxSize) {
		processOversizedParagraph(state, paragraph, maxSize, overlap);
		return;
	}

	state.currentChunk = paragraphChunk;
}

function processOversizedParagraph(
	state: SplitState,
	paragraph: string,
	maxSize: number,
	overlap: number,
): void {
	for (const sentence of splitOnSentences(paragraph)) {
		const sentenceChunk = buildChunkText(state.currentChunk, state.previousOverlap, sentence, " ");
		if (sentenceChunk.length > maxSize && state.currentChunk) {
			startNextChunk(state, overlap, sentence, " ");
			continue;
		}
		state.currentChunk = sentenceChunk;
	}
}

function buildChunkText(
	currentChunk: string,
	previousOverlap: string,
	input: string,
	separator: string,
): string {
	if (currentChunk) {
		return `${currentChunk}${separator}${input}`;
	}
	if (!previousOverlap) {
		return input;
	}
	return `${previousOverlap}${separator}${input}`;
}

function startNextChunk(
	state: SplitState,
	overlap: number,
	nextContent: string,
	separator: string,
): void {
	state.chunks.push(state.currentChunk);
	state.previousOverlap = state.currentChunk.slice(-overlap);
	state.currentChunk = buildChunkText("", state.previousOverlap, nextContent, separator);
}

function pushCurrentChunkIfPresent(state: SplitState): void {
	if (state.currentChunk.trim()) {
		state.chunks.push(state.currentChunk);
	}
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
	const metadata = getFilingChunkMeta(parsed);

	// Process each section
	for (const [sectionKey, sectionContent] of Object.entries(parsed.sections)) {
		globalChunkIndex = appendSectionChunks(
			chunks,
			metadata,
			sectionKey,
			sectionContent,
			globalChunkIndex,
		);
	}

	// Update totalChunks on all chunks
	for (const chunk of chunks) {
		chunk.totalChunks = chunks.length;
	}

	return chunks;
}

function getFilingChunkMeta(parsed: ParsedFiling): FilingChunkMeta {
	return {
		filingId: parsed.filing.accessionNumber,
		companySymbol: parsed.filing.company.ticker ?? parsed.filing.company.cik,
		filingType: parsed.filing.filingType,
		filingDate: formatDate(parsed.filing.filedDate),
	};
}

function appendSectionChunks(
	chunks: FilingChunk[],
	metadata: FilingChunkMeta,
	sectionKey: string,
	sectionContent: string,
	startChunkIndex: number,
): number {
	if (sectionContent.length < MIN_SECTION_LENGTH) {
		return startChunkIndex;
	}

	const sectionName = getSectionDisplayName(sectionKey);
	const sectionChunks = splitTextWithOverlap(sectionContent);
	let chunkIndex = startChunkIndex;

	for (const [sectionChunkIndex, chunkText] of sectionChunks.entries()) {
		const chunkHeader = createChunkHeader(sectionName, sectionChunkIndex, sectionChunks.length);
		chunks.push({
			chunkId: createChunkId(metadata.filingId, sectionKey, chunkIndex),
			filingId: metadata.filingId,
			companySymbol: metadata.companySymbol,
			filingType: metadata.filingType,
			filingDate: metadata.filingDate,
			sectionName,
			chunkIndex,
			chunkText: `${chunkHeader}\n\n${chunkText}`,
			totalChunks: 0,
		});
		chunkIndex++;
	}

	return chunkIndex;
}

function createChunkHeader(
	sectionName: string,
	sectionChunkIndex: number,
	totalSectionChunks: number,
): string {
	if (totalSectionChunks <= 1) {
		return `## ${sectionName}`;
	}
	return `## ${sectionName} (Part ${sectionChunkIndex + 1} of ${totalSectionChunks})`;
}

/**
 * Convert FilingChunk array to plain objects for serialization.
 *
 * @param chunks - Array of FilingChunk objects
 * @returns Array of plain objects
 */
export function chunksToObjects(chunks: FilingChunk[]): Record<string, unknown>[] {
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
