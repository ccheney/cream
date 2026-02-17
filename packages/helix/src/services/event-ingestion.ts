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

interface ResolvedEventIngestionOptions {
	generateEmbeddings: boolean;
	createMacroEdges: boolean;
	createCompanyEdges: boolean;
	batchSize: number;
}

interface EmbeddingGenerationResult {
	embeddings: Map<string, number[]>;
	embeddingsGenerated: number;
}

const METRIC_MATCHERS: Array<{ macroId: string; keywords: string[] }> = [
	{ macroId: "gdp", keywords: ["gdp", "growth"] },
	{ macroId: "cpi", keywords: ["cpi", "inflation"] },
	{ macroId: "unemployment", keywords: ["unemployment", "jobs", "nonfarm"] },
	{ macroId: "pmi_manufacturing", keywords: ["pmi", "manufacturing"] },
	{ macroId: "fed_funds_rate", keywords: ["rate", "fed"] },
];

const SUMMARY_MATCHERS: Array<{ macroId: string; keywords: string[] }> = [
	{ macroId: "fed_funds_rate", keywords: ["fed", "fomc", "interest rate"] },
	{ macroId: "oil_wti", keywords: ["oil", "crude", "opec"] },
	{ macroId: "treasury_10y", keywords: ["treasury", "yield", "bond"] },
];

