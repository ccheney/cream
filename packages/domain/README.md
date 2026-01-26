# @cream/domain

Core domain primitives, Zod schemas, and type-safe utilities for the Cream trading system. This package defines the canonical data structures used across all TypeScript services.

## Package Exports

```typescript
import { ... } from "@cream/domain";        // Main exports
import { ... } from "@cream/domain/env";     // Environment config
import { ... } from "@cream/domain/schemas"; // Database/HelixDB schemas
import { ... } from "@cream/domain/time";    // ISO-8601 utilities
import { ... } from "@cream/domain/calendar"; // Market calendar service
import { ... } from "@cream/domain/grpc";    // gRPC client utilities
import { ... } from "@cream/domain/websocket"; // WebSocket message schemas
```

## Architecture Overview

```mermaid
flowchart TB
    subgraph Domain["@cream/domain"]
        direction TB
        Context[ExecutionContext]
        Env[Environment Config]
        Time[Time Utilities]
        Calendar[Market Calendar]

        subgraph Schemas["Zod Schemas"]
            Decision[DecisionPlan]
            Execution[Execution]
            Market[Market Data]
            External[External Context]
            DB[Database Entities]
            Helix[HelixDB Nodes/Edges]
        end

        subgraph Safety["Safety Layer"]
            Guards[Live Guards]
            Circuit[Circuit Breaker]
            Audit[Audit Log]
        end

        subgraph Utils["Utilities"]
            OSI[Options Symbology]
            Exposure[Exposure Calc]
            Errors[Error Classes]
            Numbers[Numeric Types]
        end
    end

    Context --> Env
    Context --> Safety
    Decision --> Execution
    Execution --> Market
    Calendar --> Time
```

## ExecutionContext

Replaces ambient `CREAM_ENV` with explicit context created at system boundaries. All functions requiring environment awareness receive context as a parameter.

```typescript
import { createContext, isLive, isPaper, isTest } from "@cream/domain";

// Create at system boundaries (HTTP handlers, workers, tests)
const ctx = createContext("PAPER", "scheduled", configId);

// Thread through all operations
if (isLive(ctx)) {
  // Additional safety checks for real money
}
```

```mermaid
flowchart LR
    subgraph Boundaries["System Boundaries"]
        HTTP[HTTP Handler]
        Worker[Scheduled Worker]
        Test[Test Setup]
    end

    subgraph Context["ExecutionContext"]
        Env["environment: PAPER or LIVE"]
        Source["source: test / scheduled / manual / dashboard-test"]
        Trace["traceId: UUID"]
        Config["configId: string?"]
    end

    subgraph Consumers["Context Consumers"]
        Broker[Broker Client]
        DB[Database]
        Safety[Safety Guards]
    end

    HTTP --> Context
    Worker --> Context
    Test --> Context
    Context --> Consumers
```

| Source | Description |
|--------|-------------|
| `test` | Unit/integration tests via bun test |
| `dashboard-test` | Manual OODA testing from dashboard UI |
| `scheduled` | Hourly OODA loop worker |
| `manual` | CLI invocation |

## DecisionPlan Schema

The core contract between LLM agents and the execution engine. Mirrors Protobuf definitions in `packages/schema`.

```mermaid
classDiagram
    class DecisionPlan {
        +string cycleId
        +ISO8601 asOfTimestamp
        +Environment environment
        +Decision[] decisions
        +string? portfolioNotes
    }

    class Decision {
        +Instrument instrument
        +Action action
        +Size size
        +OrderPlan orderPlan
        +RiskLevels riskLevels
        +StrategyFamily strategyFamily
        +string rationale
        +number confidence
        +References references
    }

    class Instrument {
        +string instrumentId
        +InstrumentType instrumentType
        +OptionContract? optionContract
    }

    class OptionContract {
        +string underlyingSymbol
        +DateOnly expirationDate
        +number strike
        +OptionType right
        +number multiplier
    }

    class Size {
        +number quantity
        +SizeUnit unit
        +number targetPositionQuantity
    }

    class RiskLevels {
        +number stopLossLevel
        +number takeProfitLevel
        +RiskDenomination denomination
    }

    class OrderPlan {
        +OrderType entryOrderType
        +number? entryLimitPrice
        +OrderType exitOrderType
        +TimeInForce timeInForce
    }

    DecisionPlan "1" *-- "*" Decision
    Decision *-- Instrument
    Decision *-- Size
    Decision *-- RiskLevels
    Decision *-- OrderPlan
    Instrument *-- OptionContract
```

