/**
 * Macro Watch Repository (Drizzle ORM)
 *
 * Data access for overnight macro watch entries and morning newspapers.
 * Used by the MacroWatch workflow for accumulating overnight developments
 * and compiling morning digests.
 *
 * @see docs/plans/42-overnight-macro-watch.md
 */
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { macroWatchEntries, morningNewspapers } from "../schema/external";

// ============================================
// Types
// ============================================

export type MacroWatchSession = "OVERNIGHT" | "PRE_MARKET" | "AFTER_HOURS";

export type MacroWatchCategory = "NEWS" | "PREDICTION" | "ECONOMIC" | "MOVER" | "EARNINGS";

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

export interface CreateMacroWatchEntryInput {
	id?: string;
	timestamp: string;
	session: MacroWatchSession;
	category: MacroWatchCategory;
	headline: string;
	symbols: string[];
	source: string;
	metadata?: Record<string, unknown>;
}

export interface NewspaperSections {
	macro: string[];
	universe: string[];
	predictionMarkets: string[];
	economicCalendar: string[];
}

export interface MorningNewspaper {
	id: string;
	date: string;
	compiledAt: string;
	sections: NewspaperSections;
	rawEntryIds: string[];
	createdAt: string;
}

export interface CreateMorningNewspaperInput {
	id?: string;
	date: string;
	compiledAt: string;
	sections: NewspaperSections;
	rawEntryIds: string[];
}

export interface MacroWatchFilters {
	session?: MacroWatchSession;
	category?: MacroWatchCategory;
	fromTime?: string;
	toTime?: string;
	symbols?: string[];
}

// ============================================
// Row Mapping
// ============================================

type MacroWatchEntryRow = typeof macroWatchEntries.$inferSelect;
type MorningNewspaperRow = typeof morningNewspapers.$inferSelect;

function mapEntryRow(row: MacroWatchEntryRow): MacroWatchEntry {
	return {
		id: row.id,
		timestamp: row.timestamp.toISOString(),
		session: row.session as MacroWatchSession,
		category: row.category as MacroWatchCategory,
		headline: row.headline,
		symbols: row.symbols as string[],
		source: row.source,
		metadata: row.metadata as Record<string, unknown> | null,
		createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
	};
}

