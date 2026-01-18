# @cream/broker

Broker integration for the Cream trading system. Unified API across PAPER and LIVE environments.

## Overview

Manages trading operations through:

- **AlpacaClient** - Type-safe Alpaca Markets API wrapper
- **Environment-Aware Factory** - Auto-selects adapter based on context

## Key Components

### Client (`src/client.ts`)

```typescript
import { createAlpacaClient } from "@cream/broker";

const client = createAlpacaClient({
  apiKey: process.env.ALPACA_KEY,
  apiSecret: process.env.ALPACA_SECRET,
  environment: "PAPER",
});

// Submit order
const order = await client.submitOrder({
  clientOrderId: client.generateOrderId(),
  symbol: "AAPL",
  qty: 10,
  side: "buy",
  type: "limit",
  timeInForce: "day",
  limitPrice: 150.00,
});

// Get positions
const positions = await client.getPositions();
```

### Factory (`src/factory.ts`)

```typescript
import { createBrokerClient } from "@cream/broker";
import { createContext } from "@cream/domain";

const ctx = createContext("PAPER", "scheduled");
const client = createBrokerClient(ctx);
// Auto-uses AlpacaClient for PAPER and LIVE
```

## Features

- **Order Types** - Market, limit, stop, stop-limit, trailing-stop
- **Multi-Leg Options** - Up to 4 legs per order
- **LIVE Protection** - Requires explicit confirmation
- **Order ID Namespacing** - Environment-prefixed IDs

## Configuration

```bash
ALPACA_KEY=your_api_key
ALPACA_SECRET=your_api_secret
CREAM_ENV=PAPER|LIVE
```

## Error Handling

```typescript
import { BrokerError } from "@cream/broker";

try {
  await client.submitOrder(request);
} catch (error) {
  if (error instanceof BrokerError) {
    console.error(`[${error.code}] ${error.message}`);
    // Codes: INVALID_CREDENTIALS, INSUFFICIENT_FUNDS, INVALID_ORDER, etc.
  }
}
```

## Multi-Leg Orders

```typescript
const order = await client.submitOrder({
  clientOrderId: client.generateOrderId(),
  qty: 1,
  side: "buy",
  type: "market",
  timeInForce: "day",
  legs: [
    { symbol: "AAPL 250117C00190000", ratio: 1 },
    { symbol: "AAPL 250117C00200000", ratio: -2 },
  ],
});
```

## Dependencies

- `@cream/domain` - ExecutionContext, validation
- `@cream/config` - Runtime configuration
