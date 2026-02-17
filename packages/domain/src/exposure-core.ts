import { z } from "zod";
import type { Position } from "./execution";

/** Bucket key for aggregating exposures */
export type ExposureBucket = "total" | "instrument_type" | "sector" | "strategy" | "asset_class";

/** Position with optional metadata for bucketing */
export interface PositionWithMetadata {
	/** The base position data */
	position: Position;
	/** Optional sector classification (e.g., "Technology", "Healthcare") */
	sector?: string;
	/** Optional strategy identifier (e.g., "momentum", "mean_reversion") */
	strategy?: string;
	/** Optional asset class (e.g., "equity", "fixed_income") */
	assetClass?: string;
}

/** Exposure values in different units */
export interface ExposureValues {
	/** Exposure in number of units (shares/contracts) */
	units: number;
	/** Exposure in notional value (dollars) */
	notional: number;
	/** Exposure as percentage of equity (0-1, e.g., 0.70 = 70%) */
	pctEquity: number;
}

/** Gross and net exposure pair */
export interface ExposurePair {
	/** Gross exposure (sum of absolute values) */
	gross: ExposureValues;
	/** Net exposure (long - short) */
	net: ExposureValues;
	/** Long exposure */
	long: ExposureValues;
	/** Short exposure */
	short: ExposureValues;
}

/** Bucketed exposure results */
export interface BucketedExposure {
	/** Bucket type used for grouping */
	bucketType: ExposureBucket;
	/** Total exposure across all positions */
	total: ExposurePair;
	/** Breakdown by bucket key */
	breakdown: Map<string, ExposurePair>;
}

/** Simple exposure stats without bucketing */
export interface ExposureStats {
	/** Total gross exposure (notional) */
	grossExposureNotional: number;
	/** Total net exposure (notional) */
	netExposureNotional: number;
	/** Gross exposure as % of equity */
	grossExposurePctEquity: number;
	/** Net exposure as % of equity */
	netExposurePctEquity: number;
	/** Long exposure (notional) */
	longExposureNotional: number;
	/** Short exposure (notional) */
	shortExposureNotional: number;
	/** Number of long positions */
	longPositionCount: number;
	/** Number of short positions */
	shortPositionCount: number;
	/** Total position count */
	totalPositionCount: number;
}

export const ExposureValuesSchema = z.object({
	units: z.number(),
	notional: z.number(),
	pctEquity: z.number(),
});

export const ExposurePairSchema = z.object({
	gross: ExposureValuesSchema,
	net: ExposureValuesSchema,
	long: ExposureValuesSchema,
	short: ExposureValuesSchema,
});

export const ExposureStatsSchema = z.object({
	grossExposureNotional: z.number().nonnegative(),
	netExposureNotional: z.number(),
	grossExposurePctEquity: z.number().nonnegative(),
	netExposurePctEquity: z.number(),
	longExposureNotional: z.number().nonnegative(),
	shortExposureNotional: z.number().nonnegative(),
	longPositionCount: z.number().int().nonnegative(),
	shortPositionCount: z.number().int().nonnegative(),
	totalPositionCount: z.number().int().nonnegative(),
});

function assertPositiveEquity(accountEquity: number): void {
	if (accountEquity <= 0) {
		throw new Error("accountEquity must be positive");
	}
}

/**
 * Calculate exposure statistics for a portfolio.
 */
export function calculateExposureStats(
	positions: Position[],
	accountEquity: number,
): ExposureStats {
	assertPositiveEquity(accountEquity);

	let longNotional = 0;
	let shortNotional = 0;
	let longCount = 0;
	let shortCount = 0;

	for (const pos of positions) {
		const notional = Math.abs(pos.marketValue);

		if (pos.quantity > 0) {
			longNotional += notional;
			longCount++;
		} else if (pos.quantity < 0) {
			shortNotional += notional;
			shortCount++;
		}
	}

	const grossNotional = longNotional + shortNotional;
	const netNotional = longNotional - shortNotional;

	return {
		grossExposureNotional: grossNotional,
		netExposureNotional: netNotional,
		grossExposurePctEquity: grossNotional / accountEquity,
		netExposurePctEquity: netNotional / accountEquity,
		longExposureNotional: longNotional,
		shortExposureNotional: shortNotional,
		longPositionCount: longCount,
		shortPositionCount: shortCount,
		totalPositionCount: longCount + shortCount,
	};
}

