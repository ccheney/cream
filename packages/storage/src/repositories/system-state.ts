/**
 * System State Repository (Drizzle ORM)
 *
 * Data access for system_state table - persists system status per environment.
 */
import { eq } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { systemState } from "../schema/dashboard";

// ============================================
// Types
// ============================================

export type SystemStatus = "stopped" | "running" | "paused";

export type SystemCyclePhase = "observe" | "orient" | "decide" | "act" | "complete";

export interface SystemState {
	environment: string;
	status: SystemStatus;
	lastCycleId: string | null;
	lastCycleTime: string | null;
	currentPhase: SystemCyclePhase | null;
	phaseStartedAt: string | null;
	nextCycleAt: string | null;
	errorMessage: string | null;
	updatedAt: string;
}

export interface UpdateSystemStateInput {
	status?: SystemStatus;
	lastCycleId?: string | null;
	lastCycleTime?: string | null;
	currentPhase?: SystemCyclePhase | null;
	phaseStartedAt?: string | null;
	nextCycleAt?: string | null;
	errorMessage?: string | null;
}

// ============================================
// Row Mapping
// ============================================

type SystemStateRow = typeof systemState.$inferSelect;

function mapSystemStateRow(row: SystemStateRow): SystemState {
	return {
		environment: row.environment,
		status: row.status as SystemStatus,
		lastCycleId: row.lastCycleId,
		lastCycleTime: row.lastCycleTime?.toISOString() ?? null,
		currentPhase: row.currentPhase as SystemCyclePhase | null,
		phaseStartedAt: row.phaseStartedAt?.toISOString() ?? null,
		nextCycleAt: row.nextCycleAt?.toISOString() ?? null,
		errorMessage: row.errorMessage,
		updatedAt: row.updatedAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class SystemStateRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async getOrCreate(environment: string): Promise<SystemState> {
		const existing = await this.findByEnvironment(environment);
		if (existing) {
			return existing;
		}

		const [row] = await this.db
			.insert(systemState)
			.values({
				environment: environment as typeof systemState.$inferInsert.environment,
				status: "stopped",
			})
			.returning();

		if (!row) {
			throw new Error(`Failed to create system state for environment: ${environment}`);
		}
		return mapSystemStateRow(row);
	}

	async findByEnvironment(environment: string): Promise<SystemState | null> {
		const [row] = await this.db
			.select()
			.from(systemState)
			.where(
				eq(systemState.environment, environment as typeof systemState.$inferSelect.environment)
			)
			.limit(1);

		return row ? mapSystemStateRow(row) : null;
	}

	async update(environment: string, input: UpdateSystemStateInput): Promise<SystemState> {
		await this.getOrCreate(environment);

		const updates: Record<string, unknown> = {
			updatedAt: new Date(),
		};

		if (input.status !== undefined) {
			updates.status = input.status;
		}
		if (input.lastCycleId !== undefined) {
			updates.lastCycleId = input.lastCycleId;
		}
		if (input.lastCycleTime !== undefined) {
			updates.lastCycleTime = input.lastCycleTime ? new Date(input.lastCycleTime) : null;
		}
		if (input.currentPhase !== undefined) {
			updates.currentPhase = input.currentPhase;
		}
		if (input.phaseStartedAt !== undefined) {
			updates.phaseStartedAt = input.phaseStartedAt ? new Date(input.phaseStartedAt) : null;
		}
		if (input.nextCycleAt !== undefined) {
			updates.nextCycleAt = input.nextCycleAt ? new Date(input.nextCycleAt) : null;
		}
		if (input.errorMessage !== undefined) {
			updates.errorMessage = input.errorMessage;
		}

		const [row] = await this.db
			.update(systemState)
			.set(updates)
			.where(
				eq(systemState.environment, environment as typeof systemState.$inferSelect.environment)
			)
			.returning();

		if (!row) {
			throw new Error(`Failed to update system state for environment: ${environment}`);
		}
		return mapSystemStateRow(row);
	}

	async setStatus(environment: string, status: SystemStatus): Promise<SystemState> {
		return this.update(environment, { status });
	}

	async updateCycle(
		environment: string,
		cycleId: string,
		phase: SystemCyclePhase
	): Promise<SystemState> {
		const now = new Date().toISOString();
		return this.update(environment, {
			lastCycleId: cycleId,
			currentPhase: phase,
			phaseStartedAt: now,
			lastCycleTime: phase === "complete" ? now : undefined,
		});
	}

	async clearCycle(environment: string): Promise<SystemState> {
		return this.update(environment, {
			currentPhase: null,
			phaseStartedAt: null,
		});
	}

	async setError(environment: string, errorMessage: string): Promise<SystemState> {
		return this.update(environment, { errorMessage });
	}

	async clearError(environment: string): Promise<SystemState> {
		return this.update(environment, { errorMessage: null });
	}
}
