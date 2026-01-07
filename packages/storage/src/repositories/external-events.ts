/**
 * External Events Repository
 *
 * Data access for external_events table storing extracted context
 * from news, transcripts, and macro releases.
 *
 * @see packages/external-context for the extraction pipeline
 */

import type { Row, TursoClient } from "../turso.js";
import {
  type PaginatedResult,
  type PaginationOptions,
  paginate,
  parseJson,
  query,
  RepositoryError,
  toJson,
} from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Content source type
 */
export type ContentSourceType = "news" | "press_release" | "transcript" | "macro";

/**
 * Event type classification
 */
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

/**
 * Sentiment classification
 */
export type Sentiment = "bullish" | "bearish" | "neutral";

/**
 * Extracted entity
 */
export interface ExtractedEntity {
  name: string;
  type: "company" | "person" | "product" | "event" | "location";
  ticker?: string;
}

/**
 * Extracted data point
 */
export interface DataPoint {
  metric: string;
  value: number;
  unit: string;
  period?: string;
}

/**
 * External event entity
 */
export interface ExternalEvent {
  id: string;
  sourceType: ContentSourceType;
  eventType: EventType;
  eventTime: string;
  processedAt: string;

  // Extraction results
  sentiment: Sentiment;
  confidence: number;
  importance: number;
  summary: string;
  keyInsights: string[];
  entities: ExtractedEntity[];
  dataPoints: DataPoint[];

  // Computed scores
  sentimentScore: number;
  importanceScore: number;
  surpriseScore: number;

  // Related instruments
  relatedInstruments: string[];

  // Original content
  originalContent: string;

  // Metadata
  createdAt: string;
}

/**
 * Create external event input
 */
export interface CreateExternalEventInput {
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
}

/**
 * External event filter options
 */
export interface ExternalEventFilters {
  sourceType?: ContentSourceType | ContentSourceType[];
  eventType?: EventType | EventType[];
  sentiment?: Sentiment | Sentiment[];
  symbol?: string;
  fromDate?: string;
  toDate?: string;
  minImportance?: number;
}

// ============================================
// Row Mapper
// ============================================

function mapExternalEventRow(row: Row): ExternalEvent {
  return {
    id: row.id as string,
    sourceType: row.source_type as ContentSourceType,
    eventType: row.event_type as EventType,
    eventTime: row.event_time as string,
    processedAt: row.processed_at as string,

    sentiment: row.sentiment as Sentiment,
    confidence: row.confidence as number,
    importance: row.importance as number,
    summary: row.summary as string,
    keyInsights: parseJson<string[]>(row.key_insights, []),
    entities: parseJson<ExtractedEntity[]>(row.entities, []),
    dataPoints: parseJson<DataPoint[]>(row.data_points, []),

    sentimentScore: row.sentiment_score as number,
    importanceScore: row.importance_score as number,
    surpriseScore: row.surprise_score as number,

    relatedInstruments: parseJson<string[]>(row.related_instruments, []),
    originalContent: row.original_content as string,
    createdAt: row.created_at as string,
  };
}

// ============================================
// Repository
// ============================================

/**
 * External events repository
 */
export class ExternalEventsRepository {
  private readonly table = "external_events";

  constructor(private readonly client: TursoClient) {}

