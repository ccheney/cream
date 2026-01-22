/**
 * HelixDB Integration for External Context
 *
 * Provides optional HelixDB ingestion for extracted events.
 * Use this to persist extracted events with embeddings for semantic search.
 *
 * @example
 * ```typescript
 * import { createHelixClient } from "@cream/helix";
 * import { ExtractionPipeline } from "@cream/external-context";
 * import { ingestExtractedEvents } from "@cream/external-context";
 *
 * const client = createHelixClient();
 * const pipeline = new ExtractionPipeline();
 *
 * // Extract events
 * const events = await pipeline.processNews(articles);
 *
 * // Ingest to HelixDB
 * const result = await ingestExtractedEvents(client, events);
 * ```
 */

import type { HelixClient } from "@cream/helix";
import {
	createEventIngestionService,
	type EventIngestionResult,
	type ExtractedEvent as HelixExtractedEvent,
} from "@cream/helix";

import type { ExtractedEvent } from "./types.js";

/**
 * Convert external-context ExtractedEvent to helix ExtractedEvent format
 */
function toHelixEvent(event: ExtractedEvent): HelixExtractedEvent {
	return {
		eventId: event.eventId,
		sourceType: event.sourceType,
		eventType: event.eventType,
		eventTime: event.eventTime,
		extraction: event.extraction,
		scores: event.scores,
		relatedInstrumentIds: event.relatedInstrumentIds,
		originalContent: event.originalContent,
		processedAt: event.processedAt,
	};
}

/**
 * Ingest extracted events into HelixDB
 *
 * Creates ExternalEvent nodes with embeddings and establishes
 * graph relationships (RELATES_TO_MACRO, EVENT_MENTIONS).
 *
 * @param client - HelixDB client
 * @param events - Extracted events from the pipeline
 * @param options - Ingestion options
 * @returns Ingestion result
 */
export async function ingestExtractedEvents(
	client: HelixClient,
	events: ExtractedEvent[],
	options: {
		generateEmbeddings?: boolean;
		createMacroEdges?: boolean;
		createCompanyEdges?: boolean;
		batchSize?: number;
	} = {},
): Promise<EventIngestionResult> {
	const service = createEventIngestionService(client);
	const helixEvents = events.map(toHelixEvent);
	return service.ingestEvents(helixEvents, options);
}

/**
 * Ingest a single extracted event into HelixDB
 */
export async function ingestExtractedEvent(
	client: HelixClient,
	event: ExtractedEvent,
	options: {
		generateEmbeddings?: boolean;
		createMacroEdges?: boolean;
		createCompanyEdges?: boolean;
	} = {},
): Promise<EventIngestionResult> {
	return ingestExtractedEvents(client, [event], options);
}

/**
 * Search for similar events in HelixDB
 *
 * @param client - HelixDB client
 * @param queryText - Text to search for similar events
 * @param limit - Maximum number of results
 * @returns Similar events with similarity scores
 */
export async function searchSimilarEvents(
	client: HelixClient,
	queryText: string,
	limit = 10,
): Promise<Array<{ eventId: string; similarity: number; textSummary: string }>> {
	const service = createEventIngestionService(client);
	return service.searchSimilarEvents(queryText, limit);
}

export type { EventIngestionResult };