### Action Semantics

Actions express intent in terms of exposure, not broker order side:

| Action | From State | To State | Broker Side |
|--------|------------|----------|-------------|
| `BUY` | Flat | Long | BUY |
| `SELL` | Flat | Short | SELL |
| `INCREASE` | Long | Longer | BUY |
| `INCREASE` | Short | Shorter | SELL |
| `REDUCE` | Long | Less Long | SELL |
| `REDUCE` | Short | Less Short | BUY |
| `HOLD` | Any | Same | None |
| `NO_TRADE` | Flat | Flat | None |

```typescript
import { mapActionToBrokerOrder, deriveActionFromPositions } from "@cream/domain";

// Map decision to broker order
const mapping = mapActionToBrokerOrder("BUY", 0, 100);
// { side: "BUY", quantity: 100, description: "Establish long position of 100 units" }

// Derive action from position change
const action = deriveActionFromPositions(100, 150); // "INCREASE"
```

## Market Calendar

Trading session validation and NYSE holiday handling. Delegates to `CalendarService` (Alpaca API or hardcoded fallback).

```mermaid
stateDiagram-v2
    [*] --> CLOSED : Weekend or Holiday
    CLOSED --> PRE_MARKET : 0400 ET
    PRE_MARKET --> RTH : 0930 ET
    RTH --> AFTER_HOURS : 1600 ET
    AFTER_HOURS --> CLOSED : 2000 ET

    note right of RTH
        Regular Trading Hours
        Options trade only here
        Entries require RTH
    end note
```

```typescript
import {
  getTradingSession,
  isRTH,
  validateSessionForAction,
  getNextTradingDay,
  isMonthlyExpiration
} from "@cream/domain";

const session = getTradingSession(new Date()); // "RTH" | "PRE_MARKET" | "AFTER_HOURS" | "CLOSED"

// Validate action feasibility
const result = validateSessionForAction("BUY", "OPTION", new Date());
if (!result.valid) {
  console.log(result.reason);     // "Options can only be traded during RTH"
  console.log(result.suggestion); // "Re-plan with NO_TRADE or wait for RTH"
}
```

### Session Rules

| Action Type | Equities | Options |
|------------|----------|---------|
| Entry (BUY, SELL, INCREASE) | RTH only | RTH only |
| Exit (CLOSE, REDUCE) | RTH (extended hours optional) | RTH only |
| HOLD | Any session | Any session |

## Time Utilities

ISO-8601/RFC 3339 timestamp handling for cross-language compatibility (TypeScript + Rust).

```typescript
import {
  nowIso8601,
  toIso8601,
  fromIso8601,
  toDateOnly,
  addHours,
  daysToExpiration,
  isOptionExpired
} from "@cream/domain";

const now = nowIso8601();                    // "2026-01-26T15:30:45.123Z"
const expiry = toDateOnly(new Date());       // "2026-01-26"
const dte = daysToExpiration("2026-02-21");  // 26.xxx

// Arithmetic
const later = addHours(now, 1);
```

| Type | Format | Use Case |
|------|--------|----------|
| `Iso8601Utc` | `YYYY-MM-DDTHH:mm:ss.sssZ` | All timestamps |
| `DateOnly` | `YYYY-MM-DD` | Option expirations |

## Environment Configuration

Zod-validated environment variables with context-aware helpers.

