/**
 * Batch Data Adapter
 *
 * Adapts storage repositories to interfaces expected by IndicatorService.
 */

import { createCorporateActionsRepositoryAdapter } from "./batch-data-adapter.corporate-actions";
import { createFundamentalRepositoryAdapter } from "./batch-data-adapter.fundamental";
import { createSentimentRepositoryAdapter } from "./batch-data-adapter.sentiment";
import { createShortInterestRepositoryAdapter } from "./batch-data-adapter.short-interest";
import type { BatchRepositoryAdapters, StorageRepositories } from "./batch-data-adapter.types";

export {
	CorporateActionsRepositoryAdapter,
	createCorporateActionsRepositoryAdapter,
} from "./batch-data-adapter.corporate-actions";
export {
	createFundamentalRepositoryAdapter,
	FundamentalRepositoryAdapter,
} from "./batch-data-adapter.fundamental";
export {
	createSentimentRepositoryAdapter,
	SentimentRepositoryAdapter,
} from "./batch-data-adapter.sentiment";
export {
	createShortInterestRepositoryAdapter,
	ShortInterestRepositoryAdapter,
} from "./batch-data-adapter.short-interest";
export type {
	BatchRepositoryAdapters,
	StorageCorporateActionRow,
	StorageCorporateActionsRepository,
	StorageFundamentalRow,
	StorageFundamentalsRepository,
	StorageRepositories,
	StorageSentimentRepository,
	StorageSentimentRow,
	StorageShortInterestRepository,
	StorageShortInterestRow,
} from "./batch-data-adapter.types";

/**
 * Create all batch repository adapters from storage repositories.
 * Only creates adapters for repositories that are provided.
 */
export function createBatchRepositoryAdapters(repos: StorageRepositories): BatchRepositoryAdapters {
	const adapters: BatchRepositoryAdapters = {};

	if (repos.fundamentals) {
		adapters.fundamentalRepo = createFundamentalRepositoryAdapter(repos.fundamentals);
	}
	if (repos.shortInterest) {
		adapters.shortInterestRepo = createShortInterestRepositoryAdapter(repos.shortInterest);
	}
	if (repos.sentiment) {
		adapters.sentimentRepo = createSentimentRepositoryAdapter(repos.sentiment);
	}
	if (repos.corporateActions) {
		adapters.corporateActionsRepo = createCorporateActionsRepositoryAdapter(repos.corporateActions);
	}

	return adapters;
}
