/**
 * GMM Transition Tests
 */

import { describe, expect, it } from "bun:test";
import { requireValue } from "@cream/test-utils";
import {
	analyzeTransitions,
	calculateTransitionMatrix,
	type RegimeTransition,
	RegimeTransitionDetector,
} from "../src/transitions";

describe("RegimeTransitionDetector update flow", () => {
	it("detects regime transitions", () => {
		const detector = new RegimeTransitionDetector({
			minConfirmationObservations: 2,
			maxHistoryLength: 100,
			minTransitionConfidence: 0.3,
		});

		let result = detector.update("AAPL", "BULL_TREND", "2024-01-01", 0.8);
		expect(result.kind).toBe("initialized");

		result = detector.update("AAPL", "BULL_TREND", "2024-01-02", 0.8);
		expect(result.kind).toBe("unchanged");

		result = detector.update("AAPL", "BEAR_TREND", "2024-01-03", 0.7);
		expect(result.kind).toBe("pending_confirmation");

		result = detector.update("AAPL", "BEAR_TREND", "2024-01-04", 0.7);
		expect(result.kind).toBe("transition");
		if (result.kind === "transition") {
			expect(result.transition.fromRegime).toBe("BULL_TREND");
			expect(result.transition.toRegime).toBe("BEAR_TREND");
		}
	});

	it("rejects low confidence transitions", () => {
		const detector = new RegimeTransitionDetector({
			minConfirmationObservations: 2,
			maxHistoryLength: 100,
			minTransitionConfidence: 0.5,
		});

		detector.update("AAPL", "BULL_TREND", "2024-01-01", 0.8);

		let result = detector.update("AAPL", "BEAR_TREND", "2024-01-02", 0.3);
		expect(result.kind).toBe("low_confidence");
		if (result.kind === "low_confidence") {
			expect(result.confidence).toBe(0.3);
			expect(result.threshold).toBe(0.5);
		}

		result = detector.update("AAPL", "BEAR_TREND", "2024-01-03", 0.3);
		expect(result.kind).toBe("low_confidence");
		expect(detector.getCurrentRegime("AAPL")).toBe("BULL_TREND");
	});
});

describe("RegimeTransitionDetector state management", () => {
	it("tracks current regime", () => {
		const detector = new RegimeTransitionDetector();
		detector.update("AAPL", "BULL_TREND", "2024-01-01", 0.8);
		expect(detector.getCurrentRegime("AAPL")).toBe("BULL_TREND");

		detector.update("AAPL", "BEAR_TREND", "2024-01-02", 0.8);
		detector.update("AAPL", "BEAR_TREND", "2024-01-03", 0.8);
		expect(detector.getCurrentRegime("AAPL")).toBe("BEAR_TREND");
	});

	it("maintains regime history", () => {
		const detector = new RegimeTransitionDetector();

		detector.update("AAPL", "BULL_TREND", "2024-01-01", 0.8);
		detector.update("AAPL", "BULL_TREND", "2024-01-02", 0.8);
		detector.update("AAPL", "BEAR_TREND", "2024-01-03", 0.8);
		detector.update("AAPL", "BEAR_TREND", "2024-01-04", 0.8);

		const history = detector.getHistory("AAPL");
		expect(history.length).toBe(1);
		const first = requireValue(history[0], "transition history entry");
		expect(first.regime).toBe("BULL_TREND");
		expect(first.duration).toBe(2);
	});

	it("resets state for instrument", () => {
		const detector = new RegimeTransitionDetector();
		detector.update("AAPL", "BULL_TREND", "2024-01-01", 0.8);
		expect(detector.getCurrentRegime("AAPL")).toBe("BULL_TREND");

		detector.reset("AAPL");
		expect(detector.getCurrentRegime("AAPL")).toBeNull();
	});

	it("exports and imports state", () => {
		const detector1 = new RegimeTransitionDetector();
		detector1.update("AAPL", "BULL_TREND", "2024-01-01", 0.8);
		detector1.update("MSFT", "BEAR_TREND", "2024-01-01", 0.7);

		const state = detector1.exportState();
		const detector2 = new RegimeTransitionDetector();
		detector2.importState(state);

		expect(detector2.getCurrentRegime("AAPL")).toBe("BULL_TREND");
		expect(detector2.getCurrentRegime("MSFT")).toBe("BEAR_TREND");
	});
});

describe("analyzeTransitions", () => {
	it("analyzes transition patterns", () => {
		const transitions: RegimeTransition[] = [
			{
				fromRegime: "BULL_TREND",
				toRegime: "RANGE",
				timestamp: "2024-01-01",
				instrumentId: "AAPL",
				confidence: 0.8,
				previousRegimeDuration: 10,
			},
			{
				fromRegime: "RANGE",
				toRegime: "BEAR_TREND",
				timestamp: "2024-01-02",
				instrumentId: "AAPL",
				confidence: 0.7,
				previousRegimeDuration: 5,
			},
			{
				fromRegime: "BULL_TREND",
				toRegime: "RANGE",
				timestamp: "2024-01-03",
				instrumentId: "MSFT",
				confidence: 0.9,
				previousRegimeDuration: 15,
			},
		];

		const analysis = analyzeTransitions(transitions);
		expect(analysis.transitionCounts["BULL_TREND->RANGE"]).toBe(2);
		expect(analysis.averageDuration.BULL_TREND).toBe(12.5);
		expect(analysis.mostCommonTransitions.length).toBeGreaterThan(0);
	});
});

describe("calculateTransitionMatrix", () => {
	it("calculates transition probability matrix", () => {
		const transitions: RegimeTransition[] = [
			{
				fromRegime: "BULL_TREND",
				toRegime: "RANGE",
				timestamp: "2024-01-01",
				instrumentId: "AAPL",
				confidence: 0.8,
				previousRegimeDuration: 10,
			},
			{
				fromRegime: "BULL_TREND",
				toRegime: "BEAR_TREND",
				timestamp: "2024-01-02",
				instrumentId: "AAPL",
				confidence: 0.7,
				previousRegimeDuration: 5,
			},
			{
				fromRegime: "RANGE",
				toRegime: "BULL_TREND",
				timestamp: "2024-01-03",
				instrumentId: "AAPL",
				confidence: 0.9,
				previousRegimeDuration: 15,
			},
		];

		const matrix = calculateTransitionMatrix(transitions);
		expect(matrix.BULL_TREND.RANGE).toBe(0.5);
		expect(matrix.BULL_TREND.BEAR_TREND).toBe(0.5);
		expect(matrix.RANGE.BULL_TREND).toBe(1);
	});
});
