/**
 * Drawdown calculation functions
 */

/**
 * Calculate maximum drawdown from equity curve
 *
 * @param equity Array of equity values
 * @returns Maximum drawdown as positive decimal (e.g., 0.20 = 20% drawdown)
 */
export function calculateMaxDrawdown(equity: number[]): number {
	if (equity.length < 2) {
		return 0;
	}

	const firstValue = equity[0];
	if (firstValue === undefined) {
		return 0;
	}

	let maxDrawdown = 0;
	let peak = firstValue;

	for (const value of equity) {
		if (value > peak) {
			peak = value;
		}

		if (peak === 0) {
			continue;
		}

		const drawdown = (peak - value) / peak;
		if (drawdown > maxDrawdown) {
			maxDrawdown = drawdown;
		}
	}

	return maxDrawdown;
}

/**
 * Calculate current drawdown from equity curve
 *
 * @param equity Array of equity values
 * @returns Current drawdown as positive decimal
 */
export function calculateCurrentDrawdown(equity: number[]): number {
	if (equity.length < 2) {
		return 0;
	}

	const peak = Math.max(...equity);
	const current = equity[equity.length - 1];

	if (current === undefined || peak === 0) {
		return 0;
	}
	return (peak - current) / peak;
}
