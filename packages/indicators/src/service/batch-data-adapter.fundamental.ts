/**
 * Fundamental Repository Adapter
 */

import type { QualityIndicators, ValueIndicators } from "../types";
import type {
	StorageFundamentalRow,
	StorageFundamentalsRepository,
} from "./batch-data-adapter.types";
import type { FundamentalRepository } from "./indicator-service";

/**
 * Adapts StorageFundamentalsRepository to FundamentalRepository interface.
 * Transforms storage row format to ValueIndicators + QualityIndicators.
 */
export class FundamentalRepositoryAdapter implements FundamentalRepository {
	constructor(private repo: StorageFundamentalsRepository) {}

	async getLatest(
		symbol: string,
	): Promise<{ value: ValueIndicators; quality: QualityIndicators } | null> {
		const row = await this.repo.findLatestBySymbol(symbol);
		if (!row) {
			return null;
		}

		return this.mapRowToIndicators(row);
	}

	private mapRowToIndicators(row: StorageFundamentalRow): {
		value: ValueIndicators;
		quality: QualityIndicators;
	} {
		return {
			value: {
				pe_ratio_ttm: row.peRatioTtm,
				pe_ratio_forward: row.peRatioForward,
				pb_ratio: row.pbRatio,
				ev_ebitda: row.evEbitda,
				earnings_yield: row.earningsYield,
				dividend_yield: row.dividendYield,
				cape_10yr: row.cape10yr,
			},
			quality: {
				gross_profitability: row.grossProfitability,
				roe: row.roe,
				roa: row.roa,
				asset_growth: row.assetGrowth,
				accruals_ratio: row.accrualsRatio,
				cash_flow_quality: row.cashFlowQuality,
				beneish_m_score: row.beneishMScore,
				earnings_quality: null,
			},
		};
	}
}

/**
 * Create a FundamentalRepository adapter from a storage repository.
 */
export function createFundamentalRepositoryAdapter(
	repo: StorageFundamentalsRepository,
): FundamentalRepository {
	return new FundamentalRepositoryAdapter(repo);
}
