# Cream Architecture

> Agentic trading system for US equities and options. Runs hourly OODA loops (Observe → Orient → Decide → Act) with an 8-agent consensus network.

---

## System Overview

```mermaid
flowchart TB
    subgraph UI["User Interface"]
        Dashboard[Web Dashboard]
    end

    subgraph Services["Application Services"]
        API[Dashboard API]
        Worker[Scheduler]
        Engine[Execution Engine]
    end

    subgraph Data["Data Layer"]
        SQL[(SQL Database)]
        Graph[(Graph + Vector DB)]
        Cache[(Cache)]
    end

    subgraph External["External"]
        Broker([Broker])
        LLM([LLM Provider])
        Embed([Embeddings Provider])
    end

    Dashboard -->|HTTP/WebSocket| API
    API --> SQL
    API --> Graph
    API -->|gRPC| Engine
    API --> LLM
    API --> Embed
    Worker --> SQL
    Worker --> Graph
    Worker -->|gRPC| Engine
    Worker --> LLM
    Worker --> Embed
    Engine --> Broker
    Services --> Cache
```

---

## Services

| Service | Role | Ports | Protocol |
|---------|------|-------|----------|
| **Dashboard** | Real-time trading UI, portfolio view, decision history | 3000 | HTTP |
| **Dashboard API** | Gateway, authentication, data aggregation | 3001 | HTTP/WebSocket |
| **API** | Agent orchestration, workflow engine | 4111 | HTTP |
| **Worker** | Hourly trading cycles, background jobs | 3002 | HTTP |
| **Execution Engine** | Order validation, risk constraints, broker routing | 50051, 50053 | HTTP, gRPC |

---

## Agent Network

The system uses an 8-agent debate architecture in 4 phases:

```mermaid
flowchart TB
    subgraph Phase1["PHASE 1: ANALYSIS"]
        direction LR
        News[News Analyst]
        Fund[Fundamentals Analyst]
    end

    subgraph Phase2["PHASE 2: DEBATE"]
        direction LR
        Bull[Bullish Researcher]
        Bear[Bearish Researcher]
    end

    subgraph Phase3["PHASE 3: DECISION"]
        Trader[Head Trader]
        Plan([Decision Plan])
    end

    subgraph Phase4["PHASE 4: APPROVAL"]
        Risk[Risk Manager]
        Critic[Critic]
        Gate{Both Approve?}
        Retry{Retries < 3?}
        Execute([Execute])
        NoTrade([No Trade])
    end

    News & Fund --> Bull & Bear
    Bull & Bear --> Trader
    Trader --> Plan
    Plan --> Risk & Critic
    Risk & Critic --> Gate
    Gate -->|Yes| Execute
    Gate -->|No| Retry
    Retry -->|Yes| Trader
    Retry -->|No| NoTrade
```

### Decision Rules

$$
\delta = S_{\text{bull}} - S_{\text{bear}}
$$

