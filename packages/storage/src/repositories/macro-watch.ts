/**
 * Macro Watch Repository
 *
 * Data access for overnight macro watch entries and morning newspapers.
 * Used by the MacroWatch workflow for accumulating overnight developments
 * and compiling morning digests.
 *
 * @see docs/plans/42-overnight-macro-watch.md
 */

import type { Row, TursoClient } from "../turso.js";
import { parseJson, RepositoryError, toJson } from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Trading session when entry was captured
 */
export type MacroWatchSession = "OVERNIGHT" | "PRE_MARKET" | "AFTER_HOURS";

/**
 * Category of macro watch entry
 */
export type MacroWatchCategory = "NEWS" | "PREDICTION" | "ECONOMIC" | "MOVER" | "EARNINGS";

/**
 * Macro watch entry entity
 */
export interface MacroWatchEntry {
	id: string;
	timestamp: string;
	session: MacroWatchSession;
	category: MacroWatchCategory;
	headline: string;
	symbols: string[];
	source: string;
	metadata: Record<string, unknown> | null;
	createdAt: string;
}

/**
 * Create macro watch entry input
 */
export interface CreateMacroWatchEntryInput {
	id: string;
	timestamp: string;
	session: MacroWatchSession;
	category: MacroWatchCategory;
	headline: string;
	symbols: string[];
	source: string;
	metadata?: Record<string, unknown>;
}

/**
 * Morning newspaper sections
 */
export interface NewspaperSections {
	macro: string[];
	universe: string[];
	predictionMarkets: string[];
	economicCalendar: string[];
}

/**
 * Morning newspaper entity
 */
export interface MorningNewspaper {
	id: string;
	date: string;
	compiledAt: string;
	sections: NewspaperSections;
	rawEntryIds: string[];
	createdAt: string;
}

/**
 * Create morning newspaper input
 */
export interface CreateMorningNewspaperInput {
	id: string;
	date: string;
	compiledAt: string;
	sections: NewspaperSections;
	rawEntryIds: string[];
}

/**
 * Filter options for macro watch entries
 */
export interface MacroWatchFilters {
	session?: MacroWatchSession;
	category?: MacroWatchCategory;
	fromTime?: string;
	toTime?: string;
	symbols?: string[];
}

// ============================================
// Row Mappers
// ============================================

function mapEntryRow(row: Row): MacroWatchEntry {
	return {
		id: row.id as string,
		timestamp: row.timestamp as string,
		session: row.session as MacroWatchSession,
		category: row.category as MacroWatchCategory,
		headline: row.headline as string,
		symbols: parseJson<string[]>(row.symbols, []),
		source: row.source as string,
		metadata: parseJson<Record<string, unknown> | null>(row.metadata, null),
		createdAt: row.created_at as string,
	};
}

function mapNewspaperRow(row: Row): MorningNewspaper {
	return {
		id: row.id as string,
		date: row.date as string,
		compiledAt: row.compiled_at as string,
		sections: parseJson<NewspaperSections>(row.sections, {
			macro: [],
			universe: [],
			predictionMarkets: [],
			economicCalendar: [],
		}),
		rawEntryIds: parseJson<string[]>(row.raw_entry_ids, []),
		createdAt: row.created_at as string,
	};
}

// ============================================
// Repository
// ============================================

/**
 * Macro watch repository for overnight entries and newspapers
 */
export class MacroWatchRepository {
	constructor(private readonly client: TursoClient) {}

	// ============================================
	// Entry Operations
	// ============================================

