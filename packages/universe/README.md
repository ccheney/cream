# @cream/universe

Trading universe resolution for the Cream trading system.

## Overview

Dynamically selects trading symbols based on configuration:

- **Static Lists** - Direct ticker lists
- **Index Constituents** - S&P 500, NASDAQ 100, Russell, etc.
- **ETF Holdings** - Top holdings from ETFs
- **Stock Screeners** - Custom filters via FMP

## Usage

### Basic Resolution

```typescript
import { resolveUniverse, resolveUniverseSymbols } from "@cream/universe";

const instruments = await resolveUniverse(config);
// Returns: ResolvedInstrument[] with metadata

const symbols = await resolveUniverseSymbols(config);
// Returns: string[] of tickers
```

### Individual Sources

```typescript
import { resolveIndexSource, resolveScreenerSource } from "@cream/universe";

const sp500 = await resolveIndexSource({ indexId: "sp500" });
const screened = await resolveScreenerSource({
  minVolume: 1000000,
  minMarketCap: 10000000000,
});
```

### Point-in-Time (Backtesting)

```typescript
import { createPointInTimeResolver } from "@cream/universe";

const resolver = createPointInTimeResolver(repos);
const historicalUniverse = await resolver.getUniverseAsOf("2024-01-01");
// Prevents survivorship bias
```

## Configuration

```typescript
const config = {
  sources: [
    { type: "index", indexId: "sp500" },
    { type: "screener", minVolume: 1000000 },
  ],
  compose_mode: "union",  // or "intersection"
  filters: {
    minVolume: 500000,
    minMarketCap: 1000000000,
  },
  max_instruments: 100,
  diversification: {
    maxPerSector: 10,
    minSectors: 5,
  },
};
```

### Environment

```bash
FMP_KEY=...  # Required for index/ETF/screener sources
```

## Supported Indices

- S&P 500 (`sp500`)
- NASDAQ 100 (`nasdaq100`)
- Russell 2000 (`russell2000`)
- Dow Jones (`dowjones`)

## Output

```typescript
interface ResolvedInstrument {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  avgVolume: number;
  price: number;
}
```

## Dependencies

- `@cream/config` - UniverseConfig types
- `@cream/storage` - Cached snapshots
