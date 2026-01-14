/**
 * Cycle Event Parser
 *
 * Handles cycle progress and result event normalization.
 */

import type { CycleProgressData, CycleResultData, NormalizedEvent } from "../types";
import { EVENT_ICONS } from "../types";

function getStatusColor(status: string): NormalizedEvent["color"] {
	switch (status) {
		case "completed":
			return "profit";
		case "failed":
			return "loss";
		default:
			return "neutral";
	}
}

export function normalizeCycleProgress(data: CycleProgressData, timestamp: Date): NormalizedEvent {
	const phase = data.phase || "unknown";
	const progress = data.progress ?? 0;
	return {
		id: crypto.randomUUID(),
		timestamp,
		type: "cycle",
		icon: EVENT_ICONS.cycle,
		symbol: data.symbol || "",
		title: `OODA ${phase}`,
		details: `Progress: ${Math.round(progress * 100)}%`,
		color: "accent",
		raw: data,
	};
}

export function normalizeCycleResult(data: CycleResultData, timestamp: Date): NormalizedEvent {
	const status = data.status || "completed";
	const decisions = data.decisionsCount ?? 0;

	return {
		id: crypto.randomUUID(),
		timestamp,
		type: "cycle",
		icon: EVENT_ICONS.cycle,
		symbol: data.symbol || "",
		title: `Cycle ${status}`,
		details: decisions > 0 ? `${decisions} decision(s)` : "",
		color: getStatusColor(status),
		raw: data,
	};
}
