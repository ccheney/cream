# @cream/regime

Market regime classification for the Cream trading system.

## Overview

Identifies market conditions using two approaches:

- **Rule-Based Classifier** - Fast, interpretable (MA crossover + volatility)
- **GMM Classifier** - Data-driven regime discovery

## Regimes

- `BULL_TREND` - Upward trend
- `BEAR_TREND` - Downward trend
- `RANGE` - Sideways consolidation
- `HIGH_VOL` - High volatility environment
- `LOW_VOL` - Low volatility environment

## Usage

### Rule-Based Classification

```typescript
import { classifyRegime } from "@cream/regime";

const result = classifyRegime({ candles });
console.log(result.regime);      // "BULL_TREND"
console.log(result.confidence);  // 0.85
console.log(result.metrics);     // fastMa, slowMa, currentAtr
```

### GMM Classification

```typescript
import { trainGMM, classifyWithGMM, serializeGMMModel } from "@cream/regime";

// Train on historical data
const model = trainGMM(historicalCandles);

// Save model
const json = serializeGMMModel(model);

// Classify new data
const result = classifyWithGMM(model, currentCandles);
```

### Transition Detection

```typescript
import { RegimeTransitionDetector } from "@cream/regime";

const detector = new RegimeTransitionDetector();

const transition = detector.update("AAPL", "BULL_TREND", timestamp, 0.8);
if (transition) {
  console.log(`${transition.fromRegime} -> ${transition.toRegime}`);
}
```

## Configuration

### Rule-Based

```typescript
const config = {
  trend_ma_fast: 20,
  trend_ma_slow: 50,
  volatility_percentile_high: 80,
  volatility_percentile_low: 20,
};
```

### GMM

```typescript
const config = {
  k: 5,                // Clusters
  maxIterations: 100,
  tolerance: 1e-4,
  seed: 42,            // Reproducibility
};
```

## Integration

Used in the OODA loop's **Observe phase** to classify market conditions. Agents adjust strategy based on regime:
- `HIGH_VOL` → Conservative positioning
- `BULL_TREND` → Growth exposure
- `BEAR_TREND` → Defensive hedges

## Dependencies

- `@cream/config` - Configuration types
- `@cream/indicators` - SMA, ATR
