import { beforeEach, describe, expect, test } from "bun:test";
import {
	AuditEntityType,
	type AuditLogEntry,
	AuditLogger,
	AuditOperationType,
	AuditRetentionPolicy,
	checkImmutability,
	ImmutabilityViolationError,
	InMemoryAuditStorage,
	requireMutable,
} from "./audit/index.js";

const testActor: AuditLogEntry["actor"] = {
	type: "system",
	id: "execution-engine",
	name: "Execution Engine",
};

function createAuditLoggerFixture(): { storage: InMemoryAuditStorage; logger: AuditLogger } {
	const storage = new InMemoryAuditStorage();
	const logger = new AuditLogger({
		storage,
		computeHashes: true,
		chainEntries: true,
		environment: "LIVE",
	});
	return { storage, logger };
}

describe("AuditLogger state changes", () => {
	test("logs INSERT operation", async () => {
		const { logger } = createAuditLoggerFixture();
		const entry = await logger.logInsert({
			actor: testActor,
			entityType: AuditEntityType.DECISION_PLAN,
			entityId: "plan-123",
			state: { action: "BUY", symbol: "AAPL" },
		});
		expect(entry.operation).toBe(AuditOperationType.INSERT);
		expect(entry.entityType).toBe(AuditEntityType.DECISION_PLAN);
		expect(entry.entityId).toBe("plan-123");
		expect(entry.afterState).toEqual({ action: "BUY", symbol: "AAPL" });
		expect(entry.beforeState).toBeUndefined();
		expect(entry.entryHash).toBeDefined();
	});

	test("logs UPDATE operation with before/after state", async () => {
		const { logger } = createAuditLoggerFixture();
		const entry = await logger.logUpdate({
			actor: testActor,
			entityType: AuditEntityType.ORDER,
			entityId: "order-456",
			beforeState: { status: "pending" },
			afterState: { status: "filled" },
		});
		expect(entry.operation).toBe(AuditOperationType.UPDATE);
		expect(entry.beforeState).toEqual({ status: "pending" });
		expect(entry.afterState).toEqual({ status: "filled" });
	});
});

describe("AuditLogger approvals and deletions", () => {
	test("logs DELETE operation", async () => {
		const { logger } = createAuditLoggerFixture();
		const entry = await logger.logDelete({
			actor: testActor,
			entityType: AuditEntityType.POSITION,
			entityId: "pos-789",
			beforeState: { symbol: "AAPL", qty: 100 },
			reason: "Position closed",
		});
		expect(entry.operation).toBe(AuditOperationType.DELETE);
		expect(entry.beforeState).toEqual({ symbol: "AAPL", qty: 100 });
		expect(entry.description).toContain("Position closed");
	});

	test("logs approval operation", async () => {
		const { logger } = createAuditLoggerFixture();
		const entry = await logger.logApproval({
			actor: { type: "agent", id: "risk-manager", name: "Risk Manager Agent" },
			entityId: "plan-123",
			state: { approved: true },
		});
		expect(entry.operation).toBe(AuditOperationType.APPROVE);
		expect(entry.entityType).toBe(AuditEntityType.DECISION_PLAN);
		expect(entry.actor.type).toBe("agent");
	});

	test("logs rejection operation with reason", async () => {
		const { logger } = createAuditLoggerFixture();
		const entry = await logger.logRejection({
			actor: { type: "agent", id: "critic", name: "Critic Agent" },
			entityId: "plan-123",
			state: { approved: false },
			reason: "Position size too large",
		});
		expect(entry.operation).toBe(AuditOperationType.REJECT);
		expect(entry.description).toContain("Position size too large");
		expect(entry.metadata?.reason).toBe("Position size too large");
	});
});

