/**
 * Event Ingestion Service
 *
 * Ingests extracted events from the external-context pipeline into HelixDB.
 * Handles embedding generation and edge creation for graph relationships.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { ExternalEvent, ExternalEventType, RelatesToMacroEdge } from "@cream/helix-schema";
import { DEFAULT_EMBEDDING_CONFIG, EmbeddingClient } from "@cream/helix-schema";

import type { HelixClient } from "../client.js";
import {
	batchCreateEdges,
	batchUpsertExternalEvents,
	type EdgeInput,
	type NodeWithEmbedding,
} from "../queries/mutations.js";
import { PREDEFINED_MACRO_ENTITIES } from "./macro-graph-builder.js";

// ============================================
// Types
// ============================================

/**
 * Extracted event from external-context pipeline
 * Mirrors the ExtractedEvent type from @cream/external-context
 */
export interface ExtractedEvent {
	eventId: string;
	sourceType: "news" | "press_release" | "transcript" | "macro";
	eventType: string;
	eventTime: Date;
	extraction: {
		sentiment: "bullish" | "bearish" | "neutral";
		confidence: number;
		entities: Array<{ name: string; type: string; ticker?: string }>;
		dataPoints: Array<{ metric: string; value: number; unit: string; period?: string }>;
		eventType: string;
		importance: number;
		summary: string;
		keyInsights: string[];
	};
	scores: {
		sentimentScore: number;
		importanceScore: number;
		surpriseScore: number;
	};
	relatedInstrumentIds: string[];
	originalContent: string;
	processedAt: Date;
}

/**
 * News item for ingestion
 */
export interface NewsItemInput {
	itemId: string;
	headline: string;
	bodyText: string;
	publishedAt: Date;
	source: string;
	relatedSymbols: string[];
	sentimentScore: number;
}

/**
 * Ingestion result
 */
export interface EventIngestionResult {
	eventsIngested: number;
	edgesCreated: number;
	embeddingsGenerated: number;
	executionTimeMs: number;
	warnings: string[];
	errors: string[];
}

/**
 * Ingestion options
 */