  /**
   * Create a new external event
   */
  async create(input: CreateExternalEventInput): Promise<ExternalEvent> {
    try {
      await this.client.run(
        `INSERT INTO ${this.table} (
          id, source_type, event_type, event_time, processed_at,
          sentiment, confidence, importance, summary, key_insights, entities, data_points,
          sentiment_score, importance_score, surprise_score,
          related_instruments, original_content
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.sourceType,
          input.eventType,
          input.eventTime,
          input.processedAt,
          input.sentiment,
          input.confidence,
          input.importance,
          input.summary,
          toJson(input.keyInsights),
          toJson(input.entities),
          toJson(input.dataPoints),
          input.sentimentScore,
          input.importanceScore,
          input.surpriseScore,
          toJson(input.relatedInstruments),
          input.originalContent,
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError(this.table, error as Error);
    }

    return this.findById(input.id) as Promise<ExternalEvent>;
  }

  /**
   * Create multiple external events (batch insert)
   */
  async createMany(inputs: CreateExternalEventInput[]): Promise<number> {
    if (inputs.length === 0) {
      return 0;
    }

    let created = 0;
    for (const input of inputs) {
      try {
        await this.create(input);
        created++;
      } catch (error) {
        // Skip duplicates, log others
        if (!(error instanceof RepositoryError && error.code === "DUPLICATE_KEY")) {
          throw error;
        }
      }
    }

    return created;
  }

  /**
   * Find event by ID
   */
  async findById(id: string): Promise<ExternalEvent | null> {
    const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);

    return row ? mapExternalEventRow(row) : null;
  }

  /**
   * Find event by ID, throw if not found
   */
  async findByIdOrThrow(id: string): Promise<ExternalEvent> {
    const event = await this.findById(id);
    if (!event) {
      throw RepositoryError.notFound(this.table, id);
    }
    return event;
  }

  /**
   * Find events with filters
   */
  async findMany(
    filters: ExternalEventFilters = {},
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<ExternalEvent>> {
    const builder = query().orderBy("event_time", "DESC");

    if (filters.sourceType) {
      if (Array.isArray(filters.sourceType)) {
        builder.where("source_type", "IN", filters.sourceType);
      } else {
        builder.eq("source_type", filters.sourceType);
      }
    }
    if (filters.eventType) {
      if (Array.isArray(filters.eventType)) {
        builder.where("event_type", "IN", filters.eventType);
      } else {
        builder.eq("event_type", filters.eventType);
      }
    }
    if (filters.sentiment) {
      if (Array.isArray(filters.sentiment)) {
        builder.where("sentiment", "IN", filters.sentiment);
      } else {
        builder.eq("sentiment", filters.sentiment);
      }
    }
    if (filters.fromDate) {
      builder.where("event_time", ">=", filters.fromDate);
    }
    if (filters.toDate) {
      builder.where("event_time", "<=", filters.toDate);
    }
    if (filters.minImportance !== undefined) {
      builder.where("importance_score", ">=", filters.minImportance);
    }

    const { sql, args } = builder.build(`SELECT * FROM ${this.table}`);
    const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as count").split(" LIMIT ")[0]!;

    const result = await paginate<Row>(
      this.client,
      sql.split(" LIMIT ")[0]!,
      countSql,
      args.slice(0, -2),
      pagination
    );

    // Filter by symbol if provided (requires JSON parsing)
    let filteredData = result.data.map(mapExternalEventRow);
    if (filters.symbol) {
      filteredData = filteredData.filter((event) =>
        event.relatedInstruments.includes(filters.symbol!)
      );
    }

    return {
      ...result,
      data: filteredData,
    };
  }

  /**
   * Find recent events (last N hours)
   */
  async findRecent(hours = 24, limit = 100): Promise<ExternalEvent[]> {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table}
       WHERE event_time >= ?
       ORDER BY importance_score DESC, event_time DESC
       LIMIT ?`,
      [cutoff, limit]
    );

    return rows.map(mapExternalEventRow);
  }

  /**
   * Find events by symbol
   */
  async findBySymbol(symbol: string, limit = 50): Promise<ExternalEvent[]> {
    // SQLite JSON functions for searching in JSON array
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table}
       WHERE related_instruments LIKE ?
       ORDER BY event_time DESC
       LIMIT ?`,
      [`%"${symbol}"%`, limit]
    );

    return rows.map(mapExternalEventRow);
  }

  /**
   * Find events by multiple symbols
   */
  async findBySymbols(symbols: string[], limit = 100): Promise<ExternalEvent[]> {
    if (symbols.length === 0) {
      return [];
    }

    // Build OR conditions for each symbol
    const conditions = symbols.map(() => "related_instruments LIKE ?").join(" OR ");
    const args = symbols.map((s) => `%"${s}"%`);

    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table}
       WHERE ${conditions}
       ORDER BY importance_score DESC, event_time DESC
       LIMIT ?`,
      [...args, limit]
    );

    return rows.map(mapExternalEventRow);
  }

  /**
   * Find macro events only
   */
  async findMacroEvents(limit = 50): Promise<ExternalEvent[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table}
       WHERE source_type = 'macro'
       ORDER BY event_time DESC
       LIMIT ?`,
      [limit]
    );

    return rows.map(mapExternalEventRow);
  }

  /**
   * Get aggregate sentiment for a symbol
   */
  async getSymbolSentiment(
    symbol: string,
    hours = 24
  ): Promise<{ avgSentiment: number; count: number }> {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const row = await this.client.get<{ avg_sentiment: number; count: number }>(
      `SELECT AVG(sentiment_score) as avg_sentiment, COUNT(*) as count
       FROM ${this.table}
       WHERE related_instruments LIKE ? AND event_time >= ?`,
      [`%"${symbol}"%`, cutoff]
    );

    return {
      avgSentiment: row?.avg_sentiment ?? 0,
      count: row?.count ?? 0,
    };
  }

  /**
   * Delete old events
   */
  async deleteOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const result = await this.client.run(`DELETE FROM ${this.table} WHERE event_time < ?`, [
      cutoff,
    ]);

    return result.changes;
  }

  /**
   * Count events by source type
   */
  async countBySourceType(): Promise<Record<ContentSourceType, number>> {
    const rows = await this.client.execute<{ source_type: string; count: number }>(
      `SELECT source_type, COUNT(*) as count FROM ${this.table} GROUP BY source_type`
    );

    const result: Record<string, number> = {
      news: 0,
      press_release: 0,
      transcript: 0,
      macro: 0,
    };

    for (const row of rows) {
      result[row.source_type] = row.count;
    }

    return result as Record<ContentSourceType, number>;
  }
}