$$
\text{action} = \left\{ \begin{array}{lcr}
\text{HOLD} & |\delta| < & 0.2 \\
\text{BUY}  & \delta > & 0.3 \\
\text{SELL} & \delta < & -0.3
\end{array} \right.
$$

**Requirements:**
- Stop-loss at thesis invalidation price
- $\dfrac{\text{reward}}{\text{risk}} \geq 1.5$

---

## OODA Loop

```mermaid
flowchart LR
    subgraph OBSERVE
        Market[[Market Snapshot]]
        Context[[External Context]]
    end

    subgraph ORIENT
        Memory[[Memory Retrieval]]
        Regime[[Regime Classification]]
    end

    subgraph DECIDE
        Analysts[[Analysts]]
        Debate[[Bull vs Bear]]
        Trade[[Trader]]
        Approve[[Approvers]]
    end

    subgraph ACT
        Validate[[Constraint Check]]
        Submit[[Submit Order]]
        Persist[[Store Decision]]
    end

    OBSERVE --> ORIENT --> DECIDE --> ACT
```

### Scheduled Workflows

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| Prediction Markets | Every 15 minutes | Fetch probability data |
| Trading Cycle | Hourly (aligned to candle close) | Full OODA loop execution |
| Sentiment | Hourly 9 AM - 4 PM ET (Mon-Fri) | News sentiment aggregation |
| SEC Filings | Daily 6 AM ET | Ingest 10-K, 10-Q, 8-K documents |
| Corporate Actions | Daily 6 AM ET | Dividends, splits, spinoffs |
| Short Interest | Daily 6 PM ET | FINRA short interest data |
| Indicator Synthesis | Daily 6 AM ET (Mon-Fri) | Generate new indicators via agents |

---

## Data Flow

### Trading Cycle

```mermaid
sequenceDiagram
    participant W as Worker
    participant E as Execution Engine
    participant B as Broker
    participant SQL as SQL Database
    participant G as Graph DB

    rect rgba(99, 102, 241, 0.1)
        Note over W,B: OBSERVE
        W->>E: GetSnapshot
        E->>B: Market data request
        B-->>E: OHLCV + quotes
        E-->>W: Market snapshot
    end

    rect rgba(139, 92, 246, 0.1)
        Note over W,G: ORIENT
        W->>G: Vector search (similar decisions)
        G-->>W: Past decisions + context
    end

    rect rgba(217, 119, 6, 0.1)
        Note over W: DECIDE
        W->>W: Run 8-agent consensus
    end

    rect rgba(16, 185, 129, 0.1)
        Note over W,B: ACT
        W->>E: CheckConstraints
        E-->>W: Approved
        W->>E: SubmitOrder
        E->>B: Place order
        B-->>E: Confirmation
        E-->>W: Execution result
        W->>SQL: Persist decision
        W->>G: Store embedding
    end
```

### Dashboard Request

```mermaid
sequenceDiagram
    participant U as User
    participant D as Dashboard
    participant A as API
    participant SQL as SQL Database
    participant G as Graph DB
    participant E as Execution Engine

    U->>D: View portfolio
    D->>A: GET /portfolio

    par Parallel fetch
        A->>SQL: Query positions
        SQL-->>A: Position data
    and
        A->>G: Query recent decisions
        G-->>A: Decision history
    and
        A->>E: GetPositions
        E-->>A: Live positions
    end

    A-->>D: Aggregated response
    D-->>U: Render portfolio
```

---

## Execution Engine

```mermaid
flowchart TB
    subgraph Engine["Execution Engine"]
        HTTP[HTTP Server]
        GRPC[gRPC Server]

        subgraph Core
            Gateway[Execution Gateway]
            State[Order State Manager]
        end

        subgraph Validation
            Constraints[Constraint Validator]
        end

        subgraph Routing
            Adapter[Broker Adapter]
            Feed[Market Feed]
        end

        subgraph Safety
            Monitor[Connection Monitor]
        end
    end

    HTTP --> Gateway
    GRPC --> Gateway
    Gateway --> Constraints
    Gateway --> Adapter
    Gateway --> Feed
    Adapter --> Monitor
```

### Constraint Checks

Every decision is validated against:

- Position size limits (% of account equity)
- Sector concentration limits
- Options Greeks limits (delta, gamma, vega)
- Pattern day trader rule compliance
- Stop-loss requirement (mandatory)
- Buying power validation

---

## Environment Isolation

```mermaid
flowchart LR
    subgraph PAPER
        P1[Paper Account]
        P2[Live Data]
        P3[Safety Optional]
    end

    subgraph LIVE
        L1[Live Account]
        L2[Live Data]
        L3[Safety Required]
    end
```

| Environment | Auth Required | Real Money | Safety Checks |
|-------------|---------------|------------|---------------|
| PAPER | Yes | No | Optional |
| LIVE | Yes + MFA | Yes | Required |

---

## Storage

### SQL Database

Structured data with indexed queries:

- **decisions** - Trading decisions from OODA cycles
- **orders** - Order lifecycle tracking
- **positions** - Current open positions
- **indicators** - Technical indicators
- **runtime_config** - Active trading configuration

### Graph + Vector Database

Memory and case-based reasoning:

- **Nodes**: Decisions, Markets, Instruments, Events
- **Edges**: INFLUENCED_DECISION, SIMILAR_MARKET, CORRELATED_WITH
- **Vectors**: Decision embeddings for semantic similarity search

---

## Service Communication

```mermaid
flowchart LR
    Dashboard -->|HTTP| API
    Dashboard -->|WebSocket| API
    API -->|gRPC| Engine
    API -->|HTTPS| LLM
    API -->|HTTPS| Embed
    Worker -->|gRPC| Engine
    Worker -->|HTTPS| LLM
    Worker -->|HTTPS| Embed
    Engine -->|HTTPS| Broker
```

| From | To | Protocol | Purpose |
|------|----|----------|---------|
| Dashboard | API | HTTP/WebSocket | UI data, real-time updates |
| API | Engine | gRPC | Position queries, account state |
| API | LLM | HTTPS | Agent streaming, direct inference |
| API | Embeddings | HTTPS | Vector generation for queries |
| Worker | Engine | gRPC | Constraint checks, order submission |
| Worker | LLM | HTTPS | Agent inference |
| Worker | Embeddings | HTTPS | Vector generation for storage |
| Engine | Broker | HTTPS | Order execution, market data |
