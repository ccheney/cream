import { describe, expect, it } from "bun:test";
import type { ServerWebSocket } from "bun";
import type { ConnectionMetadata } from "./handler.js";
import {
	createHealthCheckHandler,
	createShutdownManager,
	DEFAULT_SHUTDOWN_CONFIG,
	type ShutdownConfig,
	type ShutdownDependencies,
	type ShutdownLogEntry,
	shouldRejectConnection,
	WS_CLOSE_CODES,
} from "./shutdown.js";

type CloseCall = { code: number; reason: string };

type MockWebSocket = ServerWebSocket<ConnectionMetadata> & {
	closeCalls: CloseCall[];
};

type MockDependencies = ShutdownDependencies & {
	connections: Map<string, ServerWebSocket<ConnectionMetadata>>;
	logs: ShutdownLogEntry[];
	sentMessages: Array<{ connectionId: string; message: Record<string, unknown> }>;
	flushCalled: boolean;
	cleanupCalled: boolean;
};

function createMockWebSocket(connectionId: string): MockWebSocket {
	const closeCalls: CloseCall[] = [];
	return {
		data: {
			connectionId,
			userId: `user-${connectionId}`,
			connectedAt: new Date(),
			lastPing: new Date(),
			channels: new Set(),
			symbols: new Set(),
		},
		close(code?: number, reason?: string) {
			closeCalls.push({ code: code ?? 1000, reason: reason ?? "" });
		},
		send() {
			return 0;
		},
		closeCalls,
		cork: () => undefined,
		ping: () => undefined,
		pong: () => undefined,
		subscribe: () => undefined,
		unsubscribe: () => undefined,
		isSubscribed: () => false,
		publish: () => undefined,
		publishText: () => undefined,
		publishBinary: () => undefined,
		remoteAddress: "127.0.0.1",
		binaryType: "arraybuffer" as const,
		readyState: 1,
	} as unknown as MockWebSocket;
}

function createMockDependencies(): MockDependencies {
	const connections = new Map<string, MockWebSocket>();
	const logs: ShutdownLogEntry[] = [];
	const sentMessages: Array<{ connectionId: string; message: Record<string, unknown> }> = [];
	let flushCalled = false;
	let cleanupCalled = false;

	return {
		connections,
		logs,
		sentMessages,
		get flushCalled() {
			return flushCalled;
		},
		get cleanupCalled() {
			return cleanupCalled;
		},
		getConnections: () => connections as Map<string, ServerWebSocket<ConnectionMetadata>>,
		sendMessage: (ws, message) => {
			sentMessages.push({ connectionId: ws.data.connectionId, message });
			return true;
		},
		flushQueues: async () => {
			flushCalled = true;
			await new Promise((resolve) => setTimeout(resolve, 10));
		},
		cleanupSubscriptions: async () => {
			cleanupCalled = true;
			await new Promise((resolve) => setTimeout(resolve, 10));
		},
		onLog: (entry) => {
			logs.push(entry);
		},
	};
}

const TEST_CONFIG: Partial<ShutdownConfig> = {
	drainTimeout: 100,
	flushTimeout: 100,
	cleanupTimeout: 100,
	maxShutdownTime: 500,
	exitProcess: false,
};

function setup(config: Partial<ShutdownConfig> = TEST_CONFIG) {
	const deps = createMockDependencies();
	const manager = createShutdownManager(deps, config);
	return { deps, manager };
}

describe("createShutdownManager", () => {
	it("initializes state and health", () => {
		const { manager } = setup();
		const state = manager.getState();
		expect(state.phase).toBe("idle");
		expect(state.reason).toBe(null);
		expect(state.startedAt).toBe(null);
		expect(state.isShuttingDown).toBe(false);
		expect(state.initialConnectionCount).toBe(0);
		expect(state.forcedClosures).toBe(0);
		expect(state.droppedMessages).toBe(0);
		expect(manager.isHealthy()).toBe(true);
		expect(manager.isShuttingDown()).toBe(false);
		expect(manager.getCurrentPhase()).toBe("idle");
	});

	it("resets state after shutdown", async () => {
		const { manager } = setup();
		await manager.initiateShutdown("manual");
		manager.reset();
		expect(manager.getCurrentPhase()).toBe("idle");
		expect(manager.isShuttingDown()).toBe(false);
	});
});

