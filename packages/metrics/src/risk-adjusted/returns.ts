/**
 * Return calculation functions
 */

/**
 * Calculate returns from a price/equity series
 *
 * @param values Array of prices or equity values
 * @returns Array of period returns (decimal, e.g., 0.01 = 1%)
 */
export function calculateReturns(values: number[]): number[] {
  if (values.length < 2) {
    return [];
  }

  const returns: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const current = values[i];
    const prev = values[i - 1];
    if (current === undefined || prev === undefined || prev === 0) {
      returns.push(0);
    } else {
      returns.push((current - prev) / prev);
    }
  }

  return returns;
}

/**
 * Calculate cumulative return from a returns series
 *
 * @param returns Array of period returns (decimal)
 * @returns Cumulative return (decimal, e.g., 0.10 = 10%)
 */
export function cumulativeReturn(returns: number[]): number {
  if (returns.length === 0) {
    return 0;
  }

  let cumulative = 1;
  for (const r of returns) {
    cumulative *= 1 + r;
  }

  return cumulative - 1;
}

/**
 * Calculate raw return from equity series
 *
 * @param equity Array of equity values
 * @returns Total return percentage (e.g., 0.10 = 10%)
 */
export function calculateRawReturn(equity: number[]): number {
  if (equity.length < 2) {
    return 0;
  }
  const first = equity[0];
  const last = equity[equity.length - 1];
  if (first === undefined || last === undefined || first === 0) {
    return 0;
  }
  return (last - first) / first;
}
