/**
 * Scanner Trigger Service
 *
 * Consumes scanner alerts, batches symbols, and triggers OODA cycles.
 */

import type { RuntimeEnvironment } from "@cream/config";
import type { ScannerAlert } from "@cream/domain/grpc";
import { log } from "../../shared/logger.js";
import type { CycleTriggerService } from "../trading-cycle/cycle-trigger.js";
import { type AlertBatcher, createAlertBatcher } from "./alert-batcher.js";
import type { ScannerAlertClientPort, ScannerAlertStreamOptions } from "./scanner-alert-client.js";
import { createScannerAlertClient } from "./scanner-alert-client.js";

const DEFAULT_RECONNECT_DELAY_MS = 1_000;
const DEFAULT_RECENT_SYMBOLS_TTL_MS = 24 * 60 * 60 * 1000;
const BUSY_WAIT_POLL_MS = 10;

export interface ScannerTriggerServiceConfig {
	environment: RuntimeEnvironment;
	streamProxyUrl?: string;
	batchQuietWindowMs?: number;
	batchMaxWindowMs?: number;
	maxCandidates?: number;
	reconnectDelayMs?: number;
	recentSymbolsTtlMs?: number;
}

type CycleTriggerPort = Pick<CycleTriggerService, "isRunning" | "trigger">;

export interface ScannerTriggerServiceDeps {
	cycleTrigger: CycleTriggerPort;
	scannerClient?: ScannerAlertClientPort;
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function mergeSymbolBatches(batches: string[][]): string[] {
	const seen = new Set<string>();
	const merged: string[] = [];
	for (const batch of batches) {
		for (const symbol of batch) {
			if (!seen.has(symbol)) {
				seen.add(symbol);
				merged.push(symbol);
			}
		}
	}
	return merged;
}

export class ScannerTriggerService {
	private readonly config: Required<
		Pick<ScannerTriggerServiceConfig, "environment" | "reconnectDelayMs" | "recentSymbolsTtlMs">
	>;
	private readonly cycleTrigger: CycleTriggerPort;
	private readonly scannerClient: ScannerAlertClientPort;
	private readonly batcher: AlertBatcher;
	private running = false;
	private reconnecting = false;
	private drainingQueue = false;
	private activeTriggerCount = 0;
	private readonly pendingBatches: string[][] = [];
	private readonly recentSymbols = new Map<string, number>();
	private streamAbortController: AbortController | null = null;
	private runPromise: Promise<void> | null = null;

	constructor(config: ScannerTriggerServiceConfig, deps: ScannerTriggerServiceDeps) {
		this.config = {
			environment: config.environment,
			reconnectDelayMs: config.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS,
			recentSymbolsTtlMs: config.recentSymbolsTtlMs ?? DEFAULT_RECENT_SYMBOLS_TTL_MS,
		};
		this.cycleTrigger = deps.cycleTrigger;
		this.scannerClient =
			deps.scannerClient ??
			createScannerAlertClient({
				streamProxyUrl: config.streamProxyUrl,
				reconnectDelayMs: config.reconnectDelayMs,
			});
		this.batcher = createAlertBatcher({
			quietWindowMs: config.batchQuietWindowMs,
			maxWindowMs: config.batchMaxWindowMs,
			maxCandidates: config.maxCandidates,
			onBatch: async (symbols) => {
				await this.enqueueBatch(symbols);
			},
		});
	}

	start(): void {
		if (this.running) {
			return;
		}

		this.running = true;
		this.streamAbortController = new AbortController();
		this.runPromise = this.consumeScannerAlerts({
			signal: this.streamAbortController.signal,
		});
		log.info({}, "Scanner trigger service started");
	}

	async stop(): Promise<void> {
		if (!this.running) {
			return;
		}

		this.running = false;
		this.streamAbortController?.abort();
		this.streamAbortController = null;
		this.batcher.stop();

		if (this.runPromise) {
			await this.runPromise;
		}

		this.pendingBatches.length = 0;
		this.activeTriggerCount = 0;
		this.drainingQueue = false;
		this.reconnecting = false;
		log.info({}, "Scanner trigger service stopped");
	}

	isRunning(): boolean {
		return this.running;
	}

	updateMaxCandidates(maxCandidates: number): void {
		this.batcher.setMaxCandidates(maxCandidates);
	}

