import {
	getPortfolioHistory,
	type PortfolioHistory,
	type PortfolioHistoryPeriod,
	type PortfolioHistoryTimeframe,
} from "@cream/broker";
import { calculateReturns, calculateSharpe, calculateSortino } from "@cream/metrics";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import log from "../../logger.js";
import { getCurrentEnvironment } from "../system.js";
import { PerformanceMetricsSchema } from "./schemas.js";
import { getBrokerClient, getBrokerCredentials, isAlpacaConfigured } from "./shared.js";

const performanceRoute = createRoute({
	method: "get",
	path: "/performance",
	responses: {
		200: {
			content: { "application/json": { schema: PerformanceMetricsSchema } },
			description: "Performance metrics",
		},
	},
	tags: ["Portfolio"],
});

interface PeriodMetrics {
	return: number;
	returnPct: number;
	trades: number;
	winRate: number;
}

interface PerformancePeriods {
	today: PeriodMetrics;
	week: PeriodMetrics;
	month: PeriodMetrics;
	threeMonth: PeriodMetrics;
	ytd: PeriodMetrics;
	oneYear: PeriodMetrics;
	total: PeriodMetrics;
}

interface PortfolioHistories {
	week: PortfolioHistory | null;
	month: PortfolioHistory | null;
	threeMonth: PortfolioHistory | null;
	ytd: PortfolioHistory | null;
	all: PortfolioHistory | null;
}

const NO_TRADES = { trades: 0, winRate: 0 };
const DAILY_METRICS_CONFIG = { riskFreeRate: 0.05, targetReturn: 0, periodsPerYear: 252 };

function createDefaultPeriodMetrics(): PeriodMetrics {
	return { return: 0, returnPct: 0, ...NO_TRADES };
}

function createDefaultPeriods(): PerformancePeriods {
	return {
		today: createDefaultPeriodMetrics(),
		week: createDefaultPeriodMetrics(),
		month: createDefaultPeriodMetrics(),
		threeMonth: createDefaultPeriodMetrics(),
		ytd: createDefaultPeriodMetrics(),
		oneYear: createDefaultPeriodMetrics(),
		total: createDefaultPeriodMetrics(),
	};
}

function getWeekStartDate(): string {
	const now = new Date();
	const day = now.getDay();
	const diff = day === 0 ? 6 : day - 1;
	const monday = new Date(now);
	monday.setDate(now.getDate() - diff);
	monday.setHours(0, 0, 0, 0);
	return monday.toISOString().slice(0, 10);
}

async function fetchHistorySafe(
	period: PortfolioHistoryPeriod,
	timeframe: PortfolioHistoryTimeframe,
	dateStart?: string,
): Promise<PortfolioHistory | null> {
	try {
		const { apiKey, apiSecret } = getBrokerCredentials();
		const result = await getPortfolioHistory(
			{ apiKey, apiSecret, environment: getCurrentEnvironment() },
			{ period, timeframe, ...(dateStart ? { dateStart } : {}) },
		);
		log.debug(
			{ period, dateStart, dataPoints: result.equity?.length ?? 0, baseValue: result.baseValue },
			"Fetched portfolio history",
		);
		return result;
	} catch (error) {
		log.warn(
			{ period, error: error instanceof Error ? error.message : String(error) },
			"Failed to fetch portfolio history for period",
		);
		return null;
	}
}

async function fetchPeriodHistories(): Promise<PortfolioHistories> {
	const weekStartDate = getWeekStartDate();
	const [week, month, threeMonth, ytd, all] = await Promise.all([
		fetchHistorySafe("1W", "1D", weekStartDate),
		fetchHistorySafe("1M", "1D"),
		fetchHistorySafe("3M", "1D"),
		fetchHistorySafe("1A", "1D"),
		fetchHistorySafe("all", "1D"),
	]);
	return { week, month, threeMonth, ytd, all };
}

function resolveFallbackBase(allHistory: PortfolioHistory | null): number {
	return allHistory?.equity?.find((value) => value > 0) ?? allHistory?.baseValue ?? 0;
}

function resolveBaseValue(
	currentHistory: PortfolioHistory | null,
	overrideBase?: number,
	fallbackBase?: number,
): number | undefined {
	if (overrideBase && overrideBase > 0) {
		return overrideBase;
	}

	if (currentHistory) {
		const historyBase =
			currentHistory.baseValue > 0 ? currentHistory.baseValue : (currentHistory.equity?.[0] ?? 0);
		if (historyBase > 0) {
			return historyBase;
		}
	}

	if (fallbackBase && fallbackBase > 0) {
		return fallbackBase;
	}

	return undefined;
}

function calculatePeriodReturns(
	currentEquity: number,
	history: PortfolioHistory | null,
	overrideBase?: number,
	fallbackBase?: number,
): Pick<PeriodMetrics, "return" | "returnPct"> {
	const baseValue = resolveBaseValue(history, overrideBase, fallbackBase);
	if (!baseValue) {
		return { return: 0, returnPct: 0 };
	}

	return {
		return: currentEquity - baseValue,
		returnPct: (currentEquity / baseValue - 1) * 100,
	};
}

