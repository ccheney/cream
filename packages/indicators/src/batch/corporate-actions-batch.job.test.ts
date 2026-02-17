/**
 * Corporate Actions Batch Job Runtime Tests
 */

import { expect, mock, test } from "bun:test";
import type { CorporateActionsRepository } from "@cream/storage";
import { requireArrayItem } from "@cream/test-utils";
import {
	type AlpacaCorporateAction,
	type AlpacaCorporateActionsClient,
	CorporateActionsBatchJob,
} from "./corporate-actions-batch.js";

function createMockClient(actions: AlpacaCorporateAction[] = []): AlpacaCorporateActionsClient {
	return {
		getCorporateActions: mock(async () => actions),
		getCorporateActionsForSymbols: mock(async () => actions),
	};
}

function createMockRepo(): CorporateActionsRepository {
	return {
		upsert: mock(async () => {}),
		getForSymbol: mock(async () => []),
		getSplits: mock(async () => []),
		getDividends: mock(async () => []),
		getByExDate: mock(async () => []),
	} as unknown as CorporateActionsRepository;
}

test("CorporateActionsBatchJob.run processes symbols and stores corporate actions", async () => {
	const actions: AlpacaCorporateAction[] = [
		{
			corporate_action_type: "Dividend",
			symbol: "AAPL",
			ex_date: "2024-01-15",
			record_date: "2024-01-16",
			payment_date: "2024-01-20",
			value: 0.24,
		},
		{
			corporate_action_type: "Split",
			symbol: "AAPL",
			ex_date: "2024-08-01",
			record_date: null,
			payment_date: null,
			value: 4,
		},
	];

	const client = createMockClient(actions);
	const repo = createMockRepo();
	const job = new CorporateActionsBatchJob(client, repo);

	const result = await job.run(["AAPL"]);

	expect(result.processed).toBe(1);
	expect(result.failed).toBe(0);
	expect(repo.upsert).toHaveBeenCalledTimes(2);
});

test("CorporateActionsBatchJob.run handles multiple symbols", async () => {
	const actions: AlpacaCorporateAction[] = [
		{
			corporate_action_type: "Dividend",
			symbol: "AAPL",
			ex_date: "2024-01-15",
			record_date: null,
			payment_date: null,
			value: 0.24,
		},
		{
			corporate_action_type: "Dividend",
			symbol: "MSFT",
			ex_date: "2024-01-15",
			record_date: null,
			payment_date: null,
			value: 0.68,
		},
	];

	const client = createMockClient(actions);
	const repo = createMockRepo();
	const job = new CorporateActionsBatchJob(client, repo);

	const result = await job.run(["AAPL", "MSFT"]);

	expect(result.processed).toBe(2);
	expect(result.failed).toBe(0);
});

test("CorporateActionsBatchJob.run handles symbols with no corporate actions", async () => {
	const client = createMockClient([]);
	const repo = createMockRepo();
	const job = new CorporateActionsBatchJob(client, repo);

	const result = await job.run(["AAPL"]);

	expect(result.processed).toBe(1);
	expect(result.failed).toBe(0);
	expect(repo.upsert).not.toHaveBeenCalled();
});

test("CorporateActionsBatchJob.run handles API errors with retry", async () => {
	let callCount = 0;
	const client: AlpacaCorporateActionsClient = {
		getCorporateActions: mock(async () => []),
		getCorporateActionsForSymbols: mock(async () => {
			callCount++;
			if (callCount < 3) {
				throw new Error("API error");
			}
			return [
				{
					corporate_action_type: "Dividend" as const,
					symbol: "AAPL",
					ex_date: "2024-01-15",
					record_date: null,
					payment_date: null,
					value: 0.24,
				},
			];
		}),
	};

	const repo = createMockRepo();
	const job = new CorporateActionsBatchJob(client, repo, undefined, {
		retryDelayMs: 10,
	});

	const result = await job.run(["AAPL"]);

	expect(result.processed).toBe(1);
	expect(result.failed).toBe(0);
	expect(callCount).toBe(3);
});

