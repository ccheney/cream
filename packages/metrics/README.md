# @cream/metrics

Risk-adjusted performance metrics for the Cream trading system.

## Overview

Calculates industry-standard performance metrics:

- **Sharpe Ratio** - Risk-adjusted return
- **Sortino Ratio** - Downside risk only
- **Calmar Ratio** - Return vs max drawdown
- **Drawdown Analysis** - Max and current drawdown
- **Rolling Metrics** - Time-windowed calculations

## Usage

### Basic Metrics

```typescript
import { calculateAllMetrics, calculateReturns } from "@cream/metrics";

const equity = [100000, 101000, 100500, 102000, ...];
const returns = calculateReturns(equity);
const metrics = calculateAllMetrics(equity);
// Returns metrics for 1d, 1w, 1m windows
```

### Individual Ratios

```typescript
import { calculateSharpe, calculateSortino, calculateCalmar } from "@cream/metrics";

const sharpe = calculateSharpe(returns, config);
const sortino = calculateSortino(returns, config);
const calmar = calculateCalmar(returns, equity, config);
```

### Rolling Metrics

```typescript
import { rollingSharpE, rollingSortino } from "@cream/metrics";

const rollingSharpe = rollingSharpE(returns, 100);  // 100-period window
```

### Performance Grading

```typescript
import { isAcceptablePerformance, gradePerformance } from "@cream/metrics";

if (isAcceptablePerformance(metrics)) {
  console.log("Strategy meets threshold");
}

const grade = gradePerformance(metrics);
// "exceptional" (≥3.0) | "elite" (≥2.0) | "acceptable" (≥1.0) | "poor"
```

## Configuration

```typescript
const config = {
  riskFreeRate: 0.05,       // 5% annual
  targetReturn: 0,          // 0% target
  periodsPerYear: 252 * 24, // Hourly data
};
```

## Output

```typescript
interface PerformanceMetrics {
  rawReturn: number;      // Total return %
  sharpe: number | null;  // Annualized
  sortino: number | null; // Annualized
  calmar: number | null;  // Annualized
  window: string;         // "1d", "1w", "1m"
  timestamp: string;      // ISO timestamp
}
```

## Benchmarks

- **Exceptional**: ≥3.0
- **Elite**: ≥2.0
- **Acceptable**: ≥1.0
- **Poor**: <1.0

## Dependencies

Zero external dependencies.
