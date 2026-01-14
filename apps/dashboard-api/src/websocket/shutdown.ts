/**
 * WebSocket Graceful Shutdown
 *
 * Implements graceful shutdown with connection draining, message queue flushing,
 * and event subscription cleanup for zero-downtime deployments.
 *
 * @see docs/plans/ui/06-websocket.md
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
	/** Time to wait for clients to disconnect after warning (ms) */
	drainTimeout: number;
	/** Time to wait for queue flush (ms) */
	flushTimeout: number;
	/** Time to wait for subscription cleanup (ms) */
	cleanupTimeout: number;
	/** Maximum total shutdown time (ms) */
	maxShutdownTime: number;
	/** Whether to exit process after shutdown */
	exitProcess: boolean;
}

export interface ShutdownState {
	/** Current shutdown phase */
	phase: ShutdownPhase;
	/** Reason for shutdown */
	reason: ShutdownReason | null;
	/** Timestamp when shutdown started */
	startedAt: Date | null;
	/** Whether shutdown is in progress */
	isShuttingDown: boolean;
	/** Number of connections at shutdown start */
	initialConnectionCount: number;
	/** Number of connections forcefully closed */
	forcedClosures: number;
	/** Number of messages dropped */
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
	message: Record<string, unknown>
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
	drainTimeout: 30000, // 30s for clients to disconnect
	flushTimeout: 10000, // 10s to flush queues
	cleanupTimeout: 10000, // 10s for subscription cleanup
	maxShutdownTime: 60000, // 60s max total
	exitProcess: true,
};

export const WS_CLOSE_CODES = {
	NORMAL: 1000,
	GOING_AWAY: 1001,
	SHUTDOWN: 1012,
} as const;

/**
 * Manages graceful WebSocket server shutdown.
 *
 * @example
 * ```ts
 * const shutdown = createShutdownManager({
 *   getConnections: () => connections,
 *   sendMessage: (ws, msg) => { ws.send(JSON.stringify(msg)); return true; },
 *   flushQueues: async () => { batcher.flush(); },
 *   cleanupSubscriptions: async () => { redis.quit(); },
 *   onLog: (entry) => console.log(JSON.stringify(entry)),
 * });
 *
 * // Start signal handlers
 * shutdown.registerSignalHandlers();
 *
 * // Check health (for load balancer)
 * if (!shutdown.isHealthy()) {
 *   return new Response("Service Unavailable", { status: 503 });
 * }
 *
 * // Manual shutdown
 * await shutdown.initiateShutdown("manual");
 * ```
 */
export interface ShutdownManager {
	/** Current shutdown state */
	getState(): ShutdownState;

	/** Check if server is accepting connections */
	isHealthy(): boolean;

	/** Check if shutdown is in progress */
	isShuttingDown(): boolean;

	/** Get current phase */
	getCurrentPhase(): ShutdownPhase;

	/** Register signal handlers (SIGTERM, SIGINT) */
	registerSignalHandlers(): void;

	/** Unregister signal handlers */
	unregisterSignalHandlers(): void;

	/** Initiate graceful shutdown */
	initiateShutdown(reason: ShutdownReason): Promise<void>;

	/** Force immediate shutdown */
	forceShutdown(): void;

	/** Reset state (for testing) */
	reset(): void;
}

/**
 * Create a shutdown manager.
 */
