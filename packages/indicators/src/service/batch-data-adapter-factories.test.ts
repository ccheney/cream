/**
 * Batch adapter factory composition tests
 */

import { expect, test } from "bun:test";
import { createBatchRepositoryAdapters } from "./batch-data-adapter";
import {
	createMockCorporateActionsRepo,
	createMockFundamentalsRepo,
	createMockSentimentRepo,
	createMockShortInterestRepo,
} from "./batch-data-adapter.test-helpers";

test("createBatchRepositoryAdapters creates all adapters when all repositories provided", () => {
	const adapters = createBatchRepositoryAdapters({
		fundamentals: createMockFundamentalsRepo(new Map()),
		shortInterest: createMockShortInterestRepo(new Map()),
		sentiment: createMockSentimentRepo(new Map()),
		corporateActions: createMockCorporateActionsRepo(new Map(), new Map()),
	});

	expect(adapters.fundamentalRepo).toBeDefined();
	expect(adapters.shortInterestRepo).toBeDefined();
	expect(adapters.sentimentRepo).toBeDefined();
	expect(adapters.corporateActionsRepo).toBeDefined();
});

test("createBatchRepositoryAdapters creates only provided adapters", () => {
	const adapters = createBatchRepositoryAdapters({
		fundamentals: createMockFundamentalsRepo(new Map()),
		sentiment: createMockSentimentRepo(new Map()),
	});

	expect(adapters.fundamentalRepo).toBeDefined();
	expect(adapters.shortInterestRepo).toBeUndefined();
	expect(adapters.sentimentRepo).toBeDefined();
	expect(adapters.corporateActionsRepo).toBeUndefined();
});

test("createBatchRepositoryAdapters returns empty object when no repositories provided", () => {
	const adapters = createBatchRepositoryAdapters({});

	expect(adapters.fundamentalRepo).toBeUndefined();
	expect(adapters.shortInterestRepo).toBeUndefined();
	expect(adapters.sentimentRepo).toBeUndefined();
	expect(adapters.corporateActionsRepo).toBeUndefined();
});
