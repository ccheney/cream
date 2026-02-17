import type { decisions } from "../schema/core-trading";
import type { CreateDecisionInput } from "./decisions.types";

export type DecisionUpdateInput = Partial<
	Omit<CreateDecisionInput, "id" | "cycleId" | "environment">
>;

type DecisionInsert = typeof decisions.$inferInsert;

function setIfDefined<T>(value: T | undefined, assign: (value: T) => void): void {
	if (value !== undefined) {
		assign(value);
	}
}

export function buildDecisionUpdateData(updates: DecisionUpdateInput): Partial<DecisionInsert> {
	const updateData: Partial<DecisionInsert> = {
		updatedAt: new Date(),
	};

	setIfDefined(updates.symbol, (value) => {
		updateData.symbol = value;
	});
	setIfDefined(updates.action, (value) => {
		updateData.action = value;
	});
	setIfDefined(updates.direction, (value) => {
		updateData.direction = value;
	});
	setIfDefined(updates.size, (value) => {
		updateData.size = String(value);
	});
	setIfDefined(updates.sizeUnit, (value) => {
		updateData.sizeUnit = value;
	});
	setIfDefined(updates.entryPrice, (value) => {
		updateData.entryPrice = value != null ? String(value) : null;
	});
	setIfDefined(updates.stopPrice, (value) => {
		updateData.stopPrice = value != null ? String(value) : null;
	});
	setIfDefined(updates.targetPrice, (value) => {
		updateData.targetPrice = value != null ? String(value) : null;
	});
	setIfDefined(updates.status, (value) => {
		updateData.status = value;
	});
	setIfDefined(updates.rationale, (value) => {
		updateData.rationale = value;
	});
	setIfDefined(updates.bullishFactors, (value) => {
		updateData.bullishFactors = value;
	});
	setIfDefined(updates.bearishFactors, (value) => {
		updateData.bearishFactors = value;
	});
	setIfDefined(updates.confidenceScore, (value) => {
		updateData.confidenceScore = value != null ? String(value) : null;
	});
	setIfDefined(updates.riskScore, (value) => {
		updateData.riskScore = value != null ? String(value) : null;
	});
	setIfDefined(updates.metadata, (value) => {
		updateData.metadata = value;
	});

	return updateData;
}
