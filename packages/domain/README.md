# @cream/domain

Core domain types, Zod schemas, and utilities for the Cream trading system.

## Overview

Foundational package providing:

- **Type-safe schemas** - Zod schemas mirroring Protobuf contracts
- **Environment configuration** - Explicit ExecutionContext
- **Trading domain types** - Decisions, actions, instruments
- **Infrastructure clients** - gRPC, WebSocket, Arrow Flight
- **Trading utilities** - Market calendar, position sizing, risk

## Key Components

### Environment & Context

```typescript
import { createContext, validateEnvironmentOrExit } from "@cream/domain";

const ctx = createContext("PAPER", "scheduled");
validateEnvironmentOrExit(ctx, "my-service", ["TURSO_DATABASE_URL"]);
```

### Trading Domain

- `decision.ts` - DecisionPlan, trading actions
- `execution.ts` - Order execution, account state
- `exposure.ts` - Portfolio exposure calculations

### Market & Time

- `time.ts` - ISO-8601 utilities
- `calendar.ts` - Market calendar, sessions
- `clock.ts` - Clock skew detection
- `marketSnapshot.ts` - Market data schemas

### Risk & Safety

- `risk-adjusted.ts` - Sharpe, Sortino, drawdown
- `safety.ts` - Circuit breaker, audit logging

### Infrastructure

```typescript
import { createExecutionClient } from "@cream/domain/grpc";

const client = createExecutionClient("http://localhost:50053");
const result = await client.checkConstraints({ decisionPlan, accountState });
```

### Validation

```typescript
import { DecisionPlanSchema } from "@cream/domain";

const result = DecisionPlanSchema.safeParse(plan);
if (result.success) {
  console.log("Valid plan", result.data);
}
```

## Design Principles

1. **Type Safety** - Validation at package boundaries
2. **Explicit Context** - No ambient state
3. **Cross-Language** - Schemas mirror Protobuf definitions

## Dependencies

- `zod` - Schema validation
- `@cream/schema-gen` - Generated Protobuf stubs
- `@bufbuild/protobuf` - Protobuf runtime
- `@connectrpc/connect` - gRPC client
