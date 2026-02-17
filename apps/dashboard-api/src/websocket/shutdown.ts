/**
 * WebSocket Graceful Shutdown
 */

import type { ServerWebSocket } from "bun";
import type { ConnectionMetadata } from "./handler.js";

export type ShutdownPhase =
	| "idle"
	| "reject_connections"
	| "warn_clients"
	| "drain_connections"
	| "force_close"
	| "cleanup_subscriptions"
	| "flush_queues"
	| "complete";

export type ShutdownReason = "SIGTERM" | "SIGINT" | "manual" | "error";

export interface ShutdownConfig {
	drainTimeout: number;
	flushTimeout: number;
	cleanupTimeout: number;
	maxShutdownTime: number;
	exitProcess: boolean;
}

export interface ShutdownState {
	phase: ShutdownPhase;
	reason: ShutdownReason | null;
	startedAt: Date | null;
	isShuttingDown: boolean;
	initialConnectionCount: number;
	forcedClosures: number;
	droppedMessages: number;
}

export type ShutdownEventType =
	| "shutdown.initiated"
	| "shutdown.phase_change"
	| "shutdown.connection_warned"
	| "shutdown.connection_drained"
	| "shutdown.connection_forced"
	| "shutdown.queue_flushed"
	| "shutdown.subscriptions_closed"
	| "shutdown.complete"
	| "shutdown.timeout"
	| "shutdown.error";

export interface ShutdownLogEntry {
	timestamp: string;
	event: ShutdownEventType;
	phase: ShutdownPhase;
	reason?: ShutdownReason;
	connectionCount?: number;
	duration?: number;
	message: string;
	metadata?: Record<string, unknown>;
}

export type ShutdownLogCallback = (entry: ShutdownLogEntry) => void;
export type GetConnectionsCallback = () => Map<string, ServerWebSocket<ConnectionMetadata>>;
export type SendMessageCallback = (
	ws: ServerWebSocket<ConnectionMetadata>,
	message: Record<string, unknown>,
) => boolean;
export type FlushQueuesCallback = () => Promise<void>;
export type CleanupSubscriptionsCallback = () => Promise<void>;

export interface ShutdownDependencies {
	getConnections: GetConnectionsCallback;
	sendMessage: SendMessageCallback;
	flushQueues?: FlushQueuesCallback;
	cleanupSubscriptions?: CleanupSubscriptionsCallback;
	onLog?: ShutdownLogCallback;
}

export const DEFAULT_SHUTDOWN_CONFIG: ShutdownConfig = {
	drainTimeout: 30000,
	flushTimeout: 10000,
	cleanupTimeout: 10000,
	maxShutdownTime: 60000,
	exitProcess: true,
};

export const WS_CLOSE_CODES = {
	NORMAL: 1000,
	GOING_AWAY: 1001,
	SHUTDOWN: 1012,
} as const;

export interface ShutdownManager {
	getState(): ShutdownState;
	isHealthy(): boolean;
	isShuttingDown(): boolean;
	getCurrentPhase(): ShutdownPhase;
	registerSignalHandlers(): void;
	unregisterSignalHandlers(): void;
	initiateShutdown(reason: ShutdownReason): Promise<void>;
	forceShutdown(): void;
	reset(): void;
}

const sleep = Bun.sleep;

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

class ShutdownManagerImpl implements ShutdownManager {
	private readonly config: ShutdownConfig;
	private readonly state: ShutdownState = {
		phase: "idle",
		reason: null,
		startedAt: null,
		isShuttingDown: false,
		initialConnectionCount: 0,
		forcedClosures: 0,
		droppedMessages: 0,
	};

	private signalHandlerRegistered = false;
	private shutdownTimeout: ReturnType<typeof setTimeout> | null = null;

	private readonly handleSigterm = (): void => {
		void this.initiateShutdown("SIGTERM");
	};

	private readonly handleSigint = (): void => {
		void this.initiateShutdown("SIGINT");
	};

	constructor(
		private readonly deps: ShutdownDependencies,
		config: Partial<ShutdownConfig>,
	) {
		this.config = { ...DEFAULT_SHUTDOWN_CONFIG, ...config };
	}

	private log(event: ShutdownEventType, message: string, metadata?: Record<string, unknown>): void {
		if (!this.deps.onLog) {
			return;
		}

		const entry: ShutdownLogEntry = {
			timestamp: new Date().toISOString(),
			event,
			phase: this.state.phase,
			reason: this.state.reason ?? undefined,
			connectionCount: this.deps.getConnections().size,
			duration: this.state.startedAt ? Date.now() - this.state.startedAt.getTime() : undefined,
			message,
			metadata,
		};
		this.deps.onLog(entry);
	}

