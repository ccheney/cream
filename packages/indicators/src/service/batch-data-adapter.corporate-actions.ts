/**
 * Corporate Actions Repository Adapter
 */

import type { CorporateIndicators } from "../types";
import type {
	StorageCorporateActionRow,
	StorageCorporateActionsRepository,
} from "./batch-data-adapter.types";
import { toDateString } from "./batch-data-adapter.types";
import type { CorporateActionsRepository } from "./indicator-service";

/**
 * Adapts StorageCorporateActionsRepository to CorporateActionsRepository interface.
 * Transforms storage row format to CorporateIndicators.
 */
export class CorporateActionsRepositoryAdapter implements CorporateActionsRepository {
	constructor(private repo: StorageCorporateActionsRepository) {}

	async getLatest(symbol: string): Promise<CorporateIndicators | null> {
		const [dividends, splits] = await Promise.all([
			this.repo.getDividends(symbol),
			this.repo.getSplits(symbol),
		]);

		if (dividends.length === 0 && splits.length === 0) {
			return null;
		}

		const today = new Date();
		return {
			trailing_dividend_yield: this.calculateTrailingDividendYield(dividends),
			ex_dividend_days: this.calculateDaysUntilExDividend(dividends, today),
			upcoming_earnings_days: null,
			recent_split: this.hasRecentSplit(splits, today),
		};
	}

	private calculateTrailingDividendYield(dividends: StorageCorporateActionRow[]): number | null {
		if (dividends.length === 0) {
			return null;
		}

		const oneYearAgo = new Date();
		oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
		const oneYearAgoStr = toDateString(oneYearAgo);

		const trailingDividends = dividends.filter((dividend) => dividend.exDate >= oneYearAgoStr);
		if (trailingDividends.length === 0) {
			return null;
		}

		const totalAmount = trailingDividends.reduce(
			(sum, dividend) => sum + (dividend.amount ?? 0),
			0,
		);
		return totalAmount > 0 ? totalAmount : null;
	}

	private calculateDaysUntilExDividend(
		dividends: StorageCorporateActionRow[],
		today: Date,
	): number | null {
		const todayStr = toDateString(today);
		const upcomingDividends = dividends.filter((dividend) => dividend.exDate > todayStr);

		if (upcomingDividends.length === 0) {
			return null;
		}

		const nextExDate = upcomingDividends.at(-1)?.exDate;
		if (!nextExDate) {
			return null;
		}

		const exDate = new Date(nextExDate);
		const diffTime = exDate.getTime() - today.getTime();
		return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
	}

	private hasRecentSplit(splits: StorageCorporateActionRow[], today: Date): boolean {
		if (splits.length === 0) {
			return false;
		}

		const sixMonthsAgo = new Date(today);
		sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
		const sixMonthsAgoStr = toDateString(sixMonthsAgo);

		return splits.some((split) => split.exDate >= sixMonthsAgoStr);
	}
}

/**
 * Create a CorporateActionsRepository adapter from a storage repository.
 */
export function createCorporateActionsRepositoryAdapter(
	repo: StorageCorporateActionsRepository,
): CorporateActionsRepository {
	return new CorporateActionsRepositoryAdapter(repo);
}
