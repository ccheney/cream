/**
 * Scanner Data Streaming Service
 *
 * Bridges scanner gRPC stream from alpaca-stream-proxy to dashboard WebSocket clients.
 */

import { createScannerClient, type ScannerAlert, ScannerSignalType } from "@cream/domain/grpc";
import log from "../logger.js";
import { broadcastScannerAlert, broadcastScannerStatus } from "../websocket/channels.js";

function requireStreamProxyUrl(): string {
	const streamProxyUrl = Bun.env.STREAM_PROXY_URL;
	if (!streamProxyUrl) {
		throw new Error("STREAM_PROXY_URL environment variable is required.");
	}
	return streamProxyUrl;
}

const DEFAULT_STREAM_PROXY_URL = requireStreamProxyUrl();
const DEFAULT_STATUS_POLL_MS = 15_000;
const DEFAULT_RECONNECT_DELAY_MS = 1_000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000;
const scannerClient = createScannerClient(DEFAULT_STREAM_PROXY_URL, {
	enableLogging: false,
	maxRetries: 1,
});

let streamAbortController: AbortController | null = null;
let streamLoopPromise: Promise<void> | null = null;
let statusPollTimer: ReturnType<typeof setInterval> | null = null;
let streamingConnected = false;

function toNumber(value: bigint | number | undefined): number {
	if (typeof value === "bigint") {
		return Number(value);
	}
	return value ?? 0;
}

function mapSignal(signal: ScannerSignalType): "volume_spike" | "price_move" | "gap" {
	if (signal === ScannerSignalType.VOLUME_SPIKE) {
		return "volume_spike";
	}
	if (signal === ScannerSignalType.GAP) {
		return "gap";
	}
	return "price_move";
}

function toIsoTimestamp(timestamp: ScannerAlert["timestamp"]): string {
	if (!timestamp) {
		return new Date().toISOString();
	}

	const seconds =
		typeof timestamp.seconds === "bigint" ? Number(timestamp.seconds) : timestamp.seconds;
	const millis = seconds * 1000 + Math.floor((timestamp.nanos ?? 0) / 1_000_000);
	return new Date(millis).toISOString();
}

function calculateReconnectDelay(attempt: number): number {
	const capped = Math.min(
		DEFAULT_MAX_RECONNECT_DELAY_MS,
		DEFAULT_RECONNECT_DELAY_MS * 2 ** attempt,
	);
	return Math.floor(Math.random() * capped);
}

async function broadcastScannerRuntimeStatus(): Promise<void> {
	try {
		const status = await scannerClient.getScannerStatus();
		broadcastScannerStatus({
			type: "scanner_status",
			data: {
				active: status.data.active,
				symbolsTracked: status.data.symbolsTracked,
				totalAlerts: toNumber(status.data.totalAlerts),
				alertsLastHour: toNumber(status.data.alertsLastHour),
				timestamp: new Date().toISOString(),
			},
		});
	} catch (error) {
		log.warn(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to fetch scanner runtime status",
		);
	}
}

function toScannerAlertData(alert: ScannerAlert) {
	return {
		symbol: alert.symbol,
		signals: alert.signals.map(mapSignal),
		price: alert.price,
		volume: toNumber(alert.volume),
		avgVolume: toNumber(alert.avgVolume),
		volumeRatio: alert.volumeRatio,
		priceChangePct: alert.priceChangePct,
		gapPct: alert.gapPct,
		approxAtr: alert.approxAtr,
		timestamp: toIsoTimestamp(alert.timestamp),
	};
}

function broadcastLiveScannerAlert(alert: ScannerAlert): void {
	broadcastScannerAlert({
		type: "scanner_alert",
		data: toScannerAlertData(alert),
	});
}

async function streamScannerAlertsOnce(
	signal: AbortSignal,
	onAlertReceived: () => void,
): Promise<void> {
	for await (const streamResult of scannerClient.streamScannerAlerts()) {
		if (signal.aborted) {
			return;
		}

		const alert = streamResult.data.alert;
		if (!alert) {
			continue;
		}

		onAlertReceived();
		broadcastLiveScannerAlert(alert);
	}
}

type ReconnectReason = "stream-ended" | "stream-error";

async function reconnectAfterDelay(
	reason: ReconnectReason,
	attempt: number,
	error?: unknown,
): Promise<number> {
	const delayMs = calculateReconnectDelay(attempt);
	const nextAttempt = attempt + 1;
	streamingConnected = false;

	if (reason === "stream-ended") {
		log.warn(
			{ attempt: nextAttempt, delayMs },
			"Scanner alert stream ended unexpectedly, reconnecting",
		);
	} else {
		log.warn(
			{
				attempt: nextAttempt,
				delayMs,
				error: error instanceof Error ? error.message : String(error),
			},
			"Scanner alert stream failed, reconnecting",
		);
	}

	await Bun.sleep(delayMs);
	return nextAttempt;
}

async function runScannerAlertStream(signal: AbortSignal): Promise<void> {
	let reconnectAttempt = 0;

	while (!signal.aborted) {
		try {
			streamingConnected = true;
			await streamScannerAlertsOnce(signal, () => {
				reconnectAttempt = 0;
			});

			if (signal.aborted) {
				return;
			}
			reconnectAttempt = await reconnectAfterDelay("stream-ended", reconnectAttempt);
		} catch (error) {
			if (signal.aborted) {
				return;
			}
			reconnectAttempt = await reconnectAfterDelay("stream-error", reconnectAttempt, error);
		}
	}
}

export async function initScannerDataStreaming(): Promise<void> {
	if (streamLoopPromise) {
		return;
	}

	streamAbortController = new AbortController();
	streamLoopPromise = runScannerAlertStream(streamAbortController.signal);

	await broadcastScannerRuntimeStatus();
	statusPollTimer = setInterval(() => {
		void broadcastScannerRuntimeStatus();
	}, DEFAULT_STATUS_POLL_MS);

	log.info({ streamProxyUrl: DEFAULT_STREAM_PROXY_URL }, "Scanner data streaming initialized");
}

export function isScannerStreamingConnected(): boolean {
	return streamingConnected;
}

export function shutdownScannerDataStreaming(): void {
	streamAbortController?.abort();
	streamAbortController = null;
	streamLoopPromise = null;
	streamingConnected = false;

	if (statusPollTimer) {
		clearInterval(statusPollTimer);
		statusPollTimer = null;
	}

	log.info("Scanner data streaming shutdown");
}