	private setPhase(phase: ShutdownPhase): void {
		const previousPhase = this.state.phase;
		this.state.phase = phase;
		this.log("shutdown.phase_change", `Phase transition: ${previousPhase} -> ${phase}`, {
			previousPhase,
			newPhase: phase,
		});
	}

	private rejectConnectionsPhase(): void {
		this.setPhase("reject_connections");
	}

	private warnClientsPhase(): void {
		this.setPhase("warn_clients");
		const connections = this.deps.getConnections();
		let warned = 0;

		for (const [_connectionId, ws] of connections) {
			try {
				const success = this.deps.sendMessage(ws, {
					type: "shutdown_warning",
					message: "Server shutting down. Please reconnect to another server.",
					timeout: this.config.drainTimeout / 1000,
					timestamp: new Date().toISOString(),
				});
				if (success) {
					warned++;
				}
			} catch {
				// Connection already closed
			}
		}

		this.log("shutdown.connection_warned", `Warned ${warned} connections of shutdown`, {
			warnedCount: warned,
			totalConnections: connections.size,
		});
	}

	private async drainConnectionsPhase(): Promise<void> {
		this.setPhase("drain_connections");
		const startTime = Date.now();
		const checkInterval = 100;

		while (Date.now() - startTime < this.config.drainTimeout) {
			const connections = this.deps.getConnections();
			if (connections.size === 0) {
				this.log("shutdown.connection_drained", "All connections drained successfully", {
					duration: Date.now() - startTime,
				});
				return;
			}

			if ((Date.now() - startTime) % 5000 < checkInterval) {
				this.log(
					"shutdown.connection_drained",
					`Waiting for ${connections.size} connections to drain`,
					{
						remainingConnections: connections.size,
						elapsed: Date.now() - startTime,
					},
				);
			}

			await sleep(checkInterval);
		}

		this.log(
			"shutdown.timeout",
			`Drain timeout reached with ${this.deps.getConnections().size} connections`,
			{ remainingConnections: this.deps.getConnections().size },
		);
	}

	private forceClosePhase(): void {
		this.setPhase("force_close");
		const connections = this.deps.getConnections();
		let closed = 0;

		for (const [connectionId, ws] of connections) {
			try {
				ws.close(WS_CLOSE_CODES.SHUTDOWN, "Server shutdown");
				closed++;
				this.state.forcedClosures++;
				this.log("shutdown.connection_forced", `Force closed connection: ${connectionId}`, {
					connectionId,
				});
			} catch {
				// Already closed
			}
		}

		if (closed > 0) {
			this.log("shutdown.connection_forced", `Force closed ${closed} connections`, {
				forcedCount: closed,
			});
		}
	}

	private async cleanupSubscriptionsPhase(): Promise<void> {
		this.setPhase("cleanup_subscriptions");
		if (!this.deps.cleanupSubscriptions) {
			this.log("shutdown.subscriptions_closed", "No subscription cleanup configured", {});
			return;
		}

		try {
			await Promise.race([
				this.deps.cleanupSubscriptions(),
				sleep(this.config.cleanupTimeout).then(() => {
					throw new Error("Subscription cleanup timeout");
				}),
			]);
			this.log("shutdown.subscriptions_closed", "Subscriptions cleaned up successfully", {});
		} catch (error) {
			this.log("shutdown.error", `Subscription cleanup failed: ${getErrorMessage(error)}`, {
				error: getErrorMessage(error),
			});
		}
	}

	private async flushQueuesPhase(): Promise<void> {
		this.setPhase("flush_queues");
		if (!this.deps.flushQueues) {
			this.log("shutdown.queue_flushed", "No queue flush configured", {});
			return;
		}

		try {
			await Promise.race([
				this.deps.flushQueues(),
				sleep(this.config.flushTimeout).then(() => {
					throw new Error("Queue flush timeout");
				}),
			]);
			this.log("shutdown.queue_flushed", "Message queues flushed successfully", {});
		} catch (error) {
			this.log("shutdown.error", `Queue flush failed: ${getErrorMessage(error)}`, {
				error: getErrorMessage(error),
			});
		}
	}

