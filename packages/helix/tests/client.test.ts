/**
 * HelixDB Client Unit Tests
 */

import { describe, expect, it } from "bun:test";
import { createHelixClient, createHelixClientFromEnv, HelixError } from "../src/client.js";

describe("HelixDB Client", () => {
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

	describe("createHelixClientFromEnv", () => {
		it("uses environment defaults when env vars not set", () => {
			// Clear relevant env vars
			const originalHost = process.env.HELIX_HOST;
			const originalPort = process.env.HELIX_PORT;
			delete process.env.HELIX_HOST;
			delete process.env.HELIX_PORT;

			try {
				const client = createHelixClientFromEnv();
				const config = client.getConfig();

				expect(config.host).toBe("localhost");
				expect(config.port).toBe(6969);
			} finally {
				// Restore
				if (originalHost) {
					process.env.HELIX_HOST = originalHost;
				}
				if (originalPort) {
					process.env.HELIX_PORT = originalPort;
				}
			}
		});
	});

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