describe("initiateShutdown", () => {
	it("sets shutdown flags, reason, start time, and initiation log", async () => {
		const { deps, manager } = setup();
		const before = Date.now();
		const promise = manager.initiateShutdown("SIGTERM");
		expect(manager.isShuttingDown()).toBe(true);
		expect(manager.isHealthy()).toBe(false);
		await promise;
		const after = Date.now();
		const state = manager.getState();
		expect(state.reason).toBe("SIGTERM");
		expect(state.startedAt).not.toBe(null);
		if (!state.startedAt) {
			throw new Error("Expected startedAt");
		}
		expect(state.startedAt.getTime()).toBeGreaterThanOrEqual(before);
		expect(state.startedAt.getTime()).toBeLessThanOrEqual(after);
		const initiated = deps.logs.find((log) => log.event === "shutdown.initiated");
		expect(initiated).toBeDefined();
	});

	it("prevents duplicate shutdown attempts", async () => {
		const { deps, manager } = setup();
		const first = manager.initiateShutdown("manual");
		const second = manager.initiateShutdown("SIGTERM");
		await Promise.all([first, second]);
		const initiatedLogs = deps.logs.filter((log) => log.event === "shutdown.initiated");
		expect(initiatedLogs.length).toBe(1);
		expect(initiatedLogs[0]?.message).toContain("manual");
		const duplicateError = deps.logs.find(
			(log) => log.event === "shutdown.error" && log.message.includes("already in progress"),
		);
		expect(duplicateError).toBeDefined();
	});
});

describe("shutdown phases", () => {
	it("progresses through phases and completes", async () => {
		const { deps, manager } = setup();
		await manager.initiateShutdown("manual");
		expect(manager.getCurrentPhase()).toBe("complete");
		const phases = deps.logs
			.filter((log) => log.event === "shutdown.phase_change")
			.map((log) => log.phase);
		expect(phases).toContain("reject_connections");
		expect(phases).toContain("warn_clients");
		expect(phases).toContain("drain_connections");
		expect(phases).toContain("force_close");
		expect(phases).toContain("cleanup_subscriptions");
		expect(phases).toContain("flush_queues");
		expect(phases).toContain("complete");
	});
});

describe("client warning phase", () => {
	it("warns all connected clients and logs warning count", async () => {
		const { deps, manager } = setup();
		deps.connections.set("conn-1", createMockWebSocket("conn-1"));
		deps.connections.set("conn-2", createMockWebSocket("conn-2"));
		await manager.initiateShutdown("manual");
		expect(deps.sentMessages.length).toBe(2);
		for (const message of deps.sentMessages) {
			expect(message.message.type).toBe("shutdown_warning");
			expect(message.message.timeout).toBeDefined();
		}
		const warnedLog = deps.logs.find((log) => log.event === "shutdown.connection_warned");
		expect(warnedLog).toBeDefined();
		expect(warnedLog?.message).toContain("2");
	});

	it("handles send failures without aborting shutdown", async () => {
		const { deps, manager } = setup();
		deps.connections.set("conn-1", createMockWebSocket("conn-1"));
		deps.sendMessage = () => false;
		await manager.initiateShutdown("manual");
		expect(manager.getCurrentPhase()).toBe("complete");
	});
});

describe("connection draining and force close", () => {
	it("drains connections that close before timeout", async () => {
		const { deps, manager } = setup();
		deps.connections.set("conn-1", createMockWebSocket("conn-1"));
		setTimeout(() => {
			deps.connections.delete("conn-1");
		}, 20);
		await manager.initiateShutdown("manual");
		const drainedLogs = deps.logs.filter((log) => log.event === "shutdown.connection_drained");
		expect(drainedLogs.length).toBeGreaterThan(0);
	});

	it("times out draining and then force-closes remaining connections", async () => {
		const { deps, manager } = setup();
		const ws1 = createMockWebSocket("conn-1");
		const ws2 = createMockWebSocket("conn-2");
		deps.connections.set("conn-1", ws1);
		deps.connections.set("conn-2", ws2);
		await manager.initiateShutdown("manual");
		const timeoutLog = deps.logs.find(
			(log) => log.event === "shutdown.timeout" && log.message.includes("Drain timeout"),
		);
		expect(timeoutLog).toBeDefined();
		expect(ws1.closeCalls[0]?.code).toBe(WS_CLOSE_CODES.SHUTDOWN);
		expect(ws2.closeCalls[0]?.code).toBe(WS_CLOSE_CODES.SHUTDOWN);
		expect(manager.getState().forcedClosures).toBe(2);
		expect(deps.logs.some((log) => log.event === "shutdown.connection_forced")).toBe(true);
	});
});

