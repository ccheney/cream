import { describe, expect, test } from "bun:test";

type WorkerServiceStatus = {
	name: string;
	displayName: string;
	status: string;
	lastRun?: { status: string; startedAt?: string };
};

type WorkerStatusResponse = {
	services: WorkerServiceStatus[];
};

type WorkerRun = {
	id: string;
	service: string;
	status: string;
	duration: number | null;
};

type WorkerRunsResponse = {
	runs: WorkerRun[];
	total: number;
};

type WorkerRunResponse = {
	run: WorkerRun;
};

type WorkerTriggerResponse = {
	runId: string;
	status: string;
	message: string;
};

type WorkersRoutesRequester = {
	request: (path: string, init?: RequestInit) => Response | Promise<Response>;
};

async function requestJson<T>(
	workersRoutes: WorkersRoutesRequester,
	path: string,
	init?: RequestInit,
): Promise<{ response: Response; data: T }> {
	const response = await workersRoutes.request(path, init);
	const data = (await response.json()) as T;
	return { response, data };
}

function findServiceByName(
	services: WorkerServiceStatus[],
	serviceName: string,
): WorkerServiceStatus {
	const service = services.find((item) => item.name === serviceName);
	if (!service) {
		throw new Error(`Expected ${serviceName} service`);
	}
	return service;
}

function registerStatusShapeTests(workersRoutes: WorkersRoutesRequester): void {
	test("returns status of all worker services", async () => {
		const { response, data } = await requestJson<WorkerStatusResponse>(workersRoutes, "/status");
		expect(response.status).toBe(200);
		expect(Array.isArray(data.services)).toBe(true);
		expect(data.services.length).toBe(7);

		const serviceNames = data.services.map((service) => service.name);
		expect(serviceNames).toContain("macro_watch");
		expect(serviceNames).toContain("newspaper");
		expect(serviceNames).toContain("filings_sync");
		expect(serviceNames).toContain("short_interest");
		expect(serviceNames).toContain("sentiment");
		expect(serviceNames).toContain("corporate_actions");
		expect(serviceNames).toContain("prediction_markets");
	});

	test("includes display names for all services", async () => {
		const { data } = await requestJson<WorkerStatusResponse>(workersRoutes, "/status");
		for (const service of data.services) {
			expect(typeof service.displayName).toBe("string");
			expect(service.displayName.length).toBeGreaterThan(0);
		}
	});
}

function registerStatusBehaviorTests(workersRoutes: WorkersRoutesRequester): void {
	test("identifies running services", async () => {
		const { data } = await requestJson<WorkerStatusResponse>(workersRoutes, "/status");
		const shortInterest = findServiceByName(data.services, "short_interest");
		const macroWatch = findServiceByName(data.services, "macro_watch");
		expect(shortInterest.status).toBe("running");
		expect(macroWatch.status).toBe("idle");
	});

	test("includes last run info for services with history", async () => {
		const { data } = await requestJson<WorkerStatusResponse>(workersRoutes, "/status");
		const macroWatch = findServiceByName(data.services, "macro_watch");
		expect(macroWatch.lastRun).toBeDefined();
		if (!macroWatch.lastRun) {
			throw new Error("Expected macro_watch lastRun");
		}
		expect(macroWatch.lastRun.status).toBe("completed");
		expect(macroWatch.lastRun.startedAt).toBeDefined();
	});
}

export function registerStatusSuite(workersRoutes: WorkersRoutesRequester): void {
	describe("GET /status", () => {
		registerStatusShapeTests(workersRoutes);
		registerStatusBehaviorTests(workersRoutes);
	});
}

function registerRunsShapeTests(workersRoutes: WorkersRoutesRequester): void {
	test("returns recent runs across all services", async () => {
		const { response, data } = await requestJson<WorkerRunsResponse>(workersRoutes, "/runs");
		expect(response.status).toBe(200);
		expect(Array.isArray(data.runs)).toBe(true);
		expect(data.total).toBeDefined();
	});

	test("respects limit parameter", async () => {
		const { response, data } = await requestJson<WorkerRunsResponse>(
			workersRoutes,
			"/runs?limit=3",
		);
		expect(response.status).toBe(200);
		expect(data.runs.length).toBeLessThanOrEqual(3);
	});

	test("filters by service", async () => {
		const { response, data } = await requestJson<WorkerRunsResponse>(
			workersRoutes,
			"/runs?service=macro_watch",
		);
		expect(response.status).toBe(200);
		expect(data.runs.every((run) => run.service === "macro_watch")).toBe(true);
	});
}

