# @cream/proto

Protobuf schema definitions for cross-language communication between TypeScript services and the Rust execution engine.

## Schema Files

| File | Purpose |
|------|---------|
| `common.proto` | Shared enums (Action, Direction, OrderType) and base messages (Instrument, RiskLevels) |
| `decision.proto` | DecisionPlan and Decision messages - LLM agent output format |
| `execution.proto` | ExecutionService gRPC - constraint checking, order routing, account state |
| `events.proto` | External events - earnings, macro, news, sentiment with typed payloads |
| `market_snapshot.proto` | MarketDataService gRPC - quotes, bars, option chains |
| `stream_proxy.proto` | StreamProxyService gRPC - real-time SIP/OPRA feeds from Alpaca |

## Architecture

```mermaid
flowchart TB
    subgraph TypeScript["TypeScript (Bun)"]
        Mastra[Mastra Agents]
        Worker[Worker Scheduler]
        DashAPI[Dashboard API]
    end

    subgraph Proto["@cream/proto"]
        Common[common.proto]
        Decision[decision.proto]
        Execution[execution.proto]
        Events[events.proto]
        Market[market_snapshot.proto]
        Stream[stream_proxy.proto]
    end

    subgraph Generated["@cream/schema-gen"]
        TS[TypeScript Stubs]
        Rust[Rust Stubs]
    end

    subgraph RustServices["Rust Services"]
        ExecEngine[Execution Engine]
        StreamProxy[Alpaca Stream Proxy]
    end

    Proto -->|buf generate| Generated
    TS --> TypeScript
    Rust --> RustServices
    TypeScript -->|gRPC| RustServices
```

## Code Generation

```bash
# Generate TypeScript and Rust stubs
bun run generate   # runs: buf generate

# Lint proto files
bun run lint       # runs: buf lint

# Check breaking changes
bun run breaking   # runs: buf breaking against master
```

Output locations:
- TypeScript: `../schema-gen/ts/cream/v1/*_pb.ts`
- Rust: `../schema-gen/rust/cream/v1/*.rs`

## gRPC Services

```mermaid
flowchart LR
    subgraph ExecutionService
        CC[CheckConstraints]
        SO[SubmitOrder]
        GO[GetOrderState]
        CO[CancelOrder]
        SE[StreamExecutions]
        GA[GetAccountState]
        GP[GetPositions]
    end

    subgraph StreamProxyService
        SQ[StreamQuotes]
        ST[StreamTrades]
        SB[StreamBars]
        SOQ[StreamOptionQuotes]
        SOT[StreamOptionTrades]
        SOU[StreamOrderUpdates]
        GCS[GetConnectionStatus]
    end

    subgraph MarketDataService
        SMD[SubscribeMarketData]
        GS[GetSnapshot]
        GOC[GetOptionChain]
    end
```

## Core Message Relationships

```mermaid
classDiagram
    class DecisionPlan {
        +string cycle_id
        +Timestamp as_of_timestamp
        +Environment environment
        +Decision[] decisions
    }

    class Decision {
        +Instrument instrument
        +Action action
        +Size size
        +OrderPlan order_plan
        +RiskLevels risk_levels
        +StrategyFamily strategy_family
        +string rationale
        +double confidence
        +OptionLeg[] legs
    }

    class Instrument {
        +string instrument_id
        +InstrumentType instrument_type
        +OptionContract option_contract
    }

    class RiskLevels {
        +double stop_loss_level
        +double take_profit_level
        +RiskDenomination denomination
    }

    class Size {
        +int32 quantity
        +SizeUnit unit
        +int32 target_position_quantity
    }

    DecisionPlan "1" --> "*" Decision
    Decision --> Instrument
    Decision --> RiskLevels
    Decision --> Size
```

## Execution Flow

```mermaid
sequenceDiagram
    autonumber
    participant Agent as Mastra Agent
    participant TS as TypeScript
    participant EE as Execution Engine (Rust)
    participant Broker as Alpaca

    Agent->>TS: DecisionPlan (JSON)
    TS->>TS: Validate via Protobuf
    TS->>+EE: CheckConstraints (gRPC)
    EE->>EE: Risk checks
    EE-->>-TS: CheckConstraintsResponse

    alt approved
        TS->>+EE: SubmitOrder (gRPC)
        EE->>+Broker: Order
        Broker-->>-EE: OrderId
        EE-->>-TS: SubmitOrderResponse
    else rejected
        TS->>Agent: Constraint violations
    end
```

## External Events

