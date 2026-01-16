/**
 * Prediction Markets Repository (Drizzle ORM)
 *
 * Data access for prediction market snapshots, signals, and arbitrage alerts.
 *
 * @see docs/plans/18-prediction-markets.md
 */
import { and, count, desc, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { getDb, type Database } from "../db";
import {
	predictionMarketArbitrage,
	predictionMarketSignals,
	predictionMarketSnapshots,
} from "../schema/external";

// ============================================
// Types
// ============================================

export type PredictionPlatform = "KALSHI" | "POLYMARKET";

export type PredictionMarketType =
	| "FED_RATE"
	| "ECONOMIC_DATA"
	| "RECESSION"
	| "GEOPOLITICAL"
	| "REGULATORY"
	| "ELECTION"
	| "OTHER";

export type SignalType =
	| "fed_cut_probability"
	| "fed_hike_probability"
	| "recession_12m"
	| "macro_uncertainty"
	| "policy_event_risk"
	| "cpi_surprise"
	| "gdp_surprise"
	| "shutdown_probability"
	| "tariff_escalation";

export interface MarketSnapshot {
	id: string;
	platform: PredictionPlatform;
	marketTicker: string;
	marketType: PredictionMarketType;
	marketQuestion: string | null;
	snapshotTime: string;
	data: MarketSnapshotData;
	createdAt: string;
}

export interface MarketSnapshotData {
	outcomes: Array<{
		outcome: string;
		probability: number;
		price: number;
		volume24h?: number;
	}>;
	liquidityScore?: number;
	volume24h?: number;
	openInterest?: number;
}

export interface CreateSnapshotInput {
	platform: PredictionPlatform;
	marketTicker: string;
	marketType: PredictionMarketType;
	marketQuestion?: string | null;
	snapshotTime: string;
	data: MarketSnapshotData;
}

export interface ComputedSignal {
	id: string;
	signalType: SignalType;
	signalValue: number;
	confidence: number | null;
	computedAt: string;
	inputs: SignalInputs;
	createdAt: string;
}

export interface SignalInputs {
	sources: Array<{
		platform: PredictionPlatform;
		ticker: string;
		price: number;
		weight: number;
	}>;
	method: string;
}

export interface CreateSignalInput {
	signalType: SignalType;
	signalValue: number;
	confidence?: number | null;
	computedAt: string;
	inputs: SignalInputs;
}

export interface ArbitrageAlert {
	id: string;
	kalshiTicker: string;
	polymarketToken: string;
	kalshiPrice: number;
	polymarketPrice: number;
	divergencePct: number;
	marketType: PredictionMarketType;
	detectedAt: string;
	resolvedAt: string | null;
	resolutionPrice: number | null;
	createdAt: string;
}

export interface CreateArbitrageInput {
	kalshiTicker: string;
	polymarketToken: string;
	kalshiPrice: number;
	polymarketPrice: number;
	divergencePct: number;
	marketType: PredictionMarketType;
	detectedAt: string;
}

export interface SnapshotFilters {
	platform?: PredictionPlatform;
	marketType?: PredictionMarketType;
	marketTicker?: string;
	fromTime?: string;
	toTime?: string;
}

export interface SignalFilters {
	signalType?: SignalType;
	fromTime?: string;
	toTime?: string;
	minValue?: number;
	maxValue?: number;
}

// ============================================
// Row Mappers
// ============================================

type SnapshotRow = typeof predictionMarketSnapshots.$inferSelect;
type SignalRow = typeof predictionMarketSignals.$inferSelect;
type ArbitrageRow = typeof predictionMarketArbitrage.$inferSelect;

function mapSnapshotRow(row: SnapshotRow): MarketSnapshot {
	return {
		id: row.id,
		platform: row.platform as PredictionPlatform,
		marketTicker: row.marketTicker,
		marketType: row.marketType as PredictionMarketType,
		marketQuestion: row.marketQuestion,
		snapshotTime: row.snapshotTime.toISOString(),
		data: row.data as MarketSnapshotData,
		createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
	};
}

function mapSignalRow(row: SignalRow): ComputedSignal {
	return {
		id: row.id,
		signalType: row.signalType as SignalType,
		signalValue: Number(row.signalValue),
		confidence: row.confidence ? Number(row.confidence) : null,
		computedAt: row.computedAt.toISOString(),
		inputs: row.inputs as SignalInputs,
		createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
	};
}

function mapArbitrageRow(row: ArbitrageRow): ArbitrageAlert {
	return {
		id: row.id,
		kalshiTicker: row.kalshiTicker,
		polymarketToken: row.polymarketToken,
		kalshiPrice: Number(row.kalshiPrice),
		polymarketPrice: Number(row.polymarketPrice),
		divergencePct: Number(row.divergencePct),
		marketType: row.marketType as PredictionMarketType,
		detectedAt: row.detectedAt.toISOString(),
		resolvedAt: row.resolvedAt?.toISOString() ?? null,
		resolutionPrice: row.resolutionPrice ? Number(row.resolutionPrice) : null,
		createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class PredictionMarketsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	// ============================================
	// Snapshot Operations
	// ============================================

	async saveSnapshot(input: CreateSnapshotInput): Promise<MarketSnapshot> {
		const [row] = await this.db
			.insert(predictionMarketSnapshots)
			.values({
				platform: input.platform as typeof predictionMarketSnapshots.$inferInsert.platform,
				marketTicker: input.marketTicker,
				marketType: input.marketType as typeof predictionMarketSnapshots.$inferInsert.marketType,
				marketQuestion: input.marketQuestion ?? null,
				snapshotTime: new Date(input.snapshotTime),
				data: input.data,
			})
			.returning();

		return mapSnapshotRow(row);
	}

	async findSnapshotById(id: string): Promise<MarketSnapshot | null> {
		const [row] = await this.db
			.select()
			.from(predictionMarketSnapshots)
			.where(eq(predictionMarketSnapshots.id, id))
			.limit(1);

		return row ? mapSnapshotRow(row) : null;
	}

	async getSnapshots(
		ticker: string,
		startTime: string,
		endTime: string
	): Promise<MarketSnapshot[]> {
		const rows = await this.db
			.select()
			.from(predictionMarketSnapshots)
			.where(
				and(
					eq(predictionMarketSnapshots.marketTicker, ticker),
					gte(predictionMarketSnapshots.snapshotTime, new Date(startTime)),
					lte(predictionMarketSnapshots.snapshotTime, new Date(endTime))
				)
			)
			.orderBy(desc(predictionMarketSnapshots.snapshotTime));

		return rows.map(mapSnapshotRow);
	}

	async findSnapshots(filters: SnapshotFilters = {}, limit = 100): Promise<MarketSnapshot[]> {
		const conditions = [];

		if (filters.platform) {
			conditions.push(eq(predictionMarketSnapshots.platform, filters.platform as typeof predictionMarketSnapshots.$inferSelect.platform));
		}
		if (filters.marketType) {
			conditions.push(eq(predictionMarketSnapshots.marketType, filters.marketType as typeof predictionMarketSnapshots.$inferSelect.marketType));
		}
		if (filters.marketTicker) {
			conditions.push(eq(predictionMarketSnapshots.marketTicker, filters.marketTicker));
		}
		if (filters.fromTime) {
			conditions.push(gte(predictionMarketSnapshots.snapshotTime, new Date(filters.fromTime)));
		}
		if (filters.toTime) {
			conditions.push(lte(predictionMarketSnapshots.snapshotTime, new Date(filters.toTime)));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const rows = await this.db
			.select()
			.from(predictionMarketSnapshots)
			.where(whereClause)
			.orderBy(desc(predictionMarketSnapshots.snapshotTime))
			.limit(limit);

		return rows.map(mapSnapshotRow);
	}

	async getLatestSnapshots(platform?: PredictionPlatform): Promise<MarketSnapshot[]> {
		let query = sql`
			SELECT s.*
			FROM ${predictionMarketSnapshots} s
			INNER JOIN (
				SELECT market_ticker, MAX(snapshot_time) as max_time
				FROM ${predictionMarketSnapshots}
		`;

		if (platform) {
			query = sql`${query} WHERE platform = ${platform}`;
		}

		query = sql`${query}
				GROUP BY market_ticker
			) latest ON s.market_ticker = latest.market_ticker
				AND s.snapshot_time = latest.max_time
		`;

		const result = await this.db.execute(query);
		return (result.rows as SnapshotRow[]).map(mapSnapshotRow);
	}

	// ============================================
	// Signal Operations
	// ============================================

	async saveSignal(input: CreateSignalInput): Promise<ComputedSignal> {
		const [row] = await this.db
			.insert(predictionMarketSignals)
			.values({
				signalType: input.signalType,
				signalValue: String(input.signalValue),
				confidence: input.confidence != null ? String(input.confidence) : null,
				computedAt: new Date(input.computedAt),
				inputs: input.inputs,
			})
			.returning();

		return mapSignalRow(row);
	}

	async findSignalById(id: string): Promise<ComputedSignal | null> {
		const [row] = await this.db
			.select()
			.from(predictionMarketSignals)
			.where(eq(predictionMarketSignals.id, id))
			.limit(1);

		return row ? mapSignalRow(row) : null;
	}

	async getSignalHistory(signalType: SignalType, limit = 100): Promise<ComputedSignal[]> {
		const rows = await this.db
			.select()
			.from(predictionMarketSignals)
			.where(eq(predictionMarketSignals.signalType, signalType))
			.orderBy(desc(predictionMarketSignals.computedAt))
			.limit(limit);

		return rows.map(mapSignalRow);
	}

	async findSignals(filters: SignalFilters = {}, limit = 100): Promise<ComputedSignal[]> {
		const conditions = [];

		if (filters.signalType) {
			conditions.push(eq(predictionMarketSignals.signalType, filters.signalType));
		}
		if (filters.fromTime) {
			conditions.push(gte(predictionMarketSignals.computedAt, new Date(filters.fromTime)));
		}
		if (filters.toTime) {
			conditions.push(lte(predictionMarketSignals.computedAt, new Date(filters.toTime)));
		}
		if (filters.minValue !== undefined) {
			conditions.push(gte(predictionMarketSignals.signalValue, String(filters.minValue)));
		}
		if (filters.maxValue !== undefined) {
			conditions.push(lte(predictionMarketSignals.signalValue, String(filters.maxValue)));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const rows = await this.db
			.select()
			.from(predictionMarketSignals)
			.where(whereClause)
			.orderBy(desc(predictionMarketSignals.computedAt))
			.limit(limit);

		return rows.map(mapSignalRow);
	}

	async getLatestSignals(): Promise<ComputedSignal[]> {
		const result = await this.db.execute(sql`
			SELECT s.*
			FROM ${predictionMarketSignals} s
			INNER JOIN (
				SELECT signal_type, MAX(computed_at) as max_time
				FROM ${predictionMarketSignals}
				GROUP BY signal_type
			) latest ON s.signal_type = latest.signal_type
				AND s.computed_at = latest.max_time
		`);

		return (result.rows as SignalRow[]).map(mapSignalRow);
	}

	// ============================================
	// Arbitrage Operations
	// ============================================

	async saveArbitrageAlert(input: CreateArbitrageInput): Promise<ArbitrageAlert> {
		const [row] = await this.db
			.insert(predictionMarketArbitrage)
			.values({
				kalshiTicker: input.kalshiTicker,
				polymarketToken: input.polymarketToken,
				kalshiPrice: String(input.kalshiPrice),
				polymarketPrice: String(input.polymarketPrice),
				divergencePct: String(input.divergencePct),
				marketType: input.marketType as typeof predictionMarketArbitrage.$inferInsert.marketType,
				detectedAt: new Date(input.detectedAt),
			})
			.returning();

		return mapArbitrageRow(row);
	}

	async findArbitrageById(id: string): Promise<ArbitrageAlert | null> {
		const [row] = await this.db
			.select()
			.from(predictionMarketArbitrage)
			.where(eq(predictionMarketArbitrage.id, id))
			.limit(1);

		return row ? mapArbitrageRow(row) : null;
	}

	async getUnresolvedArbitrageAlerts(): Promise<ArbitrageAlert[]> {
		const rows = await this.db
			.select()
			.from(predictionMarketArbitrage)
			.where(isNull(predictionMarketArbitrage.resolvedAt))
			.orderBy(desc(predictionMarketArbitrage.divergencePct));

		return rows.map(mapArbitrageRow);
	}

	async resolveArbitrageAlert(id: string, resolutionPrice: number): Promise<ArbitrageAlert | null> {
		const [row] = await this.db
			.update(predictionMarketArbitrage)
			.set({
				resolvedAt: new Date(),
				resolutionPrice: String(resolutionPrice),
			})
			.where(eq(predictionMarketArbitrage.id, id))
			.returning();

		return row ? mapArbitrageRow(row) : null;
	}

	async findArbitrageAlerts(
		options: {
			minDivergence?: number;
			resolved?: boolean;
			fromTime?: string;
			toTime?: string;
		} = {},
		limit = 100
	): Promise<ArbitrageAlert[]> {
		const conditions = [];

		if (options.minDivergence !== undefined) {
			conditions.push(gte(predictionMarketArbitrage.divergencePct, String(options.minDivergence)));
		}
		if (options.resolved !== undefined) {
			conditions.push(
				options.resolved
					? isNotNull(predictionMarketArbitrage.resolvedAt)
					: isNull(predictionMarketArbitrage.resolvedAt)
			);
		}
		if (options.fromTime) {
			conditions.push(gte(predictionMarketArbitrage.detectedAt, new Date(options.fromTime)));
		}
		if (options.toTime) {
			conditions.push(lte(predictionMarketArbitrage.detectedAt, new Date(options.toTime)));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const rows = await this.db
			.select()
			.from(predictionMarketArbitrage)
			.where(whereClause)
			.orderBy(desc(predictionMarketArbitrage.detectedAt))
			.limit(limit);

		return rows.map(mapArbitrageRow);
	}

	// ============================================
	// Data Retention
	// ============================================

	async pruneOldData(retentionDays: number): Promise<{
		snapshots: number;
		signals: number;
		arbitrage: number;
	}> {
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - retentionDays);

		const snapshotsResult = await this.db
			.delete(predictionMarketSnapshots)
			.where(lte(predictionMarketSnapshots.createdAt, cutoff))
			.returning({ id: predictionMarketSnapshots.id });

		const signalsResult = await this.db
			.delete(predictionMarketSignals)
			.where(lte(predictionMarketSignals.createdAt, cutoff))
			.returning({ id: predictionMarketSignals.id });

		const arbitrageResult = await this.db
			.delete(predictionMarketArbitrage)
			.where(
				and(
					lte(predictionMarketArbitrage.createdAt, cutoff),
					isNotNull(predictionMarketArbitrage.resolvedAt)
				)
			)
			.returning({ id: predictionMarketArbitrage.id });

		return {
			snapshots: snapshotsResult.length,
			signals: signalsResult.length,
			arbitrage: arbitrageResult.length,
		};
	}

	async getStats(): Promise<{
		snapshotCount: number;
		signalCount: number;
		arbitrageCount: number;
		unresolvedArbitrageCount: number;
		oldestSnapshot: string | null;
		newestSnapshot: string | null;
	}> {
		const [snapshotCount] = await this.db
			.select({ count: count() })
			.from(predictionMarketSnapshots);

		const [signalCount] = await this.db
			.select({ count: count() })
			.from(predictionMarketSignals);

		const [arbitrageCount] = await this.db
			.select({ count: count() })
			.from(predictionMarketArbitrage);

		const [unresolvedCount] = await this.db
			.select({ count: count() })
			.from(predictionMarketArbitrage)
			.where(isNull(predictionMarketArbitrage.resolvedAt));

		const [oldest] = await this.db
			.select({ snapshotTime: sql<Date>`MIN(${predictionMarketSnapshots.snapshotTime})` })
			.from(predictionMarketSnapshots);

		const [newest] = await this.db
			.select({ snapshotTime: sql<Date>`MAX(${predictionMarketSnapshots.snapshotTime})` })
			.from(predictionMarketSnapshots);

		return {
			snapshotCount: snapshotCount?.count ?? 0,
			signalCount: signalCount?.count ?? 0,
			arbitrageCount: arbitrageCount?.count ?? 0,
			unresolvedArbitrageCount: unresolvedCount?.count ?? 0,
			oldestSnapshot: oldest?.snapshotTime?.toISOString() ?? null,
			newestSnapshot: newest?.snapshotTime?.toISOString() ?? null,
		};
	}
}
