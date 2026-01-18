# @cream/marketdata

Market data aggregation and processing for the Cream trading system.

## Overview

Central data layer providing:

- **Provider Clients** - Alpaca, Alpha Vantage
- **Environment-Aware Adapters** - Real data providers (PAPER/LIVE)
- **Data Validation** - Staleness, gaps, anomalies
- **Feature Snapshots** - Candles, indicators, regime
- **Option Chain Scanner** - Filtering and scoring
- **Options Greeks** - Black-Scholes calculations

## Providers

| Provider | Data |
|----------|------|
| Alpaca | Quotes, candles, options (unified) |
| Alpha Vantage | Macro indicators |

## Usage

### Market Data Adapter

```typescript
import { createMarketDataAdapter } from "@cream/marketdata";

const adapter = createMarketDataAdapter();
const candles = await adapter.getCandles("AAPL", "1h", "2026-01-01", "2026-01-05");
const quotes = await adapter.getQuotes(["AAPL", "MSFT"]);
```

### Candle Ingestion

```typescript
import { CandleIngestionService } from "@cream/marketdata";

const result = await ingester.ingest("AAPL", "1h", from, to, {
  checkStaleness: true,
  aggregateCandles: true,
});
```

### Data Validation

```typescript
import { validateCandleData, detectAllAnomalies } from "@cream/marketdata";

const result = validateCandleData(candles, {
  checkStaleness: true,
  checkGaps: true,
  calendarAware: true,
});
```

### Feature Snapshots

```typescript
import { buildSnapshot } from "@cream/marketdata";

const snapshot = await buildSnapshot("AAPL", Date.now(), sources);
// Returns: candles, indicators, regime, marketCapBucket
```

### Option Chain Scanner

```typescript
import { OptionChainScanner } from "@cream/marketdata";

const scanner = new OptionChainScanner(alpacaClient);
const candidates = await scanner.scan("AAPL", {
  minDte: 30,
  maxDte: 60,
  minDelta: 0.15,
});
```

### Options Greeks

```typescript
import { calculateGreeks, calculateOptionsExposure } from "@cream/marketdata";

const greeks = calculateGreeks({
  underlying: 150,
  strike: 150,
  dte: 30,
  volatility: 0.25,
  optionType: "call",
});
```

## Configuration

```bash
ALPACA_KEY=...       # Alpaca (unified market data + broker)
ALPACA_SECRET=...    # Alpaca secret
ALPHAVANTAGE_KEY=... # Alpha Vantage
CREAM_ENV=...        # Controls adapter selection
```

## Dependencies

- `@cream/domain` - Environment, types
- `@cream/indicators` - Technical indicators
- `@cream/regime` - Market regime
- `@cream/universe` - Trading universe
