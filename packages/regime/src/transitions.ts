/**
 * Regime Transition Detection
 *
 * Detects and logs regime transitions for monitoring and analysis.
 *
 * @see docs/plans/02-data-layer.md
 */

import type { RegimeLabel } from "@cream/config";

export interface RegimeTransition {
	fromRegime: RegimeLabel;
	toRegime: RegimeLabel;
	timestamp: string;
	instrumentId: string;
	confidence: number;
	previousRegimeDuration: number;
}

export type TransitionUpdateResult =
	| { kind: "transition"; transition: RegimeTransition }
	| { kind: "initialized"; regime: RegimeLabel }
	| { kind: "unchanged" }
	| { kind: "low_confidence"; confidence: number; threshold: number }
	| { kind: "pending_confirmation"; count: number; required: number };

export interface RegimeState {
	currentRegime: RegimeLabel;
	regimeStartTime: string;
	observationCount: number;
	history: Array<{
		regime: RegimeLabel;
		startTime: string;
		endTime: string;
		duration: number;
	}>;
}

export interface TransitionDetectorConfig {
	minConfirmationObservations: number;
	maxHistoryLength: number;
	minTransitionConfidence: number;
}

export const DEFAULT_TRANSITION_CONFIG: TransitionDetectorConfig = {
	minConfirmationObservations: 2,
	maxHistoryLength: 100,
	minTransitionConfidence: 0.3,
};

export class RegimeTransitionDetector {
	private states: Map<string, RegimeState> = new Map();
	private pendingTransitions: Map<
		string,
		{ regime: RegimeLabel; count: number; confidence: number }
	> = new Map();
	private config: TransitionDetectorConfig;

	constructor(config: TransitionDetectorConfig = DEFAULT_TRANSITION_CONFIG) {
		this.config = config;
	}

	update(
		instrumentId: string,
		regime: RegimeLabel,
		timestamp: string,
		confidence: number
	): TransitionUpdateResult {
		let state = this.states.get(instrumentId);
		if (!state) {
			state = {
				currentRegime: regime,
				regimeStartTime: timestamp,
				observationCount: 1,
				history: [],
			};
			this.states.set(instrumentId, state);
			return { kind: "initialized", regime };
		}

		if (regime === state.currentRegime) {
			state.observationCount++;
			this.pendingTransitions.delete(instrumentId);
			return { kind: "unchanged" };
		}

		if (confidence < this.config.minTransitionConfidence) {
			return {
				kind: "low_confidence",
				confidence,
				threshold: this.config.minTransitionConfidence,
			};
		}

		let pending = this.pendingTransitions.get(instrumentId);
		if (!pending || pending.regime !== regime) {
			pending = { regime, count: 1, confidence };
			this.pendingTransitions.set(instrumentId, pending);
		} else {
			pending.count++;
			pending.confidence = Math.max(pending.confidence, confidence);
		}

		if (pending.count >= this.config.minConfirmationObservations) {
			const transition: RegimeTransition = {
				fromRegime: state.currentRegime,
				toRegime: regime,
				timestamp,
				instrumentId,
				confidence: pending.confidence,
				previousRegimeDuration: state.observationCount,
			};

			state.history.push({
				regime: state.currentRegime,
				startTime: state.regimeStartTime,
				endTime: timestamp,
				duration: state.observationCount,
			});

			if (state.history.length > this.config.maxHistoryLength) {
				state.history = state.history.slice(-this.config.maxHistoryLength);
			}

			state.currentRegime = regime;
			state.regimeStartTime = timestamp;
			state.observationCount = 1;
			this.pendingTransitions.delete(instrumentId);

			return { kind: "transition", transition };
		}

		return {
			kind: "pending_confirmation",
			count: pending.count,
			required: this.config.minConfirmationObservations,
		};
	}

	getCurrentRegime(instrumentId: string): RegimeLabel | null {
		return this.states.get(instrumentId)?.currentRegime ?? null;
	}

	getState(instrumentId: string): RegimeState | null {
		return this.states.get(instrumentId) ?? null;
	}

