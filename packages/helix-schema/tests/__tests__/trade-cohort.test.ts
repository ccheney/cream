/**
 * Trade Cohort Summarization Tests
 *
 * Tests for trade cohort summary creation and grouping.
 */

import { describe, expect, it } from "bun:test";
import {
	createTradeCohortSummary,
	formatMonthlyPeriod,
	formatQuarterlyPeriod,
	groupDecisionsForSummarization,
	type TradeDecisionInfo,
} from "../../src/retention/forgetting.js";

describe("createTradeCohortSummary", () => {
	it("creates summary from trade decisions", () => {
		const decisions: TradeDecisionInfo[] = [
			{
				decisionId: "d1",
				instrumentId: "AAPL",
				regimeLabel: "BULLISH",
				createdAt: new Date("2024-07-01"),
				closedAt: new Date("2024-07-05"),
				realizedPnl: 1000,
				returnPct: 0.05,
				isWin: true,
			},
			{
				decisionId: "d2",
				instrumentId: "AAPL",
				regimeLabel: "BULLISH",
				createdAt: new Date("2024-07-10"),
				closedAt: new Date("2024-07-12"),
				realizedPnl: -500,
				returnPct: -0.02,
				isWin: false,
			},
			{
				decisionId: "d3",
				instrumentId: "AAPL",
				regimeLabel: "BULLISH",
				createdAt: new Date("2024-07-15"),
				closedAt: new Date("2024-07-20"),
				realizedPnl: 2000,
				returnPct: 0.08,
				isWin: true,
			},
		];

		const summary = createTradeCohortSummary("2024-Q3", "AAPL", "BULLISH", decisions);

		expect(summary.summaryType).toBe("trade_cohort");
		expect(summary.period).toBe("2024-Q3");
		expect(summary.instrumentId).toBe("AAPL");
		expect(summary.regimeLabel).toBe("BULLISH");
		expect(summary.stats.totalDecisions).toBe(3);
		expect(summary.stats.winRate).toBeCloseTo(2 / 3, 2);
		expect(summary.stats.totalPnl).toBe(2500);
		expect(summary.notableDecisionIds).toContain("d3");
	});

	it("throws for empty decisions", () => {
		expect(() => createTradeCohortSummary("2024-Q3", "AAPL", "BULLISH", [])).toThrow(
			"Cannot create summary"
		);
	});

	it("limits notable decisions", () => {
		const decisions: TradeDecisionInfo[] = Array.from({ length: 10 }, (_, i) => ({
			decisionId: `d${i}`,
			instrumentId: "AAPL",
			regimeLabel: "BULLISH",
			createdAt: new Date(),
			realizedPnl: i * 100,
			returnPct: 0.01,
			isWin: true,
		}));

		const summary = createTradeCohortSummary("2024-Q3", "AAPL", "BULLISH", decisions, 3);

		expect(summary.notableDecisionIds.length).toBe(3);
	});
});

describe("groupDecisionsForSummarization", () => {
	it("groups by period, instrument, and regime", () => {
		const decisions: TradeDecisionInfo[] = [
			{
				decisionId: "d1",
				instrumentId: "AAPL",
				regimeLabel: "BULLISH",
				createdAt: new Date("2024-07-01"),
				realizedPnl: 100,
				returnPct: 0.01,
				isWin: true,
			},
			{
				decisionId: "d2",
				instrumentId: "AAPL",
				regimeLabel: "BULLISH",
				createdAt: new Date("2024-08-01"),
				realizedPnl: 200,
				returnPct: 0.02,
				isWin: true,
			},
			{
				decisionId: "d3",
				instrumentId: "GOOG",
				regimeLabel: "BULLISH",
				createdAt: new Date("2024-07-15"),
				realizedPnl: 300,
				returnPct: 0.03,
				isWin: true,
			},
		];

		const groups = groupDecisionsForSummarization(decisions);

		const aaplGroup = groups.get("2024-Q3:AAPL:BULLISH");
		expect(aaplGroup?.length).toBe(2);

		const googGroup = groups.get("2024-Q3:GOOG:BULLISH");
		expect(googGroup?.length).toBe(1);
	});
});

describe("formatQuarterlyPeriod", () => {
	it("formats dates to quarterly periods", () => {
		expect(formatQuarterlyPeriod(new Date("2024-01-15"))).toBe("2024-Q1");
		expect(formatQuarterlyPeriod(new Date("2024-04-01"))).toBe("2024-Q2");
		expect(formatQuarterlyPeriod(new Date("2024-07-31"))).toBe("2024-Q3");
		expect(formatQuarterlyPeriod(new Date("2024-12-25"))).toBe("2024-Q4");
	});
});

describe("formatMonthlyPeriod", () => {
	it("formats dates to monthly periods", () => {
		expect(formatMonthlyPeriod(new Date("2024-01-15"))).toBe("2024-01");
		expect(formatMonthlyPeriod(new Date("2024-12-01"))).toBe("2024-12");
	});
});