export interface EventIngestionOptions {
	/** Whether to generate embeddings (default: true) */
	generateEmbeddings?: boolean;
	/** Whether to create macro edges (default: true) */
	createMacroEdges?: boolean;
	/** Whether to create company mention edges (default: true) */
	createCompanyEdges?: boolean;
	/** Batch size for operations (default: 50) */
	batchSize?: number;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Map eventType from external-context to HelixDB ExternalEventType
 */
function mapEventType(sourceType: string, eventType: string): ExternalEventType | string {
	const typeMapping: Record<string, ExternalEventType> = {
		earnings: "EARNINGS",
		macro_release: "MACRO",
		guidance: "EARNINGS",
		dividend: "EARNINGS",
		analyst_rating: "NEWS",
		merger_acquisition: "NEWS",
		product_launch: "NEWS",
		regulatory: "NEWS",
		insider_trade: "NEWS",
		stock_split: "NEWS",
		layoffs: "NEWS",
		executive_change: "NEWS",
		legal: "NEWS",
		other: "NEWS",
	};

	// Source-type based mapping for special cases
	if (sourceType === "macro") {
		return "MACRO";
	}

	return typeMapping[eventType] ?? "NEWS";
}

/**
 * Build text summary for embedding from extracted event
 */
function buildTextSummary(event: ExtractedEvent): string {
	const parts: string[] = [event.extraction.summary];

	if (event.extraction.keyInsights.length > 0) {
		parts.push(`Key insights: ${event.extraction.keyInsights.join("; ")}`);
	}

	// Add sentiment context
	parts.push(
		`Sentiment: ${event.extraction.sentiment} (confidence: ${event.extraction.confidence.toFixed(2)})`,
	);

	// Add data points if relevant
	if (event.extraction.dataPoints.length > 0) {
		const dataPointStr = event.extraction.dataPoints
			.slice(0, 3)
			.map((dp) => `${dp.metric}: ${dp.value} ${dp.unit}`)
			.join(", ");
		parts.push(`Data: ${dataPointStr}`);
	}

	return parts.join(". ");
}

/**
 * Convert ExtractedEvent to HelixDB ExternalEvent
 */
function toExternalEvent(event: ExtractedEvent): ExternalEvent {
	return {
		event_id: event.eventId,
		event_type: mapEventType(event.sourceType, event.eventType),
		event_time: event.eventTime.toISOString(),
		payload: JSON.stringify({
			sourceType: event.sourceType,
			eventType: event.eventType,
			extraction: event.extraction,
			scores: event.scores,
			processedAt: event.processedAt.toISOString(),
		}),
		text_summary: buildTextSummary(event),
		related_instrument_ids: JSON.stringify(event.relatedInstrumentIds),
	};
}

/**
 * Identify macro factors related to an event
 * Returns macro entity IDs that should be linked
 */
function identifyMacroFactors(event: ExtractedEvent): string[] {
	const factors: Set<string> = new Set();

	// Check event type for macro mapping
	if (event.eventType === "macro_release") {
		// Try to identify specific macro factor from data points
		for (const dp of event.extraction.dataPoints) {
			const metric = dp.metric.toLowerCase();

			if (metric.includes("gdp") || metric.includes("growth")) {
				factors.add("gdp");
			}
			if (metric.includes("cpi") || metric.includes("inflation")) {
				factors.add("cpi");
			}
			if (
				metric.includes("unemployment") ||
				metric.includes("jobs") ||
				metric.includes("nonfarm")
			) {
				factors.add("unemployment");
			}
			if (metric.includes("pmi") || metric.includes("manufacturing")) {
				factors.add("pmi_manufacturing");
			}
			if (metric.includes("rate") || metric.includes("fed")) {
				factors.add("fed_funds_rate");
			}
		}

		// Check summary for keywords
		const summary = event.extraction.summary.toLowerCase();
		if (summary.includes("fed") || summary.includes("fomc") || summary.includes("interest rate")) {
			factors.add("fed_funds_rate");
		}
		if (summary.includes("oil") || summary.includes("crude") || summary.includes("opec")) {
			factors.add("oil_wti");
		}
		if (summary.includes("treasury") || summary.includes("yield") || summary.includes("bond")) {
			factors.add("treasury_10y");
		}
	}

	// Filter to only predefined macro entities
	const validIds = new Set(PREDEFINED_MACRO_ENTITIES.map((e) => e.entity_id));
	return [...factors].filter((id) => validIds.has(id));
}

// ============================================
// Main Service Class
// ============================================

/**
 * Event Ingestion Service
 *
 * Ingests external events into HelixDB with embeddings and graph edges.
 */
export class EventIngestionService {
	private embeddingClient: EmbeddingClient | null = null;

	constructor(private readonly client: HelixClient) {}

	/**
	 * Get or create embedding client (lazy initialization)
	 */
	private getEmbeddingClient(): EmbeddingClient {
		if (!this.embeddingClient) {
			this.embeddingClient = new EmbeddingClient(DEFAULT_EMBEDDING_CONFIG);
		}
		return this.embeddingClient;
	}