describe("AuditLogger integrity", () => {
	test("chains entries with previous hash", async () => {
		const { logger } = createAuditLoggerFixture();
		const entry1 = await logger.logInsert({
			actor: testActor,
			entityType: AuditEntityType.ORDER,
			entityId: "order-1",
			state: {},
		});
		const entry2 = await logger.logInsert({
			actor: testActor,
			entityType: AuditEntityType.ORDER,
			entityId: "order-2",
			state: {},
		});
		expect(entry2.previousHash).toBe(entry1.entryHash);
	});

	test("verifies entry integrity", async () => {
		const { logger } = createAuditLoggerFixture();
		const entry = await logger.logInsert({
			actor: testActor,
			entityType: AuditEntityType.ORDER,
			entityId: "order-1",
			state: {},
		});
		const isValid = await logger.verifyIntegrity(entry);
		expect(isValid).toBe(true);
	});

	test("verifies chain integrity", async () => {
		const { logger, storage } = createAuditLoggerFixture();
		await logger.logInsert({
			actor: testActor,
			entityType: AuditEntityType.ORDER,
			entityId: "order-1",
			state: {},
		});
		await logger.logInsert({
			actor: testActor,
			entityType: AuditEntityType.ORDER,
			entityId: "order-2",
			state: {},
		});
		const result = await logger.verifyChain(storage.getAllEntries());
		expect(result.valid).toBe(true);
	});
});

describe("AuditLogger querying", () => {
	test("retrieves entity trail", async () => {
		const { logger } = createAuditLoggerFixture();
		await logger.logInsert({
			actor: testActor,
			entityType: AuditEntityType.ORDER,
			entityId: "order-1",
			state: { status: "new" },
		});
		await logger.logUpdate({
			actor: testActor,
			entityType: AuditEntityType.ORDER,
			entityId: "order-1",
			beforeState: { status: "new" },
			afterState: { status: "pending" },
		});
		await logger.logUpdate({
			actor: testActor,
			entityType: AuditEntityType.ORDER,
			entityId: "order-1",
			beforeState: { status: "pending" },
			afterState: { status: "filled" },
		});
		const trail = await logger.getEntityTrail(AuditEntityType.ORDER, "order-1");
		expect(trail).toHaveLength(3);
		expect(trail[0]?.operation).toBe(AuditOperationType.INSERT);
		expect(trail[2]?.operation).toBe(AuditOperationType.UPDATE);
	});

	test("queries by operation type", async () => {
		const { logger } = createAuditLoggerFixture();
		await logger.logInsert({
			actor: testActor,
			entityType: AuditEntityType.ORDER,
			entityId: "order-1",
			state: {},
		});
		await logger.logApproval({
			actor: testActor,
			entityId: "plan-1",
			state: {},
		});
		const results = await logger.query({
			operation: AuditOperationType.APPROVE,
			limit: 100,
			offset: 0,
		});
		expect(results).toHaveLength(1);
		expect(results[0]?.operation).toBe(AuditOperationType.APPROVE);
	});
});

describe("checkImmutability", () => {
	test("PAPER data is not immutable", () => {
		const result = checkImmutability({
			entityType: AuditEntityType.DECISION_PLAN,
			environment: "PAPER",
		});

		expect(result.immutable).toBe(false);
	});

	test("LIVE decision plans are immutable", () => {
		const result = checkImmutability({
			entityType: AuditEntityType.DECISION_PLAN,
			environment: "LIVE",
			executedAt: "2026-01-04T00:00:00Z",
		});

		expect(result.immutable).toBe(true);
		expect(result.reason).toContain("SEC Rule 17a-4");
	});

	test("LIVE orders are immutable", () => {
		const result = checkImmutability({
			entityType: AuditEntityType.ORDER,
			environment: "LIVE",
		});

		expect(result.immutable).toBe(true);
	});

	test("LIVE positions are mutable (but audited)", () => {
		const result = checkImmutability({
			entityType: AuditEntityType.POSITION,
			environment: "LIVE",
		});

		expect(result.immutable).toBe(false);
	});

	test("PAPER data is mutable", () => {
		const result = checkImmutability({
			entityType: AuditEntityType.DECISION_PLAN,
			environment: "PAPER",
		});

		expect(result.immutable).toBe(false);
	});
});

describe("requireMutable", () => {
	test("does not throw for mutable entities", () => {
		expect(() => {
			requireMutable({
				entityType: AuditEntityType.POSITION,
				entityId: "pos-123",
				environment: "PAPER",
			});
		}).not.toThrow();
	});

	test("throws ImmutabilityViolationError for immutable entities", () => {
		expect(() => {
			requireMutable({
				entityType: AuditEntityType.DECISION_PLAN,
				entityId: "plan-123",
				environment: "LIVE",
			});
		}).toThrow(ImmutabilityViolationError);
	});

	test("error includes entity details", () => {
		try {
			requireMutable({
				entityType: AuditEntityType.ORDER,
				entityId: "order-456",
				environment: "LIVE",
			});
		} catch (e) {
			expect(e).toBeInstanceOf(ImmutabilityViolationError);
			const error = e as ImmutabilityViolationError;
			expect(error.entityType).toBe(AuditEntityType.ORDER);
			expect(error.entityId).toBe("order-456");
		}
	});
});

