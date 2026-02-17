export interface MockRun {
	id: string;
	runType: string;
	startedAt: string;
	completedAt: string | null;
	symbolsProcessed: number;
	symbolsFailed: number;
	status: string;
	errorMessage: string | null;
	environment: string;
}

const baseMockRuns: MockRun[] = [
	{
		id: "run-001",
		runType: "macro_watch",
		startedAt: "2024-01-15T10:00:00Z",
		completedAt: "2024-01-15T10:05:00Z",
		symbolsProcessed: 100,
		symbolsFailed: 2,
		status: "completed",
		errorMessage: null,
		environment: "PAPER",
	},
	{
		id: "run-002",
		runType: "newspaper",
		startedAt: "2024-01-15T06:30:00Z",
		completedAt: "2024-01-15T06:32:00Z",
		symbolsProcessed: 50,
		symbolsFailed: 0,
		status: "completed",
		errorMessage: null,
		environment: "PAPER",
	},
	{
		id: "run-003",
		runType: "filings_sync",
		startedAt: "2024-01-15T08:00:00Z",
		completedAt: "2024-01-15T08:03:00Z",
		symbolsProcessed: 8,
		symbolsFailed: 0,
		status: "completed",
		errorMessage: null,
		environment: "PAPER",
	},
	{
		id: "run-004",
		runType: "short_interest",
		startedAt: "2024-01-15T10:10:00Z",
		completedAt: null,
		symbolsProcessed: 25,
		symbolsFailed: 0,
		status: "running",
		errorMessage: null,
		environment: "PAPER",
	},
	{
		id: "run-005",
		runType: "sentiment",
		startedAt: "2024-01-15T09:00:00Z",
		completedAt: "2024-01-15T09:01:00Z",
		symbolsProcessed: 0,
		symbolsFailed: 100,
		status: "failed",
		errorMessage: "API rate limit exceeded",
		environment: "PAPER",
	},
	{
		id: "run-006",
		runType: "corporate_actions",
		startedAt: "2024-01-15T10:15:00Z",
		completedAt: "2024-01-15T10:16:00Z",
		symbolsProcessed: 100,
		symbolsFailed: 0,
		status: "completed",
		errorMessage: null,
		environment: "PAPER",
	},
	{
		id: "run-007",
		runType: "fundamentals",
		startedAt: "2024-01-15T07:00:00Z",
		completedAt: "2024-01-15T07:10:00Z",
		symbolsProcessed: 200,
		symbolsFailed: 5,
		status: "completed",
		errorMessage: null,
		environment: "PAPER",
	},
];

let insertedRuns: MockRun[] = [];

export function resetMockRuns(): void {
	insertedRuns = [];
}

function getAllRuns(): MockRun[] {
	return [...baseMockRuns, ...insertedRuns];
}

function applyFilters(runs: MockRun[], filters?: { runType?: string; status?: string }): MockRun[] {
	let filtered = [...runs];
	if (filters?.runType) {
		filtered = filtered.filter((run) => run.runType === filters.runType);
	}
	if (filters?.status) {
		filtered = filtered.filter((run) => run.status === filters.status);
	}
	return filtered;
}

function sortByStartedAtDescending(runs: MockRun[]): MockRun[] {
	return [...runs].sort(
		(a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
	);
}

function buildLastRunMap(runs: MockRun[]): Map<string, MockRun> {
	const completedRuns = runs.filter((run) => run.status === "completed" || run.status === "failed");
	const byType = new Map<string, MockRun>();

	for (const run of completedRuns) {
		const existing = byType.get(run.runType);
		if (!existing || new Date(run.startedAt) > new Date(existing.startedAt)) {
			byType.set(run.runType, run);
		}
	}

	return byType;
}

function createRunId(): string {
	return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function findMany(
	filters?: { runType?: string; status?: string },
	limit = 20,
): Promise<MockRun[]> {
	return sortByStartedAtDescending(applyFilters(getAllRuns(), filters)).slice(0, limit);
}

async function findById(id: string): Promise<MockRun | null> {
	return getAllRuns().find((run) => run.id === id) ?? null;
}

async function findAllRunning(): Promise<MockRun[]> {
	return getAllRuns().filter((run) => run.status === "running");
}

async function findRunningByType(runType: string): Promise<MockRun | null> {
	return getAllRuns().find((run) => run.runType === runType && run.status === "running") ?? null;
}

async function getLastRunByType(): Promise<Map<string, MockRun>> {
	return buildLastRunMap(getAllRuns());
}

async function countByFilters(filters?: { runType?: string; status?: string }): Promise<number> {
	return applyFilters(getAllRuns(), filters).length;
}

async function create(input: {
	id?: string;
	runType: string;
	environment: string;
}): Promise<MockRun> {
	const newRun: MockRun = {
		id: input.id ?? createRunId(),
		runType: input.runType,
		startedAt: new Date().toISOString(),
		completedAt: null,
		symbolsProcessed: 0,
		symbolsFailed: 0,
		status: "running",
		errorMessage: null,
		environment: input.environment,
	};
	insertedRuns.push(newRun);
	return newRun;
}

async function update(
	id: string,
	input: {
		status?: string;
		symbolsProcessed?: number;
		symbolsFailed?: number;
		errorMessage?: string;
	},
): Promise<MockRun | null> {
	const run = getAllRuns().find((item) => item.id === id);
	if (!run) {
		return null;
	}
	if (input.status) {
		run.status = input.status;
	}
	if (input.symbolsProcessed !== undefined) {
		run.symbolsProcessed = input.symbolsProcessed;
	}
	if (input.symbolsFailed !== undefined) {
		run.symbolsFailed = input.symbolsFailed;
	}
	if (input.errorMessage !== undefined) {
		run.errorMessage = input.errorMessage;
	}
	return run;
}

export const createMockIndicatorSyncRunsRepo = () => ({
	findMany,
	findById,
	findAllRunning,
	findRunningByType,
	getLastRunByType,
	countByFilters,
	create,
	update,
});