```typescript
import {
  env,                    // Validated config object
  requireEnv,             // Get CREAM_ENV at startup
  validateEnvironment,    // Check required vars for service
  getAlpacaBaseUrl,       // Context-aware broker URL
  getHelixUrl             // HelixDB connection
} from "@cream/domain";

// At service startup
const creamEnv = requireEnv(); // Throws if CREAM_ENV not set
const ctx = createContext(creamEnv, "scheduled");

// Validate all requirements
validateEnvironmentOrExit(ctx, "dashboard-api", ["DATABASE_URL"]);

// Use context for environment-specific behavior
const brokerUrl = getAlpacaBaseUrl(ctx);
// PAPER: "https://paper-api.alpaca.markets"
// LIVE:  "https://api.alpaca.markets"
```

## Safety Mechanisms

Multi-layer protection against accidental live trading.

```mermaid
flowchart TB
    subgraph Layer1["Layer 1: ExecutionContext"]
        Explicit[Explicit environment parameter]
    end

    subgraph Layer2["Layer 2: Credentials"]
        Separate[Separate API keys per environment]
    end

    subgraph Layer3["Layer 3: Confirmation"]
        Token["requireLiveConfirmation()"]
    end

    subgraph Layer4["Layer 4: Namespacing"]
        OrderID["Order ID: LIVE-xxx / PAPER-xxx"]
    end

    subgraph Layer5["Layer 5: Endpoint Validation"]
        Broker["validateBrokerEndpoint()"]
    end

    Layer1 --> Layer2 --> Layer3 --> Layer4 --> Layer5
```

```typescript
import {
  requireLiveConfirmation,
  preventAccidentalLiveExecution,
  generateOrderId,
  validateBrokerEndpoint,
  recordCircuitFailure,
  requireCircuitClosed
} from "@cream/domain";

// At LIVE startup
requireLiveConfirmation("I_UNDERSTAND_THIS_IS_REAL_MONEY", ctx);

// Before any order submission
preventAccidentalLiveExecution(ctx);

// Namespaced order IDs
const orderId = generateOrderId(ctx); // "LIVE-018e4f2a-7b3c9d1e"

// Circuit breaker pattern
try {
  await submitOrder();
  resetCircuit("broker", ctx);
} catch (error) {
  recordCircuitFailure("broker", error, ctx);
  requireCircuitClosed("broker", ctx); // Throws after threshold failures
}
```

## Error Handling

Typed error classes mapping to gRPC status codes from the Rust execution engine.

```mermaid
classDiagram
    class ExecutionError {
        +GrpcStatusCode grpcCode
        +string grpcStatus
        +boolean retryable
        +ErrorDetails details
        +string traceId
        +toFormattedString()
        +toJSON()
    }

    ExecutionError <|-- InvalidArgumentError
    ExecutionError <|-- ConstraintViolationError
    ExecutionError <|-- NotFoundError
    ExecutionError <|-- ServiceUnavailableError
    ExecutionError <|-- DeadlineExceededError
    ExecutionError <|-- PermissionDeniedError
    ExecutionError <|-- ResourceExhaustedError
    ExecutionError <|-- InternalError

    ConstraintViolationError <|-- InsufficientFundsError

    class ConstraintViolationError {
        +ConstraintViolationDetails violation
    }
```

| gRPC Status | Error Class | Retryable |
|-------------|-------------|-----------|
| `INVALID_ARGUMENT` | `InvalidArgumentError` | No |
| `FAILED_PRECONDITION` | `ConstraintViolationError` | No |
| `NOT_FOUND` | `NotFoundError` | No |
| `UNAVAILABLE` | `ServiceUnavailableError` | Yes |
| `DEADLINE_EXCEEDED` | `DeadlineExceededError` | Yes |
| `RESOURCE_EXHAUSTED` | `ResourceExhaustedError` | Yes (backoff) |
| `PERMISSION_DENIED` | `PermissionDeniedError` | No |
| `INTERNAL` | `InternalError` | No |

```typescript
import {
  mapGrpcError,
  isRetryableError,
  withRetry,
  InsufficientFundsError
} from "@cream/domain";

// Map gRPC errors to typed classes
const error = mapGrpcError(grpcError);
if (isRetryableError(error)) {
  await withRetry(() => submitOrder(), { maxRetries: 3 });
}

// Check specific error types
if (error instanceof InsufficientFundsError) {
  console.log(`Need $${error.requiredAmount}, have $${error.availableAmount}`);
}
```

