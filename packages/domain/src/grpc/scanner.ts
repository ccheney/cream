/**
 * ScannerService gRPC Client
 *
 * Type-safe wrapper for scanner alert stream and scanner status APIs.
 */

import { create } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import {
	GetScannerStatusRequestSchema,
	type GetScannerStatusResponse,
	ReloadScannerConfigRequestSchema,
	type ReloadScannerConfigResponse,
	ScannerService,
	StreamScannerAlertsRequestSchema,
	type StreamScannerAlertsResponse,
} from "@cream/schema-gen/cream/v1/scanner";
import { log } from "../logger.js";
import { GrpcError, RetryBackoff, sleep } from "./errors.js";
import {
	DEFAULT_GRPC_CONFIG,
	type GrpcCallMetadata,
	type GrpcCallResult,
	type GrpcClientConfig,
	isRetryableErrorCode,
} from "./types.js";

/**
 * Scanner service gRPC client.
 */
export class ScannerServiceClient {
	private readonly config: Required<GrpcClientConfig>;
	private readonly client: ReturnType<typeof createClient<typeof ScannerService>>;

	constructor(config: GrpcClientConfig) {
		this.config = {
			...DEFAULT_GRPC_CONFIG,
			...config,
		};

		const transport = createGrpcTransport({
			baseUrl: this.config.baseUrl,
		});

		this.client = createClient(ScannerService, transport);
	}

	private generateRequestId(): string {
		return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}

	private createMetadata(cycleId?: string): GrpcCallMetadata {
		return {
			requestId: this.generateRequestId(),
			cycleId,
			startTime: Date.now(),
		};
	}

	private async executeWithRetry<T>(
		operation: () => Promise<T>,
		metadata: GrpcCallMetadata,
	): Promise<GrpcCallResult<T>> {
		const backoff = new RetryBackoff();
		let lastError: GrpcError | null = null;

		for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
			try {
				const data = await operation();
				const durationMs = Date.now() - metadata.startTime;
				return { data, metadata, durationMs };
			} catch (error) {
				lastError = GrpcError.fromConnectError(error, metadata.requestId);
				if (!isRetryableErrorCode(lastError.code) || attempt >= this.config.maxRetries) {
					break;
				}

				const delay = backoff.nextDelay();
				await sleep(delay);
			}
		}

		throw lastError ?? new GrpcError("Unknown error", "UNKNOWN", { requestId: metadata.requestId });
	}

	/**
	 * Get current scanner status.
	 */
	async getScannerStatus(cycleId?: string): Promise<GrpcCallResult<GetScannerStatusResponse>> {
		const metadata = this.createMetadata(cycleId);
		const request = create(GetScannerStatusRequestSchema, {});

		if (this.config.enableLogging) {
			log.info({ requestId: metadata.requestId }, "gRPC getScannerStatus");
		}

		return this.executeWithRetry(() => this.client.getScannerStatus(request), metadata);
	}

	/**
	 * Reload scanner config from persistence.
	 */
	async reloadScannerConfig(cycleId?: string): Promise<GrpcCallResult<ReloadScannerConfigResponse>> {
		const metadata = this.createMetadata(cycleId);
		const request = create(ReloadScannerConfigRequestSchema, {});

		if (this.config.enableLogging) {
			log.info({ requestId: metadata.requestId }, "gRPC reloadScannerConfig");
		}

		return this.executeWithRetry(() => this.client.reloadScannerConfig(request), metadata);
	}

	/**
	 * Subscribe to streaming scanner alerts.
	 */
	async *streamScannerAlerts(
		cycleId?: string,
	): AsyncGenerator<GrpcCallResult<StreamScannerAlertsResponse>> {
		const metadata = this.createMetadata(cycleId);
		const request = create(StreamScannerAlertsRequestSchema, {});

		if (this.config.enableLogging) {
			log.info({ requestId: metadata.requestId }, "gRPC streamScannerAlerts");
		}

		try {
			for await (const response of this.client.streamScannerAlerts(request)) {
				const durationMs = Date.now() - metadata.startTime;
				yield { data: response, metadata, durationMs };
			}
		} catch (error) {
			throw GrpcError.fromConnectError(error, metadata.requestId);
		}
	}
}

/**
 * Create scanner gRPC client.
 */
export function createScannerClient(
	baseUrl: string,
	options?: Partial<Omit<GrpcClientConfig, "baseUrl">>,
): ScannerServiceClient {
	return new ScannerServiceClient({ baseUrl, ...options });
}
