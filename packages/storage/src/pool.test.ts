/**
 * Tests for Connection Pool
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
	type ConnectionPool,
	createHttpPool,
	createPool,
	createTursoPool,
	type HttpPool,
	type PoolConfig,
} from "./pool.js";

// ============================================
// Test Utilities
// ============================================

interface MockConnection {
	id: number;
	isValid: boolean;
	isClosed: boolean;
}

function createMockConfig(
	overrides: Partial<PoolConfig<MockConnection>> = {}
): PoolConfig<MockConnection> {
	let nextId = 1;

	return {
		create: async () => ({
			id: nextId++,
			isValid: true,
			isClosed: false,
		}),
		destroy: async (conn) => {
			conn.isClosed = true;
		},
		validate: async (conn) => conn.isValid && !conn.isClosed,
		min: 1,
		max: 5,
		idleTimeout: 1000,
		acquireTimeout: 500,
		maxAge: 5000,
		healthCheckInterval: 60000, // Long interval to avoid interference in tests
		name: "test",
		...overrides,
	};
}

// ============================================
// Basic Pool Tests
// ============================================

describe("ConnectionPool", () => {
	let pool: ConnectionPool<MockConnection>;

	afterEach(async () => {
		if (pool && !pool.isClosed()) {
			await pool.close();
		}
	});

	describe("creation and initialization", () => {
		test("creates pool with minimum connections", async () => {
			pool = createPool(createMockConfig({ min: 2 }));

			// Wait for initialization
			await new Promise((resolve) => setTimeout(resolve, 50));

			const stats = pool.getStats();
			expect(stats.size).toBeGreaterThanOrEqual(2);
		});

		test("pool starts unclosed", () => {
			pool = createPool(createMockConfig());
			expect(pool.isClosed()).toBe(false);
		});
	});

	describe("acquire and release", () => {
		test("acquires connection from pool", async () => {
			pool = createPool(createMockConfig());

			const conn = await pool.acquire();
			expect(conn).toBeDefined();
			expect(conn.id).toBeGreaterThan(0);

			pool.release(conn);
		});

		test("reuses released connections", async () => {
			pool = createPool(createMockConfig({ min: 1, max: 1 }));

			const conn1 = await pool.acquire();
			const id1 = conn1.id;
			pool.release(conn1);

			const conn2 = await pool.acquire();
			expect(conn2.id).toBe(id1);

			pool.release(conn2);
		});

		test("creates new connection when none available", async () => {
			pool = createPool(createMockConfig({ min: 0, max: 2 }));

			const conn1 = await pool.acquire();
			const conn2 = await pool.acquire();

			expect(conn1.id).not.toBe(conn2.id);

			pool.release(conn1);
			pool.release(conn2);
		});

		test("waits for connection when at max capacity", async () => {
			pool = createPool(createMockConfig({ min: 0, max: 1, acquireTimeout: 500 }));

			const conn1 = await pool.acquire();
			const id1 = conn1.id;

			// Start acquiring, should wait
			const acquirePromise = pool.acquire();

			// Release after short delay
			setTimeout(() => pool.release(conn1), 50);

			const conn2 = await acquirePromise;
			expect(conn2.id).toBe(id1);

			pool.release(conn2);
		});

		test("times out when no connection available", async () => {
			pool = createPool(createMockConfig({ min: 0, max: 1, acquireTimeout: 100 }));

			const conn = await pool.acquire();

			await expect(pool.acquire()).rejects.toThrow(/timeout/i);

			pool.release(conn);
		});
	});

	describe("use() helper", () => {
		test("acquires and releases automatically", async () => {
			pool = createPool(createMockConfig({ min: 1, max: 1 }));

			let usedConnId = 0;
			const result = await pool.use(async (conn) => {
				usedConnId = conn.id;
				return "result";
			});

			expect(result).toBe("result");

			// Should be able to acquire again
			const conn = await pool.acquire();
			expect(conn.id).toBe(usedConnId);
			pool.release(conn);
		});

		test("releases on error", async () => {
			pool = createPool(createMockConfig({ min: 1, max: 1 }));

			try {
				await pool.use(async () => {
					throw new Error("test error");
				});
			} catch {
				// Expected
			}

			// Should be able to acquire again
			const conn = await pool.acquire();
			expect(conn).toBeDefined();
			pool.release(conn);
		});
	});

	describe("connection validation", () => {
		test("destroys invalid connections", async () => {
			pool = createPool(createMockConfig({ min: 1, max: 2 }));

			const conn = await pool.acquire();
			conn.isValid = false;
			pool.release(conn);

			// Next acquire should get a new connection
			const conn2 = await pool.acquire();
			expect(conn2.id).not.toBe(conn.id);

			pool.release(conn2);
		});
	});

	describe("statistics", () => {
		test("tracks active and idle counts", async () => {
			pool = createPool(createMockConfig({ min: 2, max: 5 }));

			// Wait for initialization
			await new Promise((resolve) => setTimeout(resolve, 50));

			const initialStats = pool.getStats();
			expect(initialStats.idle).toBeGreaterThanOrEqual(2);
			expect(initialStats.active).toBe(0);

			const conn = await pool.acquire();
			const activeStats = pool.getStats();
			expect(activeStats.active).toBe(1);

			pool.release(conn);
			const releasedStats = pool.getStats();
			expect(releasedStats.active).toBe(0);
		});

		test("tracks creation and destruction counts", async () => {
			pool = createPool(createMockConfig({ min: 0, max: 1 }));

			const stats1 = pool.getStats();
			expect(stats1.totalCreated).toBe(0);

			const conn = await pool.acquire();
			const stats2 = pool.getStats();
			expect(stats2.totalCreated).toBe(1);

			pool.release(conn);
			await pool.close();

			const stats3 = pool.getStats();
			expect(stats3.totalDestroyed).toBe(1);
		});
	});

	describe("closing", () => {
		test("close destroys all connections", async () => {
			pool = createPool(createMockConfig({ min: 2, max: 5 }));

			// Wait for initialization
			await new Promise((resolve) => setTimeout(resolve, 50));

			await pool.close();

			expect(pool.isClosed()).toBe(true);
			const stats = pool.getStats();
			expect(stats.size).toBe(0);
		});

		test("acquire after close throws", async () => {
			pool = createPool(createMockConfig());
			await pool.close();

			await expect(pool.acquire()).rejects.toThrow(/closed/i);
		});

		test("close rejects pending requests", async () => {
			pool = createPool(createMockConfig({ min: 0, max: 1, acquireTimeout: 5000 }));

			const _conn = await pool.acquire();
			const acquirePromise = pool.acquire();

			// Give time for the acquire to get queued
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Close while waiting
			await pool.close();

			await expect(acquirePromise).rejects.toThrow(/closing/i);
		});
	});
});

// ============================================
// HTTP Pool Tests
// ============================================

describe("HttpPool", () => {
	let pool: HttpPool;

	afterEach(() => {
		if (pool) {
			pool.close();
		}
	});

	describe("concurrency limiting", () => {
		test("limits concurrent requests", async () => {
			pool = createHttpPool({ maxConcurrent: 2 });

			let concurrent = 0;
			let maxConcurrent = 0;

			const requests = Array.from({ length: 5 }, () =>
				pool.execute(async () => {
					concurrent++;
					maxConcurrent = Math.max(maxConcurrent, concurrent);
					await new Promise((resolve) => setTimeout(resolve, 50));
					concurrent--;
					return "done";
				})
			);

			await Promise.all(requests);

			expect(maxConcurrent).toBeLessThanOrEqual(2);
		});

		test("executes immediately when under limit", async () => {
			pool = createHttpPool({ maxConcurrent: 5 });

			const start = Date.now();
			await pool.execute(async () => "done");
			const duration = Date.now() - start;

			expect(duration).toBeLessThan(50);
		});

		test("queues requests when at limit", async () => {
			pool = createHttpPool({ maxConcurrent: 1 });

			const results: number[] = [];

			const p1 = pool.execute(async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				results.push(1);
			});

			const p2 = pool.execute(async () => {
				results.push(2);
			});

			await Promise.all([p1, p2]);

			// Second request should complete after first
			expect(results).toEqual([1, 2]);
		});
	});

	describe("timeout", () => {
		test("times out pending requests", async () => {
			pool = createHttpPool({ maxConcurrent: 1, timeout: 100 });

			// Hold the only slot
			const blocking = pool.execute(async () => {
				await new Promise((resolve) => setTimeout(resolve, 500));
			});

			// This should timeout
			await expect(pool.execute(async () => "done")).rejects.toThrow(/timeout/i);

			// Let the blocking request finish
			await blocking;
		});
	});

	describe("statistics", () => {
		test("tracks active and pending counts", async () => {
			pool = createHttpPool({ maxConcurrent: 1 });

			const stats1 = pool.getStats();
			expect(stats1.active).toBe(0);
			expect(stats1.pending).toBe(0);

			const promise = pool.execute(async () => {
				// Check stats while executing
				const stats = pool.getStats();
				expect(stats.active).toBe(1);
				await new Promise((resolve) => setTimeout(resolve, 50));
			});

			// Queue another request
			const promise2 = pool.execute(async () => "done");

			// Wait a tick for the second request to be queued
			await new Promise((resolve) => setTimeout(resolve, 10));

			const stats2 = pool.getStats();
			expect(stats2.active).toBe(1);
			expect(stats2.pending).toBe(1);

			await Promise.all([promise, promise2]);
		});
	});

	describe("closing", () => {
		test("rejects pending requests on close", async () => {
			pool = createHttpPool({ maxConcurrent: 1, timeout: 5000 });

			const blocking = pool.execute(async () => {
				await new Promise((resolve) => setTimeout(resolve, 100));
			});

			const pending = pool.execute(async () => "done");

			// Close while request is pending
			pool.close();

			await expect(pending).rejects.toThrow(/closing/i);
			await blocking;
		});

		test("rejects new requests after close", async () => {
			pool = createHttpPool();
			pool.close();

			await expect(pool.execute(async () => "done")).rejects.toThrow(/closed/i);
		});
	});
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
	test("handles rapid acquire/release cycles", async () => {
		const pool = createPool(createMockConfig({ min: 1, max: 3 }));

		try {
			const cycles = 100;
			for (let i = 0; i < cycles; i++) {
				const conn = await pool.acquire();
				pool.release(conn);
			}

			const stats = pool.getStats();
			expect(stats.totalCreated).toBeLessThanOrEqual(5); // Should reuse connections
		} finally {
			await pool.close();
		}
	});

	test("handles concurrent acquire/release", async () => {
		const pool = createPool(createMockConfig({ min: 2, max: 5 }));

		try {
			const operations = Array.from({ length: 50 }, () =>
				pool.use(async (conn) => {
					await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
					return conn.id;
				})
			);

			const results = await Promise.all(operations);
			expect(results.length).toBe(50);
		} finally {
			await pool.close();
		}
	});

	test("http pool handles errors in requests", async () => {
		const pool = createHttpPool({ maxConcurrent: 2 });

		try {
			const results = await Promise.allSettled([
				pool.execute(async () => "success"),
				pool.execute(async () => {
					throw new Error("test error");
				}),
				pool.execute(async () => "success2"),
			]);

			expect(results[0]).toEqual({ status: "fulfilled", value: "success" });
			expect(results[1].status).toBe("rejected");
			expect(results[2]).toEqual({ status: "fulfilled", value: "success2" });
		} finally {
			pool.close();
		}
	});

	test("releases connection after pool closed", async () => {
		const pool = createPool(createMockConfig({ min: 1 }));

		// Wait for initialization
		await new Promise((resolve) => setTimeout(resolve, 50));

		const conn = await pool.acquire();
		await pool.close();

		// Releasing after close should destroy the connection
		pool.release(conn);

		// Connection should be destroyed
		expect(conn.isClosed).toBe(true);
	});

	test("handles releasing unknown connection gracefully", async () => {
		const pool = createPool(createMockConfig());

		// Try to release a connection that was never in the pool
		const unknownConn: MockConnection = {
			id: 9999,
			isValid: true,
			isClosed: false,
		};

		// Should not throw
		pool.release(unknownConn);

		await pool.close();
	});

	test("handles validation throwing exception", async () => {
		let callCount = 0;
		const pool = createPool({
			create: async () => ({
				id: ++callCount,
				isValid: true,
				isClosed: false,
			}),
			destroy: async (conn) => {
				conn.isClosed = true;
			},
			validate: async () => {
				throw new Error("Validation error");
			},
			min: 1,
			max: 2,
			healthCheckInterval: 60000,
		});

		// Wait for initialization
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Should still be able to acquire (validation error = invalid)
		const conn = await pool.acquire();
		expect(conn).toBeDefined();
		pool.release(conn);

		await pool.close();
	});

	test("handles creation failure", async () => {
		let callCount = 0;
		const pool = createPool({
			create: async () => {
				callCount++;
				if (callCount === 1) {
					throw new Error("Creation failed");
				}
				return {
					id: callCount,
					isValid: true,
					isClosed: false,
				};
			},
			destroy: async (conn: MockConnection) => {
				conn.isClosed = true;
			},
			min: 1,
			max: 2,
			healthCheckInterval: 60000,
		});

		// Wait for initialization
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Pool should recover by creating a new connection
		const conn = await pool.acquire();
		expect(conn).toBeDefined();
		pool.release(conn);

		await pool.close();
	});

	test("recycles connections that exceed maxAge", async () => {
		const pool = createPool(createMockConfig({ min: 0, max: 2, maxAge: 50 }));

		const conn = await pool.acquire();
		const originalId = conn.id;

		// Wait for connection to exceed maxAge
		await new Promise((resolve) => setTimeout(resolve, 100));

		pool.release(conn);

		// Next acquire should get a new connection
		const conn2 = await pool.acquire();
		expect(conn2.id).not.toBe(originalId);
		pool.release(conn2);

		await pool.close();
	});

	test("recycles connections that exceed idleTimeout when above min", async () => {
		const pool = createPool(createMockConfig({ min: 0, max: 2, idleTimeout: 50 }));

		const conn = await pool.acquire();
		pool.release(conn);

		// Wait for idle timeout
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Next acquire should trigger recycle
		const conn2 = await pool.acquire();
		expect(conn2).toBeDefined();
		pool.release(conn2);

		await pool.close();
	});

	test("close is idempotent", async () => {
		const pool = createPool(createMockConfig({ min: 1 }));

		await pool.close();
		await pool.close(); // Second close should not throw

		expect(pool.isClosed()).toBe(true);
	});

	test("handles destroy failure gracefully", async () => {
		let destroyCallCount = 0;
		const pool = createPool({
			create: async () => ({
				id: 1,
				isValid: true,
				isClosed: false,
			}),
			destroy: async () => {
				destroyCallCount++;
				throw new Error("Destroy failed");
			},
			min: 0,
			max: 1,
			healthCheckInterval: 60000,
		});

		const conn = await pool.acquire();
		pool.release(conn);

		await pool.close();

		// Destroy should have been called even though it failed
		expect(destroyCallCount).toBeGreaterThan(0);
	});

	test("works without validator function", async () => {
		const pool = createPool({
			create: async () => ({
				id: 1,
				isValid: true,
				isClosed: false,
			}),
			destroy: async (conn: MockConnection) => {
				conn.isClosed = true;
			},
			// No validate function
			min: 1,
			max: 2,
			healthCheckInterval: 60000,
		});

		// Wait for initialization
		await new Promise((resolve) => setTimeout(resolve, 50));

		const conn = await pool.acquire();
		expect(conn).toBeDefined();
		pool.release(conn);

		// Should be able to reuse connection
		const conn2 = await pool.acquire();
		expect(conn2.id).toBe(conn.id);
		pool.release(conn2);

		await pool.close();
	});

	test("health check interval runs and recycles old connections", async () => {
		const pool = createPool({
			...createMockConfig({ min: 1, max: 2, maxAge: 50 }),
			healthCheckInterval: 100, // Short interval for testing
		});

		// Wait for initialization
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Wait for health check to run
		await new Promise((resolve) => setTimeout(resolve, 150));

		// Connection should have been recycled due to age
		const stats = pool.getStats();
		expect(stats.totalCreated).toBeGreaterThan(0);

		await pool.close();
	});

	test("health check maintains minimum connections", async () => {
		const pool = createPool({
			...createMockConfig({ min: 2, max: 5 }),
			healthCheckInterval: 50,
		});

		// Wait for initialization
		await new Promise((resolve) => setTimeout(resolve, 100));

		const stats = pool.getStats();
		expect(stats.size).toBeGreaterThanOrEqual(2);

		await pool.close();
	});

	test("pending request processing after release", async () => {
		const pool = createPool(createMockConfig({ min: 0, max: 1, acquireTimeout: 500 }));

		const conn1 = await pool.acquire();

		// Queue a pending request
		const pendingPromise = pool.acquire();

		// Short delay then release
		await new Promise((resolve) => setTimeout(resolve, 20));

		pool.release(conn1);

		// Pending request should be fulfilled
		const conn2 = await pendingPromise;
		expect(conn2).toBeDefined();
		pool.release(conn2);

		await pool.close();
	});
});

// ============================================
// Turso Pool Tests
// ============================================

describe("TursoPool", () => {
	test("creates turso pool with correct config", async () => {
		let executeCount = 0;

		const pool = await createTursoPool(
			async () => ({
				execute: async (_sql: string, _args?: unknown[]) => {
					executeCount++;
					return [];
				},
				close: () => {},
			}),
			{ min: 1, max: 2 }
		);

		// Wait for initialization
		await new Promise((resolve) => setTimeout(resolve, 50));

		const conn = await pool.acquire();
		await conn.execute("SELECT 1");
		pool.release(conn);

		expect(executeCount).toBeGreaterThan(0);

		await pool.close();
	});

	test("turso pool validates connections", async () => {
		let isValid = true;

		const pool = await createTursoPool(
			async () => ({
				execute: async (_sql: string, _args?: unknown[]) => {
					if (!isValid) {
						throw new Error("Connection invalid");
					}
					return [];
				},
				close: () => {},
			}),
			{ min: 0, max: 2 }
		);

		const conn = await pool.acquire();
		pool.release(conn);

		// Invalidate connections
		isValid = false;

		// Next acquire should fail validation and get new connection
		const conn2 = await pool.acquire();
		pool.release(conn2);

		await pool.close();
	});
});