function buildPeriods(params: {
	currentEquity: number;
	lastEquity: number;
	histories: PortfolioHistories;
}): PerformancePeriods {
	const fallbackBase = resolveFallbackBase(params.histories.all);
	const todayBase = params.lastEquity > 0 ? params.lastEquity : fallbackBase;
	const todayReturns = calculatePeriodReturns(params.currentEquity, null, todayBase, fallbackBase);
	const weekReturns = calculatePeriodReturns(
		params.currentEquity,
		params.histories.week,
		undefined,
		fallbackBase,
	);
	const monthReturns = calculatePeriodReturns(
		params.currentEquity,
		params.histories.month,
		undefined,
		fallbackBase,
	);
	const threeMonthReturns = calculatePeriodReturns(
		params.currentEquity,
		params.histories.threeMonth,
		undefined,
		fallbackBase,
	);
	const ytdReturns = calculatePeriodReturns(
		params.currentEquity,
		params.histories.ytd,
		undefined,
		fallbackBase,
	);
	const allReturns = calculatePeriodReturns(
		params.currentEquity,
		params.histories.all,
		undefined,
		fallbackBase,
	);

	return {
		today: { ...todayReturns, ...NO_TRADES },
		week: { ...weekReturns, ...NO_TRADES },
		month: { ...monthReturns, ...NO_TRADES },
		threeMonth: { ...threeMonthReturns, ...NO_TRADES },
		ytd: { ...ytdReturns, ...NO_TRADES },
		oneYear: { ...allReturns, ...NO_TRADES },
		total: { ...allReturns, ...NO_TRADES },
	};
}

function buildEquityHistory(histories: PortfolioHistories, currentEquity: number): number[] {
	const base = histories.all?.equity ?? histories.month?.equity ?? [];
	return currentEquity > 0 ? [...base, currentEquity] : [...base];
}

function calculateDrawdowns(equityHistory: number[]) {
	let peak = 0;
	let maxDrawdown = 0;
	const lastEquity = equityHistory.at(-1) ?? 0;

	for (const equity of equityHistory) {
		peak = Math.max(peak, equity);
		const drawdown = peak - equity;
		maxDrawdown = Math.max(maxDrawdown, drawdown);
	}

	const currentDrawdown = peak > 0 ? peak - lastEquity : 0;
	return {
		maxDrawdown,
		currentDrawdown,
		maxDrawdownPct: peak > 0 ? -(maxDrawdown / peak) * 100 : 0,
		currentDrawdownPct: peak > 0 ? -(currentDrawdown / peak) * 100 : 0,
	};
}

function calculateVolatilityAndRatios(equityHistory: number[]) {
	const dailyReturns = calculateReturns(equityHistory);
	const sharpeRatio =
		dailyReturns.length >= 2 ? (calculateSharpe(dailyReturns, DAILY_METRICS_CONFIG) ?? 0) : 0;
	const sortinoRatio =
		dailyReturns.length >= 2 ? (calculateSortino(dailyReturns, DAILY_METRICS_CONFIG) ?? 0) : 0;

	if (dailyReturns.length < 2) {
		return { dailyVolatility: 0, annualizedVolatility: 0, sharpeRatio, sortinoRatio };
	}

	const mean = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
	const squaredDiffs = dailyReturns.map((value) => (value - mean) ** 2);
	const variance = squaredDiffs.reduce((sum, value) => sum + value, 0) / (dailyReturns.length - 1);
	const dailyVolatility = Math.sqrt(variance);
	return {
		dailyVolatility,
		annualizedVolatility: dailyVolatility * Math.sqrt(252),
		sharpeRatio,
		sortinoRatio,
	};
}

async function loadBrokerPerformanceData() {
	const client = getBrokerClient();
	const currentAccount = await client.getAccount();
	const histories = await fetchPeriodHistories();

	const periods = buildPeriods({
		currentEquity: currentAccount.equity,
		lastEquity: currentAccount.lastEquity,
		histories,
	});
	const equityHistory = buildEquityHistory(histories, currentAccount.equity);

	log.debug(
		{
			todayReturn: periods.today.return,
			weekReturn: periods.week.return,
			monthReturn: periods.month.return,
		},
		"Calculated period returns from Alpaca history",
	);

	return { periods, equityHistory };
}

export function registerPerformanceRoute(app: OpenAPIHono): void {
	app.openapi(performanceRoute, async (c) => {
		let periods = createDefaultPeriods();
		let equityHistory: number[] = [];

		if (isAlpacaConfigured()) {
			try {
				const brokerData = await loadBrokerPerformanceData();
				periods = brokerData.periods;
				equityHistory = brokerData.equityHistory;
			} catch (error) {
				log.warn(
					{ error: error instanceof Error ? error.message : String(error) },
					"Failed to fetch Alpaca portfolio history for performance metrics",
				);
			}
		}

		const drawdowns = calculateDrawdowns(equityHistory);
		const volatility = calculateVolatilityAndRatios(equityHistory);

		return c.json({
			periods,
			volatility: {
				daily: volatility.dailyVolatility,
				annualized: volatility.annualizedVolatility,
			},
			sharpeRatio: volatility.sharpeRatio,
			sortinoRatio: volatility.sortinoRatio,
			maxDrawdown: drawdowns.maxDrawdown,
			maxDrawdownPct: drawdowns.maxDrawdownPct,
			currentDrawdown: drawdowns.currentDrawdown,
			currentDrawdownPct: drawdowns.currentDrawdownPct,
			winRate: 0,
			profitFactor: 0,
			avgWin: 0,
			avgLoss: 0,
			totalTrades: 0,
		});
	});
}