```mermaid
classDiagram
    class ExternalEvent {
        +string event_id
        +EventType event_type
        +Timestamp event_time
        +string[] related_instrument_ids
        +DataSource source
        +double sentiment_score
        +double importance_score
    }

    class EarningsEventPayload {
        +string symbol
        +string quarter
        +int32 year
        +double eps_actual
        +double eps_expected
        +double revenue_actual
    }

    class MacroEventPayload {
        +string indicator_name
        +double value
        +double previous_value
        +double expected_value
        +string country
    }

    class NewsEventPayload {
        +string headline
        +string body
        +string source
        +ExtractedEntity[] entities
    }

    ExternalEvent --> EarningsEventPayload : oneof payload
    ExternalEvent --> MacroEventPayload : oneof payload
    ExternalEvent --> NewsEventPayload : oneof payload
```

## Key Enums

### Trading Actions

| Action | Description |
|--------|-------------|
| `BUY` | Establish new long from flat |
| `SELL` | Establish new short from flat |
| `HOLD` | Maintain current position |
| `INCREASE` | Increase exposure in direction |
| `REDUCE` | Reduce exposure magnitude |
| `CLOSE` | Close an existing position |
| `NO_TRADE` | Remain flat |

### Order Types

| Type | Use Case |
|------|----------|
| `LIMIT` | Price-controlled entry/exit |
| `MARKET` | Immediate execution |
| `STOP` | Triggered at price level |
| `STOP_LIMIT` | Stop with limit protection |
| `TRAILING_STOP` | Dynamic stop level |

### Strategy Families

| Family | Description |
|--------|-------------|
| `EQUITY_LONG/SHORT` | Directional equity positions |
| `OPTION_LONG/SHORT` | Single-leg options |
| `VERTICAL_SPREAD` | Bull/bear spreads |
| `IRON_CONDOR` | Range-bound strategy |
| `STRADDLE/STRANGLE` | Volatility plays |
| `CALENDAR_SPREAD` | Time decay strategy |

## Risk Constraints

The execution engine validates decisions against configurable limits:

```protobuf
message RiskConstraints {
  // Per-instrument
  int32 max_shares = 1;
  int32 max_contracts = 2;
  int64 max_notional_cents = 3;
  int32 max_pct_equity_bps = 4;  // basis points

  // Portfolio-level
  int32 max_positions = 9;
  int32 max_concentration_bps = 10;
  int32 max_drawdown_bps = 12;

  // Options Greeks
  int64 max_delta_notional_cents = 13;
  int64 max_vega_cents = 15;
  int64 max_theta_cents = 16;
}
```

## Stream Proxy Data Flow

```mermaid
flowchart LR
    subgraph Alpaca
        SIP[SIP Feed]
        OPRA[OPRA Feed]
        TU[Trade Updates]
    end

    subgraph StreamProxy["Stream Proxy (Rust)"]
        WS[WebSocket Client]
        MUX[Multiplexer]
        GRPC[gRPC Server]
    end

    subgraph Clients["TypeScript Clients"]
        Dashboard
        Worker
        DashAPI
    end

    SIP --> WS
    OPRA --> WS
    TU --> WS
    WS --> MUX
    MUX --> GRPC
    GRPC -->|StreamQuotes| Clients
    GRPC -->|StreamTrades| Clients
    GRPC -->|StreamOptionQuotes| Clients
    GRPC -->|StreamOrderUpdates| Clients
```

## Usage Examples

### Decision (Equity)

```json
{
  "instrument": {
    "instrumentId": "AAPL",
    "instrumentType": "INSTRUMENT_TYPE_EQUITY"
  },
  "action": "ACTION_BUY",
  "size": {
    "quantity": 50,
    "unit": "SIZE_UNIT_SHARES",
    "targetPositionQuantity": 50
  },
  "riskLevels": {
    "stopLossLevel": 179.5,
    "takeProfitLevel": 195.0,
    "denomination": "RISK_DENOMINATION_UNDERLYING_PRICE"
  },
  "confidence": 0.78
}
```

### Decision (Option)

```json
{
  "instrument": {
    "instrumentId": "AAPL250117C00200000",
    "instrumentType": "INSTRUMENT_TYPE_OPTION",
    "optionContract": {
      "underlying": "AAPL",
      "expiration": "2025-01-17",
      "strike": 200,
      "optionType": "OPTION_TYPE_CALL"
    }
  },
  "action": "ACTION_BUY",
  "size": {
    "quantity": 5,
    "unit": "SIZE_UNIT_CONTRACTS"
  },
  "riskLevels": {
    "stopLossLevel": 2.75,
    "takeProfitLevel": 11.0,
    "denomination": "RISK_DENOMINATION_OPTION_PRICE"
  }
}
```

## Toolchain

| Tool | Version | Purpose |
|------|---------|---------|
| Buf CLI | v2 | Linting, breaking detection, generation |
| protobuf-es | v2.x | TypeScript code generation |
| prost | - | Rust message types |
| tonic | - | Rust gRPC stubs |

## Dependencies

```yaml
# buf.yaml
deps:
  - buf.build/protocolbuffers/wellknowntypes  # Timestamp, Struct
```