describe("AuditRetentionPolicy", () => {
	test("isHotStorage for recent records", () => {
		const recentTimestamp = new Date().toISOString();
		expect(AuditRetentionPolicy.isHotStorage(recentTimestamp)).toBe(true);
	});

	test("shouldArchive for old records", () => {
		const threeYearsAgo = new Date();
		threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

		expect(AuditRetentionPolicy.shouldArchive(threeYearsAgo.toISOString())).toBe(true);
	});

	test("canDelete only after 6 years", () => {
		const fiveYearsAgo = new Date();
		fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

		const sevenYearsAgo = new Date();
		sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);

		expect(AuditRetentionPolicy.canDelete(fiveYearsAgo.toISOString())).toBe(false);
		expect(AuditRetentionPolicy.canDelete(sevenYearsAgo.toISOString())).toBe(true);
	});

	test("getRetentionStatus returns correct tier", () => {
		const now = new Date();
		const hot = AuditRetentionPolicy.getRetentionStatus(now.toISOString());
		expect(hot.tier).toBe("hot");
		expect(hot.daysRemaining).toBeGreaterThan(0);

		const threeYearsAgo = new Date();
		threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
		const archive = AuditRetentionPolicy.getRetentionStatus(threeYearsAgo.toISOString());
		expect(archive.tier).toBe("archive");

		const sevenYearsAgo = new Date();
		sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);
		const deletable = AuditRetentionPolicy.getRetentionStatus(sevenYearsAgo.toISOString());
		expect(deletable.tier).toBe("deletable");
		expect(deletable.daysRemaining).toBe(0);
	});
});

function createStorageEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
	return {
		id: crypto.randomUUID(),
		timestamp: new Date().toISOString(),
		actor: { type: "system", id: "test" },
		operation: AuditOperationType.INSERT,
		entityType: AuditEntityType.ORDER,
		entityId: "order-1",
		environment: "PAPER",
		...overrides,
	};
}

describe("InMemoryAuditStorage persistence", () => {
	let storage: InMemoryAuditStorage;

	beforeEach(() => {
		storage = new InMemoryAuditStorage();
	});

	test("appends entries immutably", async () => {
		const entry = createStorageEntry();
		await storage.append(entry);
		const entries = storage.getAllEntries();
		expect(entries).toHaveLength(1);
		expect(entries[0]).toEqual(entry);
	});

	test("queries with filters", async () => {
		const entry1 = createStorageEntry();
		const entry2 = createStorageEntry({
			entityType: AuditEntityType.POSITION,
			entityId: "pos-1",
			environment: "LIVE",
		});
		await storage.append(entry1);
		await storage.append(entry2);
		const liveOnly = await storage.query({ environment: "LIVE", limit: 100, offset: 0 });
		expect(liveOnly).toHaveLength(1);
		expect(liveOnly[0]?.entityType).toBe(AuditEntityType.POSITION);
	});
});

describe("InMemoryAuditStorage housekeeping", () => {
	let storage: InMemoryAuditStorage;

	beforeEach(() => {
		storage = new InMemoryAuditStorage();
	});

	test("getLatestEntry returns most recent", async () => {
		const entry1 = createStorageEntry({
			timestamp: "2026-01-01T00:00:00Z",
			entityId: "order-1",
		});
		const entry2 = createStorageEntry({
			timestamp: "2026-01-02T00:00:00Z",
			entityId: "order-2",
		});
		await storage.append(entry1);
		await storage.append(entry2);
		const latest = await storage.getLatestEntry();
		expect(latest?.entityId).toBe("order-2");
	});

	test("clear removes all entries", async () => {
		const entry = createStorageEntry();
		await storage.append(entry);
		expect(storage.getAllEntries()).toHaveLength(1);
		storage.clear();
		expect(storage.getAllEntries()).toHaveLength(0);
	});
});
