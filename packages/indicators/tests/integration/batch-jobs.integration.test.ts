/**
 * Batch Jobs Integration Tests
 *
 * Tests the full batch job pipeline with real database using in-memory SQLite.
 * External API clients are mocked, but repositories are real.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.NODE_ENV = "test";

import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	CorporateActionsRepository,
	createInMemoryClient,
	FundamentalsRepository,
	runMigrations,
	SentimentRepository,
	ShortInterestRepository,
	type TursoClient,
} from "@cream/storage";
import {
	type AlpacaCorporateAction,
	type AlpacaCorporateActionsClient,
	CorporateActionsBatchJob,
} from "../../src/batch/corporate-actions-batch.js";
import {
	type FMPBalanceSheet,
	type FMPCashFlowStatement,
	type FMPCompanyProfile,
	type FMPIncomeStatement,
	type FMPKeyMetrics,
	FundamentalsBatchJob,
	type FundamentalsFMPClient,
} from "../../src/batch/fundamentals-batch.js";
import {
	type ExtractedSentiment,
	SentimentAggregationJob,
	type SentimentDataProvider,
} from "../../src/batch/sentiment-batch.js";
import {
	type FINRAClient,
	type FINRAShortInterestRecord,
	type SharesOutstandingProvider,
	ShortInterestBatchJob,
} from "../../src/batch/short-interest-batch.js";

// ============================================
// Test Data Factories
// ============================================

function createMockKeyMetrics(symbol: string, overrides?: Partial<FMPKeyMetrics>): FMPKeyMetrics {
	return {
		symbol,
		date: "2024-09-28",
		calendarYear: "2024",
		period: "FY",
		peRatio: 28.5,
		priceToSalesRatio: 7.5,
		pbRatio: 45.2,
		enterpriseValueOverEBITDA: 22.3,
		earningsYield: 0.035,
		dividendYield: 0.005,
		roe: 1.65,
		returnOnAssets: 0.26,
		marketCap: 3500000000000,
		...overrides,
	};
}

function createMockIncomeStatement(
	symbol: string,
	overrides?: Partial<FMPIncomeStatement>
): FMPIncomeStatement {
	return {
		symbol,
		date: "2024-09-28",
		calendarYear: "2024",
		period: "FY",
		revenue: 391000000000,
		costOfRevenue: 214000000000,
		grossProfit: 177000000000,
		netIncome: 94000000000,
		operatingIncome: 119000000000,
		depreciationAndAmortization: 11000000000,
		...overrides,
	};
}

function createMockBalanceSheet(
	symbol: string,
	overrides?: Partial<FMPBalanceSheet>
): FMPBalanceSheet {
	return {
		symbol,
		date: "2024-09-28",
		calendarYear: "2024",
		period: "FY",
		totalAssets: 365000000000,
		totalCurrentAssets: 153000000000,
		totalCurrentLiabilities: 176000000000,
		totalStockholdersEquity: 57000000000,
		inventory: 7300000000,
		netReceivables: 66000000000,
		accountPayables: 69000000000,
		propertyPlantEquipmentNet: 46000000000,
		...overrides,
	};
}

function createMockCashFlowStatement(
	symbol: string,
	overrides?: Partial<FMPCashFlowStatement>
): FMPCashFlowStatement {
	return {
		symbol,
		date: "2024-09-28",
		calendarYear: "2024",
		period: "FY",
		operatingCashFlow: 118000000000,
		netIncome: 94000000000,
		depreciationAndAmortization: 11000000000,
		capitalExpenditure: -9400000000,
		...overrides,
	};
}

function createMockProfile(
	symbol: string,
	overrides?: Partial<FMPCompanyProfile>
): FMPCompanyProfile {
	return {
		symbol,
		companyName: `${symbol} Inc.`,
		sector: "Technology",
		industry: "Consumer Electronics",
		mktCap: 3500000000000,
		price: 230,
		...overrides,
	};
}

function createMockFINRARecord(
	symbol: string,
	overrides?: Partial<FINRAShortInterestRecord>
): FINRAShortInterestRecord {
	return {
		symbolCode: symbol,
		issueName: `${symbol} Inc Common Stock`,
		marketClassCode: "NMS",
		currentShortPositionQuantity: 50000000,
		previousShortPositionQuantity: 45000000,
		changePreviousNumber: 5000000,
		changePercent: 11.11,
		averageDailyVolumeQuantity: 100000000,
		daysToCoverQuantity: 0.5,
		stockSplitFlag: null,
		revisionFlag: null,
		settlementDate: "2024-01-15",
		...overrides,
	};
}

function createMockSentiment(
	symbol: string,
	overrides?: Partial<ExtractedSentiment>
): ExtractedSentiment {
	return {
		symbol,
		sourceType: "news",
		sentiment: "bullish",
		confidence: 0.85,
		eventTime: new Date("2024-01-15T10:00:00Z"),
		...overrides,
	};
}

function createMockCorporateAction(
	symbol: string,
	type: "dividend" | "split",
	overrides?: Partial<AlpacaCorporateAction>
): AlpacaCorporateAction {
	if (type === "dividend") {
		return {
			corporate_action_type: "Dividend",
			symbol,
			ex_date: "2024-01-20",
			record_date: "2024-01-15",
			payment_date: "2024-01-25",
			value: 0.24,
			description: `${symbol} quarterly dividend`,
			...overrides,
		} as AlpacaCorporateAction;
	} else {
		return {
			corporate_action_type: "Split",
			symbol,
			ex_date: "2024-01-20",
			record_date: "2024-01-15",
			payment_date: null,
			value: 4, // 4:1 split
			description: `${symbol} stock split`,
			...overrides,
		} as AlpacaCorporateAction;
	}
}

// ============================================
// Mock Factory Functions
// ============================================

function createMockFMPClient(
	data: Map<
		string,
		{
			metrics: FMPKeyMetrics;
			income: FMPIncomeStatement;
			balance: FMPBalanceSheet;
			cashFlow: FMPCashFlowStatement;
			profile: FMPCompanyProfile;
		}
	>
): FundamentalsFMPClient {
	return {
		getKeyMetrics: mock(async (symbol: string) => {
			const d = data.get(symbol);
			return d ? [d.metrics] : [];
		}),
		getIncomeStatement: mock(async (symbol: string) => {
			const d = data.get(symbol);
			return d ? [d.income] : [];
		}),
		getBalanceSheet: mock(async (symbol: string) => {
			const d = data.get(symbol);
			return d ? [d.balance] : [];
		}),
		getCashFlowStatement: mock(async (symbol: string) => {
			const d = data.get(symbol);
			return d ? [d.cashFlow] : [];
		}),
		getCompanyProfile: mock(async (symbol: string) => data.get(symbol)?.profile ?? null),
	};
}

function createMockFINRAClient(records: FINRAShortInterestRecord[]): FINRAClient {
	return {
		queryShortInterest: mock(async () => records),
		getShortInterestBySymbols: mock(async (symbols: string[]) => {
			return records.filter((r) => symbols.includes(r.symbolCode));
		}),
		getLatestSettlementDate: mock(async () => "2024-01-15"),
	};
}

function createMockSharesProvider(
	data: Map<string, { sharesOutstanding: number; floatShares: number | null }>
): SharesOutstandingProvider {
	return {
		getSharesData: mock(async (symbol: string) => data.get(symbol) ?? null),
	};
}

function createMockSentimentProvider(sentimentData: ExtractedSentiment[]): SentimentDataProvider {
	return {
		getSentimentData: mock(async () => sentimentData),
		getHistoricalSentiment: mock(async () => []),
	};
}

function createMockAlpacaClient(actions: AlpacaCorporateAction[]): AlpacaCorporateActionsClient {
	return {
		getCorporateActions: mock(async () => actions),
		getCorporateActionsForSymbols: mock(async (symbols: string[]) => {
			return actions.filter((a) => symbols.includes(a.symbol));
		}),
	};
}

// ============================================
// Test Suite
// ============================================

describe("Batch Jobs Integration Tests", () => {
	let client: TursoClient;

	beforeAll(async () => {
		// Create fresh in-memory database with migrations
		client = await createInMemoryClient();
		await runMigrations(client, { logger: () => {} });
	});

	afterAll(() => {
		client.close();
	});

	// ============================================
	// FundamentalsBatchJob Integration Tests
	// ============================================

	describe("FundamentalsBatchJob Integration", () => {
		let repo: FundamentalsRepository;

		beforeEach(async () => {
			// Fresh database for each test
			client.close();
			client = await createInMemoryClient();
			await runMigrations(client, { logger: () => {} });
			repo = new FundamentalsRepository(client);
		});

		it("processes symbols and stores fundamentals in database", async () => {
			const symbols = ["AAPL", "MSFT"];
			const mockData = new Map(
				symbols.map((s) => [
					s,
					{
						metrics: createMockKeyMetrics(s),
						income: createMockIncomeStatement(s),
						balance: createMockBalanceSheet(s),
						cashFlow: createMockCashFlowStatement(s),
						profile: createMockProfile(s),
					},
				])
			);

			const mockClient = createMockFMPClient(mockData);
			const job = new FundamentalsBatchJob(mockClient, repo, { rateLimitDelayMs: 0 });

			const result = await job.run(symbols);

			expect(result.processed).toBe(2);
			expect(result.failed).toBe(0);
			expect(result.errors).toHaveLength(0);

			// Verify data was stored
			const aaplData = await repo.findLatestBySymbol("AAPL");
			expect(aaplData).not.toBeNull();
			expect(aaplData!.symbol).toBe("AAPL");
			expect(aaplData!.peRatioTtm).toBeCloseTo(28.5, 1);
			expect(aaplData!.pbRatio).toBeCloseTo(45.2, 1);
			expect(aaplData!.sector).toBe("Technology");

			const msftData = await repo.findLatestBySymbol("MSFT");
			expect(msftData).not.toBeNull();
			expect(msftData!.symbol).toBe("MSFT");
		});

		it("calculates quality factors correctly and stores them", async () => {
			const mockData = new Map([
				[
					"AAPL",
					{
						metrics: createMockKeyMetrics("AAPL"),
						income: createMockIncomeStatement("AAPL", {
							revenue: 100000,
							costOfRevenue: 40000, // 60% gross margin
						}),
						balance: createMockBalanceSheet("AAPL", {
							totalAssets: 200000,
						}),
						cashFlow: createMockCashFlowStatement("AAPL"),
						profile: createMockProfile("AAPL"),
					},
				],
			]);

			const mockClient = createMockFMPClient(mockData);
			const job = new FundamentalsBatchJob(mockClient, repo, { rateLimitDelayMs: 0 });

			await job.run(["AAPL"]);

			const data = await repo.findLatestBySymbol("AAPL");
			expect(data).not.toBeNull();
			// Gross profitability = (100000 - 40000) / 200000 = 0.30
			expect(data!.grossProfitability).toBeCloseTo(0.3, 2);
		});

		it("handles partial failures gracefully", async () => {
			const mockData = new Map([
				[
					"AAPL",
					{
						metrics: createMockKeyMetrics("AAPL"),
						income: createMockIncomeStatement("AAPL"),
						balance: createMockBalanceSheet("AAPL"),
						cashFlow: createMockCashFlowStatement("AAPL"),
						profile: createMockProfile("AAPL"),
					},
				],
				// MSFT not in map - will return null
			]);

			const mockClient = createMockFMPClient(mockData);
			const job = new FundamentalsBatchJob(mockClient, repo, {
				rateLimitDelayMs: 0,
				continueOnError: true,
			});

			const result = await job.run(["AAPL", "MSFT"]);

			expect(result.processed).toBe(1);
			expect(result.failed).toBe(1);

			// AAPL should be stored
			const aaplData = await repo.findLatestBySymbol("AAPL");
			expect(aaplData).not.toBeNull();

			// MSFT should not exist
			const msftData = await repo.findLatestBySymbol("MSFT");
			expect(msftData).toBeNull();
		});

		it("updates existing records on re-run (upsert)", async () => {
			const initialData = new Map([
				[
					"AAPL",
					{
						metrics: createMockKeyMetrics("AAPL", { peRatio: 25.0 }),
						income: createMockIncomeStatement("AAPL"),
						balance: createMockBalanceSheet("AAPL"),
						cashFlow: createMockCashFlowStatement("AAPL"),
						profile: createMockProfile("AAPL"),
					},
				],
			]);

			const mockClient = createMockFMPClient(initialData);
			const job = new FundamentalsBatchJob(mockClient, repo, { rateLimitDelayMs: 0 });

			// First run
			await job.run(["AAPL"]);
			const firstRun = await repo.findLatestBySymbol("AAPL");
			expect(firstRun!.peRatioTtm).toBeCloseTo(25.0, 1);

			// Update mock data
			const updatedData = new Map([
				[
					"AAPL",
					{
						metrics: createMockKeyMetrics("AAPL", { peRatio: 30.0 }),
						income: createMockIncomeStatement("AAPL"),
						balance: createMockBalanceSheet("AAPL"),
						cashFlow: createMockCashFlowStatement("AAPL"),
						profile: createMockProfile("AAPL"),
					},
				],
			]);

			const updatedClient = createMockFMPClient(updatedData);
			const job2 = new FundamentalsBatchJob(updatedClient, repo, { rateLimitDelayMs: 0 });

			// Second run (upsert)
			await job2.run(["AAPL"]);
			const secondRun = await repo.findLatestBySymbol("AAPL");
			expect(secondRun!.peRatioTtm).toBeCloseTo(30.0, 1);
		});
	});

	// ============================================
	// ShortInterestBatchJob Integration Tests
	// ============================================

	describe("ShortInterestBatchJob Integration", () => {
		let repo: ShortInterestRepository;

		beforeEach(async () => {
			client.close();
			client = await createInMemoryClient();
			await runMigrations(client, { logger: () => {} });
			repo = new ShortInterestRepository(client);
		});

		it("processes symbols and stores short interest in database", async () => {
			const symbols = ["AAPL", "MSFT"];
			const records = symbols.map((s) => createMockFINRARecord(s));
			const sharesData = new Map(
				symbols.map((s) => [s, { sharesOutstanding: 15000000000, floatShares: 14000000000 }])
			);

			const mockFinra = createMockFINRAClient(records);
			const mockShares = createMockSharesProvider(sharesData);
			const job = new ShortInterestBatchJob(mockFinra, repo, mockShares, { rateLimitDelayMs: 0 });

			const result = await job.run(symbols);

			expect(result.processed).toBe(2);
			expect(result.failed).toBe(0);

			// Verify data was stored
			const aaplData = await repo.findLatestBySymbol("AAPL");
			expect(aaplData).not.toBeNull();
			expect(aaplData!.symbol).toBe("AAPL");
			expect(aaplData!.shortInterest).toBe(50000000);
			expect(aaplData!.settlementDate).toBe("2024-01-15");

			const msftData = await repo.findLatestBySymbol("MSFT");
			expect(msftData).not.toBeNull();
		});

		it("calculates short % of float correctly", async () => {
			const records = [createMockFINRARecord("AAPL", { currentShortPositionQuantity: 1000000 })];
			const sharesData = new Map([["AAPL", { sharesOutstanding: 10000000, floatShares: 5000000 }]]);

			const mockFinra = createMockFINRAClient(records);
			const mockShares = createMockSharesProvider(sharesData);
			const job = new ShortInterestBatchJob(mockFinra, repo, mockShares, { rateLimitDelayMs: 0 });

			await job.run(["AAPL"]);

			const data = await repo.findLatestBySymbol("AAPL");
			expect(data).not.toBeNull();
			// Short % of float = 1,000,000 / 5,000,000 = 0.20 = 20%
			expect(data!.shortPctFloat).toBeCloseTo(0.2, 2);
		});

		it("handles missing shares data gracefully", async () => {
			const records = [createMockFINRARecord("AAPL")];
			const sharesData = new Map<
				string,
				{ sharesOutstanding: number; floatShares: number | null }
			>();

			const mockFinra = createMockFINRAClient(records);
			const mockShares = createMockSharesProvider(sharesData);
			const job = new ShortInterestBatchJob(mockFinra, repo, mockShares, { rateLimitDelayMs: 0 });

			const result = await job.run(["AAPL"]);

			expect(result.processed).toBe(1);

			const data = await repo.findLatestBySymbol("AAPL");
			expect(data).not.toBeNull();
			expect(data!.shortInterest).toBe(50000000);
			expect(data!.shortPctFloat).toBeNull(); // No float data available
		});

		it("batches symbols correctly for large universes", async () => {
			const symbols = Array.from({ length: 150 }, (_, i) => `SYM${i.toString().padStart(3, "0")}`);
			const records = symbols.map((s) => createMockFINRARecord(s));
			const sharesData = new Map(
				symbols.map((s) => [s, { sharesOutstanding: 1000000000, floatShares: 900000000 }])
			);

			const mockFinra = createMockFINRAClient(records);
			const mockShares = createMockSharesProvider(sharesData);
			const job = new ShortInterestBatchJob(mockFinra, repo, mockShares, {
				rateLimitDelayMs: 0,
				batchSize: 50,
			});

			const result = await job.run(symbols);

			expect(result.processed).toBe(150);
			// Should have made 3 API calls (50 + 50 + 50)
			expect(mockFinra.getShortInterestBySymbols).toHaveBeenCalledTimes(3);
		});
	});

	// ============================================
	// SentimentAggregationJob Integration Tests
	// ============================================

	describe("SentimentAggregationJob Integration", () => {
		let repo: SentimentRepository;

		beforeEach(async () => {
			client.close();
			client = await createInMemoryClient();
			await runMigrations(client, { logger: () => {} });
			repo = new SentimentRepository(client);
		});

		it("processes symbols and stores aggregated sentiment in database", async () => {
			const sentimentData = [
				createMockSentiment("AAPL", { sentiment: "bullish", confidence: 0.9 }),
				createMockSentiment("AAPL", { sentiment: "bullish", confidence: 0.8 }),
				createMockSentiment("MSFT", { sentiment: "neutral", confidence: 0.7 }),
			];

			const mockProvider = createMockSentimentProvider(sentimentData);
			const job = new SentimentAggregationJob(mockProvider, repo, { rateLimitDelayMs: 0 });

			const result = await job.run(["AAPL", "MSFT"], "2024-01-15");

			expect(result.processed).toBe(2);
			expect(result.failed).toBe(0);

			// Verify data was stored
			const aaplData = await repo.findBySymbolAndDate("AAPL", "2024-01-15");
			expect(aaplData).not.toBeNull();
			expect(aaplData!.symbol).toBe("AAPL");
			expect(aaplData!.sentimentScore).toBeGreaterThan(0); // Bullish = positive

			const msftData = await repo.findBySymbolAndDate("MSFT", "2024-01-15");
			expect(msftData).not.toBeNull();
		});

		it("calculates sentiment strength correctly", async () => {
			const sentimentData = [
				createMockSentiment("AAPL", { sentiment: "bullish", confidence: 0.95 }),
				createMockSentiment("AAPL", { sentiment: "bullish", confidence: 0.9 }),
				createMockSentiment("AAPL", { sentiment: "bullish", confidence: 0.85 }),
			];

			const mockProvider = createMockSentimentProvider(sentimentData);
			const job = new SentimentAggregationJob(mockProvider, repo, { rateLimitDelayMs: 0 });

			await job.run(["AAPL"], "2024-01-15");

			const data = await repo.findBySymbolAndDate("AAPL", "2024-01-15");
			expect(data).not.toBeNull();
			// High confidence scores should result in high strength
			expect(data!.sentimentStrength).toBeGreaterThan(0.5);
		});

		it("handles symbols with no sentiment data", async () => {
			const sentimentData: ExtractedSentiment[] = []; // No data for any symbol

			const mockProvider = createMockSentimentProvider(sentimentData);
			const job = new SentimentAggregationJob(mockProvider, repo, { rateLimitDelayMs: 0 });

			const result = await job.run(["AAPL"], "2024-01-15");

			// Symbol processed but with null/default values
			expect(result.processed).toBe(1);
		});

		it("detects event risk flags", async () => {
			const sentimentData = [
				createMockSentiment("AAPL", {
					sentiment: "bullish",
					confidence: 0.9,
					eventType: "earnings",
					importance: 5, // High importance earnings event triggers risk flag
				}),
			];

			const mockProvider = createMockSentimentProvider(sentimentData);
			const job = new SentimentAggregationJob(mockProvider, repo, { rateLimitDelayMs: 0 });

			await job.run(["AAPL"], "2024-01-15");

			const data = await repo.findBySymbolAndDate("AAPL", "2024-01-15");
			expect(data).not.toBeNull();
			// earnings eventType with importance >= 3 should trigger event risk flag
			expect(data!.eventRiskFlag).toBe(true);
		});
	});

	// ============================================
	// CorporateActionsBatchJob Integration Tests
	// ============================================

	describe("CorporateActionsBatchJob Integration", () => {
		let repo: CorporateActionsRepository;

		beforeEach(async () => {
			client.close();
			client = await createInMemoryClient();
			await runMigrations(client, { logger: () => {} });
			repo = new CorporateActionsRepository(client);
		});

		it("processes symbols and stores corporate actions in database", async () => {
			const actions = [
				createMockCorporateAction("AAPL", "dividend"),
				createMockCorporateAction("MSFT", "dividend"),
				createMockCorporateAction("AAPL", "split"),
			];

			const mockClient = createMockAlpacaClient(actions);
			const job = new CorporateActionsBatchJob(mockClient, repo, undefined, {
				rateLimitDelayMs: 0,
			});

			const result = await job.run(["AAPL", "MSFT"]);

			expect(result.processed).toBe(2);
			expect(result.failed).toBe(0);

			// Verify dividend actions were stored
			const aaplActions = await repo.getForSymbol("AAPL");
			expect(aaplActions.length).toBeGreaterThanOrEqual(1);
		});

		it("correctly categorizes dividend and split actions", async () => {
			const actions = [
				createMockCorporateAction("AAPL", "dividend", { value: 0.25 }),
				createMockCorporateAction("TSLA", "split", { value: 3 }),
			];

			const mockClient = createMockAlpacaClient(actions);
			const job = new CorporateActionsBatchJob(mockClient, repo, undefined, {
				rateLimitDelayMs: 0,
			});

			await job.run(["AAPL", "TSLA"]);

			// Verify AAPL dividend
			const aaplActions = await repo.getForSymbol("AAPL");
			const aaplDividend = aaplActions.find((a) => a.actionType === "dividend");
			expect(aaplDividend).not.toBeUndefined();
			expect(aaplDividend!.amount).toBeCloseTo(0.25, 2);

			// Verify TSLA split
			const tslaActions = await repo.getForSymbol("TSLA");
			const tslaSplit = tslaActions.find((a) => a.actionType === "split");
			expect(tslaSplit).not.toBeUndefined();
		});

		it("handles symbols with no corporate actions", async () => {
			const actions: AlpacaCorporateAction[] = []; // No actions

			const mockClient = createMockAlpacaClient(actions);
			const job = new CorporateActionsBatchJob(mockClient, repo, undefined, {
				rateLimitDelayMs: 0,
			});

			const result = await job.run(["AAPL"]);

			// Should process without errors
			expect(result.processed).toBe(1);
			expect(result.failed).toBe(0);
		});
	});

	// ============================================
	// Cross-Job Integration Tests
	// ============================================

	describe("Cross-Job Integration", () => {
		let fundamentalsRepo: FundamentalsRepository;
		let shortInterestRepo: ShortInterestRepository;
		let sentimentRepo: SentimentRepository;
		let corporateActionsRepo: CorporateActionsRepository;

		beforeEach(async () => {
			client.close();
			client = await createInMemoryClient();
			await runMigrations(client, { logger: () => {} });
			fundamentalsRepo = new FundamentalsRepository(client);
			shortInterestRepo = new ShortInterestRepository(client);
			sentimentRepo = new SentimentRepository(client);
			corporateActionsRepo = new CorporateActionsRepository(client);
		});

		it("all batch jobs can run concurrently for same universe", async () => {
			const symbols = ["AAPL", "MSFT", "GOOGL"];

			// Set up all mock data
			const fmpData = new Map(
				symbols.map((s) => [
					s,
					{
						metrics: createMockKeyMetrics(s),
						income: createMockIncomeStatement(s),
						balance: createMockBalanceSheet(s),
						cashFlow: createMockCashFlowStatement(s),
						profile: createMockProfile(s),
					},
				])
			);

			const finraRecords = symbols.map((s) => createMockFINRARecord(s));
			const sharesData = new Map(
				symbols.map((s) => [s, { sharesOutstanding: 1000000000, floatShares: 900000000 }])
			);

			const sentimentData = symbols.flatMap((s) => [
				createMockSentiment(s, { sentiment: "bullish" }),
				createMockSentiment(s, { sentiment: "neutral" }),
			]);

			const corporateActions = symbols.map((s) => createMockCorporateAction(s, "dividend"));

			// Create all jobs
			const fundamentalsJob = new FundamentalsBatchJob(
				createMockFMPClient(fmpData),
				fundamentalsRepo,
				{ rateLimitDelayMs: 0 }
			);
			const shortInterestJob = new ShortInterestBatchJob(
				createMockFINRAClient(finraRecords),
				shortInterestRepo,
				createMockSharesProvider(sharesData),
				{ rateLimitDelayMs: 0 }
			);
			const sentimentJob = new SentimentAggregationJob(
				createMockSentimentProvider(sentimentData),
				sentimentRepo,
				{ rateLimitDelayMs: 0 }
			);
			const corporateActionsJob = new CorporateActionsBatchJob(
				createMockAlpacaClient(corporateActions),
				corporateActionsRepo,
				undefined,
				{ rateLimitDelayMs: 0 }
			);

			// Run all jobs concurrently
			const results = await Promise.all([
				fundamentalsJob.run(symbols),
				shortInterestJob.run(symbols),
				sentimentJob.run(symbols, "2024-01-15"),
				corporateActionsJob.run(symbols),
			]);

			// All should succeed
			expect(results.every((r) => r.processed === 3)).toBe(true);
			expect(results.every((r) => r.failed === 0)).toBe(true);

			// Verify all data stored
			for (const symbol of symbols) {
				expect(await fundamentalsRepo.findLatestBySymbol(symbol)).not.toBeNull();
				expect(await shortInterestRepo.findLatestBySymbol(symbol)).not.toBeNull();
				expect(await sentimentRepo.findBySymbolAndDate(symbol, "2024-01-15")).not.toBeNull();
			}
		});

		it("jobs handle mixed success/failure gracefully", async () => {
			const symbols = ["AAPL", "MSFT", "FAIL"];

			// Only provide data for AAPL and MSFT
			const fmpData = new Map(
				["AAPL", "MSFT"].map((s) => [
					s,
					{
						metrics: createMockKeyMetrics(s),
						income: createMockIncomeStatement(s),
						balance: createMockBalanceSheet(s),
						cashFlow: createMockCashFlowStatement(s),
						profile: createMockProfile(s),
					},
				])
			);

			const job = new FundamentalsBatchJob(createMockFMPClient(fmpData), fundamentalsRepo, {
				rateLimitDelayMs: 0,
				continueOnError: true,
			});

			const result = await job.run(symbols);

			expect(result.processed).toBe(2);
			expect(result.failed).toBe(1);

			// Successful symbols should be stored
			expect(await fundamentalsRepo.findLatestBySymbol("AAPL")).not.toBeNull();
			expect(await fundamentalsRepo.findLatestBySymbol("MSFT")).not.toBeNull();
			// Failed symbol should not exist
			expect(await fundamentalsRepo.findLatestBySymbol("FAIL")).toBeNull();
		});
	});
});
