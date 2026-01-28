/**
 * External Context Pipeline
 *
 * Orchestrates the multi-stage extraction pipeline:
 * Raw Feed → Parse → Extract → Score → Link → Store
 *
 * Uses dependency injection for the extraction client - pass an
 * IExtractionClient implementation (e.g., GeminiExtractionClient
 * from @cream/agents) via the config.
 */

import { EntityLinker, type EntityLinkerConfig } from "./linking/index.js";
import {
	parseEconomicCalendarEvents,
	parseNewsArticles,
	parseTranscript,
} from "./parsers/index.js";
import type { EconomicCalendarEvent } from "./parsers/macroParser.js";
import {
	computeImportanceScore,
	computeSentimentFromExtraction,
	computeSurpriseFromExtraction,
	type MetricExpectation,
} from "./scoring/index.js";
import type {
	ContentScores,
	ContentSourceType,
	ExtractedEvent,
	ExtractionResult,
	IExtractionClient,
	NewsArticle,
	ParsedTranscript,
	TranscriptInput,
} from "./types.js";

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
	/** Extraction client (required - uses dependency injection) */
	extractionClient: IExtractionClient;
	/** Entity linker config */
	linking?: EntityLinkerConfig;
	/** Target symbols for relevance scoring */
	targetSymbols?: string[];
	/** Metric expectations for surprise scoring */
	expectations?: MetricExpectation[];
	/** Enable dry run mode (skip LLM calls) */
	dryRun?: boolean;
}

/**
 * Pipeline processing result
 */
export interface PipelineResult {
	success: boolean;
	events: ExtractedEvent[];
	errors: Array<{ content: string; error: string }>;
	stats: {
		inputCount: number;
		successCount: number;
		errorCount: number;
		processingTimeMs: number;
	};
}

/**
 * External context extraction pipeline
 */
export class ExtractionPipeline {
	private extractionClient: IExtractionClient;
	private entityLinker: EntityLinker;
	private config: PipelineConfig;

	constructor(config: PipelineConfig) {
		this.config = config;
		this.extractionClient = config.extractionClient;
		this.entityLinker = new EntityLinker(config.linking);
	}

	/**
	 * Process news articles through the pipeline
	 */
	async processNews(articles: NewsArticle[]): Promise<PipelineResult> {
		const startTime = Date.now();
		const parsed = parseNewsArticles(articles);
		return this.processItems(
			parsed.map((p) => ({
				sourceType: "news" as const,
				content: `${p.headline}\n\n${p.body}`,
				eventTime: p.publishedAt,
				source: p.source,
				symbols: p.symbols,
			})),
			startTime,
		);
	}

	/**
	 * Process transcripts through the pipeline
	 */
	async processTranscripts(transcripts: TranscriptInput[]): Promise<PipelineResult> {
		const startTime = Date.now();
		const parsed = transcripts
			.map((t) => parseTranscript(t))
			.filter((t): t is ParsedTranscript => t !== null);

		return this.processItems(
			parsed.map((p) => ({
				sourceType: "transcript" as const,
				content: p.speakers.map((s) => `${s.speaker}: ${s.text}`).join("\n\n"),
				eventTime: p.date,
				source: "transcript",
				symbols: [p.symbol],
			})),
			startTime,
		);
	}

	/**
	 * Process macro releases through the pipeline
	 */
	async processMacroReleases(releases: EconomicCalendarEvent[]): Promise<PipelineResult> {
		const startTime = Date.now();
		const parsed = parseEconomicCalendarEvents(releases);

		return this.processItems(
			parsed.map((p) => ({
				sourceType: "macro" as const,
				content: `${p.indicator}: ${p.value}${p.unit ? ` ${p.unit}` : ""} (${p.date.toISOString()})`,
				eventTime: p.date,
				source: p.source,
				symbols: undefined,
			})),
			startTime,
		);
	}

	/**
	 * Process generic content through the pipeline
	 */
	async processContent(
		content: string,
		sourceType: ContentSourceType,
		eventTime: Date = new Date(),
		source = "unknown",
		symbols?: string[],
	): Promise<ExtractedEvent | null> {
		try {
			// Stage 1: Extract using LLM
			const extraction = this.config.dryRun
				? this.createDryRunExtraction(content)
				: await this.extractionClient.extract(content, sourceType);

			// Stage 2: Compute scores
			const scores = this.computeScores(extraction, sourceType, source, eventTime);

			// Stage 3: Link entities
			const links = await this.entityLinker.linkEntities(extraction.entities);
			const relatedInstrumentIds = [...EntityLinker.getTickers(links), ...(symbols ?? [])];

			// Stage 4: Create event
			return {
				eventId: crypto.randomUUID(),
				sourceType,
				eventType: extraction.eventType,
				eventTime,
				extraction,
				scores,
				relatedInstrumentIds: [...new Set(relatedInstrumentIds)],
				originalContent: content,
				processedAt: new Date(),
			};
		} catch (_error) {
			return null;
		}
	}

	/**
	 * Process multiple items
	 */
	private async processItems(
		items: Array<{
			sourceType: ContentSourceType;
			content: string;
			eventTime: Date;
			source: string;
			symbols?: string[];
		}>,
		startTime: number,
	): Promise<PipelineResult> {
		const events: ExtractedEvent[] = [];
		const errors: Array<{ content: string; error: string }> = [];

		for (const item of items) {
			try {
				const event = await this.processContent(
					item.content,
					item.sourceType,
					item.eventTime,
					item.source,
					item.symbols,
				);
				if (event) {
					events.push(event);
				} else {
					errors.push({ content: item.content.slice(0, 100), error: "Processing failed" });
				}
			} catch (err) {
				errors.push({
					content: item.content.slice(0, 100),
					error: err instanceof Error ? err.message : "Unknown error",
				});
			}
		}

		return {
			success: errors.length === 0,
			events,
			errors,
			stats: {
				inputCount: items.length,
				successCount: events.length,
				errorCount: errors.length,
				processingTimeMs: Date.now() - startTime,
			},
		};
	}

	/**
	 * Compute all scores for an extraction
	 */
	private computeScores(
		extraction: ExtractionResult,
		sourceType: ContentSourceType,
		source: string,
		eventTime: Date,
	): ContentScores {
		const sentimentScore = computeSentimentFromExtraction(extraction);
		const importanceScore = computeImportanceScore(
			extraction,
			sourceType,
			source,
			eventTime,
			this.config.targetSymbols ?? [],
		);
		const surpriseScore = computeSurpriseFromExtraction(extraction, this.config.expectations ?? []);

		return {
			sentimentScore,
			importanceScore,
			surpriseScore,
		};
	}

	/**
	 * Create a dry-run extraction (for testing without LLM)
	 */
	private createDryRunExtraction(content: string): ExtractionResult {
		return {
			sentiment: "neutral",
			confidence: 0.5,
			entities: [],
			dataPoints: [],
			eventType: "other",
			importance: 3,
			summary: content.slice(0, 200),
			keyInsights: [],
		};
	}

	/**
	 * Test pipeline connection
	 */
	async testConnection(): Promise<boolean> {
		return this.extractionClient.testConnection();
	}

	/**
	 * Get extraction client for direct use
	 */
	getExtractionClient(): IExtractionClient {
		return this.extractionClient;
	}

	/**
	 * Get entity linker for direct use
	 */
	getEntityLinker(): EntityLinker {
		return this.entityLinker;
	}
}

/**
 * Create extraction pipeline with required extraction client
 */
export function createExtractionPipeline(config: PipelineConfig): ExtractionPipeline {
	return new ExtractionPipeline(config);
}