export function createShutdownManager(
	deps: ShutdownDependencies,
	config: Partial<ShutdownConfig> = {}
): ShutdownManager {
	const fullConfig: ShutdownConfig = { ...DEFAULT_SHUTDOWN_CONFIG, ...config };

	const state: ShutdownState = {
		phase: "idle",
		reason: null,
		startedAt: null,
		isShuttingDown: false,
		initialConnectionCount: 0,
		forcedClosures: 0,
		droppedMessages: 0,
	};

	let signalHandlerRegistered = false;
	let shutdownTimeout: ReturnType<typeof setTimeout> | null = null;

	const log = (
		event: ShutdownEventType,
		message: string,
		metadata?: Record<string, unknown>
	): void => {
		if (!deps.onLog) {
			return;
		}

		const entry: ShutdownLogEntry = {
			timestamp: new Date().toISOString(),
			event,
			phase: state.phase,
			reason: state.reason ?? undefined,
			connectionCount: deps.getConnections().size,
			duration: state.startedAt ? Date.now() - state.startedAt.getTime() : undefined,
			message,
			metadata,
		};

		deps.onLog(entry);
	};

	const setPhase = (phase: ShutdownPhase): void => {
		const previousPhase = state.phase;
		state.phase = phase;

		log("shutdown.phase_change", `Phase transition: ${previousPhase} → ${phase}`, {
			previousPhase,
			newPhase: phase,
		});
	};

	/** Server marks itself as unhealthy so load balancer stops routing traffic. */
	const rejectConnectionsPhase = (): void => {
		setPhase("reject_connections");
	};

	const warnClientsPhase = (): void => {
		setPhase("warn_clients");

		const connections = deps.getConnections();
		let warned = 0;

		for (const [_connectionId, ws] of connections) {
			try {
				const success = deps.sendMessage(ws, {
					type: "shutdown_warning",
					message: "Server shutting down. Please reconnect to another server.",
					timeout: fullConfig.drainTimeout / 1000,
					timestamp: new Date().toISOString(),
				});

				if (success) {
					warned++;
				}
			} catch {
				// Connection already closed
			}
		}

		log("shutdown.connection_warned", `Warned ${warned} connections of shutdown`, {
			warnedCount: warned,
			totalConnections: connections.size,
		});
	};

	const drainConnectionsPhase = async (): Promise<void> => {
		setPhase("drain_connections");

		const startTime = Date.now();
		const checkInterval = 100; // Check every 100ms

		while (Date.now() - startTime < fullConfig.drainTimeout) {
			const connections = deps.getConnections();

			if (connections.size === 0) {
				log("shutdown.connection_drained", "All connections drained successfully", {
					duration: Date.now() - startTime,
				});
				return;
			}

			// Log progress every 5 seconds
			if ((Date.now() - startTime) % 5000 < checkInterval) {
				log("shutdown.connection_drained", `Waiting for ${connections.size} connections to drain`, {
					remainingConnections: connections.size,
					elapsed: Date.now() - startTime,
				});
			}

			await sleep(checkInterval);
		}

		log(
			"shutdown.timeout",
			`Drain timeout reached with ${deps.getConnections().size} connections`,
			{
				remainingConnections: deps.getConnections().size,
			}
		);
	};

	const forceClosePhase = (): void => {
		setPhase("force_close");

		const connections = deps.getConnections();
		let closed = 0;

		for (const [connectionId, ws] of connections) {
			try {
				ws.close(WS_CLOSE_CODES.SHUTDOWN, "Server shutdown");
				closed++;
				state.forcedClosures++;

				log("shutdown.connection_forced", `Force closed connection: ${connectionId}`, {
					connectionId,
				});
			} catch {
				// Already closed
			}
		}

		if (closed > 0) {
			log("shutdown.connection_forced", `Force closed ${closed} connections`, {
				forcedCount: closed,
			});
		}
	};

	/** Close Redis connections, gRPC streams, etc. */
	const cleanupSubscriptionsPhase = async (): Promise<void> => {
		setPhase("cleanup_subscriptions");

		if (!deps.cleanupSubscriptions) {
			log("shutdown.subscriptions_closed", "No subscription cleanup configured", {});
			return;
		}

		try {
			const cleanup = Promise.race([
				deps.cleanupSubscriptions(),
				sleep(fullConfig.cleanupTimeout).then(() => {
					throw new Error("Subscription cleanup timeout");
				}),
			]);

			await cleanup;
			log("shutdown.subscriptions_closed", "Subscriptions cleaned up successfully", {});
		} catch (error) {
			log("shutdown.error", `Subscription cleanup failed: ${(error as Error).message}`, {
				error: (error as Error).message,
			});
		}
	};

	const flushQueuesPhase = async (): Promise<void> => {
		setPhase("flush_queues");

		if (!deps.flushQueues) {
			log("shutdown.queue_flushed", "No queue flush configured", {});
			return;
		}

		try {
			const flush = Promise.race([
				deps.flushQueues(),
				sleep(fullConfig.flushTimeout).then(() => {
					throw new Error("Queue flush timeout");
				}),
			]);

			await flush;
			log("shutdown.queue_flushed", "Message queues flushed successfully", {});
		} catch (error) {
			log("shutdown.error", `Queue flush failed: ${(error as Error).message}`, {
				error: (error as Error).message,
			});
		}
	};

	const completePhase = (): void => {
		setPhase("complete");

		const duration = state.startedAt ? Date.now() - state.startedAt.getTime() : 0;

		log("shutdown.complete", `Shutdown complete in ${duration}ms`, {
			duration,
			forcedClosures: state.forcedClosures,
			droppedMessages: state.droppedMessages,
		});

		if (fullConfig.exitProcess) {
			// Allow final log to flush before exiting
			setTimeout(() => {
				process.exit(0);
			}, 100);
		}
	};

	const initiateShutdown = async (reason: ShutdownReason): Promise<void> => {
		if (state.isShuttingDown) {
			log("shutdown.error", "Shutdown already in progress", { existingReason: state.reason });
			return;
		}

		state.isShuttingDown = true;
		state.reason = reason;
		state.startedAt = new Date();
		state.initialConnectionCount = deps.getConnections().size;

		log("shutdown.initiated", `Shutdown initiated: ${reason}`, {
			reason,
			initialConnections: state.initialConnectionCount,
		});

		// Set overall timeout
		shutdownTimeout = setTimeout(() => {
			log("shutdown.timeout", "Maximum shutdown time exceeded, forcing exit", {
				maxTime: fullConfig.maxShutdownTime,
			});
			forceShutdown();
		}, fullConfig.maxShutdownTime);

		try {
			rejectConnectionsPhase();
			warnClientsPhase();
			await drainConnectionsPhase();
			forceClosePhase();
			await cleanupSubscriptionsPhase();
			await flushQueuesPhase();
			completePhase();
		} catch (error) {
			log("shutdown.error", `Shutdown error: ${(error as Error).message}`, {
				error: (error as Error).message,
			});
			forceShutdown();
		} finally {
			if (shutdownTimeout) {
				clearTimeout(shutdownTimeout);
				shutdownTimeout = null;
			}
		}
	};

	const forceShutdown = (): void => {
		log("shutdown.complete", "Forced shutdown", {
			reason: state.reason,
			forcedClosures: state.forcedClosures,
		});

		const connections = deps.getConnections();
		for (const [_id, ws] of connections) {
			try {
				ws.close(WS_CLOSE_CODES.SHUTDOWN, "Forced shutdown");
			} catch {}
		}

		if (fullConfig.exitProcess) {
			process.exit(1);
		}
	};

	const handleSigterm = (): void => {
		initiateShutdown("SIGTERM");
	};

	const handleSigint = (): void => {
		initiateShutdown("SIGINT");
	};

	const registerSignalHandlers = (): void => {
		if (signalHandlerRegistered) {
			return;
		}

		process.on("SIGTERM", handleSigterm);
		process.on("SIGINT", handleSigint);

		signalHandlerRegistered = true;

		log("shutdown.initiated", "Signal handlers registered (SIGTERM, SIGINT)", {});
	};

	const unregisterSignalHandlers = (): void => {
		if (!signalHandlerRegistered) {
			return;
		}

		process.off("SIGTERM", handleSigterm);
		process.off("SIGINT", handleSigint);

		signalHandlerRegistered = false;
	};

	return {
		getState(): ShutdownState {
			return { ...state };
		},

		isHealthy(): boolean {
			return !state.isShuttingDown;
		},

		isShuttingDown(): boolean {
			return state.isShuttingDown;
		},

		getCurrentPhase(): ShutdownPhase {
			return state.phase;
		},

		registerSignalHandlers,
		unregisterSignalHandlers,
		initiateShutdown,
		forceShutdown,

		reset(): void {
			state.phase = "idle";
			state.reason = null;
			state.startedAt = null;
			state.isShuttingDown = false;
			state.initialConnectionCount = 0;
			state.forcedClosures = 0;
			state.droppedMessages = 0;

			if (shutdownTimeout) {
				clearTimeout(shutdownTimeout);
				shutdownTimeout = null;
			}
		},
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Use in the upgrade handler to reject new connections during shutdown. */
export function shouldRejectConnection(manager: ShutdownManager): boolean {
	return manager.isShuttingDown();
}

/** Returns 503 during shutdown for load balancer health checks. */
export function createHealthCheckHandler(manager: ShutdownManager) {
	return (): Response => {
		if (!manager.isHealthy()) {
			return new Response(
				JSON.stringify({
					status: "unhealthy",
					reason: "shutting_down",
					phase: manager.getCurrentPhase(),
				}),
				{
					status: 503,
					headers: { "Content-Type": "application/json" },
				}
			);
		}

		return new Response(
			JSON.stringify({
				status: "healthy",
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		);
	};
}

export default {
	createShutdownManager,
	shouldRejectConnection,
	createHealthCheckHandler,
	DEFAULT_SHUTDOWN_CONFIG,
	WS_CLOSE_CODES,
};