	private completePhase(): void {
		this.setPhase("complete");
		const duration = this.state.startedAt ? Date.now() - this.state.startedAt.getTime() : 0;
		this.log("shutdown.complete", `Shutdown complete in ${duration}ms`, {
			duration,
			forcedClosures: this.state.forcedClosures,
			droppedMessages: this.state.droppedMessages,
		});

		if (this.config.exitProcess) {
			setTimeout(() => {
				process.exit(0);
			}, 100);
		}
	}

	private startOverallTimeout(): void {
		this.shutdownTimeout = setTimeout(() => {
			this.log("shutdown.timeout", "Maximum shutdown time exceeded, forcing exit", {
				maxTime: this.config.maxShutdownTime,
			});
			this.forceShutdown();
		}, this.config.maxShutdownTime);
	}

	private clearOverallTimeout(): void {
		if (!this.shutdownTimeout) {
			return;
		}
		clearTimeout(this.shutdownTimeout);
		this.shutdownTimeout = null;
	}

	getState(): ShutdownState {
		return { ...this.state };
	}

	isHealthy(): boolean {
		return !this.state.isShuttingDown;
	}

	isShuttingDown(): boolean {
		return this.state.isShuttingDown;
	}

	getCurrentPhase(): ShutdownPhase {
		return this.state.phase;
	}

	registerSignalHandlers(): void {
		if (this.signalHandlerRegistered) {
			return;
		}
		process.on("SIGTERM", this.handleSigterm);
		process.on("SIGINT", this.handleSigint);
		this.signalHandlerRegistered = true;
		this.log("shutdown.initiated", "Signal handlers registered (SIGTERM, SIGINT)", {});
	}

	unregisterSignalHandlers(): void {
		if (!this.signalHandlerRegistered) {
			return;
		}
		process.off("SIGTERM", this.handleSigterm);
		process.off("SIGINT", this.handleSigint);
		this.signalHandlerRegistered = false;
	}

	async initiateShutdown(reason: ShutdownReason): Promise<void> {
		if (this.state.isShuttingDown) {
			this.log("shutdown.error", "Shutdown already in progress", {
				existingReason: this.state.reason,
			});
			return;
		}

		this.state.isShuttingDown = true;
		this.state.reason = reason;
		this.state.startedAt = new Date();
		this.state.initialConnectionCount = this.deps.getConnections().size;

		this.log("shutdown.initiated", `Shutdown initiated: ${reason}`, {
			reason,
			initialConnections: this.state.initialConnectionCount,
		});

		this.startOverallTimeout();

		try {
			this.rejectConnectionsPhase();
			this.warnClientsPhase();
			await this.drainConnectionsPhase();
			this.forceClosePhase();
			await this.cleanupSubscriptionsPhase();
			await this.flushQueuesPhase();
			this.completePhase();
		} catch (error) {
			this.log("shutdown.error", `Shutdown error: ${getErrorMessage(error)}`, {
				error: getErrorMessage(error),
			});
			this.forceShutdown();
		} finally {
			this.clearOverallTimeout();
		}
	}

	forceShutdown(): void {
		this.log("shutdown.complete", "Forced shutdown", {
			reason: this.state.reason,
			forcedClosures: this.state.forcedClosures,
		});

		for (const [_id, ws] of this.deps.getConnections()) {
			try {
				ws.close(WS_CLOSE_CODES.SHUTDOWN, "Forced shutdown");
			} catch {
				// Ignore close errors
			}
		}

		if (this.config.exitProcess) {
			process.exit(1);
		}
	}

	reset(): void {
		this.state.phase = "idle";
		this.state.reason = null;
		this.state.startedAt = null;
		this.state.isShuttingDown = false;
		this.state.initialConnectionCount = 0;
		this.state.forcedClosures = 0;
		this.state.droppedMessages = 0;
		this.clearOverallTimeout();
	}
}

export function createShutdownManager(
	deps: ShutdownDependencies,
	config: Partial<ShutdownConfig> = {},
): ShutdownManager {
	return new ShutdownManagerImpl(deps, config);
}

export function shouldRejectConnection(manager: ShutdownManager): boolean {
	return manager.isShuttingDown();
}

export function createHealthCheckHandler(manager: ShutdownManager) {
	return (): Response => {
		if (!manager.isHealthy()) {
			return Response.json(
				{
					status: "unhealthy",
					reason: "shutting_down",
					phase: manager.getCurrentPhase(),
				},
				{ status: 503 },
			);
		}

		return Response.json({
			status: "healthy",
		});
	};
}

export default {
	createShutdownManager,
	shouldRejectConnection,
	createHealthCheckHandler,
	DEFAULT_SHUTDOWN_CONFIG,
	WS_CLOSE_CODES,
};
