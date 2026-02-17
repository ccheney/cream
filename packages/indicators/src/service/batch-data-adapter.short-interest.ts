/**
 * Short Interest Repository Adapter
 */

import type { ShortInterestIndicators } from "../types";
import type { StorageShortInterestRepository } from "./batch-data-adapter.types";
import type { ShortInterestRepository } from "./indicator-service";

/**
 * Adapts StorageShortInterestRepository to ShortInterestRepository interface.
 * Transforms storage row format to ShortInterestIndicators.
 */
export class ShortInterestRepositoryAdapter implements ShortInterestRepository {
	constructor(private repo: StorageShortInterestRepository) {}

	async getLatest(symbol: string): Promise<ShortInterestIndicators | null> {
		const row = await this.repo.findLatestBySymbol(symbol);
		if (!row) {
			return null;
		}

		return {
			short_interest_ratio: row.shortInterestRatio,
			days_to_cover: row.daysToCover,
			short_pct_float: row.shortPctFloat,
			short_interest_change: row.shortInterestChange,
			settlement_date: row.settlementDate,
		};
	}
}

/**
 * Create a ShortInterestRepository adapter from a storage repository.
 */
export function createShortInterestRepositoryAdapter(
	repo: StorageShortInterestRepository,
): ShortInterestRepository {
	return new ShortInterestRepositoryAdapter(repo);
}