## Options Symbology (OSI)

21-character OCC standard format for option contracts.

```
AAPL  260321C00180000
├────┤├────┤│├───────┤
Symbol Date  │ Strike
      YYMMDD│ $$$$$¢¢¢
             C/P
```

```typescript
import { parseOSI, toOSI, isValidOSI, extractStrike } from "@cream/domain";

// Parse OSI to contract
const result = parseOSI("AAPL  260321C00180000");
if (result.success) {
  console.log(result.contract.underlyingSymbol); // "AAPL"
  console.log(result.contract.strike);           // 180
  console.log(result.contract.right);            // "CALL"
}

// Generate OSI from contract
const osi = toOSI({
  underlyingSymbol: "AAPL",
  expirationDate: "2026-03-21",
  strike: 180,
  right: "CALL",
  multiplier: 100
}); // "AAPL  260321C00180000"
```

## Exposure Calculations

Portfolio risk metrics for gross/net exposure and limit validation.

```typescript
import {
  calculateExposureStats,
  validateExposure,
  calculateDeltaAdjustedExposure,
  DEFAULT_EXPOSURE_LIMITS
} from "@cream/domain";

const stats = calculateExposureStats(positions, accountEquity);
// stats.grossExposurePctEquity = 1.0 (100%)
// stats.netExposurePctEquity = 0.4 (40% net long)

const validation = validateExposure(positions, accountEquity, {
  maxGrossExposure: 2.0,      // 200%
  maxSinglePositionExposure: 0.2 // 20%
});

if (!validation.valid) {
  for (const v of validation.violations) {
    console.log(v.message); // "Position AAPL exposure 25.0% exceeds limit of 20.0%"
  }
}
```

## Database Schemas

Zod schemas for PostgreSQL entities via Drizzle ORM.

```mermaid
erDiagram
    CycleLog ||--o{ Decision : generates
    CycleLog ||--o{ AgentOutput : produces
    Decision ||--o{ Order : executes
    Order }o--|| Position : affects

    CycleLog {
        uuid id PK
        string cycleId
        enum environment
        enum phase
        datetime startedAt
    }

    Decision {
        uuid id PK
        string cycleId FK
        string symbol
        enum action
        enum direction
        decimal confidence
    }

    Order {
        uuid id PK
        uuid decisionId FK
        string symbol
        enum side
        integer quantity
        enum status
    }

    Position {
        uuid id PK
        string symbol
        integer quantity
        decimal avgEntryPrice
        decimal unrealizedPnl
    }
```

Key schemas: `DecisionInsertSchema`, `OrderInsertSchema`, `PositionInsertSchema`, `CycleLogInsertSchema`, `PortfolioSnapshotInsertSchema`

## HelixDB Schemas

Graph database schemas for agent memory and thesis tracking.

```mermaid
flowchart LR
    subgraph Nodes
        Memory[MemoryNode]
        Thesis[ThesisNode]
        Citation[CitationNode]
        MarketCtx[MarketContextNode]
        DecisionN[DecisionNode]
    end

    subgraph Edges
        Memory -->|supports| Thesis
        Memory -->|invalidates| Thesis
        DecisionN -->|cites| Citation
        DecisionN -->|occurredIn| MarketCtx
        Memory -->|references| Memory
        Thesis -->|transitions| Thesis
    end
```

### Thesis State Machine

```mermaid
stateDiagram-v2
    [*] --> WATCHING
    WATCHING --> ENTERED : Entry conditions met
    WATCHING --> CLOSED : Give up
    ENTERED --> ADDING : Scale in
    ENTERED --> MANAGING : Hold
    ENTERED --> EXITING : Start exit
    ENTERED --> INVALIDATED : Thesis wrong
    ADDING --> MANAGING : Done adding
    ADDING --> EXITING : Start exit
    ADDING --> INVALIDATED : Thesis wrong
    MANAGING --> ADDING : Scale in more
    MANAGING --> EXITING : Start exit
    MANAGING --> INVALIDATED : Thesis wrong
    EXITING --> CLOSED : Fully closed
    EXITING --> MANAGING : Resume hold
    INVALIDATED --> CLOSED : Must close
    CLOSED --> [*]
```

