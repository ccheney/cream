/**
 * System State
 *
 * Database-backed system state with in-memory cache for running cycles.
 * Status is persisted to PostgreSQL and survives server restarts.
 */

import { requireEnv } from "@cream/domain";
import type { SystemState as DbSystemState, SystemStatus } from "@cream/storage";
import { getSystemStateRepo } from "../../db.js";
import type { RunningCycleState, SystemState } from "./types.js";

type Environment = "BACKTEST" | "PAPER" | "LIVE";

/**
 * In-memory cache for volatile state (running cycles, trigger times).
 * This is NOT persisted - only used for real-time cycle tracking.
 */
interface VolatileState {
	runningCycles: Map<string, RunningCycleState>;
	lastTriggerTime: Map<string, number>;
}

const volatileState: VolatileState = {
	runningCycles: new Map(),
	lastTriggerTime: new Map(),
};

/**
 * Get the current system state from the database.
 * Creates a default entry if none exists.
 */
export async function getSystemState(environment?: string): Promise<SystemState> {
	const env = environment ?? requireEnv();
	const repo = await getSystemStateRepo();
	const dbState = await repo.getOrCreate(env);

	return {
		status: dbState.status,
		environment: dbState.environment as Environment,
		lastCycleId: dbState.lastCycleId,
		lastCycleTime: dbState.lastCycleTime,
		startedAt: null, // Not persisted, only relevant for current session
		runningCycles: volatileState.runningCycles,
		lastTriggerTime: volatileState.lastTriggerTime,
	};
}

/**
 * Set the system status.
 */
export async function setSystemStatus(
	status: SystemStatus,
	environment?: string
): Promise<DbSystemState> {
	const env = environment ?? requireEnv();
	const repo = await getSystemStateRepo();
	const result = await repo.setStatus(env, status);
	return result;
}

/**
 * Update cycle information in the database.
 */
export async function updateCycleState(
	environment: string,
	cycleId: string,
	phase: "observe" | "orient" | "decide" | "act" | "complete"
): Promise<void> {
	const repo = await getSystemStateRepo();
	await repo.updateCycle(environment, cycleId, phase);
}

/**
 * Clear cycle state when cycle completes or is cancelled.
 */
export async function clearCycleState(environment: string): Promise<void> {
	const repo = await getSystemStateRepo();
	await repo.clearCycle(environment);
}

/**
 * Get the running cycles map (in-memory only).
 */
export function getRunningCycles(): Map<string, RunningCycleState> {
	return volatileState.runningCycles;
}

/**
 * Get the last trigger time map (in-memory only).
 */
export function getLastTriggerTime(): Map<string, number> {
	return volatileState.lastTriggerTime;
}

/**
 * Set a running cycle state.
 */
export function setRunningCycle(environment: string, cycle: RunningCycleState): void {
	volatileState.runningCycles.set(environment, cycle);
}

/**
 * Remove a running cycle state.
 */
export function removeRunningCycle(environment: string): void {
	volatileState.runningCycles.delete(environment);
}

/**
 * Set last trigger time for rate limiting.
 */
export function setLastTriggerTime(environment: string, time: number): void {
	volatileState.lastTriggerTime.set(environment, time);
}

/**
 * Get the current environment synchronously.
 * This returns the CREAM_ENV environment variable value.
 */
export function getCurrentEnvironment(): Environment {
	return requireEnv() as Environment;
}

// Legacy export for backwards compatibility during migration
// TODO: Remove once all routes are updated to use the new functions
export const systemState: SystemState = {
	get status() {
		// This is a sync getter but we need async - callers should use getSystemState()
		return "stopped" as SystemStatus;
	},
	set status(_value: SystemStatus) {
		// No-op, use setSystemStatus() instead
	},
	environment: requireEnv() as Environment,
	lastCycleId: null,
	lastCycleTime: null,
	startedAt: null,
	runningCycles: volatileState.runningCycles,
	lastTriggerTime: volatileState.lastTriggerTime,
};