	/**
	 * Ingest a batch of extracted events
	 */
	async ingestEvents(
		events: ExtractedEvent[],
		options: EventIngestionOptions = {},
	): Promise<EventIngestionResult> {
		const startTime = performance.now();
		const warnings: string[] = [];
		const errors: string[] = [];

		const {
			generateEmbeddings = true,
			createMacroEdges = true,
			createCompanyEdges = true,
			batchSize = 50,
		} = options;

		if (events.length === 0) {
			return {
				eventsIngested: 0,
				edgesCreated: 0,
				embeddingsGenerated: 0,
				executionTimeMs: 0,
				warnings: [],
				errors: [],
			};
		}

		// Step 1: Convert to HelixDB format
		const externalEvents = events.map(toExternalEvent);

		// Step 2: Generate embeddings if enabled
		const embeddings: Map<string, number[]> = new Map();
		let embeddingsGenerated = 0;

		if (generateEmbeddings) {
			try {
				const embeddingClient = this.getEmbeddingClient();
				const textsToEmbed = externalEvents.map((e) => e.text_summary ?? "");
				const validTexts = textsToEmbed.filter((t) => t.length > 0);

				if (validTexts.length > 0) {
					const result = await embeddingClient.batchGenerateEmbeddings(validTexts);

					let validIndex = 0;
					for (let i = 0; i < textsToEmbed.length; i++) {
						const text = textsToEmbed[i];
						if (text && text.length > 0) {
							const embedding = result.embeddings[validIndex];
							if (embedding) {
								embeddings.set(externalEvents[i]?.event_id ?? "", embedding.values);
								embeddingsGenerated++;
							}
							validIndex++;
						}
					}
				}
			} catch (error) {
				warnings.push(
					`Embedding generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
		}

		// Step 3: Upsert events with embeddings
		const eventsWithEmbeddings: NodeWithEmbedding<ExternalEvent>[] = externalEvents.map(
			(event) => ({
				node: event,
				embedding: embeddings.get(event.event_id),
				embeddingModelVersion: DEFAULT_EMBEDDING_CONFIG.model,
			}),
		);

		let eventsIngested = 0;
		for (let i = 0; i < eventsWithEmbeddings.length; i += batchSize) {
			const batch = eventsWithEmbeddings.slice(i, i + batchSize);
			const result = await batchUpsertExternalEvents(this.client, batch);
			eventsIngested += result.successful.length;

			if (result.failed.length > 0) {
				errors.push(...result.failed.slice(0, 5).map((f) => f.error ?? "Unknown error"));
			}
		}

		// Step 4: Create edges
		const edges: EdgeInput[] = [];

		for (let i = 0; i < events.length; i++) {
			const event = events[i];
			if (!event) {
				continue;
			}

			const eventId = event.eventId;

			// Create RELATES_TO_MACRO edges for macro events
			if (createMacroEdges) {
				const macroFactors = identifyMacroFactors(event);
				for (const macroId of macroFactors) {
					const edge: RelatesToMacroEdge = {
						source_id: eventId,
						target_id: macroId,
					};
					edges.push({
						sourceId: edge.source_id,
						targetId: edge.target_id,
						edgeType: "RELATES_TO_MACRO",
						properties: {},
					});
				}
			}

			// Create company edges for news with tickers
			if (createCompanyEdges && event.relatedInstrumentIds.length > 0) {
				for (const symbol of event.relatedInstrumentIds) {
					edges.push({
						sourceId: eventId,
						targetId: symbol,
						edgeType: "EVENT_MENTIONS",
						properties: {
							sentiment: event.scores.sentimentScore,
						},
					});
				}
			}
		}

		// Batch create edges
		let edgesCreated = 0;
		if (edges.length > 0) {
			for (let i = 0; i < edges.length; i += batchSize) {
				const batch = edges.slice(i, i + batchSize);
				const result = await batchCreateEdges(this.client, batch);
				edgesCreated += result.successful.length;

				if (result.failed.length > 0) {
					warnings.push(
						`${result.failed.length} edges failed to create in batch ${Math.floor(i / batchSize) + 1}`,
					);
				}
			}
		}

		return {
			eventsIngested,
			edgesCreated,
			embeddingsGenerated,
			executionTimeMs: performance.now() - startTime,
			warnings,
			errors,
		};
	}

	/**
	 * Ingest a single event
	 */
	async ingestEvent(
		event: ExtractedEvent,
		options: EventIngestionOptions = {},
	): Promise<EventIngestionResult> {
		return this.ingestEvents([event], options);
	}

	/**
	 * Search for similar events by text
	 */
	async searchSimilarEvents(
		queryText: string,
		limit = 10,
	): Promise<Array<{ eventId: string; similarity: number; textSummary: string }>> {
		try {
			const result = await this.client.query<
				Array<{ event_id: string; similarity: number; text_summary: string }>
			>("SearchExternalEvents", { query: queryText, limit });

			return result.data.map((r) => ({
				eventId: r.event_id,
				similarity: r.similarity,
				textSummary: r.text_summary,
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Search for events by type
	 */
	async searchEventsByType(
		queryText: string,
		eventType: ExternalEventType,
		limit = 10,
	): Promise<Array<{ eventId: string; similarity: number; textSummary: string }>> {
		try {
			const result = await this.client.query<
				Array<{ event_id: string; similarity: number; text_summary: string }>
			>("SearchExternalEventsByType", { query: queryText, event_type: eventType, limit });

			return result.data.map((r) => ({
				eventId: r.event_id,
				similarity: r.similarity,
				textSummary: r.text_summary,
			}));
		} catch {
			return [];
		}
	}
}

// ============================================
// Factory Function
// ============================================

/**
 * Create an EventIngestionService instance
 */
export function createEventIngestionService(client: HelixClient): EventIngestionService {
	return new EventIngestionService(client);
}

// ============================================
// Exported Helper Functions (for testing)
// ============================================

/** @internal Exported for testing */
export const _internal = {
	mapEventType,
	buildTextSummary,
	toExternalEvent,
	identifyMacroFactors,
};
