import type { cycles } from "../schema/core-trading";
import type { UpdateCycleInput } from "./cycles.types";

type CycleInsert = typeof cycles.$inferInsert;

function setIfDefined<T>(value: T | undefined, assign: (value: T) => void): void {
	if (value !== undefined) {
		assign(value);
	}
}

export function buildCycleUpdateData(input: UpdateCycleInput): Partial<CycleInsert> {
	const updateData: Partial<CycleInsert> = {
		updatedAt: new Date(),
	};

	setIfDefined(input.status, (value) => {
		updateData.status = value;
	});
	setIfDefined(input.completedAt, (value) => {
		updateData.completedAt = new Date(value);
	});
	setIfDefined(input.durationMs, (value) => {
		updateData.durationMs = value;
	});
	setIfDefined(input.currentPhase, (value) => {
		updateData.currentPhase = value;
	});
	setIfDefined(input.phaseStartedAt, (value) => {
		updateData.phaseStartedAt = new Date(value);
	});
	setIfDefined(input.completedSymbols, (value) => {
		updateData.completedSymbols = value;
	});
	setIfDefined(input.progressPct, (value) => {
		updateData.progressPct = String(value);
	});
	setIfDefined(input.approved, (value) => {
		updateData.approved = value;
	});
	setIfDefined(input.iterations, (value) => {
		updateData.iterations = value;
	});
	setIfDefined(input.decisionsCount, (value) => {
		updateData.decisionsCount = value;
	});
	setIfDefined(input.ordersCount, (value) => {
		updateData.ordersCount = value;
	});
	setIfDefined(input.decisions, (value) => {
		updateData.decisionsJson = value;
	});
	setIfDefined(input.orders, (value) => {
		updateData.ordersJson = value;
	});
	setIfDefined(input.errorMessage, (value) => {
		updateData.errorMessage = value;
	});
	setIfDefined(input.errorStack, (value) => {
		updateData.errorStack = value;
	});

	return updateData;
}