function registerRunsFilterTests(workersRoutes: WorkersRoutesRequester): void {
	test("filters by status", async () => {
		const { response, data } = await requestJson<WorkerRunsResponse>(
			workersRoutes,
			"/runs?status=completed",
		);
		expect(response.status).toBe(200);
		expect(data.runs.every((run) => run.status === "completed")).toBe(true);
	});

	test("includes duration for completed runs", async () => {
		const { data } = await requestJson<WorkerRunsResponse>(workersRoutes, "/runs?status=completed");
		for (const run of data.runs) {
			expect(run.duration).toBeDefined();
			expect(run.duration).toBeGreaterThanOrEqual(0);
		}
	});

	test("returns null duration for running jobs", async () => {
		const { data } = await requestJson<WorkerRunsResponse>(workersRoutes, "/runs?status=running");
		for (const run of data.runs) {
			expect(run.duration).toBeNull();
		}
	});
}

function registerRunsValidationTests(workersRoutes: WorkersRoutesRequester): void {
	test("validates service enum", async () => {
		const response = await workersRoutes.request("/runs?service=invalid_service");
		expect(response.status).toBe(400);
	});

	test("validates status enum", async () => {
		const response = await workersRoutes.request("/runs?status=invalid_status");
		expect(response.status).toBe(400);
	});

	test("validates limit range", async () => {
		const responseLow = await workersRoutes.request("/runs?limit=0");
		expect(responseLow.status).toBe(400);

		const responseHigh = await workersRoutes.request("/runs?limit=101");
		expect(responseHigh.status).toBe(400);
	});
}

export function registerRunsSuite(workersRoutes: WorkersRoutesRequester): void {
	describe("GET /runs", () => {
		registerRunsShapeTests(workersRoutes);
		registerRunsFilterTests(workersRoutes);
		registerRunsValidationTests(workersRoutes);
	});
}

export function registerRunByIdSuite(workersRoutes: WorkersRoutesRequester): void {
	describe("GET /runs/:id", () => {
		test("returns single run by id", async () => {
			const { response, data } = await requestJson<WorkerRunResponse>(
				workersRoutes,
				"/runs/run-001",
			);
			expect(response.status).toBe(200);
			expect(data.run.id).toBe("run-001");
			expect(data.run.service).toBe("macro_watch");
			expect(data.run.status).toBe("completed");
		});

		test("returns 404 for non-existent run", async () => {
			const response = await workersRoutes.request("/runs/non-existent");
			expect(response.status).toBe(404);
		});
	});
}

async function postTrigger(
	workersRoutes: WorkersRoutesRequester,
	path: string,
	body: Record<string, unknown>,
): Promise<Response> {
	return workersRoutes.request(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

export function registerTriggerSuite(workersRoutes: WorkersRoutesRequester): void {
	describe("POST /:service/trigger", () => {
		test("triggers a service and returns run id", async () => {
			const response = await postTrigger(workersRoutes, "/macro_watch/trigger", {});
			expect(response.status).toBe(202);

			const data = (await response.json()) as WorkerTriggerResponse;
			expect(data.runId).toBeDefined();
			expect(data.status).toBe("started");
			expect(data.message).toContain("Macro Watch");
		});

		test("accepts optional symbols array", async () => {
			const response = await postTrigger(workersRoutes, "/sentiment/trigger", {
				symbols: ["AAPL", "MSFT"],
			});
			expect(response.status).toBe(202);
		});

		test("accepts optional priority", async () => {
			const response = await postTrigger(workersRoutes, "/corporate_actions/trigger", {
				priority: "high",
			});
			expect(response.status).toBe(202);
		});

		test("returns 409 if service is already running", async () => {
			const response = await postTrigger(workersRoutes, "/short_interest/trigger", {});
			expect(response.status).toBe(409);
		});

		test("validates service enum", async () => {
			const response = await postTrigger(workersRoutes, "/invalid_service/trigger", {});
			expect(response.status).toBe(400);
		});
	});
}