describe("cleanup and flush callbacks - success and missing", () => {
	it("runs cleanup/flush callbacks and logs success", async () => {
		const { deps, manager } = setup();
		await manager.initiateShutdown("manual");
		expect(deps.cleanupCalled).toBe(true);
		expect(deps.flushCalled).toBe(true);
		expect(
			deps.logs.some(
				(log) =>
					log.event === "shutdown.subscriptions_closed" && log.message.includes("successfully"),
			),
		).toBe(true);
		expect(
			deps.logs.some(
				(log) => log.event === "shutdown.queue_flushed" && log.message.includes("successfully"),
			),
		).toBe(true);
	});

	it("logs when cleanup/flush callbacks are missing", async () => {
		const { deps, manager } = setup();
		deps.cleanupSubscriptions = undefined;
		deps.flushQueues = undefined;
		await manager.initiateShutdown("manual");
		expect(
			deps.logs.some(
				(log) =>
					log.event === "shutdown.subscriptions_closed" &&
					log.message.includes("No subscription cleanup configured"),
			),
		).toBe(true);
		expect(
			deps.logs.some(
				(log) =>
					log.event === "shutdown.queue_flushed" &&
					log.message.includes("No queue flush configured"),
			),
		).toBe(true);
	});
});

describe("cleanup and flush callbacks - timeout and errors", () => {
	it("logs cleanup/flush timeout and callback errors but still completes", async () => {
		const { deps, manager } = setup();
		deps.cleanupSubscriptions = async () => {
			throw new Error("Cleanup failed");
		};
		deps.flushQueues = async () => {
			await new Promise((resolve) => setTimeout(resolve, 1000));
		};
		await manager.initiateShutdown("manual");
		expect(
			deps.logs.some(
				(log) => log.event === "shutdown.error" && log.message.includes("Cleanup failed"),
			),
		).toBe(true);
		expect(
			deps.logs.some((log) => log.event === "shutdown.error" && log.message.includes("flush")),
		).toBe(true);
		expect(manager.getCurrentPhase()).toBe("complete");
	});
});

describe("health check and connection rejection", () => {
	it("health reflects shutdown state and shouldRejectConnection", async () => {
		const { manager } = setup();
		expect(manager.isHealthy()).toBe(true);
		expect(shouldRejectConnection(manager)).toBe(false);
		const promise = manager.initiateShutdown("manual");
		expect(manager.isHealthy()).toBe(false);
		expect(shouldRejectConnection(manager)).toBe(true);
		await promise;
	});

	it("createHealthCheckHandler returns 200 or 503 based on health", async () => {
		const { manager } = setup();
		const handler = createHealthCheckHandler(manager);
		expect(handler().status).toBe(200);
		const promise = manager.initiateShutdown("manual");
		const unhealthy = handler();
		expect(unhealthy.status).toBe(503);
		const body = (await unhealthy.json()) as { status: string; reason: string };
		expect(body.status).toBe("unhealthy");
		expect(body.reason).toBe("shutting_down");
		await promise;
	});
});

describe("shutdown completion and forceShutdown", () => {
	it("logs completion with duration and metrics", async () => {
		const { deps, manager } = setup();
		deps.connections.set("conn-1", createMockWebSocket("conn-1"));
		await manager.initiateShutdown("manual");
		const completeLog = deps.logs.find((log) => log.event === "shutdown.complete");
		expect(completeLog).toBeDefined();
		expect((completeLog?.duration ?? -1) >= 0).toBe(true);
		expect(completeLog?.metadata?.forcedClosures).toBe(1);
	});

	it("forceShutdown closes all connections and logs forced shutdown", () => {
		const { deps, manager } = setup();
		const ws1 = createMockWebSocket("conn-1");
		const ws2 = createMockWebSocket("conn-2");
		deps.connections.set("conn-1", ws1);
		deps.connections.set("conn-2", ws2);
		manager.forceShutdown();
		expect(ws1.closeCalls.length).toBe(1);
		expect(ws2.closeCalls.length).toBe(1);
		expect(
			deps.logs.some((log) => log.event === "shutdown.complete" && log.message.includes("Forced")),
		).toBe(true);
	});
});

