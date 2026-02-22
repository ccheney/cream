/**
 * Scanner Alert Batcher
 *
 * Deduplicates scanner alerts and emits symbol batches on quiet/max windows.
 */

import type { ScannerAlert } from "@cream/domain/grpc";

const DEFAULT_QUIET_WINDOW_MS = 60_000;
const DEFAULT_MAX_WINDOW_MS = 5 * 60_000;
const DEFAULT_MAX_CANDIDATES = 10;

export interface AlertBatcherConfig {
	quietWindowMs?: number;
	maxWindowMs?: number;
	maxCandidates?: number;
	onBatch: (symbols: string[], alerts: ScannerAlert[]) => void | Promise<void>;
}

interface AlertWithScore {
	alert: ScannerAlert;
	score: number;
}

export interface AlertBatcherStatus {
	pendingCount: number;
	pendingSymbols: string[];
}

function calculateAlertScore(alert: ScannerAlert): number {
	return (
		Math.abs(alert.volumeRatio) +
		Math.abs(alert.priceChangePct) +
		Math.abs(alert.gapPct) +
		alert.signals.length
	);
}

export class AlertBatcher {
	private quietWindowMs: number;
	private maxWindowMs: number;
	private maxCandidates: number;
	private readonly onBatch: AlertBatcherConfig["onBatch"];
	private readonly pendingAlerts = new Map<string, AlertWithScore>();
	private quietTimer: ReturnType<typeof setTimeout> | null = null;
	private maxTimer: ReturnType<typeof setTimeout> | null = null;
	private flushing = false;

	constructor(config: AlertBatcherConfig) {
		this.quietWindowMs = config.quietWindowMs ?? DEFAULT_QUIET_WINDOW_MS;
		this.maxWindowMs = config.maxWindowMs ?? DEFAULT_MAX_WINDOW_MS;
		this.maxCandidates = config.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
		this.onBatch = config.onBatch;
	}

	setMaxCandidates(maxCandidates: number): void {
		this.maxCandidates = Math.max(1, Math.trunc(maxCandidates));
	}

	addAlert(alert: ScannerAlert): void {
		const score = calculateAlertScore(alert);
		const existing = this.pendingAlerts.get(alert.symbol);
		if (!existing || score > existing.score) {
			this.pendingAlerts.set(alert.symbol, { alert, score });
		}

		this.resetQuietTimer();
		if (!this.maxTimer) {
			this.maxTimer = setTimeout(() => {
				void this.flush();
			}, this.maxWindowMs);
		}
	}

	hasPending(): boolean {
		return this.pendingAlerts.size > 0;
	}

	getStatus(): AlertBatcherStatus {
		return {
			pendingCount: this.pendingAlerts.size,
			pendingSymbols: [...this.pendingAlerts.keys()],
		};
	}

	stop(): void {
		this.clearTimers();
		this.pendingAlerts.clear();
	}

	private resetQuietTimer(): void {
		if (this.quietTimer) {
			clearTimeout(this.quietTimer);
		}
		this.quietTimer = setTimeout(() => {
			void this.flush();
		}, this.quietWindowMs);
	}

	private clearTimers(): void {
		if (this.quietTimer) {
			clearTimeout(this.quietTimer);
			this.quietTimer = null;
		}
		if (this.maxTimer) {
			clearTimeout(this.maxTimer);
			this.maxTimer = null;
		}
	}

	private async flush(): Promise<void> {
		if (this.pendingAlerts.size === 0) {
			this.clearTimers();
			return;
		}
		if (this.flushing) {
			this.resetQuietTimer();
			return;
		}

		this.flushing = true;
		this.clearTimers();

		const selectedAlerts = [...this.pendingAlerts.values()]
			.toSorted((left, right) => right.score - left.score)
			.slice(0, this.maxCandidates)
			.map((entry) => entry.alert);

		this.pendingAlerts.clear();

		try {
			await this.onBatch(
				selectedAlerts.map((alert) => alert.symbol),
				selectedAlerts,
			);
		} finally {
			this.flushing = false;
		}
	}
}

export function createAlertBatcher(config: AlertBatcherConfig): AlertBatcher {
	return new AlertBatcher(config);
}
