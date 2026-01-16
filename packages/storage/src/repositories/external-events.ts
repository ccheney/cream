/**
 * External Events Repository (Drizzle ORM)
 *
 * Data access for external_events table storing extracted context
 * from news, transcripts, and macro releases.
 *
 * @see packages/external-context for the extraction pipeline
 */
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb, type Database } from "../db";
import { externalEvents } from "../schema/external";

// ============================================
// Types
// ============================================

export type ContentSourceType = "news" | "press_release" | "transcript" | "macro";

export type EventType =
	| "earnings"
	| "guidance"
	| "merger_acquisition"
	| "product_launch"
	| "regulatory"
	| "macro_release"
	| "analyst_rating"
	| "insider_trade"
	| "dividend"
	| "stock_split"
	| "layoffs"
	| "executive_change"
	| "legal"
	| "other";

export type Sentiment = "bullish" | "bearish" | "neutral";

export interface ExtractedEntity {
	name: string;
	type: "company" | "person" | "product" | "event" | "location";
	ticker?: string;
}

export interface DataPoint {
	metric: string;
	value: number;
	unit: string;
	period?: string;
}

export interface ExternalEvent {
	id: string;
	sourceType: ContentSourceType;
	eventType: EventType;
	eventTime: string;
	processedAt: string;

	sentiment: Sentiment;
	confidence: number;
	importance: number;
	summary: string;
	keyInsights: string[];
	entities: ExtractedEntity[];
	dataPoints: DataPoint[];

	sentimentScore: number;
	importanceScore: number;
	surpriseScore: number;

	relatedInstruments: string[];
	originalContent: string;
	createdAt: string;
}

export interface CreateExternalEventInput {
	sourceType: ContentSourceType;
	eventType: EventType;
	eventTime: string;
	processedAt: string;

	sentiment: Sentiment;
	confidence: number;
	importance: number;
	summary: string;
	keyInsights: string[];
	entities: ExtractedEntity[];
	dataPoints: DataPoint[];

	sentimentScore: number;
	importanceScore: number;
	surpriseScore: number;

	relatedInstruments: string[];
	originalContent: string;
}

export interface ExternalEventFilters {
	sourceType?: ContentSourceType | ContentSourceType[];
	eventType?: EventType | EventType[];
	sentiment?: Sentiment | Sentiment[];
	symbol?: string;
	fromDate?: string;
	toDate?: string;
	minImportance?: number;
}

export interface PaginationOptions {
	page?: number;
	pageSize?: number;
}