describe("signal handlers", () => {
	it("registers and unregisters signal handlers", () => {
		const { manager } = setup();
		expect(() => manager.registerSignalHandlers()).not.toThrow();
		expect(() => manager.unregisterSignalHandlers()).not.toThrow();
	});

	it("logs first registration and ignores duplicate registration", () => {
		const { deps, manager } = setup();
		manager.registerSignalHandlers();
		expect(
			deps.logs.some(
				(log) =>
					log.event === "shutdown.initiated" && log.message.includes("Signal handlers registered"),
			),
		).toBe(true);
		deps.logs.length = 0;
		manager.registerSignalHandlers();
		expect(deps.logs.length).toBe(0);
	});
});

describe("configuration and constants", () => {
	it("works with default config and merged custom config", async () => {
		const defaultSetup = setup({});
		expect(defaultSetup.manager.isHealthy()).toBe(true);
		const customSetup = setup({ drainTimeout: 50, exitProcess: false });
		customSetup.deps.connections.set("conn-1", createMockWebSocket("conn-1"));
		await customSetup.manager.initiateShutdown("manual");
		expect(customSetup.manager.getCurrentPhase()).toBe("complete");
	});

	it("exposes expected constants", () => {
		expect(DEFAULT_SHUTDOWN_CONFIG.drainTimeout).toBe(30000);
		expect(DEFAULT_SHUTDOWN_CONFIG.flushTimeout).toBe(10000);
		expect(DEFAULT_SHUTDOWN_CONFIG.cleanupTimeout).toBe(10000);
		expect(DEFAULT_SHUTDOWN_CONFIG.maxShutdownTime).toBe(60000);
		expect(DEFAULT_SHUTDOWN_CONFIG.exitProcess).toBe(true);
		expect(WS_CLOSE_CODES.NORMAL).toBe(1000);
		expect(WS_CLOSE_CODES.GOING_AWAY).toBe(1001);
		expect(WS_CLOSE_CODES.SHUTDOWN).toBe(1012);
	});
});

describe("edge cases", () => {
	it("handles empty connections and connection close/send errors", async () => {
		const empty = setup();
		await empty.manager.initiateShutdown("manual");
		expect(empty.manager.getCurrentPhase()).toBe("complete");

		const closeError = setup();
		const ws = {
			...createMockWebSocket("conn-1"),
			close() {
				throw new Error("Already closed");
			},
		} as unknown as ServerWebSocket<ConnectionMetadata>;
		closeError.deps.connections.set("conn-1", ws);
		await closeError.manager.initiateShutdown("manual");
		expect(closeError.manager.getCurrentPhase()).toBe("complete");

		const sendError = setup();
		sendError.deps.connections.set("conn-1", createMockWebSocket("conn-1"));
		sendError.deps.sendMessage = () => {
			throw new Error("Send failed");
		};
		await sendError.manager.initiateShutdown("manual");
		expect(sendError.manager.getCurrentPhase()).toBe("complete");
	});

	it("logs with timestamps/phase/count and supports no onLog callback", async () => {
		const { deps, manager } = setup();
		deps.connections.set("conn-1", createMockWebSocket("conn-1"));
		await manager.initiateShutdown("manual");
		expect(deps.logs.length).toBeGreaterThan(0);
		for (const log of deps.logs) {
			expect(new Date(log.timestamp).getTime()).not.toBeNaN();
			expect(log.phase).toBeDefined();
		}
		expect(deps.logs.some((log) => log.connectionCount !== undefined)).toBe(true);

		const noLog = setup();
		noLog.deps.onLog = undefined;
		const noLogManager = createShutdownManager(noLog.deps, TEST_CONFIG);
		await noLogManager.initiateShutdown("manual");
		expect(noLogManager.getCurrentPhase()).toBe("complete");
	});
});

describe("state snapshots", () => {
	it("getState returns snapshots and tracks initial connection count", async () => {
		const { deps, manager } = setup();
		const before = manager.getState();
		deps.connections.set("conn-1", createMockWebSocket("conn-1"));
		deps.connections.set("conn-2", createMockWebSocket("conn-2"));
		deps.connections.set("conn-3", createMockWebSocket("conn-3"));
		await manager.initiateShutdown("manual");
		const after = manager.getState();
		expect(before.isShuttingDown).toBe(false);
		expect(after.isShuttingDown).toBe(true);
		expect(after.initialConnectionCount).toBe(3);
	});
});
