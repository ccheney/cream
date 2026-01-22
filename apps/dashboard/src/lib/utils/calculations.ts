/**
 * Calculation Utility Functions
 *
 * Common financial calculations for P&L, exposure, and portfolio metrics.
 *
 * @see docs/plans/ui/22-typography.md number formatting
 */

export interface Position {
	symbol: string;
	qty: number;
	avgEntry: number;
	currentPrice: number;
	side: "LONG" | "SHORT";
	marketValue: number;
}

export interface Quote {
	symbol: string;
	price: number;
	bid?: number;
	ask?: number;
}

export interface ExposureResult {
	gross: number;
	net: number;
	long: number;
	short: number;
}

export interface PnLResult {
	absolute: number;
	percent: number;
}

/**
 * Calculate absolute P&L for a position.
 *
 * @example
 * calculatePnL(100, 110, 10)   // 100 (bought at 100, now 110, 10 shares)
 * calculatePnL(100, 90, 10)    // -100
 * calculatePnL(100, 90, -10)   // 100 (short position)
 */
export function calculatePnL(entryPrice: number, currentPrice: number, quantity: number): number {
	return (currentPrice - entryPrice) * quantity;
}

/**
 * Calculate P&L percentage.
 *
 * @example
 * calculatePnLPercent(100, 110)  // 10 (10% gain)
 * calculatePnLPercent(100, 90)   // -10 (-10% loss)
 */
export function calculatePnLPercent(entryPrice: number, currentPrice: number): number {
	if (entryPrice === 0) {
		return 0;
	}
	return ((currentPrice - entryPrice) / entryPrice) * 100;
}

/**
 * Calculate P&L with both absolute and percentage values.
 *
 * @example
 * calculatePnLFull(100, 110, 10)  // { absolute: 100, percent: 10 }
 */
export function calculatePnLFull(
	entryPrice: number,
	currentPrice: number,
	quantity: number,
): PnLResult {
	return {
		absolute: calculatePnL(entryPrice, currentPrice, quantity),
		percent: calculatePnLPercent(entryPrice, currentPrice),
	};
}

/**
 * Calculate total portfolio value from positions and quotes.
 *
 * @example
 * const positions = [{ symbol: 'AAPL', qty: 10, ... }];
 * const quotes = [{ symbol: 'AAPL', price: 150 }];
 * calculatePortfolioValue(positions, quotes)  // 1500
 */
export function calculatePortfolioValue(positions: Position[], quotes: Quote[]): number {
	const quoteMap = new Map(quotes.map((q) => [q.symbol, q.price]));

	return positions.reduce((total, pos) => {
		const price = quoteMap.get(pos.symbol) ?? pos.currentPrice;
		const value = Math.abs(pos.qty) * price;
		return total + value;
	}, 0);
}

/**
 * Calculate portfolio exposure metrics.
 *
 * @example
 * calculateExposure(positions)
 * // { gross: 50000, net: 30000, long: 40000, short: 10000 }
 */
export function calculateExposure(positions: Position[]): ExposureResult {
	let long = 0;
	let short = 0;

	for (const pos of positions) {
		const value = Math.abs(pos.marketValue);
		if (pos.side === "LONG") {
			long += value;
		} else {
			short += value;
		}
	}

	return {
		gross: long + short,
		net: long - short,
		long,
		short,
	};
}

/**
 * Calculate exposure as percentage of NAV.
 */
export function calculateExposurePercent(
	positions: Position[],
	nav: number,
): {
	gross: number;
	net: number;
	long: number;
	short: number;
} {
	const exposure = calculateExposure(positions);

	if (nav === 0) {
		return { gross: 0, net: 0, long: 0, short: 0 };
	}

	return {
		gross: (exposure.gross / nav) * 100,
		net: (exposure.net / nav) * 100,
		long: (exposure.long / nav) * 100,
		short: (exposure.short / nav) * 100,
	};
}

/**
 * Calculate position concentration as percentage of portfolio.
 */
export function calculateConcentration(positionValue: number, portfolioValue: number): number {
	if (portfolioValue === 0) {
		return 0;
	}
	return (positionValue / portfolioValue) * 100;
}

/**
 * Calculate maximum drawdown from equity curve.
 *
 * @example
 * calculateMaxDrawdown([100, 110, 90, 95, 80, 100])  // -27.27 (from 110 to 80)
 */
export function calculateMaxDrawdown(equityCurve: number[]): number {
	if (equityCurve.length === 0) {
		return 0;
	}

	let maxEquity = equityCurve[0] ?? 0;
	let maxDrawdown = 0;

	for (const equity of equityCurve) {
		if (equity > maxEquity) {
			maxEquity = equity;
		}
		const drawdown = ((equity - maxEquity) / maxEquity) * 100;
		if (drawdown < maxDrawdown) {
			maxDrawdown = drawdown;
		}
	}

	return maxDrawdown;
}

/**
 * Calculate Sharpe ratio.
 * Uses annualized returns and standard deviation.
 *
 * @param returns Array of period returns (e.g., daily returns)
 * @param riskFreeRate Annual risk-free rate (e.g., 0.05 for 5%)
 * @param periodsPerYear Number of periods per year (252 for daily, 12 for monthly)
 */
export function calculateSharpeRatio(
	returns: number[],
	riskFreeRate = 0.05,
	periodsPerYear = 252,
): number {
	if (returns.length === 0) {
		return 0;
	}

	const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
	const annualizedReturn = meanReturn * periodsPerYear;

	const variance = returns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / returns.length;
	const stdDev = Math.sqrt(variance);
	const annualizedStdDev = stdDev * Math.sqrt(periodsPerYear);

	if (annualizedStdDev === 0) {
		return 0;
	}

	return (annualizedReturn - riskFreeRate) / annualizedStdDev;
}

/**
 * Calculate Sortino ratio (downside risk adjusted return).
 */
export function calculateSortinoRatio(
	returns: number[],
	riskFreeRate = 0.05,
	periodsPerYear = 252,
): number {
	if (returns.length === 0) {
		return 0;
	}

	const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
	const annualizedReturn = meanReturn * periodsPerYear;

	const downsideReturns = returns.filter((r) => r < 0);
	if (downsideReturns.length === 0) {
		return meanReturn > 0 ? Number.POSITIVE_INFINITY : 0;
	}

	const downsideVariance =
		downsideReturns.reduce((sum, r) => sum + r ** 2, 0) / downsideReturns.length;
	const downsideDeviation = Math.sqrt(downsideVariance);
	const annualizedDownside = downsideDeviation * Math.sqrt(periodsPerYear);

	if (annualizedDownside === 0) {
		return 0;
	}

	return (annualizedReturn - riskFreeRate) / annualizedDownside;
}

/**
 * Calculate total portfolio delta.
 */
export function calculatePortfolioDelta(
	deltas: { symbol: string; delta: number; quantity: number }[],
): number {
	return deltas.reduce((total, d) => total + d.delta * d.quantity, 0);
}

/**
 * Calculate total portfolio theta (daily time decay).
 */
export function calculatePortfolioTheta(
	thetas: { symbol: string; theta: number; quantity: number }[],
): number {
	return thetas.reduce((total, t) => total + t.theta * t.quantity, 0);
}

export default {
	calculatePnL,
	calculatePnLPercent,
	calculatePnLFull,
	calculatePortfolioValue,
	calculateExposure,
	calculateExposurePercent,
	calculateConcentration,
	calculateMaxDrawdown,
	calculateSharpeRatio,
	calculateSortinoRatio,
	calculatePortfolioDelta,
	calculatePortfolioTheta,
};
