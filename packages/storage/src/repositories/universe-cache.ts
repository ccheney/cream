/**
 * Universe Cache Repository (Drizzle ORM)
 *
 * Data access for cached universe resolution results (index constituents, ETF holdings, screeners).
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */
import { and, eq, gt, lte } from "drizzle-orm";
import { z } from "zod";
import { type Database, getDb } from "../db";
import { universeCache } from "../schema/market-data";

// ============================================
// Zod Schemas
// ============================================

export const SourceTypeSchema = z.enum(["index", "etf", "screener", "static", "custom"]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export interface UniverseCache {
	id: number;
	sourceType: SourceType;
	sourceId: string;
	sourceHash: string;
	tickers: string[];
	tickerCount: number;
	metadata: Record<string, unknown> | null;
	cachedAt: string;
	expiresAt: string;
	provider: string | null;
}

export interface UniverseCacheInsert {
	sourceType: SourceType;
	sourceId: string;
	sourceHash: string;
	tickers: string[];
	tickerCount?: number;
	metadata?: Record<string, unknown> | null;
	expiresAt: string;
	provider?: string | null;
}

// ============================================
// Row Mapping
// ============================================

type UniverseCacheRow = typeof universeCache.$inferSelect;

function mapUniverseCacheRow(row: UniverseCacheRow): UniverseCache {
	return {
		id: row.id,
		sourceType: row.sourceType as SourceType,
		sourceId: row.sourceId,
		sourceHash: row.sourceHash,
		tickers: row.tickers as string[],
		tickerCount: row.tickerCount,
		metadata: row.metadata as Record<string, unknown> | null,
		cachedAt: row.cachedAt.toISOString(),
		expiresAt: row.expiresAt.toISOString(),
		provider: row.provider,
	};
}

// ============================================
// Repository
// ============================================

export class UniverseCacheRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async get(sourceType: SourceType, sourceId: string): Promise<UniverseCache | null> {
		const now = new Date();

		const [row] = await this.db
			.select()
			.from(universeCache)
			.where(
				and(
					eq(universeCache.sourceType, sourceType),
					eq(universeCache.sourceId, sourceId),
					gt(universeCache.expiresAt, now)
				)
			)
			.limit(1);

		return row ? mapUniverseCacheRow(row) : null;
	}

	async getByHash(sourceHash: string): Promise<UniverseCache | null> {
		const now = new Date();

		const [row] = await this.db
			.select()
			.from(universeCache)
			.where(and(eq(universeCache.sourceHash, sourceHash), gt(universeCache.expiresAt, now)))
			.limit(1);

		return row ? mapUniverseCacheRow(row) : null;
	}

	async set(cache: UniverseCacheInsert): Promise<void> {
		const tickerCount = cache.tickers.length;

		await this.db
			.insert(universeCache)
			.values({
				sourceType: cache.sourceType,
				sourceId: cache.sourceId,
				sourceHash: cache.sourceHash,
				tickers: cache.tickers,
				tickerCount,
				metadata: cache.metadata ?? null,
				expiresAt: new Date(cache.expiresAt),
				provider: cache.provider ?? null,
			})
			.onConflictDoUpdate({
				target: [universeCache.sourceType, universeCache.sourceId],
				set: {
					sourceHash: cache.sourceHash,
					tickers: cache.tickers,
					tickerCount,
					metadata: cache.metadata ?? null,
					cachedAt: new Date(),
					expiresAt: new Date(cache.expiresAt),
					provider: cache.provider ?? null,
				},
			});
	}

	async delete(sourceType: SourceType, sourceId: string): Promise<boolean> {
		const result = await this.db
			.delete(universeCache)
			.where(and(eq(universeCache.sourceType, sourceType), eq(universeCache.sourceId, sourceId)))
			.returning({ id: universeCache.id });

		return result.length > 0;
	}

	async purgeExpired(): Promise<number> {
		const now = new Date();

		const result = await this.db
			.delete(universeCache)
			.where(lte(universeCache.expiresAt, now))
			.returning({ id: universeCache.id });

		return result.length;
	}

	async listSources(): Promise<{ sourceType: SourceType; sourceId: string }[]> {
		const now = new Date();

		const rows = await this.db
			.select({ sourceType: universeCache.sourceType, sourceId: universeCache.sourceId })
			.from(universeCache)
			.where(gt(universeCache.expiresAt, now))
			.orderBy(universeCache.sourceType, universeCache.sourceId);

		return rows.map((r) => ({
			sourceType: r.sourceType as SourceType,
			sourceId: r.sourceId,
		}));
	}
}