function mapNewspaperRow(row: MorningNewspaperRow): MorningNewspaper {
	const defaultSections: NewspaperSections = {
		macro: [],
		universe: [],
		predictionMarkets: [],
		economicCalendar: [],
	};

	return {
		id: row.id,
		date: row.date,
		compiledAt: row.compiledAt.toISOString(),
		sections: (row.sections as NewspaperSections) ?? defaultSections,
		rawEntryIds: row.rawEntryIds as string[],
		createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class MacroWatchRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	// ============================================
	// Entry Operations
	// ============================================

	async saveEntry(input: CreateMacroWatchEntryInput): Promise<MacroWatchEntry> {
		const values: typeof macroWatchEntries.$inferInsert = {
			timestamp: new Date(input.timestamp),
			session: input.session as typeof macroWatchEntries.$inferInsert.session,
			category: input.category as typeof macroWatchEntries.$inferInsert.category,
			headline: input.headline,
			symbols: input.symbols,
			source: input.source,
			metadata: input.metadata ?? null,
		};

		// Only set id if provided (otherwise let DB generate uuidv7)
		if (input.id) {
			values.id = input.id;
		}

		const [row] = await this.db.insert(macroWatchEntries).values(values).returning();

		if (!row) {
			throw new Error("Failed to save macro watch entry");
		}
		return mapEntryRow(row);
	}

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

	async findEntryById(id: string): Promise<MacroWatchEntry | null> {
		const [row] = await this.db
			.select()
			.from(macroWatchEntries)
			.where(eq(macroWatchEntries.id, id))
			.limit(1);

		return row ? mapEntryRow(row) : null;
	}

	async getEntries(startTime: string, endTime: string): Promise<MacroWatchEntry[]> {
		const rows = await this.db
			.select()
			.from(macroWatchEntries)
			.where(
				and(
					gte(macroWatchEntries.timestamp, new Date(startTime)),
					lte(macroWatchEntries.timestamp, new Date(endTime))
				)
			)
			.orderBy(desc(macroWatchEntries.timestamp));

		return rows.map(mapEntryRow);
	}

	async findEntries(filters: MacroWatchFilters = {}, limit = 100): Promise<MacroWatchEntry[]> {
		const conditions = [];

		if (filters.session) {
			conditions.push(
				eq(
					macroWatchEntries.session,
					filters.session as typeof macroWatchEntries.$inferSelect.session
				)
			);
		}
		if (filters.category) {
			conditions.push(
				eq(
					macroWatchEntries.category,
					filters.category as typeof macroWatchEntries.$inferSelect.category
				)
			);
		}
		if (filters.fromTime) {
			conditions.push(gte(macroWatchEntries.timestamp, new Date(filters.fromTime)));
		}
		if (filters.toTime) {
			conditions.push(lte(macroWatchEntries.timestamp, new Date(filters.toTime)));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const rows = await this.db
			.select()
			.from(macroWatchEntries)
			.where(whereClause)
			.orderBy(desc(macroWatchEntries.timestamp))
			.limit(limit);

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

	async getEntriesSinceClose(previousCloseTime: string): Promise<MacroWatchEntry[]> {
		const rows = await this.db
			.select()
			.from(macroWatchEntries)
			.where(gte(macroWatchEntries.timestamp, new Date(previousCloseTime)))
			.orderBy(macroWatchEntries.timestamp);

		return rows.map(mapEntryRow);
	}

	async findByCreatedAtRange(
		startTime: string,
		endTime: string,
		limit = 100
	): Promise<MacroWatchEntry[]> {
		const rows = await this.db
			.select()
			.from(macroWatchEntries)
			.where(
				and(
					gte(macroWatchEntries.createdAt, new Date(startTime)),
					lte(macroWatchEntries.createdAt, new Date(endTime))
				)
			)
			.orderBy(desc(macroWatchEntries.timestamp))
			.limit(limit);

		return rows.map(mapEntryRow);
	}

	async countByCategory(sinceTime: string): Promise<Record<MacroWatchCategory, number>> {
		const rows = await this.db
			.select({
				category: macroWatchEntries.category,
				count: sql<number>`COUNT(*)::int`,
			})
			.from(macroWatchEntries)
			.where(gte(macroWatchEntries.timestamp, new Date(sinceTime)))
			.groupBy(macroWatchEntries.category);

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

	async saveNewspaper(input: CreateMorningNewspaperInput): Promise<MorningNewspaper> {
		const values: typeof morningNewspapers.$inferInsert = {
			date: input.date,
			compiledAt: new Date(input.compiledAt),
			sections: input.sections,
			rawEntryIds: input.rawEntryIds,
		};

		// Only set id if provided (otherwise let DB generate uuidv7)
		if (input.id) {
			values.id = input.id;
		}

		const [row] = await this.db.insert(morningNewspapers).values(values).returning();

		if (!row) {
			throw new Error("Failed to save morning newspaper");
		}
		return mapNewspaperRow(row);
	}

	async upsertNewspaper(input: CreateMorningNewspaperInput): Promise<MorningNewspaper> {
		const values: typeof morningNewspapers.$inferInsert = {
			date: input.date,
			compiledAt: new Date(input.compiledAt),
			sections: input.sections,
			rawEntryIds: input.rawEntryIds,
		};

		// Only set id if provided (otherwise let DB generate uuidv7)
		if (input.id) {
			values.id = input.id;
		}

		const [row] = await this.db
			.insert(morningNewspapers)
			.values(values)
			.onConflictDoUpdate({
				target: morningNewspapers.date,
				set: {
					compiledAt: new Date(input.compiledAt),
					sections: input.sections,
					rawEntryIds: input.rawEntryIds,
				},
			})
			.returning();

		if (!row) {
			throw new Error("Failed to upsert morning newspaper");
		}
		return mapNewspaperRow(row);
	}

	async findNewspaperById(id: string): Promise<MorningNewspaper | null> {
		const [row] = await this.db
			.select()
			.from(morningNewspapers)
			.where(eq(morningNewspapers.id, id))
			.limit(1);

		return row ? mapNewspaperRow(row) : null;
	}

	async getNewspaperByDate(date: string): Promise<MorningNewspaper | null> {
		const [row] = await this.db
			.select()
			.from(morningNewspapers)
			.where(eq(morningNewspapers.date, date))
			.limit(1);

		return row ? mapNewspaperRow(row) : null;
	}

	async getNewspapers(startDate: string, endDate: string): Promise<MorningNewspaper[]> {
		const rows = await this.db
			.select()
			.from(morningNewspapers)
			.where(and(gte(morningNewspapers.date, startDate), lte(morningNewspapers.date, endDate)))
			.orderBy(desc(morningNewspapers.date));

		return rows.map(mapNewspaperRow);
	}

	async getLatestNewspaper(): Promise<MorningNewspaper | null> {
		const [row] = await this.db
			.select()
			.from(morningNewspapers)
			.orderBy(desc(morningNewspapers.date))
			.limit(1);

		return row ? mapNewspaperRow(row) : null;
	}

	async getNewspaperByCompiledAtRange(
		startTime: string,
		endTime: string
	): Promise<MorningNewspaper | null> {
		const [row] = await this.db
			.select()
			.from(morningNewspapers)
			.where(
				and(
					gte(morningNewspapers.compiledAt, new Date(startTime)),
					lte(morningNewspapers.compiledAt, new Date(endTime))
				)
			)
			.orderBy(desc(morningNewspapers.compiledAt))
			.limit(1);

		return row ? mapNewspaperRow(row) : null;
	}

	// ============================================
	// Data Retention
	// ============================================

	async pruneOldData(retentionDays: number): Promise<{
		entries: number;
		newspapers: number;
	}> {
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - retentionDays);
		const cutoffDate = cutoff.toISOString().slice(0, 10);

		const entriesResult = await this.db
			.delete(macroWatchEntries)
			.where(lte(macroWatchEntries.createdAt, cutoff))
			.returning({ id: macroWatchEntries.id });

		const newspapersResult = await this.db
			.delete(morningNewspapers)
			.where(lte(morningNewspapers.date, cutoffDate))
			.returning({ id: morningNewspapers.id });

		return {
			entries: entriesResult.length,
			newspapers: newspapersResult.length,
		};
	}

	async getStats(): Promise<{
		entryCount: number;
		newspaperCount: number;
		oldestEntry: string | null;
		newestEntry: string | null;
		latestNewspaperDate: string | null;
	}> {
		const [entryCountResult] = await this.db.select({ count: count() }).from(macroWatchEntries);

		const [newspaperCountResult] = await this.db.select({ count: count() }).from(morningNewspapers);

		const [oldest] = await this.db
			.select({ timestamp: sql<Date>`MIN(${macroWatchEntries.timestamp})` })
			.from(macroWatchEntries);

		const [newest] = await this.db
			.select({ timestamp: sql<Date>`MAX(${macroWatchEntries.timestamp})` })
			.from(macroWatchEntries);

		const [latestNewspaper] = await this.db
			.select({ date: sql<string>`MAX(${morningNewspapers.date})` })
			.from(morningNewspapers);

		return {
			entryCount: entryCountResult?.count ?? 0,
			newspaperCount: newspaperCountResult?.count ?? 0,
			oldestEntry: oldest?.timestamp?.toISOString() ?? null,
			newestEntry: newest?.timestamp?.toISOString() ?? null,
			latestNewspaperDate: latestNewspaper?.date ?? null,
		};
	}
}
