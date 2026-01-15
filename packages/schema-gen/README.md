# @cream/schema-gen

Generated Protobuf stubs for the Cream trading system.

## Overview

Contains compiled Protobuf code generated from `packages/proto`:

- **TypeScript/JavaScript** - `ts/` → `dist/`
- **Python** - `python/`
- **Rust** - `rust/`

## Proto Files (Source: packages/proto)

| File | Purpose |
|------|---------|
| `common.proto` | Shared enums (Action, Direction, Environment) |
| `decision.proto` | DecisionPlan, Decision, OrderPlan |
| `execution.proto` | ExecutionService gRPC stubs |
| `events.proto` | ExternalEvent types |
| `market_snapshot.proto` | Market data structures |

## Usage

### TypeScript

```typescript
import { DecisionPlan, Action, Direction } from "@cream/schema-gen";
import { ExecutionService } from "@cream/schema-gen/execution";
```

### Rust

```rust
use cream_schema_gen::decision::DecisionPlan;
use cream_schema_gen::execution::execution_service_client::ExecutionServiceClient;
```

### Python

```python
from cream_schema_gen.decision_pb2 import DecisionPlan
from cream_schema_gen.execution_pb2_grpc import ExecutionServiceStub
```

## Regenerating

```bash
# From packages/proto
bun run generate

# Uses Buf CLI with buf.gen.yaml configuration
```

## Build

```bash
# TypeScript only
bun run build
```

## Dependencies

- `@bufbuild/protobuf` - Protobuf runtime
- `@connectrpc/connect` - gRPC client library
