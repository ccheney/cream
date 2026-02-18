/**
 * HelixDB Client Unit Tests
 */

import { describe, expect, it } from "bun:test";
import {
	checkCircuit,
	createCircuitBreakerRuntime,
	createHelixClient,
	createHelixClientFromEnv,
	HelixError,
	isConnectionRefused,
	isRetryable,
	onCircuitFailure,
	onCircuitSuccess,
} from "../src/client.js";

const DEFAULT_CONFIG = {
	host: "localhost" as const,
	port: 6969,
	timeout: 5000,
	maxRetries: 3,
	retryDelay: 100,
	circuitBreakerThreshold: 3,
	circuitBreakerResetMs: 30_000,
};

describe("HelixDB Client", () => {
	registerCreateHelixClientSuite();
	registerCreateHelixClientFromEnvSuite();
	registerHelixErrorSuite();
	registerConnectionRefusedSuite();
	registerIsRetryableSuite();
	registerCheckCircuitSuite();
	registerCircuitLifecycleSuite();
});

describe("Query helpers", () => {
	describe("VectorSearchOptions defaults", () => {
		it("exports vector search types", async () => {
			const { vectorSearch } = await import("../src/queries/vector.js");
			expect(typeof vectorSearch).toBe("function");
		});
	});

	describe("TraversalOptions defaults", () => {
		it("exports graph traversal types", async () => {
			const { traverse, getNode } = await import("../src/queries/graph.js");
			expect(typeof traverse).toBe("function");
			expect(typeof getNode).toBe("function");
		});
	});

	describe("Export/Import utilities", () => {
		it("exports data portability types", async () => {
			const { exportData, importData } = await import("../src/queries/export.js");
			expect(typeof exportData).toBe("function");
			expect(typeof importData).toBe("function");
		});
	});
});

function registerCreateHelixClientSuite(): void {
	describe("createHelixClient", () => {
		it("creates client with default config", () => {
			const client = createHelixClient();
			const config = client.getConfig();
			expect(config.host).toBe("localhost");
			expect(config.port).toBe(6969);
			expect(config.timeout).toBe(5000);
			expect(config.maxRetries).toBe(3);
			expect(config.retryDelay).toBe(100);
		});

		it("creates client with custom config", () => {
			const client = createHelixClient({
				host: "helix.example.com",
				port: 7000,
				timeout: 10000,
				maxRetries: 5,
				retryDelay: 200,
			});
			const config = client.getConfig();
			expect(config.host).toBe("helix.example.com");
			expect(config.port).toBe(7000);
			expect(config.timeout).toBe(10000);
			expect(config.maxRetries).toBe(5);
			expect(config.retryDelay).toBe(200);
		});

		it("merges partial config with defaults", () => {
			const client = createHelixClient({ port: 8000 });
			const config = client.getConfig();
			expect(config.host).toBe("localhost");
			expect(config.port).toBe(8000);
			expect(config.timeout).toBe(5000);
		});

		it("starts disconnected", () => {
			const client = createHelixClient();
			expect(client.isConnected()).toBe(false);
		});

		it("closes cleanly", () => {
			const client = createHelixClient();
			client.close();
			expect(client.isConnected()).toBe(false);
		});
	});
}

function registerCreateHelixClientFromEnvSuite(): void {
	describe("createHelixClientFromEnv", () => {
		it("uses environment defaults when env vars not set", () => {
			const originalHost = Bun.env.HELIX_HOST;
			const originalPort = Bun.env.HELIX_PORT;
			delete Bun.env.HELIX_HOST;
			delete Bun.env.HELIX_PORT;

			try {
				const client = createHelixClientFromEnv();
				const config = client.getConfig();
				expect(config.host).toBe("localhost");
				expect(config.port).toBe(6969);
			} finally {
				if (originalHost) {
					Bun.env.HELIX_HOST = originalHost;
				}
				if (originalPort) {
					Bun.env.HELIX_PORT = originalPort;
				}
			}
		});
	});
}

function registerConnectionRefusedSuite(): void {
	describe("isConnectionRefused", () => {
		it("detects error with ConnectionRefused code", () => {
			const error = Object.assign(new Error("connection failed"), { code: "ConnectionRefused" });
			expect(isConnectionRefused(error)).toBe(true);
		});

		it("detects error with ConnectionRefused in message", () => {
			const error = new Error("code: ConnectionRefused");
			expect(isConnectionRefused(error)).toBe(true);
		});

		it("detects error with Unable to connect in message", () => {
			const error = new Error("Unable to connect. Is the computer able to access the url?");
			expect(isConnectionRefused(error)).toBe(true);
		});

		it("returns false for unrelated errors", () => {
			expect(isConnectionRefused(new Error("timeout"))).toBe(false);
		});

		it("returns false for non-Error values", () => {
			expect(isConnectionRefused("string error")).toBe(false);
			expect(isConnectionRefused(null)).toBe(false);
			expect(isConnectionRefused(undefined)).toBe(false);
		});
	});
}

