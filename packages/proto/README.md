# @cream/proto

Protobuf schema definitions for the Cream trading system.

## Overview

Source .proto files that define the contract layer between services:

- **TypeScript/Node.js** ↔ **Rust execution engine** via gRPC
- Cross-language type safety
- Generated to `packages/schema-gen`

## Proto Files

### common.proto

Shared types and enums:
- `Environment` - PAPER, LIVE
- `Action` - BUY, SELL, HOLD, etc.
- `Direction` - LONG, SHORT, FLAT
- `InstrumentType` - EQUITY, OPTION, ETF
- `Size`, `RiskLevels`, `OrderType`, `TimeInForce`
- `RegimeClassification`

### decision.proto

Trading decision models:
- `DecisionPlan` - Complete cycle of decisions
- `Decision` - Individual instrument decision
- `OrderPlan` - Order execution specification
- `References` - Links to indicators, memory, events

### execution.proto

Rust execution engine gRPC service:
- `ExecutionService` with 6 RPC methods
- `CheckConstraints`, `SubmitOrder`, `GetOrderState`
- `CancelOrder`, `GetAccountState`, `GetPositions`
- Account state, positions, order tracking

### events.proto

External event stream:
- 16 event types (earnings, macro, news, sentiment, etc.)
- Type-safe payloads
- Computed scores (sentiment, importance, surprise)

### market_snapshot.proto

Market data structures:
- `Quote`, `Bar` (OHLCV)
- `OptionQuote` with Greeks
- `MarketDataService` for streaming

## Generation

```bash
# Generate all language stubs
bun run generate

# Lint schemas
buf lint

# Check breaking changes
buf breaking
```

## Configuration

- `buf.yaml` - Module configuration
- `buf.gen.yaml` - Code generation settings

## Dependencies

- Buf CLI
- Google well-known types (Timestamp, Struct)