	getHistory(instrumentId: string): RegimeState["history"] {
		return this.states.get(instrumentId)?.history ?? [];
	}

	reset(instrumentId: string): void {
		this.states.delete(instrumentId);
		this.pendingTransitions.delete(instrumentId);
	}

	resetAll(): void {
		this.states.clear();
		this.pendingTransitions.clear();
	}

	getTrackedInstruments(): string[] {
		return Array.from(this.states.keys());
	}

	exportState(): Map<string, RegimeState> {
		return new Map(this.states);
	}

	importState(states: Map<string, RegimeState>): void {
		this.states = new Map(states);
		this.pendingTransitions.clear();
	}
}

export function analyzeTransitions(transitions: RegimeTransition[]): {
	transitionCounts: Record<string, number>;
	averageDuration: Record<RegimeLabel, number>;
	mostCommonTransitions: Array<{ from: RegimeLabel; to: RegimeLabel; count: number }>;
} {
	const transitionCounts: Record<string, number> = {};
	const durations: Record<RegimeLabel, number[]> = {
		BULL_TREND: [],
		BEAR_TREND: [],
		RANGE: [],
		HIGH_VOL: [],
		LOW_VOL: [],
	};

	for (const t of transitions) {
		const key = `${t.fromRegime}->${t.toRegime}`;
		transitionCounts[key] = (transitionCounts[key] ?? 0) + 1;
		durations[t.fromRegime].push(t.previousRegimeDuration);
	}

	const averageDuration: Record<RegimeLabel, number> = {
		BULL_TREND: 0,
		BEAR_TREND: 0,
		RANGE: 0,
		HIGH_VOL: 0,
		LOW_VOL: 0,
	};

	for (const regime of Object.keys(durations) as RegimeLabel[]) {
		const durs = durations[regime];
		if (durs.length > 0) {
			averageDuration[regime] = durs.reduce((a, b) => a + b, 0) / durs.length;
		}
	}

	const sortedTransitions = Object.entries(transitionCounts)
		.map(([key, count]) => {
			const [from, to] = key.split("->") as [RegimeLabel, RegimeLabel];
			return { from, to, count };
		})
		.sort((a, b) => b.count - a.count);

	return {
		transitionCounts,
		averageDuration,
		mostCommonTransitions: sortedTransitions.slice(0, 10),
	};
}

export function calculateTransitionMatrix(
	transitions: RegimeTransition[]
): Record<RegimeLabel, Record<RegimeLabel, number>> {
	const regimes: RegimeLabel[] = ["BULL_TREND", "BEAR_TREND", "RANGE", "HIGH_VOL", "LOW_VOL"];

	const createEmptyRow = (): Record<RegimeLabel, number> => ({
		BULL_TREND: 0,
		BEAR_TREND: 0,
		RANGE: 0,
		HIGH_VOL: 0,
		LOW_VOL: 0,
	});

	const counts: Record<RegimeLabel, Record<RegimeLabel, number>> = {
		BULL_TREND: createEmptyRow(),
		BEAR_TREND: createEmptyRow(),
		RANGE: createEmptyRow(),
		HIGH_VOL: createEmptyRow(),
		LOW_VOL: createEmptyRow(),
	};
	const totals: Record<RegimeLabel, number> = {
		BULL_TREND: 0,
		BEAR_TREND: 0,
		RANGE: 0,
		HIGH_VOL: 0,
		LOW_VOL: 0,
	};

	for (const t of transitions) {
		counts[t.fromRegime][t.toRegime]++;
		totals[t.fromRegime]++;
	}

	const matrix: Record<RegimeLabel, Record<RegimeLabel, number>> = {
		BULL_TREND: createEmptyRow(),
		BEAR_TREND: createEmptyRow(),
		RANGE: createEmptyRow(),
		HIGH_VOL: createEmptyRow(),
		LOW_VOL: createEmptyRow(),
	};
	for (const from of regimes) {
		for (const to of regimes) {
			matrix[from][to] = totals[from] > 0 ? counts[from][to] / totals[from] : 0;
		}
	}

	return matrix;
}
