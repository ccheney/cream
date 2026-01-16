/**
 * Options Indicators Cache Repository (Drizzle ORM)
 *
 * Data access for options_indicators_cache table.
 * Stores cached options-derived indicators with TTL-based expiration.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */
import { and, count, eq, gt, lte, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { optionsIndicatorsCache } from "../schema/indicators";

// ============================================
// Types
// ============================================

export interface OptionsIndicatorsCache {
	id: string;
	symbol: string;
	timestamp: string;

	impliedVolatility: number | null;
	ivPercentile30d: number | null;
	ivSkew: number | null;
	putCallRatio: number | null;
	vrp: number | null;
	termStructureSlope: number | null;

	netDelta: number | null;
	netGamma: number | null;
	netTheta: number | null;
	netVega: number | null;

	expiresAt: string;
}

export interface CreateOptionsIndicatorsCacheInput {
	symbol: string;

	impliedVolatility?: number | null;
	ivPercentile30d?: number | null;
	ivSkew?: number | null;
	putCallRatio?: number | null;
	vrp?: number | null;
	termStructureSlope?: number | null;

	netDelta?: number | null;
	netGamma?: number | null;
	netTheta?: number | null;
	netVega?: number | null;

	ttlMinutes?: number;
}

export interface UpdateOptionsIndicatorsCacheInput {
	impliedVolatility?: number | null;
	ivPercentile30d?: number | null;
	ivSkew?: number | null;
	putCallRatio?: number | null;
	vrp?: number | null;
	termStructureSlope?: number | null;

	netDelta?: number | null;
	netGamma?: number | null;
	netTheta?: number | null;
	netVega?: number | null;

	ttlMinutes?: number;
}

// ============================================
// Row Mapping
// ============================================

type OptionsIndicatorsRow = typeof optionsIndicatorsCache.$inferSelect;

function mapOptionsIndicatorsRow(row: OptionsIndicatorsRow): OptionsIndicatorsCache {
	return {
		id: row.id,
		symbol: row.symbol,
		timestamp: row.timestamp.toISOString(),

		impliedVolatility: row.impliedVolatility ? Number(row.impliedVolatility) : null,
		ivPercentile30d: row.ivPercentile30d ? Number(row.ivPercentile30d) : null,
		ivSkew: row.ivSkew ? Number(row.ivSkew) : null,
		putCallRatio: row.putCallRatio ? Number(row.putCallRatio) : null,
		vrp: row.vrp ? Number(row.vrp) : null,
		termStructureSlope: row.termStructureSlope ? Number(row.termStructureSlope) : null,

		netDelta: row.netDelta ? Number(row.netDelta) : null,
		netGamma: row.netGamma ? Number(row.netGamma) : null,
		netTheta: row.netTheta ? Number(row.netTheta) : null,
		netVega: row.netVega ? Number(row.netVega) : null,

		expiresAt: row.expiresAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class OptionsIndicatorsCacheRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	private calculateExpiresAt(ttlMinutes = 60): Date {
		const now = new Date();
		now.setMinutes(now.getMinutes() + ttlMinutes);
		return now;
	}

	async set(input: CreateOptionsIndicatorsCacheInput): Promise<OptionsIndicatorsCache> {
		const now = new Date();
		const expiresAt = this.calculateExpiresAt(input.ttlMinutes);

		const [row] = await this.db
			.insert(optionsIndicatorsCache)
			.values({
				symbol: input.symbol,
				timestamp: now,
				impliedVolatility: input.impliedVolatility != null ? String(input.impliedVolatility) : null,
				ivPercentile30d: input.ivPercentile30d != null ? String(input.ivPercentile30d) : null,
				ivSkew: input.ivSkew != null ? String(input.ivSkew) : null,
				putCallRatio: input.putCallRatio != null ? String(input.putCallRatio) : null,
				vrp: input.vrp != null ? String(input.vrp) : null,
				termStructureSlope:
					input.termStructureSlope != null ? String(input.termStructureSlope) : null,
				netDelta: input.netDelta != null ? String(input.netDelta) : null,
				netGamma: input.netGamma != null ? String(input.netGamma) : null,
				netTheta: input.netTheta != null ? String(input.netTheta) : null,
				netVega: input.netVega != null ? String(input.netVega) : null,
				expiresAt,
			})
			.onConflictDoUpdate({
				target: optionsIndicatorsCache.symbol,
				set: {
					timestamp: now,
					impliedVolatility:
						input.impliedVolatility != null ? String(input.impliedVolatility) : null,
					ivPercentile30d: input.ivPercentile30d != null ? String(input.ivPercentile30d) : null,
					ivSkew: input.ivSkew != null ? String(input.ivSkew) : null,
					putCallRatio: input.putCallRatio != null ? String(input.putCallRatio) : null,
					vrp: input.vrp != null ? String(input.vrp) : null,
					termStructureSlope:
						input.termStructureSlope != null ? String(input.termStructureSlope) : null,
					netDelta: input.netDelta != null ? String(input.netDelta) : null,
					netGamma: input.netGamma != null ? String(input.netGamma) : null,
					netTheta: input.netTheta != null ? String(input.netTheta) : null,
					netVega: input.netVega != null ? String(input.netVega) : null,
					expiresAt,
				},
			})
			.returning();

		if (!row) {
			throw new Error("Failed to set options indicators cache");
		}
		return mapOptionsIndicatorsRow(row);
	}

	async bulkSet(inputs: CreateOptionsIndicatorsCacheInput[]): Promise<number> {
		if (inputs.length === 0) {
			return 0;
		}

		let count = 0;
		for (const input of inputs) {
			await this.set(input);
			count++;
		}

		return count;
	}

	async get(symbol: string): Promise<OptionsIndicatorsCache | null> {
		const now = new Date();

		const [row] = await this.db
			.select()
			.from(optionsIndicatorsCache)
			.where(
				and(eq(optionsIndicatorsCache.symbol, symbol), gt(optionsIndicatorsCache.expiresAt, now))
			)
			.limit(1);

		return row ? mapOptionsIndicatorsRow(row) : null;
	}

	async getIncludingExpired(symbol: string): Promise<OptionsIndicatorsCache | null> {
		const [row] = await this.db
			.select()
			.from(optionsIndicatorsCache)
			.where(eq(optionsIndicatorsCache.symbol, symbol))
			.limit(1);

		return row ? mapOptionsIndicatorsRow(row) : null;
	}

	async getMany(symbols: string[]): Promise<Map<string, OptionsIndicatorsCache>> {
		if (symbols.length === 0) {
			return new Map();
		}

		const now = new Date();

		const rows = await this.db.execute(sql`
			SELECT * FROM ${optionsIndicatorsCache}
			WHERE symbol = ANY(${symbols}) AND expires_at > ${now}
		`);

		const result = new Map<string, OptionsIndicatorsCache>();
		for (const row of rows.rows as OptionsIndicatorsRow[]) {
			const entry = mapOptionsIndicatorsRow(row);
			result.set(entry.symbol, entry);
		}
		return result;
	}

	async has(symbol: string): Promise<boolean> {
		const now = new Date();

		const [result] = await this.db
			.select({ count: count() })
			.from(optionsIndicatorsCache)
			.where(
				and(eq(optionsIndicatorsCache.symbol, symbol), gt(optionsIndicatorsCache.expiresAt, now))
			);

		return (result?.count ?? 0) > 0;
	}

	async getAll(): Promise<OptionsIndicatorsCache[]> {
		const now = new Date();

		const rows = await this.db
			.select()
			.from(optionsIndicatorsCache)
			.where(gt(optionsIndicatorsCache.expiresAt, now))
			.orderBy(optionsIndicatorsCache.symbol);

		return rows.map(mapOptionsIndicatorsRow);
	}

	async getExpiredSymbols(): Promise<string[]> {
		const now = new Date();

		const rows = await this.db
			.select({ symbol: optionsIndicatorsCache.symbol })
			.from(optionsIndicatorsCache)
			.where(lte(optionsIndicatorsCache.expiresAt, now));

		return rows.map((r) => r.symbol);
	}

	async refresh(symbol: string, ttlMinutes = 60): Promise<boolean> {
		const expiresAt = this.calculateExpiresAt(ttlMinutes);
		const now = new Date();

		const result = await this.db
			.update(optionsIndicatorsCache)
			.set({ expiresAt, timestamp: now })
			.where(eq(optionsIndicatorsCache.symbol, symbol))
			.returning({ id: optionsIndicatorsCache.id });

		return result.length > 0;
	}

	async update(
		symbol: string,
		input: UpdateOptionsIndicatorsCacheInput
	): Promise<OptionsIndicatorsCache | null> {
		const updates: Record<string, unknown> = {
			timestamp: new Date(),
		};

		if (input.impliedVolatility !== undefined) {
			updates.impliedVolatility =
				input.impliedVolatility != null ? String(input.impliedVolatility) : null;
		}

		if (input.ivPercentile30d !== undefined) {
			updates.ivPercentile30d =
				input.ivPercentile30d != null ? String(input.ivPercentile30d) : null;
		}

		if (input.ivSkew !== undefined) {
			updates.ivSkew = input.ivSkew != null ? String(input.ivSkew) : null;
		}

		if (input.putCallRatio !== undefined) {
			updates.putCallRatio = input.putCallRatio != null ? String(input.putCallRatio) : null;
		}

		if (input.vrp !== undefined) {
			updates.vrp = input.vrp != null ? String(input.vrp) : null;
		}

		if (input.termStructureSlope !== undefined) {
			updates.termStructureSlope =
				input.termStructureSlope != null ? String(input.termStructureSlope) : null;
		}

		if (input.netDelta !== undefined) {
			updates.netDelta = input.netDelta != null ? String(input.netDelta) : null;
		}

		if (input.netGamma !== undefined) {
			updates.netGamma = input.netGamma != null ? String(input.netGamma) : null;
		}

		if (input.netTheta !== undefined) {
			updates.netTheta = input.netTheta != null ? String(input.netTheta) : null;
		}

		if (input.netVega !== undefined) {
			updates.netVega = input.netVega != null ? String(input.netVega) : null;
		}

		if (input.ttlMinutes !== undefined) {
			updates.expiresAt = this.calculateExpiresAt(input.ttlMinutes);
		}

		const [row] = await this.db
			.update(optionsIndicatorsCache)
			.set(updates)
			.where(eq(optionsIndicatorsCache.symbol, symbol))
			.returning();

		return row ? mapOptionsIndicatorsRow(row) : null;
	}

	async delete(symbol: string): Promise<boolean> {
		const result = await this.db
			.delete(optionsIndicatorsCache)
			.where(eq(optionsIndicatorsCache.symbol, symbol))
			.returning({ id: optionsIndicatorsCache.id });

		return result.length > 0;
	}

	async clearExpired(): Promise<number> {
		const now = new Date();

		const result = await this.db
			.delete(optionsIndicatorsCache)
			.where(lte(optionsIndicatorsCache.expiresAt, now))
			.returning({ id: optionsIndicatorsCache.id });

		return result.length;
	}

	async clearAll(): Promise<number> {
		const result = await this.db
			.delete(optionsIndicatorsCache)
			.returning({ id: optionsIndicatorsCache.id });

		return result.length;
	}

	async count(includeExpired = false): Promise<number> {
		if (includeExpired) {
			const [result] = await this.db.select({ count: count() }).from(optionsIndicatorsCache);
			return result?.count ?? 0;
		}

		const now = new Date();
		const [result] = await this.db
			.select({ count: count() })
			.from(optionsIndicatorsCache)
			.where(gt(optionsIndicatorsCache.expiresAt, now));
		return result?.count ?? 0;
	}

	async getStats(): Promise<{
		total: number;
		valid: number;
		expired: number;
		oldestTimestamp: string | null;
		newestTimestamp: string | null;
	}> {
		const now = new Date();

		const [totalResult] = await this.db.select({ count: count() }).from(optionsIndicatorsCache);

		const [validResult] = await this.db
			.select({ count: count() })
			.from(optionsIndicatorsCache)
			.where(gt(optionsIndicatorsCache.expiresAt, now));

		const [statsResult] = await this.db
			.select({
				oldest: sql<Date>`MIN(${optionsIndicatorsCache.timestamp})`,
				newest: sql<Date>`MAX(${optionsIndicatorsCache.timestamp})`,
			})
			.from(optionsIndicatorsCache);

		const total = totalResult?.count ?? 0;
		const valid = validResult?.count ?? 0;

		return {
			total,
			valid,
			expired: total - valid,
			oldestTimestamp: statsResult?.oldest?.toISOString() ?? null,
			newestTimestamp: statsResult?.newest?.toISOString() ?? null,
		};
	}
}