function registerIsRetryableSuite(): void {
	describe("isRetryable", () => {
		it("returns false for CONNECTION_FAILED HelixError", () => {
			const error = new HelixError("connection failed", "CONNECTION_FAILED");
			expect(isRetryable(error)).toBe(false);
		});

		it("returns false for SCHEMA_ERROR HelixError", () => {
			const error = new HelixError("bad schema", "SCHEMA_ERROR");
			expect(isRetryable(error)).toBe(false);
		});

		it("returns false for INVALID_QUERY HelixError", () => {
			const error = new HelixError("invalid", "INVALID_QUERY");
			expect(isRetryable(error)).toBe(false);
		});

		it("returns false for NOT_FOUND HelixError", () => {
			const error = new HelixError("not found", "NOT_FOUND");
			expect(isRetryable(error)).toBe(false);
		});

		it("returns true for TIMEOUT HelixError", () => {
			const error = new HelixError("timed out", "TIMEOUT");
			expect(isRetryable(error)).toBe(true);
		});

		it("returns false for QUERY_FAILED with ConnectionRefused cause", () => {
			const cause = Object.assign(new Error("Unable to connect"), {
				code: "ConnectionRefused",
			});
			const error = new HelixError("query failed", "QUERY_FAILED", cause);
			expect(isRetryable(error)).toBe(false);
		});

		it("returns true for QUERY_FAILED with non-connection cause", () => {
			const cause = new Error("some other error");
			const error = new HelixError("query failed", "QUERY_FAILED", cause);
			expect(isRetryable(error)).toBe(true);
		});

		it("returns false for raw ConnectionRefused error", () => {
			const error = Object.assign(new Error("connection refused"), {
				code: "ConnectionRefused",
			});
			expect(isRetryable(error)).toBe(false);
		});

		it("returns true for generic network errors", () => {
			expect(isRetryable(new Error("ECONNRESET"))).toBe(true);
		});

		it("returns false for CIRCUIT_OPEN HelixError", () => {
			const error = new HelixError("circuit open", "CIRCUIT_OPEN");
			expect(isRetryable(error)).toBe(false);
		});
	});
}

function registerCheckCircuitSuite(): void {
	describe("checkCircuit", () => {
		it("allows requests when circuit is closed", () => {
			const circuit = createCircuitBreakerRuntime();
			expect(() => checkCircuit(circuit, DEFAULT_CONFIG)).not.toThrow();
		});

		it("throws CIRCUIT_OPEN when circuit is open and within reset window", () => {
			const circuit = createCircuitBreakerRuntime();
			circuit.state = "open";
			circuit.consecutiveFailures = 3;
			circuit.lastFailureTime = Date.now();
			expect(() => checkCircuit(circuit, DEFAULT_CONFIG)).toThrow(HelixError);
			try {
				checkCircuit(circuit, DEFAULT_CONFIG);
			} catch (err) {
				expect((err as HelixError).code).toBe("CIRCUIT_OPEN");
			}
		});

		it("transitions to half-open after reset window elapses", () => {
			const circuit = createCircuitBreakerRuntime();
			circuit.state = "open";
			circuit.consecutiveFailures = 3;
			circuit.lastFailureTime = Date.now() - 31_000;
			expect(() => checkCircuit(circuit, DEFAULT_CONFIG)).not.toThrow();
			expect(circuit.state as string).toBe("half-open");
		});

		it("allows requests when circuit is half-open", () => {
			const circuit = createCircuitBreakerRuntime();
			circuit.state = "half-open";
			expect(() => checkCircuit(circuit, DEFAULT_CONFIG)).not.toThrow();
		});
	});
}

function registerCircuitLifecycleSuite(): void {
	describe("onCircuitSuccess", () => {
		it("resets circuit to closed state", () => {
			const circuit = createCircuitBreakerRuntime();
			circuit.state = "half-open";
			circuit.consecutiveFailures = 3;
			onCircuitSuccess(circuit);
			expect(circuit.state as string).toBe("closed");
			expect(circuit.consecutiveFailures).toBe(0);
		});
	});

	describe("onCircuitFailure", () => {
		it("increments failure count", () => {
			const circuit = createCircuitBreakerRuntime();
			onCircuitFailure(circuit, DEFAULT_CONFIG);
			expect(circuit.consecutiveFailures).toBe(1);
			expect(circuit.state).toBe("closed");
		});

		it("opens circuit after reaching threshold", () => {
			const circuit = createCircuitBreakerRuntime();
			onCircuitFailure(circuit, DEFAULT_CONFIG);
			onCircuitFailure(circuit, DEFAULT_CONFIG);
			expect(circuit.state).toBe("closed");
			onCircuitFailure(circuit, DEFAULT_CONFIG);
			expect(circuit.state).toBe("open");
			expect(circuit.consecutiveFailures).toBe(3);
		});

		it("records lastFailureTime", () => {
			const circuit = createCircuitBreakerRuntime();
			const before = Date.now();
			onCircuitFailure(circuit, DEFAULT_CONFIG);
			expect(circuit.lastFailureTime).toBeGreaterThanOrEqual(before);
			expect(circuit.lastFailureTime).toBeLessThanOrEqual(Date.now());
		});
	});
}

function registerHelixErrorSuite(): void {
	describe("HelixError", () => {
		it("creates error with code", () => {
			const error = new HelixError("Test error", "CONNECTION_FAILED");
			expect(error.message).toBe("Test error");
			expect(error.code).toBe("CONNECTION_FAILED");
			expect(error.name).toBe("HelixError");
			expect(error.cause).toBeUndefined();
		});

		it("creates error with cause", () => {
			const cause = new Error("Original error");
			const error = new HelixError("Wrapped error", "QUERY_FAILED", cause);
			expect(error.message).toBe("Wrapped error");
			expect(error.code).toBe("QUERY_FAILED");
			expect(error.cause).toBe(cause);
		});

		it("is instance of Error", () => {
			const error = new HelixError("Test", "TIMEOUT");
			expect(error instanceof Error).toBe(true);
			expect(error instanceof HelixError).toBe(true);
		});
	});
}