const VALID_MACRO_ENTITY_IDS = new Set(PREDEFINED_MACRO_ENTITIES.map((entity) => entity.entity_id));

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

	parts.push(
		`Sentiment: ${event.extraction.sentiment} (confidence: ${event.extraction.confidence.toFixed(2)})`,
	);

	if (event.extraction.dataPoints.length > 0) {
		const dataPointStr = event.extraction.dataPoints
			.slice(0, 3)
			.map((dataPoint) => `${dataPoint.metric}: ${dataPoint.value} ${dataPoint.unit}`)
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

function addMacroFactorsFromMetrics(event: ExtractedEvent, factors: Set<string>): void {
	for (const dataPoint of event.extraction.dataPoints) {
		const metric = dataPoint.metric.toLowerCase();
		for (const matcher of METRIC_MATCHERS) {
			if (matcher.keywords.some((keyword) => metric.includes(keyword))) {
				factors.add(matcher.macroId);
			}
		}
	}
}

function addMacroFactorsFromSummary(event: ExtractedEvent, factors: Set<string>): void {
	const summary = event.extraction.summary.toLowerCase();
	for (const matcher of SUMMARY_MATCHERS) {
		if (matcher.keywords.some((keyword) => summary.includes(keyword))) {
			factors.add(matcher.macroId);
		}
	}
}

/**
 * Identify macro factors related to an event
 * Returns macro entity IDs that should be linked
 */
function identifyMacroFactors(event: ExtractedEvent): string[] {
	if (event.eventType !== "macro_release") {
		return [];
	}

	const factors = new Set<string>();
	addMacroFactorsFromMetrics(event, factors);
	addMacroFactorsFromSummary(event, factors);

	return [...factors].filter((macroId) => VALID_MACRO_ENTITY_IDS.has(macroId));
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

	private resolveOptions(options: EventIngestionOptions): ResolvedEventIngestionOptions {
		return {
			generateEmbeddings: options.generateEmbeddings ?? true,
			createMacroEdges: options.createMacroEdges ?? true,
			createCompanyEdges: options.createCompanyEdges ?? true,
			batchSize: options.batchSize ?? 50,
		};
	}

	private createEmptyResult(): EventIngestionResult {
		return {
			eventsIngested: 0,
			edgesCreated: 0,
			embeddingsGenerated: 0,
			executionTimeMs: 0,
			warnings: [],
			errors: [],
		};
	}

	private async generateEmbeddingsForEvents(
		externalEvents: ExternalEvent[],
		generateEmbeddings: boolean,
		warnings: string[],
	): Promise<EmbeddingGenerationResult> {
		const embeddings = new Map<string, number[]>();
		let embeddingsGenerated = 0;

		if (!generateEmbeddings) {
			return { embeddings, embeddingsGenerated };
		}

		try {
			const embeddingClient = this.getEmbeddingClient();
			const textsToEmbed = externalEvents.map((event) => event.text_summary ?? "");
			const validTexts = textsToEmbed.filter((text) => text.length > 0);

			if (validTexts.length === 0) {
				return { embeddings, embeddingsGenerated };
			}

			const result = await embeddingClient.batchGenerateEmbeddings(validTexts);
			let validIndex = 0;
			for (let i = 0; i < textsToEmbed.length; i++) {
				if (!textsToEmbed[i]) {
					continue;
				}
				const embedding = result.embeddings[validIndex];
				if (embedding) {
					embeddings.set(externalEvents[i]?.event_id ?? "", embedding.values);
					embeddingsGenerated++;
				}
				validIndex++;
			}
		} catch (error) {
			warnings.push(
				`Embedding generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}

		return { embeddings, embeddingsGenerated };
	}

	private async upsertEvents(
		eventsWithEmbeddings: NodeWithEmbedding<ExternalEvent>[],
		batchSize: number,
		errors: string[],
	): Promise<number> {
		let eventsIngested = 0;

		for (let i = 0; i < eventsWithEmbeddings.length; i += batchSize) {
			const batch = eventsWithEmbeddings.slice(i, i + batchSize);
			const result = await batchUpsertExternalEvents(this.client, batch);
			eventsIngested += result.successful.length;

			if (result.failed.length > 0) {
				errors.push(
					...result.failed.slice(0, 5).map((failure) => failure.error ?? "Unknown error"),
				);
			}
		}

		return eventsIngested;
	}

	private buildEventEdges(
		events: ExtractedEvent[],
		createMacroEdges: boolean,
		createCompanyEdges: boolean,
	): EdgeInput[] {
		const edges: EdgeInput[] = [];

		for (const event of events) {
			if (createMacroEdges) {
				for (const macroId of identifyMacroFactors(event)) {
					const edge: RelatesToMacroEdge = {
						source_id: event.eventId,
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

			if (!createCompanyEdges || event.relatedInstrumentIds.length === 0) {
				continue;
			}
			for (const symbol of event.relatedInstrumentIds) {
				edges.push({
					sourceId: event.eventId,
					targetId: symbol,
					edgeType: "EVENT_MENTIONS",
					properties: {
						sentiment: event.scores.sentimentScore,
					},
				});
			}
		}

		return edges;
	}

	private async createEdgesInBatches(
		edges: EdgeInput[],
		batchSize: number,
		warnings: string[],
	): Promise<number> {
		let edgesCreated = 0;

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

		return edgesCreated;
	}

	/**
	 * Ingest a batch of extracted events
	 */
	async ingestEvents(
		events: ExtractedEvent[],
		options: EventIngestionOptions = {},
	): Promise<EventIngestionResult> {
		if (events.length === 0) {
			return this.createEmptyResult();
		}

		const startTime = performance.now();
		const warnings: string[] = [];
		const errors: string[] = [];
		const resolvedOptions = this.resolveOptions(options);
		const externalEvents = events.map(toExternalEvent);
		const { embeddings, embeddingsGenerated } = await this.generateEmbeddingsForEvents(
			externalEvents,
			resolvedOptions.generateEmbeddings,
			warnings,
		);
		const eventsWithEmbeddings: NodeWithEmbedding<ExternalEvent>[] = externalEvents.map(
			(event) => ({
				node: event,
				embedding: embeddings.get(event.event_id),
				embeddingModelVersion: DEFAULT_EMBEDDING_CONFIG.model,
			}),
		);
		const eventsIngested = await this.upsertEvents(
			eventsWithEmbeddings,
			resolvedOptions.batchSize,
			errors,
		);
		const edges = this.buildEventEdges(
			events,
			resolvedOptions.createMacroEdges,
			resolvedOptions.createCompanyEdges,
		);
		const edgesCreated = await this.createEdgesInBatches(
			edges,
			resolvedOptions.batchSize,
			warnings,
		);

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

			return result.data.map((row) => ({
				eventId: row.event_id,
				similarity: row.similarity,
				textSummary: row.text_summary,
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

			return result.data.map((row) => ({
				eventId: row.event_id,
				similarity: row.similarity,
				textSummary: row.text_summary,
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