	getRecentSymbols(limit = 100): string[] {
		this.pruneRecentSymbols();
		return [...this.recentSymbols.entries()]
			.toSorted((left, right) => right[1] - left[1])
			.slice(0, limit)
			.map(([symbol]) => symbol);
	}

	private shouldStopStream(options: ScannerAlertStreamOptions): boolean {
		return !this.running || Boolean(options.signal?.aborted);
	}

	private consumeAlert(alert: ScannerAlert): void {
		this.recordRecentSymbols([alert.symbol]);
		this.batcher.addAlert(alert);
	}

	private async consumeStreamCycle(
		options: ScannerAlertStreamOptions,
	): Promise<"stopped" | "stream-ended"> {
		for await (const alert of this.scannerClient.streamAlerts(options)) {
			if (this.shouldStopStream(options)) {
				return "stopped";
			}
			this.consumeAlert(alert);
		}
		return this.shouldStopStream(options) ? "stopped" : "stream-ended";
	}

	private async consumeScannerAlerts(options: ScannerAlertStreamOptions): Promise<void> {
		while (!this.shouldStopStream(options)) {
			try {
				const cycleResult = await this.consumeStreamCycle(options);
				if (cycleResult === "stopped") {
					return;
				}
				await this.sleepBeforeReconnect("stream-ended");
			} catch (error) {
				if (this.shouldStopStream(options)) {
					return;
				}
				log.warn(
					{ error: toErrorMessage(error) },
					"Scanner trigger service stream error, reconnecting",
				);
				await this.sleepBeforeReconnect("stream-error");
			}
		}
	}

	private async sleepBeforeReconnect(reason: "stream-ended" | "stream-error"): Promise<void> {
		if (this.reconnecting || !this.running) {
			return;
		}
		this.reconnecting = true;
		try {
			log.warn(
				{
					reason,
					delayMs: this.config.reconnectDelayMs,
				},
				"Scanner trigger service waiting before reconnect",
			);
			await Bun.sleep(this.config.reconnectDelayMs);
		} finally {
			this.reconnecting = false;
		}
	}

	private async enqueueBatch(symbols: string[]): Promise<void> {
		if (symbols.length === 0) {
			return;
		}

		this.recordRecentSymbols(symbols);
		this.pendingBatches.push(symbols);
		await this.drainBatchQueue();
	}

	private async drainBatchQueue(): Promise<void> {
		if (this.drainingQueue) {
			return;
		}
		this.drainingQueue = true;

		try {
			while (this.pendingBatches.length > 0 && this.running) {
				if (this.isCycleBusy()) {
					await Bun.sleep(BUSY_WAIT_POLL_MS);
					continue;
				}

				const mergedSymbols = mergeSymbolBatches(this.pendingBatches.splice(0));
				if (mergedSymbols.length === 0) {
					continue;
				}

				this.activeTriggerCount += 1;
				try {
					log.info(
						{
							environment: this.config.environment,
							symbolCount: mergedSymbols.length,
							symbols: mergedSymbols,
						},
						"Triggering scanner-driven cycle",
					);
					await this.cycleTrigger.trigger(this.config.environment, mergedSymbols);
				} catch (error) {
					log.error(
						{
							error: toErrorMessage(error),
							symbolCount: mergedSymbols.length,
						},
						"Scanner-driven cycle trigger failed",
					);
				} finally {
					this.activeTriggerCount = Math.max(0, this.activeTriggerCount - 1);
				}
			}
		} finally {
			this.drainingQueue = false;
		}
	}

	private isCycleBusy(): boolean {
		return this.activeTriggerCount > 0 || this.cycleTrigger.isRunning();
	}

	private recordRecentSymbols(symbols: string[]): void {
		const now = Date.now();
		for (const symbol of symbols) {
			this.recentSymbols.set(symbol, now);
		}
		this.pruneRecentSymbols();
	}

	private pruneRecentSymbols(): void {
		const cutoff = Date.now() - this.config.recentSymbolsTtlMs;
		for (const [symbol, timestamp] of this.recentSymbols) {
			if (timestamp < cutoff) {
				this.recentSymbols.delete(symbol);
			}
		}
	}
}

export function createScannerTriggerService(
	config: ScannerTriggerServiceConfig,
	deps: ScannerTriggerServiceDeps,
): ScannerTriggerService {
	return new ScannerTriggerService(config, deps);
}

export type { ScannerAlert };
