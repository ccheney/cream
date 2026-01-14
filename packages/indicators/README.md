# @cream/indicators

Technical indicator calculation engine for the Cream trading system.

## Overview

The v2 indicator engine provides academically-validated technical, fundamental, and alternative data indicators. It distinguishes between:

1. **Real-time indicators** - Computed on-demand from market data (price, volume, options)
2. **Batch indicators** - Computed nightly from external sources (fundamentals, filings, short interest, sentiment)

See [docs/plans/33-indicator-engine-v2.md](../../docs/plans/33-indicator-engine-v2.md) for complete architecture.

## Quick Start

```typescript
import {
  IndicatorService,
  createIndicatorService,
  type IndicatorSnapshot,
} from "@cream/indicators";

// Create service with dependencies
const service = createIndicatorService({
  marketData: alpacaMarketData,
  optionsProvider: alpacaOptionsProvider,
  fundamentalRepo: tursoFundamentalsRepo,
  // ... other repos
});

// Get complete indicator snapshot for a symbol
const snapshot: IndicatorSnapshot = await service.getSnapshot("AAPL");

// Access indicators by category
console.log(snapshot.price.rsi_14);        // 65.5
console.log(snapshot.liquidity.vwap);      // 175.42
console.log(snapshot.sentiment.overall_score); // 0.6
```

## API Reference

### IndicatorService

The main service for fetching and calculating indicators.

```typescript
interface IndicatorService {
  // Get complete snapshot for a symbol
  getSnapshot(symbol: string): Promise<IndicatorSnapshot>;

  // Get snapshots for multiple symbols
  getSnapshots(symbols: string[]): Promise<Map<string, IndicatorSnapshot>>;

  // Get only price-based indicators
  getPriceIndicators(symbol: string): Promise<PriceIndicators>;
}
```

### IndicatorSnapshot

The unified indicator format returned by `getSnapshot()`:

```typescript
interface IndicatorSnapshot {
  symbol: string;
  timestamp: number;

  // Real-time (from Alpaca bars)
  price: PriceIndicators;      // RSI, SMA, EMA, ATR, MACD, Bollinger, Stochastic
  liquidity: LiquidityIndicators;  // Bid-ask spread, VWAP, Amihud illiquidity
  options: OptionsIndicators;      // IV skew, put/call ratio, term structure, Greeks

  // Batch (from external sources)
  value: ValueIndicators;          // P/E, P/B, EV/EBITDA, dividend yield
  quality: QualityIndicators;      // ROE, ROA, gross profitability, Beneish M-score
  short_interest: ShortInterestIndicators;  // Short ratio, days to cover
  sentiment: SentimentIndicators;  // News sentiment, social sentiment
  corporate: CorporateIndicators;  // Earnings dates, dividends, splits

  // Context
  market: MarketIndicators;        // Sector, market cap, beta
  metadata: IndicatorMetadata;     // Data quality, timestamps
}
```

### Price Calculators

Pure functions for calculating individual indicators from OHLCV bars:

```typescript
import {
  calculateRSI,
  calculateSMA,
  calculateEMA,
  calculateATR,
  calculateMACD,
  calculateBollingerBands,
  calculateStochastic,
  isGoldenCross,
  isDeathCross,
} from "@cream/indicators";

// Single value calculations
const rsi = calculateRSI(bars, 14);           // RSIResult | null
const sma = calculateSMA(bars, 20);           // number | null
const atr = calculateATR(bars, 14);           // number | null

// Series calculations (for charts/backtesting)
import {
  calculateRSISeries,
  calculateSMASeries,
  calculateMACDSeries,
} from "@cream/indicators";

const rsiSeries = calculateRSISeries(bars, 14);   // RSIResult[]
const smaSeries = calculateSMASeries(bars, 20);   // SMAResult[]

// Crossover detection
const isEntry = isGoldenCross(prevFast, prevSlow, currFast, currSlow);
const isExit = isDeathCross(prevFast, prevSlow, currFast, currSlow);
```

### Liquidity Calculators

```typescript
import {
  calculateBidAskSpread,
  calculateAmihudIlliquidity,
  calculateTurnoverRatio,
  calculateVWAP,
} from "@cream/indicators";

const spread = calculateBidAskSpread(bidPrice, askPrice);
const amihud = calculateAmihudIlliquidity(returns, volume);
```

### Batch Jobs

For populating batch indicators from external data sources:

```typescript
import {
  ShortInterestBatchJob,
  SentimentAggregationJob,
  CorporateActionsBatchJob,
} from "@cream/indicators";

// Run short interest batch
const job = new ShortInterestBatchJob(finraClient, shortInterestRepo, sharesProvider);
const result = await job.run(symbols);
console.log(`Processed ${result.processed}, Failed: ${result.failed}`);
```

## Batch Job Schedule

| Job | Frequency | Data Source | Purpose |
|-----|-----------|-------------|---------|
| `ShortInterestBatchJob` | Bi-monthly | FINRA | Short interest data |
| `SentimentAggregationJob` | Hourly | Alpaca News | Sentiment scores |
| `CorporateActionsBatchJob` | Daily | Alpaca | Earnings, dividends, splits |

## Data Quality

Each snapshot includes metadata about data freshness:

```typescript
const snapshot = await service.getSnapshot("AAPL");

console.log(snapshot.metadata.data_quality);     // "COMPLETE" | "PARTIAL" | "STALE"
console.log(snapshot.metadata.missing_fields);   // ["options"] if unavailable
console.log(snapshot.metadata.price_updated_at); // timestamp
```

## Configuration

The service accepts configuration for caching and timeouts:

```typescript
const service = createIndicatorService({
  // ... providers
}, {
  cache: {
    priceIndicatorsTTL: 30_000,    // 30s for price data
    batchIndicatorsTTL: 3600_000, // 1hr for batch data
  },
  timeouts: {
    marketDataMs: 5000,
    optionsDataMs: 10000,
  },
});
```

## Dependencies

- `@cream/storage` - Repository interfaces for batch data
- `@cream/logger` - Structured logging