export interface PaginatedResult<T> {
	data: T[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

// ============================================
// Row Mapping
// ============================================

type ExternalEventRow = typeof externalEvents.$inferSelect;

function mapExternalEventRow(row: ExternalEventRow): ExternalEvent {
	return {
		id: row.id,
		sourceType: row.sourceType as ContentSourceType,
		eventType: row.eventType as EventType,
		eventTime: row.eventTime.toISOString(),
		processedAt: row.processedAt.toISOString(),

		sentiment: row.sentiment as Sentiment,
		confidence: Number(row.confidence),
		importance: row.importance,
		summary: row.summary,
		keyInsights: row.keyInsights as string[],
		entities: row.entities as ExtractedEntity[],
		dataPoints: row.dataPoints as DataPoint[],

		sentimentScore: Number(row.sentimentScore),
		importanceScore: Number(row.importanceScore),
		surpriseScore: Number(row.surpriseScore),

		relatedInstruments: row.relatedInstruments as string[],
		originalContent: row.originalContent,
		createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class ExternalEventsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateExternalEventInput): Promise<ExternalEvent> {
		const [row] = await this.db
			.insert(externalEvents)
			.values({
				sourceType: input.sourceType as typeof externalEvents.$inferInsert.sourceType,
				eventType: input.eventType,
				eventTime: new Date(input.eventTime),
				processedAt: new Date(input.processedAt),
				sentiment: input.sentiment as typeof externalEvents.$inferInsert.sentiment,
				confidence: String(input.confidence),
				importance: input.importance,
				summary: input.summary,
				keyInsights: input.keyInsights,
				entities: input.entities as string[],
				dataPoints: input.dataPoints as Record<string, unknown>[],
				sentimentScore: String(input.sentimentScore),
				importanceScore: String(input.importanceScore),
				surpriseScore: String(input.surpriseScore),
				relatedInstruments: input.relatedInstruments,
				originalContent: input.originalContent,
			})
			.returning();

		return mapExternalEventRow(row);
	}

	async createMany(inputs: CreateExternalEventInput[]): Promise<number> {
		if (inputs.length === 0) {
			return 0;
		}

		let created = 0;
		for (const input of inputs) {
			try {
				await this.create(input);
				created++;
			} catch {
				// Skip duplicates
			}
		}

		return created;
	}

	async findById(id: string): Promise<ExternalEvent | null> {
		const [row] = await this.db
			.select()
			.from(externalEvents)
			.where(eq(externalEvents.id, id))
			.limit(1);

		return row ? mapExternalEventRow(row) : null;
	}

	async findMany(
		filters: ExternalEventFilters = {},
		pagination?: PaginationOptions
	): Promise<PaginatedResult<ExternalEvent>> {
		const conditions = [];

		if (filters.sourceType) {
			if (Array.isArray(filters.sourceType)) {
				conditions.push(inArray(externalEvents.sourceType, filters.sourceType as typeof externalEvents.$inferSelect.sourceType[]));
			} else {
				conditions.push(eq(externalEvents.sourceType, filters.sourceType as typeof externalEvents.$inferSelect.sourceType));
			}
		}
		if (filters.eventType) {
			if (Array.isArray(filters.eventType)) {
				conditions.push(inArray(externalEvents.eventType, filters.eventType));
			} else {
				conditions.push(eq(externalEvents.eventType, filters.eventType));
			}
		}
		if (filters.sentiment) {
			if (Array.isArray(filters.sentiment)) {
				conditions.push(inArray(externalEvents.sentiment, filters.sentiment as typeof externalEvents.$inferSelect.sentiment[]));
			} else {
				conditions.push(eq(externalEvents.sentiment, filters.sentiment as typeof externalEvents.$inferSelect.sentiment));
			}
		}
		if (filters.fromDate) {
			conditions.push(gte(externalEvents.eventTime, new Date(filters.fromDate)));
		}
		if (filters.toDate) {
			conditions.push(lte(externalEvents.eventTime, new Date(filters.toDate)));
		}
		if (filters.minImportance !== undefined) {
			conditions.push(gte(externalEvents.importanceScore, String(filters.minImportance)));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const page = pagination?.page ?? 1;
		const pageSize = pagination?.pageSize ?? 50;
		const offset = (page - 1) * pageSize;

		const [countResult] = await this.db
			.select({ count: count() })
			.from(externalEvents)
			.where(whereClause);

		const rows = await this.db
			.select()
			.from(externalEvents)
			.where(whereClause)
			.orderBy(desc(externalEvents.eventTime))
			.limit(pageSize)
			.offset(offset);

		let data = rows.map(mapExternalEventRow);

		// Symbol filtering done in-memory
		if (filters.symbol) {
			data = data.filter((event) =>
				event.relatedInstruments.includes(filters.symbol!)
			);
		}

		const total = countResult?.count ?? 0;

		return {
			data,
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		};
	}

	async findRecent(hours = 24, limit = 100): Promise<ExternalEvent[]> {
		const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

		const rows = await this.db
			.select()
			.from(externalEvents)
			.where(gte(externalEvents.eventTime, cutoff))
			.orderBy(desc(externalEvents.importanceScore), desc(externalEvents.eventTime))
			.limit(limit);

		return rows.map(mapExternalEventRow);
	}

	async findBySymbol(symbol: string, limit = 50): Promise<ExternalEvent[]> {
		const rows = await this.db.execute(sql`
			SELECT * FROM ${externalEvents}
			WHERE ${symbol} = ANY(related_instruments)
			ORDER BY event_time DESC
			LIMIT ${limit}
		`);

		return (rows.rows as ExternalEventRow[]).map(mapExternalEventRow);
	}

	async findBySymbols(symbols: string[], limit = 100): Promise<ExternalEvent[]> {
		if (symbols.length === 0) {
			return [];
		}

		const rows = await this.db.execute(sql`
			SELECT * FROM ${externalEvents}
			WHERE related_instruments && ${symbols}
			ORDER BY importance_score DESC, event_time DESC
			LIMIT ${limit}
		`);

		return (rows.rows as ExternalEventRow[]).map(mapExternalEventRow);
	}

	async findMacroEvents(limit = 50): Promise<ExternalEvent[]> {
		const rows = await this.db
			.select()
			.from(externalEvents)
			.where(eq(externalEvents.sourceType, "macro"))
			.orderBy(desc(externalEvents.eventTime))
			.limit(limit);

		return rows.map(mapExternalEventRow);
	}

	async getSymbolSentiment(
		symbol: string,
		hours = 24
	): Promise<{ avgSentiment: number; count: number }> {
		const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

		const result = await this.db.execute(sql`
			SELECT AVG(sentiment_score::numeric) as avg_sentiment, COUNT(*)::int as count
			FROM ${externalEvents}
			WHERE ${symbol} = ANY(related_instruments) AND event_time >= ${cutoff}
		`);

		const row = result.rows[0] as { avg_sentiment: string | null; count: number } | undefined;

		return {
			avgSentiment: row?.avg_sentiment ? Number(row.avg_sentiment) : 0,
			count: row?.count ?? 0,
		};
	}

	async deleteOlderThan(days: number): Promise<number> {
		const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

		const result = await this.db
			.delete(externalEvents)
			.where(lte(externalEvents.eventTime, cutoff))
			.returning({ id: externalEvents.id });

		return result.length;
	}

	async countBySourceType(): Promise<Record<ContentSourceType, number>> {
		const rows = await this.db
			.select({
				sourceType: externalEvents.sourceType,
				count: sql<number>`COUNT(*)::int`,
			})
			.from(externalEvents)
			.groupBy(externalEvents.sourceType);

		const result: Record<ContentSourceType, number> = {
			news: 0,
			press_release: 0,
			transcript: 0,
			macro: 0,
		};

		for (const row of rows) {
			result[row.sourceType as ContentSourceType] = row.count;
		}

		return result;
	}
}