	/**
	 * Save a macro watch entry
	 */
	async saveEntry(input: CreateMacroWatchEntryInput): Promise<MacroWatchEntry> {
		try {
			await this.client.run(
				`INSERT INTO macro_watch_entries (
          id, timestamp, session, category, headline, symbols, source, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					input.id,
					input.timestamp,
					input.session,
					input.category,
					input.headline,
					toJson(input.symbols),
					input.source,
					input.metadata ? toJson(input.metadata) : null,
				]
			);
		} catch (error) {
			throw RepositoryError.fromSqliteError("macro_watch_entries", error as Error);
		}

		return this.findEntryById(input.id) as Promise<MacroWatchEntry>;
	}

	/**
	 * Save multiple entries in a batch
	 */
	async saveEntries(inputs: CreateMacroWatchEntryInput[]): Promise<number> {
		if (inputs.length === 0) {
			return 0;
		}

		let saved = 0;
		for (const input of inputs) {
			try {
				await this.saveEntry(input);
				saved++;
			} catch {
				// Continue with next entry on error
			}
		}
		return saved;
	}

	/**
	 * Find entry by ID
	 */
	async findEntryById(id: string): Promise<MacroWatchEntry | null> {
		const row = await this.client.get<Row>("SELECT * FROM macro_watch_entries WHERE id = ?", [id]);
		return row ? mapEntryRow(row) : null;
	}

	/**
	 * Get entries for a time range
	 */
	async getEntries(startTime: string, endTime: string): Promise<MacroWatchEntry[]> {
		const rows = await this.client.execute<Row>(
			`SELECT * FROM macro_watch_entries
       WHERE timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp DESC`,
			[startTime, endTime]
		);
		return rows.map(mapEntryRow);
	}

	/**
	 * Find entries with filters
	 */
	async findEntries(filters: MacroWatchFilters = {}, limit = 100): Promise<MacroWatchEntry[]> {
		const conditions: string[] = [];
		const args: unknown[] = [];

		if (filters.session) {
			conditions.push("session = ?");
			args.push(filters.session);
		}
		if (filters.category) {
			conditions.push("category = ?");
			args.push(filters.category);
		}
		if (filters.fromTime) {
			conditions.push("timestamp >= ?");
			args.push(filters.fromTime);
		}
		if (filters.toTime) {
			conditions.push("timestamp <= ?");
			args.push(filters.toTime);
		}

		const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

		const rows = await this.client.execute<Row>(
			`SELECT * FROM macro_watch_entries ${whereClause}
       ORDER BY timestamp DESC
       LIMIT ?`,
			[...args, limit]
		);

		let results = rows.map(mapEntryRow);

		// Filter by symbols if specified (post-query filter due to JSON array)
		if (filters.symbols && filters.symbols.length > 0) {
			const symbolSet = new Set(filters.symbols.map((s) => s.toUpperCase()));
			results = results.filter((entry) =>
				entry.symbols.some((s) => symbolSet.has(s.toUpperCase()))
			);
		}

		return results;
	}

	/**
	 * Get entries since previous market close for newspaper compilation
	 */
	async getEntriesSinceClose(previousCloseTime: string): Promise<MacroWatchEntry[]> {
		const rows = await this.client.execute<Row>(
			`SELECT * FROM macro_watch_entries
       WHERE timestamp >= ?
       ORDER BY timestamp ASC`,
			[previousCloseTime]
		);
		return rows.map(mapEntryRow);
	}

	/**
	 * Count entries by category since a timestamp
	 */
	async countByCategory(sinceTime: string): Promise<Record<MacroWatchCategory, number>> {
		const rows = await this.client.execute<{ category: string; count: number }>(
			`SELECT category, COUNT(*) as count FROM macro_watch_entries
       WHERE timestamp >= ?
       GROUP BY category`,
			[sinceTime]
		);

		const result: Record<MacroWatchCategory, number> = {
			NEWS: 0,
			PREDICTION: 0,
			ECONOMIC: 0,
			MOVER: 0,
			EARNINGS: 0,
		};

		for (const row of rows) {
			result[row.category as MacroWatchCategory] = row.count;
		}

		return result;
	}

	// ============================================
	// Newspaper Operations
	// ============================================

	/**
	 * Save a morning newspaper
	 */
	async saveNewspaper(input: CreateMorningNewspaperInput): Promise<MorningNewspaper> {
		try {
			await this.client.run(
				`INSERT INTO morning_newspapers (
          id, date, compiled_at, sections, raw_entry_ids
        ) VALUES (?, ?, ?, ?, ?)`,
				[input.id, input.date, input.compiledAt, toJson(input.sections), toJson(input.rawEntryIds)]
			);
		} catch (error) {
			throw RepositoryError.fromSqliteError("morning_newspapers", error as Error);
		}

		return this.findNewspaperById(input.id) as Promise<MorningNewspaper>;
	}

	/**
	 * Upsert a morning newspaper (update if exists for date)
	 */
	async upsertNewspaper(input: CreateMorningNewspaperInput): Promise<MorningNewspaper> {
		try {
			await this.client.run(
				`INSERT INTO morning_newspapers (
          id, date, compiled_at, sections, raw_entry_ids
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          compiled_at = excluded.compiled_at,
          sections = excluded.sections,
          raw_entry_ids = excluded.raw_entry_ids`,
				[input.id, input.date, input.compiledAt, toJson(input.sections), toJson(input.rawEntryIds)]
			);
		} catch (error) {
			throw RepositoryError.fromSqliteError("morning_newspapers", error as Error);
		}

		return this.getNewspaperByDate(input.date) as Promise<MorningNewspaper>;
	}

	/**
	 * Find newspaper by ID
	 */
	async findNewspaperById(id: string): Promise<MorningNewspaper | null> {
		const row = await this.client.get<Row>("SELECT * FROM morning_newspapers WHERE id = ?", [id]);
		return row ? mapNewspaperRow(row) : null;
	}

	/**
	 * Get newspaper by date
	 */
	async getNewspaperByDate(date: string): Promise<MorningNewspaper | null> {
		const row = await this.client.get<Row>("SELECT * FROM morning_newspapers WHERE date = ?", [
			date,
		]);
		return row ? mapNewspaperRow(row) : null;
	}

	/**
	 * Get newspapers for a date range
	 */
	async getNewspapers(startDate: string, endDate: string): Promise<MorningNewspaper[]> {
		const rows = await this.client.execute<Row>(
			`SELECT * FROM morning_newspapers
       WHERE date >= ? AND date <= ?
       ORDER BY date DESC`,
			[startDate, endDate]
		);
		return rows.map(mapNewspaperRow);
	}

	/**
	 * Get the most recent newspaper
	 */
	async getLatestNewspaper(): Promise<MorningNewspaper | null> {
		const row = await this.client.get<Row>(
			`SELECT * FROM morning_newspapers
       ORDER BY date DESC
       LIMIT 1`
		);
		return row ? mapNewspaperRow(row) : null;
	}

	// ============================================
	// Data Retention
	// ============================================

	/**
	 * Prune old entries based on retention policy
	 *
	 * @param retentionDays - Number of days to retain
	 * @returns Object with counts of deleted records
	 */
	async pruneOldData(retentionDays: number): Promise<{
		entries: number;
		newspapers: number;
	}> {
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - retentionDays);
		const cutoffStr = cutoff.toISOString();
		const cutoffDate = cutoffStr.slice(0, 10);

		const entriesResult = await this.client.run(
			"DELETE FROM macro_watch_entries WHERE created_at < ?",
			[cutoffStr]
		);

		const newspapersResult = await this.client.run(
			"DELETE FROM morning_newspapers WHERE date < ?",
			[cutoffDate]
		);

		return {
			entries: entriesResult.changes,
			newspapers: newspapersResult.changes,
		};
	}

	/**
	 * Get storage statistics
	 */
	async getStats(): Promise<{
		entryCount: number;
		newspaperCount: number;
		oldestEntry: string | null;
		newestEntry: string | null;
		latestNewspaperDate: string | null;
	}> {
		const entryCount = await this.client.get<{ count: number }>(
			"SELECT COUNT(*) as count FROM macro_watch_entries"
		);
		const newspaperCount = await this.client.get<{ count: number }>(
			"SELECT COUNT(*) as count FROM morning_newspapers"
		);
		const oldest = await this.client.get<{ timestamp: string }>(
			"SELECT MIN(timestamp) as timestamp FROM macro_watch_entries"
		);
		const newest = await this.client.get<{ timestamp: string }>(
			"SELECT MAX(timestamp) as timestamp FROM macro_watch_entries"
		);
		const latestNewspaper = await this.client.get<{ date: string }>(
			"SELECT MAX(date) as date FROM morning_newspapers"
		);

		return {
			entryCount: entryCount?.count ?? 0,
			newspaperCount: newspaperCount?.count ?? 0,
			oldestEntry: oldest?.timestamp ?? null,
			newestEntry: newest?.timestamp ?? null,
			latestNewspaperDate: latestNewspaper?.date ?? null,
		};
	}
}
