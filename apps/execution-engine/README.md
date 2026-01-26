# Execution Engine

Deterministic Rust execution engine for Cream's order routing and risk management. Receives `DecisionPlan` messages from TypeScript agents via gRPC/HTTP, validates against risk constraints, and routes orders to Alpaca Markets.

## Architecture

```mermaid
flowchart TB
    subgraph TypeScript["TypeScript Layer"]
        Mastra["Mastra Agents"]
        DashAPI["Dashboard API"]
    end

    subgraph Rust["Rust Execution Engine"]
        subgraph Adapters["Driver Adapters"]
            gRPC["gRPC Server<br/>:50053"]
            HTTP["HTTP/REST<br/>:50051"]
        end

        subgraph Application["Application Layer"]
            SubmitOrders["SubmitOrdersUseCase"]
            ValidateRisk["ValidateRiskUseCase"]
            CancelOrders["CancelOrdersUseCase"]
            MonitorStops["MonitorStopsUseCase"]
            Reconcile["ReconcileUseCase"]
        end

        subgraph Domain["Domain Layer"]
            OrderExec["order_execution"]
            RiskMgmt["risk_management"]
            ExecTactics["execution_tactics"]
            StopEnforce["stop_enforcement"]
            OptionPos["option_position"]
        end

        subgraph Infrastructure["Driven Adapters"]
            AlpacaBroker["AlpacaBrokerAdapter"]
            AlpacaMarket["AlpacaMarketDataAdapter"]
            StreamProxy["StreamProxyClient"]
            OrderRepo["OrderRepository"]
        end
    end

    subgraph External["External Services"]
        Alpaca["Alpaca Markets API"]
        Proxy["alpaca-stream-proxy<br/>:50052"]
    end

    Mastra -->|"CheckConstraints<br/>SubmitOrder"| gRPC
    DashAPI -->|"REST"| HTTP

    gRPC --> SubmitOrders & ValidateRisk & CancelOrders
    HTTP --> SubmitOrders & ValidateRisk & CancelOrders

    SubmitOrders --> OrderExec & RiskMgmt
    ValidateRisk --> RiskMgmt
    MonitorStops --> StopEnforce

    AlpacaBroker --> Alpaca
    AlpacaMarket --> Alpaca
    StreamProxy --> Proxy
```

## Order Flow

```mermaid
sequenceDiagram
    autonumber
    participant Agent as Mastra Agent
    participant EE as ExecutionService
    participant Risk as RiskValidationService
    participant Order as Order Aggregate
    participant Broker as AlpacaBrokerAdapter
    participant Alpaca as Alpaca API

    Agent->>+EE: CheckConstraints(DecisionPlan)
    EE->>Risk: validate(orders, context)
    Risk-->>EE: ConstraintResult
    EE-->>-Agent: CheckConstraintsResponse

    alt Approved
        Agent->>+EE: SubmitOrder(request)
        EE->>Order: new(CreateOrderCommand)
        Order-->>EE: Order [status=New]
        EE->>Risk: validate([order], context)
        Risk-->>EE: passed
        EE->>+Broker: submit_order(request)
        Broker->>+Alpaca: POST /v2/orders
        Alpaca-->>-Broker: OrderResponse
        Broker-->>-EE: OrderAck
        EE->>Order: accept(broker_id)
        Order-->>EE: Order [status=Accepted]
        EE-->>-Agent: SubmitOrderResponse
    end
```

## Risk Validation Pipeline

```mermaid
flowchart LR
    subgraph Input
        Orders[Orders]
        Context[RiskContext]
    end

    subgraph Checks["Risk Checks"]
        PerInstrument["Per-Instrument<br/>max_units<br/>max_notional<br/>max_pct_equity"]
        Portfolio["Portfolio<br/>max_gross_notional<br/>max_net_notional<br/>max_leverage"]
        Options["Options Greeks<br/>max_delta<br/>max_gamma<br/>max_vega<br/>max_theta"]
        BuyingPower["Buying Power<br/>required vs available"]
        PDT["PDT Rules<br/>day_trades_remaining"]
    end

    subgraph Output
        Result[ConstraintResult]
    end

    Orders --> PerInstrument & Portfolio & BuyingPower & PDT
    Context --> PerInstrument & Portfolio & Options & BuyingPower & PDT

    PerInstrument --> Result
    Portfolio --> Result
    Options --> Result
    BuyingPower --> Result
    PDT --> Result
```

## Order State Machine

```mermaid
stateDiagram-v2
    [*] --> New : create
    New --> Accepted : accept
    New --> Rejected : reject
    New --> Canceled : cancel

    Accepted --> PartiallyFilled : partial fill
    Accepted --> Filled : complete fill
    Accepted --> Canceled : cancel

    PartiallyFilled --> PartiallyFilled : partial fill
    PartiallyFilled --> Filled : complete fill
    PartiallyFilled --> Canceled : cancel

    Filled --> [*]
    Canceled --> [*]
    Rejected --> [*]
    Expired --> [*]

    note right of PartiallyFilled
        FIX Protocol Invariant
        CumQty + LeavesQty = OrdQty
    end note
```

## Domain Model

### Bounded Contexts

| Context | Responsibility |
|---------|----------------|
| `order_execution` | Order lifecycle (FIX protocol semantics), partial fills, state transitions |
| `risk_management` | Risk policies, constraint validation, exposure tracking |
| `execution_tactics` | TWAP, VWAP, Iceberg, Adaptive execution strategies |
| `stop_enforcement` | Price monitoring, stop-loss/take-profit triggers |
| `option_position` | Multi-leg options tracking, Greeks aggregation |

### Key Aggregates

