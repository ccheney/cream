import type {
	StorageCorporateActionRow,
	StorageCorporateActionsRepository,
	StorageFundamentalRow,
	StorageFundamentalsRepository,
	StorageSentimentRepository,
	StorageSentimentRow,
	StorageShortInterestRepository,
	StorageShortInterestRow,
} from "./batch-data-adapter";

export function createMockFundamentalsRepo(
	data: Map<string, StorageFundamentalRow>,
): StorageFundamentalsRepository {
	return {
		async findLatestBySymbol(symbol: string) {
			return data.get(symbol) ?? null;
		},
	};
}

export function createMockShortInterestRepo(
	data: Map<string, StorageShortInterestRow>,
): StorageShortInterestRepository {
	return {
		async findLatestBySymbol(symbol: string) {
			return data.get(symbol) ?? null;
		},
	};
}

export function createMockSentimentRepo(
	data: Map<string, StorageSentimentRow>,
): StorageSentimentRepository {
	return {
		async findLatestBySymbol(symbol: string) {
			return data.get(symbol) ?? null;
		},
	};
}

export function createMockCorporateActionsRepo(
	dividends: Map<string, StorageCorporateActionRow[]>,
	splits: Map<string, StorageCorporateActionRow[]>,
): StorageCorporateActionsRepository {
	return {
		async getForSymbol(symbol: string) {
			return [...(dividends.get(symbol) ?? []), ...(splits.get(symbol) ?? [])];
		},
		async getDividends(symbol: string) {
			return dividends.get(symbol) ?? [];
		},
		async getSplits(symbol: string) {
			return splits.get(symbol) ?? [];
		},
	};
}
