/**
 * Backtest Detail Custom Hooks
 *
 * Custom React hooks for transforming and computing backtest data.
 */

import { format } from "date-fns";
import { useMemo } from "react";
import type { EquityDataPoint } from "@/components/charts/EquityCurve";
import type { EquityPoint } from "@/lib/api/types";
import type { MonthlyReturn } from "./types";

/**
 * Transforms equity points into chart-compatible data format.
 */
export function useEquityChartData(equity: EquityPoint[] | undefined): EquityDataPoint[] {
	return useMemo(() => {
		if (!equity) {
			return [];
		}
		return equity.map((point) => ({
			time: format(new Date(point.timestamp), "MMM d"),
			value: point.nav,
			drawdown: point.drawdownPct / 100,
		}));
	}, [equity]);
}

/**
 * Calculates monthly returns from equity data for heatmap display.
 */
export function useMonthlyReturns(equity: EquityPoint[] | undefined): MonthlyReturn[] {
	return useMemo(() => {
		if (!equity || equity.length < 2) {
			return [];
		}

		const monthlyData: MonthlyReturn[] = [];
		let prevValue = equity[0]?.nav ?? 0;
		let currentMonth = "";

		for (const point of equity) {
			const date = new Date(point.timestamp);
			const month = format(date, "MMM yyyy");

			if (month !== currentMonth) {
				if (currentMonth && prevValue > 0) {
					const returnPct = ((point.nav - prevValue) / prevValue) * 100;
					monthlyData.push({ month: currentMonth, returnPct });
				}
				currentMonth = month;
				prevValue = point.nav;
			}
		}

		if (equity.length > 0 && currentMonth) {
			const lastNav = equity[equity.length - 1]?.nav ?? 0;
			const returnPct = prevValue > 0 ? ((lastNav - prevValue) / prevValue) * 100 : 0;
			monthlyData.push({ month: currentMonth, returnPct });
		}

		return monthlyData;
	}, [equity]);
}

/**
 * Formats a number as USD currency.
 */
export function formatCurrency(value: number): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value);
}

/**
 * Formats a number as a percentage with sign.
 */
export function formatPct(value: number): string {
	return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
