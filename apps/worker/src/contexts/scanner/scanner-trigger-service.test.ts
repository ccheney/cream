import { afterEach, expect, mock, test } from "bun:test";
import type { ScannerAlert } from "@cream/domain/grpc";
import type { CycleTriggerResult } from "../trading-cycle/cycle-trigger.js";
import type { ScannerAlertClientPort, ScannerAlertStreamOptions } from "./scanner-alert-client.js";
import { createScannerTriggerService } from "./scanner-trigger-service.js";

class PushScannerAlertClient implements ScannerAlertClientPort {
	private queue: Array<ScannerAlert | Error | "close"> = [];
	private waiters: Array<(item: ScannerAlert | Error | "close") => void> = [];

	pushAlert(alert: ScannerAlert): void {
		this.push(alert);
	}

	pushError(error: Error): void {
		this.push(error);
	}

	closeStream(): void {
		this.push("close");
	}

	async *streamAlerts(options: ScannerAlertStreamOptions = {}): AsyncGenerator<ScannerAlert> {
		while (!options.signal?.aborted) {
			const next = await this.nextItem(options.signal);
			if (!next || next === "close") {
				return;
			}
			if (next instanceof Error) {
				throw next;
			}
			yield next;
		}
	}

	private push(item: ScannerAlert | Error | "close"): void {
		const waiter = this.waiters.shift();
		if (waiter) {
			waiter(item);
			return;
		}
		this.queue.push(item);
	}

	private async nextItem(signal?: AbortSignal): Promise<ScannerAlert | Error | "close" | null> {
		if (this.queue.length > 0) {
			return this.queue.shift() ?? null;
		}

		return new Promise((resolve) => {
			const resolveOnce = (item: ScannerAlert | Error | "close") => {
				if (signalListener) {
					signal?.removeEventListener("abort", signalListener);
				}
				resolve(item);
			};
			const signalListener = signal
				? () => {
						resolve(null);
					}
				: null;
			if (signalListener) {
				signal?.addEventListener("abort", signalListener, { once: true });
			}
			this.waiters.push(resolveOnce);
		});
	}
}

function createAlert(symbol: string, volumeRatio = 3): ScannerAlert {
	return {
		$typeName: "cream.v1.ScannerAlert",
		symbol,
		signals: [],
		price: 100,
		volume: 10_000n,
		avgVolume: 1_000n,
		volumeRatio,
		priceChangePct: 2,
		gapPct: 0,
		approxAtr: 1,
	};
}

interface MockCycleTriggerHarness {
	cycleTrigger: {
		isRunning: () => boolean;
		trigger: (environment: string, symbols: string[]) => Promise<CycleTriggerResult | null>;
	};
	triggerCalls: string[][];
	releaseNextTrigger: () => void;
}

function createMockCycleTriggerHarness(): MockCycleTriggerHarness {
	const triggerCalls: string[][] = [];
	const pendingResolvers: Array<() => void> = [];
	let running = false;

	return {
		cycleTrigger: {
			isRunning: () => running,
			trigger: mock(async (_environment: string, symbols: string[]) => {
				triggerCalls.push(symbols);
				running = true;
				await new Promise<void>((resolve) => {
					pendingResolvers.push(() => {
						running = false;
						resolve();
					});
				});
				return { cycleId: `cycle-${triggerCalls.length}`, status: "queued" };
			}),
		},
		triggerCalls,
		releaseNextTrigger: () => {
			const release = pendingResolvers.shift();
			if (release) {
				release();
			}
		},
	};
}

const runningServices: Array<{ stop: () => Promise<void> }> = [];

afterEach(async () => {
	for (const service of runningServices.splice(0)) {
		await service.stop();
	}
});

test("guards against concurrent cycles and triggers queued batch after completion", async () => {
	const scannerClient = new PushScannerAlertClient();
	const harness = createMockCycleTriggerHarness();
	const service = createScannerTriggerService(
		{
			environment: "PAPER",
			batchQuietWindowMs: 15,
			batchMaxWindowMs: 60,
			reconnectDelayMs: 10,
		},
		{
			scannerClient,
			cycleTrigger: harness.cycleTrigger,
		},
	);
	runningServices.push(service);
	service.start();

	scannerClient.pushAlert(createAlert("AAPL", 6));
	await Bun.sleep(25);

	expect(harness.triggerCalls).toHaveLength(1);
	expect(harness.triggerCalls[0]).toEqual(["AAPL"]);

	scannerClient.pushAlert(createAlert("MSFT", 5));
	await Bun.sleep(25);

	expect(harness.triggerCalls).toHaveLength(1);

	harness.releaseNextTrigger();
	await Bun.sleep(35);

	expect(harness.triggerCalls).toHaveLength(2);
	expect(harness.triggerCalls[1]).toEqual(["MSFT"]);
	harness.releaseNextTrigger();
});

test("drains pending symbols after a cycle completes", async () => {
	const scannerClient = new PushScannerAlertClient();
	const harness = createMockCycleTriggerHarness();
	const service = createScannerTriggerService(
		{
			environment: "PAPER",
			batchQuietWindowMs: 10,
			batchMaxWindowMs: 50,
			reconnectDelayMs: 10,
		},
		{
			scannerClient,
			cycleTrigger: harness.cycleTrigger,
		},
	);
	runningServices.push(service);
	service.start();

	scannerClient.pushAlert(createAlert("AAPL", 8));
	await Bun.sleep(20);
	expect(harness.triggerCalls).toHaveLength(1);

	scannerClient.pushAlert(createAlert("NVDA", 7));
	scannerClient.pushAlert(createAlert("TSLA", 6));
	await Bun.sleep(20);
	expect(harness.triggerCalls).toHaveLength(1);

	harness.releaseNextTrigger();
	await Bun.sleep(35);

	expect(harness.triggerCalls).toHaveLength(2);
	expect(new Set(harness.triggerCalls[1])).toEqual(new Set(["NVDA", "TSLA"]));
	harness.releaseNextTrigger();
});

test("reconnects after stream drop and continues triggering batches", async () => {
	const scannerClient = new PushScannerAlertClient();
	const triggerCalls: string[][] = [];
	const cycleTrigger = {
		isRunning: () => false,
		trigger: mock(async (_environment: string, symbols: string[]) => {
			triggerCalls.push(symbols);
			return {
				cycleId: `cycle-${triggerCalls.length}`,
				status: "queued",
			} satisfies CycleTriggerResult;
		}),
	};

	const service = createScannerTriggerService(
		{
			environment: "PAPER",
			batchQuietWindowMs: 10,
			batchMaxWindowMs: 30,
			reconnectDelayMs: 10,
		},
		{
			scannerClient,
			cycleTrigger,
		},
	);
	runningServices.push(service);
	service.start();

	scannerClient.pushError(new Error("stream dropped"));
	await Bun.sleep(25);

	scannerClient.pushAlert(createAlert("META", 9));
	await Bun.sleep(25);

	expect(triggerCalls).toHaveLength(1);
	expect(triggerCalls[0]).toEqual(["META"]);
});
