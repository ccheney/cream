# @cream/prediction-markets

Prediction markets integration for the Cream trading system. Aggregates probability data from Kalshi and Polymarket to provide macro-level signals for trading decisions.

## Installation

```bash
bun add @cream/prediction-markets
```

## Features

- **Multi-Platform Support**: Unified client for Kalshi and Polymarket
- **Real-Time Updates**: WebSocket support for Kalshi market data
- **Market Aggregation**: Cross-platform market matching and arbitrage detection
- **Caching**: In-memory TTL cache with LRU eviction
- **Signal Transformation**: Convert prediction market data to trading signals

## Quick Start

```typescript
import {
  createKalshiClientFromEnv,
  createPolymarketClientFromEnv,
  createUnifiedClient,
} from "@cream/prediction-markets";

// Create unified client (combines both platforms)
const client = await createUnifiedClient();

// Fetch aggregated market data
const data = await client.fetchAllMarkets();
console.log("Fed Rate Markets:", data.fedRateMarkets);
console.log("Macro Risk Signals:", data.macroRiskSignals);
console.log("Arbitrage Alerts:", data.arbitrageAlerts);
```

## API Reference

### Clients

#### KalshiClient

REST API client for Kalshi prediction markets with RSA-PSS authentication.

```typescript
import { createKalshiClientFromEnv } from "@cream/prediction-markets";

const client = await createKalshiClientFromEnv();

// Fetch markets by series
const fedMarkets = await client.getMarketsBySeries("KXFED");

// Fetch events with markets
const events = await client.getEventsWithMarkets({
  seriesTicker: "KXFED",
  status: "open",
});
```

**Environment Variables:**
- `KALSHI_API_KEY_ID` - API key ID
- `KALSHI_PRIVATE_KEY` - RSA private key (PEM format)
- `KALSHI_DEMO` - Set to "true" for demo environment

#### PolymarketClient

CLOB client for Polymarket prediction markets.

```typescript
import { createPolymarketClientFromEnv } from "@cream/prediction-markets";

const client = await createPolymarketClientFromEnv();

// Search for relevant markets
const events = await client.searchMarkets("Federal Reserve");

// Get orderbook for a token
const orderbook = await client.getOrderbook(tokenId);
```

#### KalshiWebSocketClient

Real-time market data via WebSocket connection.

```typescript
import { KalshiWebSocketClient } from "@cream/prediction-markets";

const ws = new KalshiWebSocketClient({ demo: true });
await ws.connect();

// Subscribe to ticker updates
ws.subscribe("ticker", ["KXFED-26JAN29"], (message) => {
  console.log("Price update:", message);
});

// Access cached market state
const state = ws.getCache().get("KXFED-26JAN29");
```

### Aggregation

#### UnifiedPredictionMarketClient

Combines Kalshi and Polymarket into a single interface.

```typescript
import { createUnifiedClient } from "@cream/prediction-markets";

const client = await createUnifiedClient({
  kalshi: { demo: true },
  polymarket: {},
  cache: { eventTtlMs: 300000 },
  arbitrageThreshold: 0.05,
});

const data = await client.fetchAllMarkets();
```

#### MarketMatcher

Matches similar markets across platforms using Jaccard similarity.

```typescript
import { MarketMatcher } from "@cream/prediction-markets";

const matcher = new MarketMatcher({ minSimilarity: 0.3 });
const matches = matcher.findMatches(kalshiMarkets, polymarketMarkets);
```

#### ArbitrageDetector

Detects price divergences between platforms.

```typescript
import { ArbitrageDetector } from "@cream/prediction-markets";

const detector = new ArbitrageDetector({ threshold: 0.05 });
const alerts = detector.detectArbitrage(matchedMarkets);
```

### Caching

#### MarketCache

In-memory cache with TTL and LRU eviction.

```typescript
import { MarketCache } from "@cream/prediction-markets";

const cache = new MarketCache({
  eventTtlMs: 300000, // 5 minutes
  scoresTtlMs: 60000, // 1 minute
  maxEventEntries: 1000,
});

// Get-or-fetch pattern
const event = await cache.getOrFetchEvent("KXFED-26JAN29", async () => {
  return await fetchFromApi("KXFED-26JAN29");
});
```

### Transformers

#### transformToExternalEvent

Converts prediction market events to ExternalEvent format for the trading system.

```typescript
import { transformToExternalEvent } from "@cream/prediction-markets";

const externalEvent = transformToExternalEvent(predictionMarketEvent);
// Returns: { eventId, eventType: "PREDICTION_MARKET", payload, ... }
```

#### mapToRelatedInstruments

Maps market types to related ETF instruments.

```typescript
import { mapToRelatedInstruments } from "@cream/prediction-markets";

const instruments = mapToRelatedInstruments(fedRateEvent);
// Returns: ["XLF", "TLT", "IYR", "KRE", ...]
```

## Market Types

| Type | Description | Example Markets |
|------|-------------|-----------------|
| FED_RATE | Federal Reserve decisions | KXFED (25bps cut/hike) |
| ECONOMIC_DATA | Economic indicators | KXCPI, KXGDP |
| RECESSION | Recession probability | Recession 2026 |
| GEOPOLITICAL | Geopolitical events | Tariffs, conflicts |
| REGULATORY | Regulatory decisions | SEC, antitrust |
| ELECTION | Election outcomes | Presidential races |

## Prediction Market Scores

The aggregator computes standardized scores for the trading system:

```typescript
interface PredictionMarketScores {
  fedCutProbability?: number;     // 0-1 probability of Fed rate cut
  fedHikeProbability?: number;    // 0-1 probability of Fed rate hike
  recessionProbability12m?: number; // 12-month recession probability
  macroUncertaintyIndex?: number; // 0-1 overall macro uncertainty
  policyEventRisk?: number;       // 0-1 policy event risk
  cpiSurpriseDirection?: number;  // -1 to 1 CPI surprise direction
  gdpSurpriseDirection?: number;  // -1 to 1 GDP surprise direction
}
```

## Testing

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Run specific test file
bun test src/providers/kalshi/client.test.ts
```

## Configuration

See `@cream/config` for full configuration options:

```typescript
import { loadConfig } from "@cream/config";

const config = await loadConfig();
const pmConfig = config.predictionMarkets;
// { kalshi: {...}, polymarket: {...}, cache: {...}, ... }
```

## Rate Limits

| Platform | Rate Limit |
|----------|------------|
| Kalshi REST | 100 req/min |
| Kalshi WebSocket | 10 msg/sec |
| Polymarket | 30 req/min |

## Related Packages

- `@cream/domain` - Shared types and schemas
- `@cream/config` - Configuration management
- `@cream/storage` - Database persistence (PredictionMarketsRepository)
