/**
 * ExecutionService gRPC Client
 *
 * Type-safe wrapper for the Rust execution engine ExecutionService.
 * Uses Connect-ES with gRPC transport for communication.
 */

import { createClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import {
	type CancelOrderRequest,
	type CancelOrderResponse,
	type CheckConstraintsRequest,
	type CheckConstraintsResponse,
	ExecutionService,
	type GetAccountStateRequest,
	type GetAccountStateResponse,
	type GetOrderStateRequest,
	type GetOrderStateResponse,
	type GetPositionsRequest,
	type GetPositionsResponse,
	type StreamExecutionsResponse,
	type SubmitOrderRequest,
	type SubmitOrderResponse,
} from "@cream/schema-gen/cream/v1/execution";
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
 * ExecutionService client with error handling and retries
 */
export class ExecutionServiceClient {
	private readonly config: Required<GrpcClientConfig>;
	private readonly client: ReturnType<typeof createClient<typeof ExecutionService>>;

	constructor(config: GrpcClientConfig) {
		this.config = {
			...DEFAULT_GRPC_CONFIG,
			...config,
		};

		// Create gRPC transport (HTTP/2 is the default and required for gRPC)
		const transport = createGrpcTransport({
			baseUrl: this.config.baseUrl,
		});

		// Create Connect client
		this.client = createClient(ExecutionService, transport);
	}

	/**
	 * Generate unique request ID
	 */
	private generateRequestId(): string {
		return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	}

	/**
	 * Create call metadata
	 */
	private createMetadata(cycleId?: string): GrpcCallMetadata {
		return {
			requestId: this.generateRequestId(),
			cycleId,
			startTime: Date.now(),
		};
	}

	/**
	 * Execute a gRPC call with retry logic
	 */
	private async executeWithRetry<T>(
		operation: () => Promise<T>,
		metadata: GrpcCallMetadata
	): Promise<GrpcCallResult<T>> {
		const backoff = new RetryBackoff();
		let lastError: GrpcError | null = null;

		for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
			try {
				const data = await operation();
				const durationMs = Date.now() - metadata.startTime;

				if (this.config.enableLogging) {
					log.info({ requestId: metadata.requestId, durationMs }, "gRPC call completed");
				}

				return { data, metadata, durationMs };
			} catch (error) {
				lastError = GrpcError.fromConnectError(error, metadata.requestId);

				if (this.config.enableLogging) {
					log.warn(
						{ requestId: metadata.requestId, attempt: attempt + 1, error: lastError.message },
						"gRPC call attempt failed"
					);
				}

				// Don't retry if error is not retryable or we've exhausted retries
				if (!isRetryableErrorCode(lastError.code) || attempt >= this.config.maxRetries) {
					break;
				}

				// Wait before retrying
				const delay = backoff.nextDelay();
				await sleep(delay);
			}
		}

		// Throw the last error if all retries failed
		throw lastError ?? new GrpcError("Unknown error", "UNKNOWN", { requestId: metadata.requestId });
	}

	/**
	 * Validate a decision plan against constraints
	 */
	async checkConstraints(
		request: CheckConstraintsRequest,
		cycleId?: string
	): Promise<GrpcCallResult<CheckConstraintsResponse>> {
		const metadata = this.createMetadata(cycleId);

		if (this.config.enableLogging) {
			log.info({ requestId: metadata.requestId }, "gRPC checkConstraints");
		}

		return this.executeWithRetry(() => this.client.checkConstraints(request), metadata);
	}

	/**
	 * Submit an order for execution
	 */
	async submitOrder(
		request: SubmitOrderRequest,
		cycleId?: string
	): Promise<GrpcCallResult<SubmitOrderResponse>> {
		const metadata = this.createMetadata(cycleId);

		if (this.config.enableLogging) {
			log.info({ requestId: metadata.requestId }, "gRPC submitOrder");
		}

		return this.executeWithRetry(() => this.client.submitOrder(request), metadata);
	}

	/**
	 * Get order state by order ID
	 */
	async getOrderState(
		request: GetOrderStateRequest,
		cycleId?: string
	): Promise<GrpcCallResult<GetOrderStateResponse>> {
		const metadata = this.createMetadata(cycleId);

		if (this.config.enableLogging) {
			log.info({ requestId: metadata.requestId }, "gRPC getOrderState");
		}

		return this.executeWithRetry(() => this.client.getOrderState(request), metadata);
	}

	/**
	 * Cancel an order
	 */
	async cancelOrder(
		request: CancelOrderRequest,
		cycleId?: string
	): Promise<GrpcCallResult<CancelOrderResponse>> {
		const metadata = this.createMetadata(cycleId);

		if (this.config.enableLogging) {
			log.info({ requestId: metadata.requestId }, "gRPC cancelOrder");
		}

		return this.executeWithRetry(() => this.client.cancelOrder(request), metadata);
	}

	/**
	 * Get current account state
	 */
	async getAccountState(
		request: GetAccountStateRequest = {} as GetAccountStateRequest,
		cycleId?: string
	): Promise<GrpcCallResult<GetAccountStateResponse>> {
		const metadata = this.createMetadata(cycleId);

		if (this.config.enableLogging) {
			log.info({ requestId: metadata.requestId }, "gRPC getAccountState");
		}

		return this.executeWithRetry(() => this.client.getAccountState(request), metadata);
	}

	/**
	 * Get current positions
	 */
	async getPositions(
		request: GetPositionsRequest = {} as GetPositionsRequest,
		cycleId?: string
	): Promise<GrpcCallResult<GetPositionsResponse>> {
		const metadata = this.createMetadata(cycleId);

		if (this.config.enableLogging) {
			log.info({ requestId: metadata.requestId }, "gRPC getPositions");
		}

		return this.executeWithRetry(() => this.client.getPositions(request), metadata);
	}

	/**
	 * Stream order execution updates
	 *
	 * Note: Returns an async iterator that yields execution updates.
	 * The caller should handle connection errors and reconnection.
	 */
	async *streamExecutions(
		cycleId?: string,
		orderIds?: string[]
	): AsyncGenerator<GrpcCallResult<StreamExecutionsResponse>> {
		const metadata = this.createMetadata(cycleId);

		if (this.config.enableLogging) {
			log.info({ requestId: metadata.requestId }, "gRPC streamExecutions");
		}

		const request = {
			cycleId,
			orderIds: orderIds ?? [],
		};

		try {
			for await (const response of this.client.streamExecutions(request)) {
				const durationMs = Date.now() - metadata.startTime;
				yield { data: response, metadata, durationMs };
			}
		} catch (error) {
			throw GrpcError.fromConnectError(error, metadata.requestId);
		}
	}
}

/**
 * Create an ExecutionServiceClient with default configuration
 */
export function createExecutionClient(
	baseUrl: string,
	options?: Partial<Omit<GrpcClientConfig, "baseUrl">>
): ExecutionServiceClient {
	return new ExecutionServiceClient({ baseUrl, ...options });
}