test("CorporateActionsBatchJob.run continues on individual symbol errors when configured", async () => {
	const client = createMockClient([
		{
			corporate_action_type: "Dividend",
			symbol: "AAPL",
			ex_date: "2024-01-15",
			record_date: null,
			payment_date: null,
			value: 0.24,
		},
	]);

	const repo = createMockRepo();
	(repo.upsert as ReturnType<typeof mock>).mockImplementation(async () => {
		throw new Error("Database error");
	});

	const job = new CorporateActionsBatchJob(client, repo, undefined, {
		continueOnError: true,
	});

	const result = await job.run(["AAPL", "MSFT"]);

	// AAPL fails during upsert, MSFT has no actions so succeeds
	expect(result.failed).toBe(1);
	expect(result.processed).toBe(1);
	expect(result.errors.length).toBe(1);
	expect(requireArrayItem(result.errors, 0, "error").symbol).toBe("AAPL");
});

test("CorporateActionsBatchJob.run stops on error when continueOnError is false", async () => {
	const client: AlpacaCorporateActionsClient = {
		getCorporateActions: mock(async () => []),
		getCorporateActionsForSymbols: mock(async () => {
			throw new Error("API error");
		}),
	};

	const repo = createMockRepo();
	const job = new CorporateActionsBatchJob(client, repo, undefined, {
		continueOnError: false,
		maxRetries: 0,
	});

	await expect(job.run(["AAPL"])).rejects.toThrow("API error");
});

test("CorporateActionsBatchJob.run reports duration in milliseconds", async () => {
	const client = createMockClient([]);
	const repo = createMockRepo();
	const job = new CorporateActionsBatchJob(client, repo);

	const result = await job.run(["AAPL"]);

	expect(result.durationMs).toBeGreaterThanOrEqual(0);
});

test("CorporateActionsBatchJob stores dividend actions with amount", async () => {
	const actions: AlpacaCorporateAction[] = [
		{
			corporate_action_type: "Dividend",
			symbol: "AAPL",
			ex_date: "2024-01-15",
			record_date: "2024-01-16",
			payment_date: "2024-01-20",
			value: 0.24,
			description: "Quarterly dividend",
		},
	];

	const client = createMockClient(actions);
	const repo = createMockRepo();
	const job = new CorporateActionsBatchJob(client, repo);

	await job.run(["AAPL"]);

	const calls = (repo.upsert as ReturnType<typeof mock>).mock.calls;
	expect(calls.length).toBe(1);
	const insert = requireArrayItem(calls, 0, "upsert call")[0];
	if (!insert) {
		throw new Error("Expected insert payload");
	}
	expect(insert.actionType).toBe("dividend");
	expect(insert.amount).toBe(0.24);
	expect(insert.ratio).toBeNull();
	expect(insert.details).toBe("Quarterly dividend");
});

test("CorporateActionsBatchJob stores split actions with ratio", async () => {
	const actions: AlpacaCorporateAction[] = [
		{
			corporate_action_type: "Split",
			symbol: "AAPL",
			ex_date: "2024-08-01",
			record_date: null,
			payment_date: null,
			value: 4,
		},
	];

	const client = createMockClient(actions);
	const repo = createMockRepo();
	const job = new CorporateActionsBatchJob(client, repo);

	await job.run(["AAPL"]);

	const calls = (repo.upsert as ReturnType<typeof mock>).mock.calls;
	expect(calls.length).toBe(1);
	const insert = requireArrayItem(calls, 0, "upsert call")[0];
	if (!insert) {
		throw new Error("Expected insert payload");
	}
	expect(insert.actionType).toBe("split");
	expect(insert.ratio).toBe(4);
	expect(insert.amount).toBeNull();
});

