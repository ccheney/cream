# @cream/indicators

Technical indicators for the Cream trading system.

## Overview

Provides:

- **Core Indicators** - RSI, Stochastic, SMA, EMA, ATR, Bollinger Bands
- **Pipeline** - Multi-timeframe calculation
- **Transforms** - Z-score, percentile rank, returns
- **Synthesis** - Dynamic indicator generation and validation

## Indicators

### Momentum
- **RSI** - Relative Strength Index (period: 14)
- **Stochastic** - K and D lines (K: 14, D: 3)

### Trend
- **SMA** - Simple Moving Average (20, 50, 200)
- **EMA** - Exponential Moving Average (9, 21)

### Volatility
- **ATR** - Average True Range (period: 14)
- **Bollinger Bands** - Center, upper, lower, bandwidth (period: 20, stddev: 2)

### Volume
- **Volume SMA** - Volume relative to average (period: 20)

## Usage

### Single Timeframe

```typescript
import { calculateIndicators } from "@cream/indicators";

const snapshot = calculateIndicators(candles, "1h");
console.log(snapshot.values["rsi_14_1h"]);
```

### Multi-Timeframe

```typescript
import { calculateMultiTimeframeIndicators } from "@cream/indicators";

const combined = calculateMultiTimeframeIndicators(
  new Map([["1h", candles1h], ["4h", candles4h]])
);
```

### Historical (Backtesting)

```typescript
import { calculateHistoricalIndicators, getRequiredWarmupPeriod } from "@cream/indicators";

const warmup = getRequiredWarmupPeriod(config);
const snapshots = calculateHistoricalIndicators(candles, "1d", config, warmup);
```

### Transforms

```typescript
import { applyTransforms } from "@cream/indicators";

const transformed = applyTransforms(candles, "1h", {
  zscore: { enabled: true, params: { lookback: 20 } },
  returns: { enabled: true, params: { periods: [1, 5, 20] } },
});
```

## Configuration

```typescript
const config = {
  rsi: { enabled: true, period: 14 },
  sma: { enabled: true, periods: [20, 50, 200] },
  atr: { enabled: true, period: 14 },
  bollinger: { enabled: true, period: 20, stdDev: 2 },
};
```

## Synthesis

For dynamic indicator generation with ML validation:

```typescript
import { runValidationPipeline, IndicatorMonitor } from "@cream/indicators";

const validation = await runValidationPipeline({
  hypothesis,
  historicalData: candles,
  config: { gates: ["dsr", "pbo", "ic", "orthogonality"] },
});
```

## Dependencies

- `@cream/storage` - Features repository