## External Context

Structured data from news, sentiment, and fundamentals providers.

```typescript
import {
  ExternalContextSchema,
  createEmptyExternalContext,
  getSentimentScore,
  hasExternalContext
} from "@cream/domain";

const ctx: ExternalContext = {
  news: {
    items: [...],
    aggregateSentiment: 0.65,
    itemCount: 12,
    periodHours: 24
  },
  sentiment: {
    combinedScore: 0.55,
    direction: "BULLISH",
    confidence: 0.8
  },
  fundamentals: {
    earnings: { daysToEarnings: 14, epsEstimate: 2.15 },
    valuation: { peRatio: 28.5, forwardPe: 24.2 }
  },
  macro: {
    vix: 18.5,
    treasury10y: 4.25
  }
};

const sentiment = getSentimentScore(ctx); // 0.55
```

## Validation Utilities

Error formatting, batch validation, and SQL injection prevention.

```typescript
import {
  safeParse,
  formatValidationError,
  validateBatch,
  createTypeGuard,
  coerceInt,
  safeString
} from "@cream/domain/schemas";

// Safe parsing with structured errors
const result = safeParse(OrderInsertSchema, data);
if (!result.success) {
  return Response.json(result.error, { status: 400 });
}

// Batch validation
const { valid, invalid } = validateBatch(PositionSchema, positions);
console.log(`${valid.length} valid, ${invalid.length} invalid`);

// Type guards
const isOrder = createTypeGuard(OrderInsertSchema);
if (isOrder(data)) {
  // data is typed as OrderInsert
}

// Query parameter coercion
const QuerySchema = z.object({
  page: coerceInt(1),
  limit: coerceInt(20)
});
```

## Position Sizing

Risk-based position sizing calculators.

```typescript
import {
  calculateFixedFractional,
  calculateVolatilityTargeted,
  calculateFractionalKelly,
  calculateLiquidityLimit,
  DEFAULT_RISK_LIMITS
} from "@cream/domain";

// Fixed fractional (risk % of equity per trade)
const size = calculateFixedFractional({
  equity: 100000,
  riskPerTrade: 0.01,  // 1%
  entryPrice: 150,
  stopLoss: 145
}); // { shares: 200, dollarRisk: 1000 }

// Volatility-targeted sizing
const volSize = calculateVolatilityTargeted({
  equity: 100000,
  targetVolatility: 0.15,
  atr: 3.5,
  price: 150
});
```

## Drawdown Tracking

Portfolio drawdown monitoring and alerts.

```typescript
import {
  DrawdownTracker,
  calculateDrawdownStats,
  checkDrawdownAlert,
  DRAWDOWN_THRESHOLDS
} from "@cream/domain";

const tracker = new DrawdownTracker();
tracker.update(100000); // New equity point
tracker.update(95000);  // Drawdown of 5%

const stats = tracker.getStats();
// stats.currentDrawdown = 0.05
// stats.maxDrawdown = 0.05

const alert = checkDrawdownAlert(stats, {
  warning: 0.05,
  danger: 0.10,
  critical: 0.15
});
// alert.level = "warning"
```

## LLM Output Parsing

Utilities for parsing and validating LLM-generated JSON with retry logic.

```typescript
import {
  parseWithRetry,
  cleanLLMOutput,
  generateRetryPrompt,
  schemaToDescription
} from "@cream/domain";

const result = await parseWithRetry(
  DecisionPlanSchema,
  llmOutput,
  {
    maxAttempts: 3,
    logger: console,
    agentType: "trader"
  }
);

if (result.success) {
  const plan = result.data;
} else {
  console.error(result.errors);
}
```

## Dependencies

- `zod` - Runtime schema validation
- `@bufbuild/protobuf` - Protobuf support
- `@connectrpc/connect` - gRPC client
- `@cream/logger` - Structured logging
- `@cream/schema-gen` - Generated Protobuf stubs
