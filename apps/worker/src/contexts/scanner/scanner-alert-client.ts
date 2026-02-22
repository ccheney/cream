/**
 * Scanner Alert Client
 *
 * gRPC streaming client for scanner alerts from alpaca-stream-proxy.
 */

import { createScannerClient, type ScannerAlert } from "@cream/domain/grpc";
import { log } from "../../shared/logger.js";

const DEFAULT_STREAM_PROXY_URL = Bun.env.STREAM_PROXY_URL ?? "http://localhost:50052";
const DEFAULT_RECONNECT_DELAY_MS = 1_000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000;

export interface ScannerAlertStreamOptions {
	signal?: AbortSignal;
}

export interface ScannerAlertClientConfig {
	streamProxyUrl?: string;
	reconnectDelayMs?: number;
	maxReconnectDelayMs?: number;
}

export interface ScannerAlertClientPort {
	streamAlerts(options?: ScannerAlertStreamOptions): AsyncGenerator<ScannerAlert>;
}

interface NormalizedScannerAlertClientConfig {
	streamProxyUrl: string;
	reconnectDelayMs: number;
	maxReconnectDelayMs: number;
}

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function calculateReconnectDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
	const cappedExponentialDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
	return Math.floor(Math.random() * cappedExponentialDelay);
}

function isUnavailableError(error: unknown): boolean {
	return toErrorMessage(error).toLowerCase().includes("unavailable");
}

async function waitForScannerService(
	client: ReturnType<typeof createScannerClient>,
	config: NormalizedScannerAlertClientConfig,
	signal?: AbortSignal,
): Promise<void> {
	let attempt = 0;

	while (!signal?.aborted) {
		try {
			await client.getScannerStatus();
			if (attempt > 0) {
				log.info({ attempts: attempt }, "Scanner service became available");
			}
			return;
		} catch (error) {
			const delayMs = calculateReconnectDelay(
				attempt,
				config.reconnectDelayMs,
				config.maxReconnectDelayMs,
			);
			attempt += 1;

			if (attempt === 1 || attempt % 5 === 0) {
				log.info(
					{
						attempt,
						delayMs,
						streamProxyUrl: config.streamProxyUrl,
					},
					"Waiting for scanner service availability",
				);
			}

			await Bun.sleep(delayMs);
		}
	}
}

export class ScannerAlertClient implements ScannerAlertClientPort {
	private readonly config: NormalizedScannerAlertClientConfig;

	constructor(config: ScannerAlertClientConfig = {}) {
		this.config = {
			streamProxyUrl: config.streamProxyUrl ?? DEFAULT_STREAM_PROXY_URL,
			reconnectDelayMs: config.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS,
			maxReconnectDelayMs: config.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS,
		};
	}

	async *streamAlerts(options: ScannerAlertStreamOptions = {}): AsyncGenerator<ScannerAlert> {
		const scannerClient = createScannerClient(this.config.streamProxyUrl, {
			enableLogging: false,
			maxRetries: 0,
		});

		await waitForScannerService(scannerClient, this.config, options.signal);

		let reconnectAttempt = 0;
		while (!options.signal?.aborted) {
			try {
				for await (const streamResult of scannerClient.streamScannerAlerts()) {
					if (options.signal?.aborted) {
						return;
					}

					const alert = streamResult.data.alert;
					if (alert) {
						yield alert;
					}
					reconnectAttempt = 0;
				}

				if (options.signal?.aborted) {
					return;
				}

				const delayMs = calculateReconnectDelay(
					reconnectAttempt,
					this.config.reconnectDelayMs,
					this.config.maxReconnectDelayMs,
				);
				reconnectAttempt += 1;

				if (reconnectAttempt === 1 || reconnectAttempt % 5 === 0) {
					log.warn(
						{
							attempt: reconnectAttempt,
							delayMs,
							streamProxyUrl: this.config.streamProxyUrl,
						},
						"Scanner alert stream ended unexpectedly, reconnecting",
					);
				}
				await Bun.sleep(delayMs);
			} catch (error) {
				if (options.signal?.aborted) {
					return;
				}

				const delayMs = calculateReconnectDelay(
					reconnectAttempt,
					this.config.reconnectDelayMs,
					this.config.maxReconnectDelayMs,
				);
				reconnectAttempt += 1;

				const errorMessage = toErrorMessage(error);
				if (isUnavailableError(error)) {
					if (reconnectAttempt === 1 || reconnectAttempt % 5 === 0) {
						log.info(
							{
								attempt: reconnectAttempt,
								delayMs,
								streamProxyUrl: this.config.streamProxyUrl,
							},
							"Scanner alert stream unavailable, retrying",
						);
					}
				} else {
					log.warn(
						{
							attempt: reconnectAttempt,
							delayMs,
							streamProxyUrl: this.config.streamProxyUrl,
							error: errorMessage,
						},
						"Scanner alert stream failed, reconnecting",
					);
				}
				await Bun.sleep(delayMs);
			}
		}
	}
}

export function createScannerAlertClient(
	config: ScannerAlertClientConfig = {},
): ScannerAlertClient {
	return new ScannerAlertClient(config);
}