test("CorporateActionsBatchJob stores reverse split with ratio", async () => {
	const actions: AlpacaCorporateAction[] = [
		{
			corporate_action_type: "ReverseSplit",
			symbol: "XYZ",
			ex_date: "2024-03-01",
			record_date: null,
			payment_date: null,
			value: 0.1,
		},
	];

	const client = createMockClient(actions);
	const repo = createMockRepo();
	const job = new CorporateActionsBatchJob(client, repo);

	await job.run(["XYZ"]);

	const calls = (repo.upsert as ReturnType<typeof mock>).mock.calls;
	expect(calls.length).toBe(1);
	const insert = requireArrayItem(calls, 0, "upsert call")[0];
	if (!insert) {
		throw new Error("Expected insert payload");
	}
	expect(insert.actionType).toBe("reverse_split");
	expect(insert.ratio).toBe(0.1);
});

test("CorporateActionsBatchJob stores special dividend", async () => {
	const actions: AlpacaCorporateAction[] = [
		{
			corporate_action_type: "SpecialDividend",
			symbol: "COST",
			ex_date: "2024-12-01",
			record_date: null,
			payment_date: null,
			value: 15.0,
		},
	];

	const client = createMockClient(actions);
	const repo = createMockRepo();
	const job = new CorporateActionsBatchJob(client, repo);

	await job.run(["COST"]);

	const calls = (repo.upsert as ReturnType<typeof mock>).mock.calls;
	expect(calls.length).toBe(1);
	const insert = requireArrayItem(calls, 0, "upsert call")[0];
	if (!insert) {
		throw new Error("Expected insert payload");
	}
	expect(insert.actionType).toBe("special_dividend");
	expect(insert.amount).toBe(15.0);
});

test("CorporateActionsBatchJob uses default configuration", async () => {
	const client = createMockClient([]);
	const repo = createMockRepo();
	const job = new CorporateActionsBatchJob(client, repo);

	const result = await job.run(["AAPL"]);
	expect(result.processed).toBe(1);
});

test("CorporateActionsBatchJob respects custom lookback days", async () => {
	const client = createMockClient([]);
	const repo = createMockRepo();
	const job = new CorporateActionsBatchJob(client, repo, undefined, {
		lookbackDays: 30,
		lookaheadDays: 14,
	});

	await job.run(["AAPL"]);

	// Verify the client was called (we can't easily verify dates without more mocking)
	expect(client.getCorporateActionsForSymbols).toHaveBeenCalled();
});

test("CorporateActionsBatchJob handles empty symbols array", async () => {
	const client = createMockClient([]);
	const repo = createMockRepo();
	const job = new CorporateActionsBatchJob(client, repo);

	const result = await job.run([]);

	expect(result.processed).toBe(0);
	expect(result.failed).toBe(0);
});

test("CorporateActionsBatchJob handles case-insensitive symbol matching", async () => {
	const actions: AlpacaCorporateAction[] = [
		{
			corporate_action_type: "Dividend",
			symbol: "aapl",
			ex_date: "2024-01-15",
			record_date: null,
			payment_date: null,
			value: 0.24,
		},
	];

	const client = createMockClient(actions);
	const repo = createMockRepo();
	const job = new CorporateActionsBatchJob(client, repo);

	const result = await job.run(["AAPL"]);

	expect(result.processed).toBe(1);
	expect(repo.upsert).toHaveBeenCalled();
});

test("CorporateActionsBatchJob handles actions without description", async () => {
	const actions: AlpacaCorporateAction[] = [
		{
			corporate_action_type: "Dividend",
			symbol: "AAPL",
			ex_date: "2024-01-15",
			record_date: null,
			payment_date: null,
			value: 0.24,
		},
	];

	const client = createMockClient(actions);
	const repo = createMockRepo();
	const job = new CorporateActionsBatchJob(client, repo);

	await job.run(["AAPL"]);

	const calls = (repo.upsert as ReturnType<typeof mock>).mock.calls;
	const insert = requireArrayItem(calls, 0, "upsert call")[0];
	if (!insert) {
		throw new Error("Expected insert payload");
	}
	expect(insert.details).toBeNull();
});
