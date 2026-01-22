/**
 * Runtime Configuration History and Change Tracking
 */

import type { RuntimeTradingConfig } from "./types.js";

const FIELD_DESCRIPTIONS: Record<string, string> = {
	globalModel: "Changed LLM model",
	maxConsensusIterations: "Adjusted consensus iterations",
	agentTimeoutMs: "Changed agent timeout",
	totalConsensusTimeoutMs: "Changed total consensus timeout",
	convictionDeltaHold: "Adjusted hold conviction threshold",
	convictionDeltaAction: "Adjusted action conviction threshold",
	highConvictionPct: "Changed high conviction percentage",
	mediumConvictionPct: "Changed medium conviction percentage",
	lowConvictionPct: "Changed low conviction percentage",
	minRiskRewardRatio: "Updated minimum risk/reward ratio",
	kellyFraction: "Adjusted Kelly fraction for position sizing",
	tradingCycleIntervalMs: "Changed trading cycle interval",
	predictionMarketsIntervalMs: "Changed prediction markets interval",
};

function formatMilliseconds(ms: number): string {
	if (ms >= 60000) {
		return `${ms / 60000}m`;
	}
	if (ms >= 1000) {
		return `${ms / 1000}s`;
	}
	return `${ms}ms`;
}

export function findChangedFields(
	current: RuntimeTradingConfig,
	previous: RuntimeTradingConfig,
): string[] {
	const changedFields: string[] = [];
	const fieldsToCheck = [
		"globalModel",
		"maxConsensusIterations",
		"agentTimeoutMs",
		"totalConsensusTimeoutMs",
		"convictionDeltaHold",
		"convictionDeltaAction",
		"highConvictionPct",
		"mediumConvictionPct",
		"lowConvictionPct",
		"minRiskRewardRatio",
		"kellyFraction",
		"tradingCycleIntervalMs",
		"predictionMarketsIntervalMs",
	] as const;

	for (const field of fieldsToCheck) {
		if (current[field] !== previous[field]) {
			changedFields.push(field);
		}
	}

	return changedFields;
}

export function describeFieldChange(
	field: string,
	current: RuntimeTradingConfig,
	previous: RuntimeTradingConfig,
): string {
	const base = FIELD_DESCRIPTIONS[field] ?? `Updated ${field}`;

	const currentVal = current[field as keyof RuntimeTradingConfig];
	const prevVal = previous[field as keyof RuntimeTradingConfig];

	if (typeof currentVal === "number" && typeof prevVal === "number") {
		if (field.endsWith("Ms")) {
			return `${base}: ${formatMilliseconds(prevVal)} → ${formatMilliseconds(currentVal)}`;
		}
		if (field.endsWith("Pct")) {
			return `${base}: ${prevVal}% → ${currentVal}%`;
		}
		return `${base}: ${prevVal} → ${currentVal}`;
	}

	if (typeof currentVal === "string" && typeof prevVal === "string") {
		return `${base}: ${prevVal} → ${currentVal}`;
	}

	return base;
}

export function generateChangeDescription(
	changedFields: string[],
	current: RuntimeTradingConfig,
	previous?: RuntimeTradingConfig,
): string | undefined {
	if (changedFields.length === 0) {
		if (current.promotedFrom) {
			return "Rollback to previous configuration";
		}
		return "Initial configuration";
	}

	if (changedFields.length === 1) {
		const field = changedFields[0];
		if (!field || !previous) {
			return undefined;
		}
		return describeFieldChange(field, current, previous);
	}

	if (changedFields.length <= 3) {
		return `Updated ${changedFields.join(", ")}`;
	}

	return `Updated ${changedFields.length} configuration settings`;
}