/**
 * Calculate exposure pair (gross/net/long/short) from positions.
 */
export function calculateExposurePair(positions: Position[], accountEquity: number): ExposurePair {
	assertPositiveEquity(accountEquity);

	let longUnits = 0;
	let shortUnits = 0;
	let longNotional = 0;
	let shortNotional = 0;

	for (const pos of positions) {
		const notional = Math.abs(pos.marketValue);
		const units = Math.abs(pos.quantity);

		if (pos.quantity > 0) {
			longUnits += units;
			longNotional += notional;
		} else if (pos.quantity < 0) {
			shortUnits += units;
			shortNotional += notional;
		}
	}

	const grossUnits = longUnits + shortUnits;
	const grossNotional = longNotional + shortNotional;
	const netUnits = longUnits - shortUnits;
	const netNotional = longNotional - shortNotional;

	return {
		gross: {
			units: grossUnits,
			notional: grossNotional,
			pctEquity: grossNotional / accountEquity,
		},
		net: {
			units: netUnits,
			notional: netNotional,
			pctEquity: netNotional / accountEquity,
		},
		long: {
			units: longUnits,
			notional: longNotional,
			pctEquity: longNotional / accountEquity,
		},
		short: {
			units: shortUnits,
			notional: shortNotional,
			pctEquity: shortNotional / accountEquity,
		},
	};
}

/**
 * Calculate exposure bucketed by instrument type.
 */
export function calculateExposureByInstrumentType(
	positions: Position[],
	accountEquity: number,
): BucketedExposure {
	assertPositiveEquity(accountEquity);

	const buckets = new Map<string, Position[]>();

	for (const pos of positions) {
		const key = pos.instrument.instrumentType;
		const existing = buckets.get(key) ?? [];
		existing.push(pos);
		buckets.set(key, existing);
	}

	const breakdown = new Map<string, ExposurePair>();
	for (const [key, bucketPositions] of buckets) {
		breakdown.set(key, calculateExposurePair(bucketPositions, accountEquity));
	}

	return {
		bucketType: "instrument_type",
		total: calculateExposurePair(positions, accountEquity),
		breakdown,
	};
}

function resolveBucketKey(
	bucketType: "sector" | "strategy" | "asset_class",
	position: PositionWithMetadata,
): string {
	switch (bucketType) {
		case "sector":
			return position.sector ?? "Unknown";
		case "strategy":
			return position.strategy ?? "Unknown";
		case "asset_class":
			return position.assetClass ?? "Unknown";
	}
}

/**
 * Calculate exposure bucketed by a custom field.
 */
export function calculateExposureByBucket(
	positions: PositionWithMetadata[],
	accountEquity: number,
	bucketType: "sector" | "strategy" | "asset_class",
): BucketedExposure {
	assertPositiveEquity(accountEquity);

	const buckets = new Map<string, Position[]>();

	for (const position of positions) {
		const key = resolveBucketKey(bucketType, position);
		const existing = buckets.get(key) ?? [];
		existing.push(position.position);
		buckets.set(key, existing);
	}

	const allPositions = positions.map((position) => position.position);
	const breakdown = new Map<string, ExposurePair>();
	for (const [key, bucketPositions] of buckets) {
		breakdown.set(key, calculateExposurePair(bucketPositions, accountEquity));
	}

	return {
		bucketType,
		total: calculateExposurePair(allPositions, accountEquity),
		breakdown,
	};
}

/**
 * Calculate exposure by sector.
 */
export function calculateExposureBySector(
	positions: PositionWithMetadata[],
	accountEquity: number,
): BucketedExposure {
	return calculateExposureByBucket(positions, accountEquity, "sector");
}

/**
 * Calculate exposure by strategy.
 */
export function calculateExposureByStrategy(
	positions: PositionWithMetadata[],
	accountEquity: number,
): BucketedExposure {
	return calculateExposureByBucket(positions, accountEquity, "strategy");
}

/**
 * Calculate exposure by asset class.
 */
export function calculateExposureByAssetClass(
	positions: PositionWithMetadata[],
	accountEquity: number,
): BucketedExposure {
	return calculateExposureByBucket(positions, accountEquity, "asset_class");
}
