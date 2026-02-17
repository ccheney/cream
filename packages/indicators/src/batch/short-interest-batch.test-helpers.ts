import { mock } from "bun:test";
import type {
	CreateShortInterestInput,
	ShortInterestIndicators,
	ShortInterestRepository,
} from "@cream/storage";
import type {
	FINRAClient,
	FINRAShortInterestRecord,
	SharesOutstandingProvider,
} from "./short-interest-batch.js";

export function createMockFINRARecord(
	overrides: Partial<FINRAShortInterestRecord> = {},
): FINRAShortInterestRecord {
	return {
		symbolCode: "AAPL",
		issueName: "Apple Inc",
		marketClassCode: "NMS",
		settlementDate: "2024-01-15",
		currentShortPositionQuantity: 100000,
		previousShortPositionQuantity: 90000,
		changePreviousNumber: 10000,
		changePercent: 11.11,
		averageDailyVolumeQuantity: 50000,
		daysToCoverQuantity: 2.0,
		stockSplitFlag: null,
		revisionFlag: null,
		...overrides,
	};
}

export function createMockFINRAClient(records: FINRAShortInterestRecord[] = []): FINRAClient {
	return {
		queryShortInterest: mock(() => Promise.resolve(records)),
		getShortInterestBySymbols: mock(() => Promise.resolve(records)),
		getLatestSettlementDate: mock(() => Promise.resolve("2024-01-15")),
	};
}

export function createMockSharesProvider(
	data: Map<string, { sharesOutstanding: number; floatShares: number | null }> = new Map(),
): SharesOutstandingProvider {
	return {
		getSharesData: mock((symbol: string) => Promise.resolve(data.get(symbol) ?? null)),
	};
}

export type MockShortInterestRepository = ShortInterestRepository & {
	upsertCalls: CreateShortInterestInput[];
};

export function createMockRepository(): MockShortInterestRepository {
	const upsertCalls: CreateShortInterestInput[] = [];
	const mockRepo = {
		upsertCalls,
		upsert: mock((input: CreateShortInterestInput) => {
			upsertCalls.push(input);
			return Promise.resolve({
				id: `si_${Date.now()}_mock`,
				symbol: input.symbol,
				settlementDate: input.settlementDate,
				shortInterest: input.shortInterest,
				shortInterestRatio: input.shortInterestRatio ?? null,
				shortPctFloat: input.shortPctFloat ?? null,
				daysToCover: input.daysToCover ?? null,
				shortInterestChange: input.shortInterestChange ?? null,
				source: input.source ?? "FINRA",
				fetchedAt: new Date().toISOString(),
			});
		}),
		findBySymbol: mock(() => Promise.resolve([])),
		findBySymbolAndDate: mock(() => Promise.resolve(null)),
		findLatestBySymbol: mock(() => Promise.resolve(null)),
		create: mock(() => Promise.resolve({} as ShortInterestIndicators)),
		bulkUpsert: mock(() => Promise.resolve(0)),
		findById: mock(() => Promise.resolve(null)),
		update: mock(() => Promise.resolve(null)),
		delete: mock(() => Promise.resolve(false)),
		deleteOlderThan: mock(() => Promise.resolve(0)),
		findAll: mock(() => Promise.resolve([])),
		count: mock(() => Promise.resolve(0)),
		findWithFilters: mock(() =>
			Promise.resolve({
				data: [],
				total: 0,
				page: 1,
				pageSize: 10,
				totalPages: 0,
				hasNext: false,
				hasPrev: false,
			}),
		),
	};

	return mockRepo as unknown as MockShortInterestRepository;
}