```mermaid
classDiagram
    class Order {
        +OrderId id
        +Symbol symbol
        +OrderSide side
        +OrderType order_type
        +Quantity quantity
        +OrderStatus status
        +PartialFillState partial_fill
        +accept(BrokerId)
        +apply_fill(FillReport)
        +cancel(CancelReason)
        +reject(RejectReason)
    }

    class RiskPolicy {
        +String id
        +String name
        +ExposureLimits limits
        +validate(orders, context)
    }

    class ExposureLimits {
        +PerInstrumentLimits per_instrument
        +PortfolioLimits portfolio
        +OptionsLimits options
        +SizingLimits sizing
    }

    RiskPolicy --> ExposureLimits
```

## gRPC Service

**Package**: `cream.v1`
**Port**: `50053`

### ExecutionService

| RPC | Request | Response | Description |
|-----|---------|----------|-------------|
| `CheckConstraints` | `CheckConstraintsRequest` | `CheckConstraintsResponse` | Validate DecisionPlan against risk limits |
| `SubmitOrder` | `SubmitOrderRequest` | `SubmitOrderResponse` | Submit single order to broker |
| `GetOrderState` | `GetOrderStateRequest` | `GetOrderStateResponse` | Query order by ID |
| `CancelOrder` | `CancelOrderRequest` | `CancelOrderResponse` | Request order cancellation |
| `StreamExecutions` | `StreamExecutionsRequest` | `stream StreamExecutionsResponse` | Real-time execution updates |
| `GetAccountState` | `GetAccountStateRequest` | `GetAccountStateResponse` | Account equity, buying power |
| `GetPositions` | `GetPositionsRequest` | `GetPositionsResponse` | Current positions |

### MarketDataService

| RPC | Description |
|-----|-------------|
| `GetSnapshot` | Latest quote for symbols |
| `GetOptionChain` | Option chain for underlying |
| `SubscribeMarketData` | Stream real-time quotes |

## HTTP API

**Port**: `50051`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/v1/check-constraints` | Validate orders against risk |
| `POST` | `/api/v1/submit-orders` | Submit batch of orders |
| `POST` | `/api/v1/orders` | Get order state by IDs |
| `POST` | `/api/v1/cancel-orders` | Cancel orders |

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CREAM_ENV` | No | `PAPER` | `PAPER` or `LIVE` |
| `ALPACA_KEY` | Yes | - | Alpaca API key |
| `ALPACA_SECRET` | Yes | - | Alpaca API secret |
| `HTTP_PORT` | No | `50051` | HTTP server port |
| `GRPC_PORT` | No | `50053` | gRPC server port |
| `POSITION_MONITOR_ENABLED` | No | `true` | Enable position monitoring |
| `STREAM_PROXY_ENDPOINT` | No | `http://localhost:50052` | Stream proxy gRPC endpoint |

### config.yaml

```yaml
constraints:
  per_instrument:
    max_notional: 50000      # $50k per position
    max_units: 1000          # Max shares/contracts
    max_equity_pct: 0.10     # 10% of equity

  portfolio:
    max_gross_notional: 500000
    max_net_notional: 200000
    max_leverage: 2.0

  options:
    max_delta_per_underlying: 100.0
    max_portfolio_delta: 500.0
    max_portfolio_gamma: 50.0
    max_portfolio_vega: 1000.0
    max_portfolio_theta: -500.0
```

## Execution Tactics

Available tactics for order slicing and market impact minimization:

| Tactic | Description |
|--------|-------------|
| `PassiveLimit` | Post limit at bid/ask, await fill |
| `AggressiveLimit` | Cross spread for immediate execution |
| `TWAP` | Time-weighted slices over duration |
| `VWAP` | Volume-weighted slices based on historical profile |
| `Iceberg` | Hidden quantity with visible peak |
| `Adaptive` | Dynamic tactic switching based on market conditions |

## Project Structure

```
src/
  domain/                    # Business logic (no dependencies)
    order_execution/         # Order aggregate, FIX semantics
    risk_management/         # Risk policies, validation
    execution_tactics/       # TWAP, VWAP, Iceberg
    stop_enforcement/        # Price monitoring
    option_position/         # Multi-leg options
    shared/                  # Value objects (Money, Quantity, Symbol)

  application/               # Use cases and orchestration
    use_cases/               # SubmitOrders, ValidateRisk, etc.
    ports/                   # BrokerPort, PriceFeedPort interfaces
    dto/                     # Data transfer objects
    services/                # PositionMonitorService

  infrastructure/            # External integrations
    grpc/                    # Tonic gRPC server
    http/                    # Axum REST API
    broker/alpaca/           # Alpaca broker adapter
    marketdata/              # Market data adapter
    stream_proxy/            # Real-time quote client
    persistence/             # Order repository
```

## Development

```bash
# Build
cargo build -p execution-engine

# Test
cargo test -p execution-engine

# Run (requires ALPACA_KEY, ALPACA_SECRET)
CREAM_ENV=PAPER cargo run -p execution-engine

# Generate protobuf stubs (automatic via build.rs)
buf generate
```

## Dependencies

| Crate | Purpose |
|-------|---------|
| `tonic` | gRPC server/client |
| `axum` | HTTP server |
| `tokio` | Async runtime |
| `rust_decimal` | Financial precision arithmetic |
| `reqwest` | HTTP client for Alpaca API |
| `sqlx` | PostgreSQL (shared with TS apps) |
| `tracing` | Structured logging |

## Safety

- `#![forbid(unsafe_code)]` - No unsafe Rust
- Clippy `pedantic` + `nursery` lints enabled
- `unwrap_used` and `expect_used` warnings (test code excepted)
- 90% code coverage target (Critical tier)
