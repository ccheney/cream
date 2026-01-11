# Cream Technical Architecture

> Agentic trading system for US equities and options combining LLM reasoning with deterministic Rust execution. Runs hourly OODA loops (Observe → Orient → Decide → Act).

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Service Architecture](#2-service-architecture)
3. [Agent Architecture](#3-agent-architecture)
4. [OODA Loop Data Flow](#4-ooda-loop-data-flow)
5. [Rust Execution Engine](#5-rust-execution-engine)

---

## 1. System Overview

Cream is a multi-language monorepo implementing an autonomous trading system:

- **8-Agent Consensus Network**: LLM agents (Gemini) analyze markets, debate positions, and reach consensus before execution
- **Deterministic Execution**: Rust engine validates decisions against risk constraints and routes orders
- **Hourly OODA Cycles**: Scheduled trading cycles with checkpoint-based recovery
- **Multi-Asset Support**: US equities and options (up to 4-leg strategies)
- **Environment Isolation**: Complete separation of BACKTEST, PAPER, and LIVE modes
- **GraphRAG Memory**: HelixDB stores trade decisions for case-based reasoning

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#FEF3C7', 'primaryTextColor': '#3D3832', 'primaryBorderColor': '#D97706', 'lineColor': '#78716C', 'secondaryColor': '#CCFBF1', 'tertiaryColor': '#FBF8F3'}}}%%
flowchart TB
    subgraph Services["Application Layer"]
        Dashboard["`**Dashboard**
        Next.js 16 · :3000`"]
        DashAPI["`**Dashboard-API**
        Hono + Bun · :3001`"]
        Worker["`**Worker**
        Scheduler · :3002`"]
        Engine["`**Execution Engine**
        Rust · :50051/53/55`"]
    end

    subgraph Data["Data Layer"]
        Turso[("`**Turso**
        SQLite · :8080`")]
        Helix[("`**HelixDB**
        Graph+Vec · :6969`")]
        Redis[("`**Redis**
        Cache · :6379`")]
    end

    subgraph External["External Services"]
        Databento(["`**Databento**
        Market Data`"])
        Alpaca(["`**Alpaca**
        Broker`"])
    end

    Dashboard -->|HTTP/WS| DashAPI
    DashAPI --> Turso
    DashAPI --> Helix
    DashAPI -->|gRPC| Engine
    Worker --> Turso
    Worker --> Helix
    Worker -->|gRPC| Engine
    Engine --> Databento
    Engine --> Alpaca
    Services --> Redis

    classDef service fill:#FEF3C7,stroke:#D97706,stroke-width:2px,color:#3D3832
    classDef database fill:#CCFBF1,stroke:#14B8A6,stroke-width:2px,color:#3D3832
    classDef external fill:#F5F5F4,stroke:#78716C,stroke-width:2px,color:#3D3832

    class Dashboard,DashAPI,Worker,Engine service
    class Turso,Helix,Redis database
    class Databento,Alpaca external
```

---

## 2. Service Architecture

### Dashboard Request Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#FEF3C7', 'primaryTextColor': '#3D3832', 'lineColor': '#78716C', 'actorBkg': '#FEF3C7', 'actorBorder': '#D97706', 'actorTextColor': '#3D3832', 'activationBkgColor': '#F5F1EA', 'activationBorderColor': '#D97706', 'signalColor': '#57534E', 'signalTextColor': '#3D3832', 'noteBkgColor': '#FBF8F3', 'noteBorderColor': '#EBE5DA', 'noteTextColor': '#3D3832'}}}%%
sequenceDiagram
    participant U as User
    participant D as Dashboard<br/>:3000
    participant A as Dashboard-API<br/>:3001
    participant T as Turso<br/>:8080
    participant H as HelixDB<br/>:6969
    participant E as Execution Engine<br/>:50053

    U->>D: View portfolio
    D->>+A: GET /api/portfolio
    par Fetch data
        A->>T: Query positions
        T-->>A: Position data
    and
        A->>H: Query decisions
        H-->>A: Decision history
    and
        A->>E: gRPC GetPositions
        E-->>A: Live positions
    end
    A-->>-D: Aggregated response
    D-->>U: Render portfolio
```

### Trading Cycle Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#FEF3C7', 'primaryTextColor': '#3D3832', 'lineColor': '#78716C', 'actorBkg': '#FEF3C7', 'actorBorder': '#D97706', 'actorTextColor': '#3D3832', 'activationBkgColor': '#F5F1EA', 'activationBorderColor': '#D97706', 'signalColor': '#57534E', 'signalTextColor': '#3D3832', 'noteBkgColor': '#FBF8F3', 'noteBorderColor': '#EBE5DA', 'noteTextColor': '#3D3832'}}}%%
sequenceDiagram
    participant W as Worker<br/>:3002
    participant T as Turso<br/>:8080
    participant H as HelixDB<br/>:6969
    participant E as Execution Engine<br/>:50053
    participant B as Alpaca<br/>Broker
    participant M as Databento<br/>Market Data

    W->>T: Load config
    T-->>W: Trading config

    rect rgba(99, 102, 241, 0.08)
        Note over W,M: OBSERVE
        W->>E: gRPC GetSnapshot
        E->>M: Subscribe market data
        M-->>E: OHLCV + quotes
        E-->>W: Market snapshot
    end

    rect rgba(139, 92, 246, 0.08)
        Note over W,H: ORIENT
        W->>H: Query similar decisions
        H-->>W: GraphRAG results
    end

    rect rgba(217, 119, 6, 0.08)
        Note over W: DECIDE
        W->>W: Run 8-agent consensus
    end

    rect rgba(16, 185, 129, 0.08)
        Note over W,B: ACT
        W->>E: gRPC CheckConstraints
        E-->>W: Approved
        W->>E: gRPC SubmitOrder
        E->>B: POST /orders
        B-->>E: Order confirmation
        E-->>W: Execution result
        W->>T: Persist decision
        W->>H: Store embeddings
    end
```

### Execution Engine Ports

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#FEF3C7', 'primaryTextColor': '#3D3832', 'lineColor': '#78716C', 'tertiaryColor': '#FBF8F3'}}}%%
flowchart LR
    subgraph Engine["Execution Engine (Rust)"]
        HTTP["`**:50051**
        HTTP/Axum
        REST API`"]
        GRPC["`**:50053**
        gRPC/Tonic
        ExecutionService`"]
        Flight["`**:50055**
        Arrow Flight
        Market Data`"]
    end

    Client([Client]) -->|/health, /v1/*| HTTP
    Worker([Worker]) -->|CheckConstraints, SubmitOrder| GRPC
    Dashboard([Dashboard]) -->|High-perf streaming| Flight

    classDef port fill:#FEF3C7,stroke:#D97706,stroke-width:2px,color:#3D3832
    classDef client fill:#F5F5F4,stroke:#78716C,stroke-width:2px,color:#3D3832

    class HTTP,GRPC,Flight port
    class Client,Worker,Dashboard client
```

---

## 3. Agent Architecture

### 8-Agent Consensus Network

The system implements a multi-agent debate architecture in 4 phases:

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#FEF3C7', 'primaryTextColor': '#3D3832', 'lineColor': '#78716C', 'tertiaryColor': '#FBF8F3'}}}%%
flowchart TB
    subgraph Phase1["PHASE 1: ANALYSIS"]
        direction LR
        Tech["`**Technical**
        Analyst`"]
        News["`**News**
        Analyst`"]
        Fund["`**Fundamentals**
        Analyst`"]
    end

    subgraph Phase2["PHASE 2: DEBATE"]
        direction LR
        Bull["`**Bullish**
        Researcher`"]
        Bear["`**Bearish**
        Researcher`"]
    end

    subgraph Phase3["PHASE 3: DECISION"]
        Trader["`**TRADER**
        Head Trader`"]
        DecPlan(["DecisionPlan"])
    end

    subgraph Phase4["PHASE 4: APPROVAL"]
        Risk["`**RISK**
        MANAGER`"]
        Critic["`**CRITIC**`"]
        Approve{"`Both
        APPROVE?`"}
        Execute([EXECUTE])
        NoTrade([NO_TRADE])
    end

    Tech & News & Fund --> Bull & Bear
    Bull & Bear --> Trader
    Trader --> DecPlan
    DecPlan --> Risk & Critic
    Risk & Critic --> Approve
    Approve -->|YES| Execute
    Approve -->|"NO (max 3)"| NoTrade

    classDef technical fill:#EDE9FE,stroke:#8B5CF6,stroke-width:2px,color:#3D3832
    classDef sentiment fill:#FCE7F3,stroke:#EC4899,stroke-width:2px,color:#3D3832
    classDef fundamentals fill:#CCFBF1,stroke:#14B8A6,stroke-width:2px,color:#3D3832
    classDef bullish fill:#DCFCE7,stroke:#22C55E,stroke-width:2px,color:#3D3832
    classDef bearish fill:#FEE2E2,stroke:#EF4444,stroke-width:2px,color:#3D3832
    classDef trader fill:#FEF3C7,stroke:#D97706,stroke-width:2px,color:#3D3832
    classDef risk fill:#FFEDD5,stroke:#F97316,stroke-width:2px,color:#3D3832
    classDef critic fill:#E0E7FF,stroke:#6366F1,stroke-width:2px,color:#3D3832
    classDef output fill:#F5F5F4,stroke:#78716C,stroke-width:2px,color:#3D3832

    class Tech technical
    class News sentiment
    class Fund fundamentals
    class Bull bullish
    class Bear bearish
    class Trader,DecPlan trader
    class Risk risk
    class Critic critic
    class Approve,Execute,NoTrade output
```

### Agent Configuration

| Agent | Model | Role |
|-------|-------|------|
| Technical Analyst | Gemini 3 Pro | Price action, indicators, key levels |
| News Analyst | Gemini 3 Pro | News impact, sentiment, event timing |
| Fundamentals Analyst | Gemini 3 Pro | Valuation, macro context, prediction markets |
| Bullish Researcher | Gemini 3 Pro | Long thesis with conviction score |
| Bearish Researcher | Gemini 3 Pro | Short thesis with conviction score |
| Trader | Gemini 3 Pro | Synthesizes all inputs, sizes positions |
| Risk Manager | Gemini 3 Flash | Constraint validation, position limits |
| Critic | Gemini 3 Flash | Logic validation, hallucination detection |

### Decision Rules

```
delta = bullish_conviction - bearish_conviction

|delta| < 0.2  → HOLD (insufficient edge)
delta > 0.3    → BUY/LONG with Kelly-inspired sizing
delta < -0.3   → SELL/SHORT or CLOSE existing

Every decision requires:
  - Stop-loss at Technical Analyst's invalidation levels
  - Risk/reward minimum 1.5:1
  - Sizing adjusted for macro events (prediction markets)
```

---

## 4. OODA Loop Data Flow

### Trading Cycle (Hourly)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#FEF3C7', 'primaryTextColor': '#3D3832', 'lineColor': '#78716C', 'tertiaryColor': '#FBF8F3'}}}%%
flowchart LR
    subgraph OBSERVE["OBSERVE"]
        Market[["`**Market Snapshot**
        OHLCV, quotes, options`"]]
        Context[["`**External Context**
        news, earnings, macro`"]]
    end

    subgraph ORIENT["ORIENT"]
        Memory[["`**GraphRAG**
        Retrieval`"]]
        Regimes[["`**Regime**
        Classification`"]]
        PredictionMkt[["`**Prediction**
        Markets`"]]
    end

    subgraph DECIDE["DECIDE"]
        Analysts[["`**3 Analysts**
        parallel`"]]
        Debate[["`**Bull vs Bear**
        parallel`"]]
        TraderStep[["`**Trader**
        DecisionPlan`"]]
        Consensus[["`**Risk + Critic**
        approval`"]]
    end

    subgraph ACT["ACT"]
        Constraints[["`**checkConstraints**
        gRPC → Rust`"]]
        Submit[["`**submitOrders**
        Rust → Alpaca`"]]
        Persist[["`**persistDecisions**
        Turso + HelixDB`"]]
    end

    OBSERVE --> ORIENT --> DECIDE --> ACT

    classDef observe fill:#E0E7FF,stroke:#6366F1,stroke-width:2px,color:#3D3832
    classDef orient fill:#EDE9FE,stroke:#8B5CF6,stroke-width:2px,color:#3D3832
    classDef decide fill:#FEF3C7,stroke:#D97706,stroke-width:2px,color:#3D3832
    classDef act fill:#D1FAE5,stroke:#10B981,stroke-width:2px,color:#3D3832

    class Market,Context observe
    class Memory,Regimes,PredictionMkt orient
    class Analysts,Debate,TraderStep,Consensus decide
    class Constraints,Submit,Persist act
```

### Scheduled Workflows

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#FEF3C7', 'primaryTextColor': '#3D3832', 'lineColor': '#78716C', 'tertiaryColor': '#FBF8F3'}}}%%
flowchart TB
    Scheduler([Worker Scheduler])

    Scheduler --> Trading
    Scheduler --> Predictions
    Scheduler --> Filings

    subgraph Trading["Trading Cycle"]
        T1["`**Hourly**
        aligned to candle close`"]
    end

    subgraph Predictions["Prediction Markets"]
        P1["`**Every 15 min**
        Kalshi + Polymarket`"]
    end

    subgraph Filings["SEC Filings Sync"]
        F1["`**Daily 6 AM EST**
        10-K, 10-Q, 8-K`"]
    end

    classDef scheduler fill:#FEF3C7,stroke:#D97706,stroke-width:2px,color:#3D3832
    classDef workflow fill:#CCFBF1,stroke:#14B8A6,stroke-width:2px,color:#3D3832

    class Scheduler scheduler
    class T1,P1,F1 workflow
```

---

## 5. Rust Execution Engine

### Module Structure

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#FEF3C7', 'primaryTextColor': '#3D3832', 'lineColor': '#78716C', 'tertiaryColor': '#FBF8F3'}}}%%
flowchart TB
    subgraph Engine["apps/execution-engine/src/"]
        Main["main.rs"]
        Config["config.rs"]

        subgraph Server["server/"]
            HTTP["http.rs<br/>Axum :50051"]
            GRPC["grpc.rs<br/>Tonic :50053"]
        end

        subgraph Execution["execution/"]
            Gateway["ExecutionGateway"]
            OrderState["OrderStateManager"]
        end

        subgraph Risk["risk/"]
            Constraints["ConstraintValidator"]
        end

        subgraph Broker["broker/"]
            AlpacaAdapter["AlpacaAdapter"]
        end

        subgraph Feed["feed/"]
            Databento["DatabentoFeed"]
        end

        subgraph Safety["safety/"]
            Monitor["ConnectionMonitor"]
        end
    end

    Main --> Server
    Main --> Config
    Server --> Execution
    Execution --> Risk
    Execution --> Broker
    Execution --> Feed
    Broker --> Safety

    classDef core fill:#FEF3C7,stroke:#D97706,stroke-width:2px,color:#3D3832
    classDef module fill:#CCFBF1,stroke:#14B8A6,stroke-width:2px,color:#3D3832

    class Main,Config core
    class HTTP,GRPC,Gateway,OrderState,Constraints,AlpacaAdapter,Databento,Monitor module
```

### Environment-Based Behavior

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#FEF3C7', 'primaryTextColor': '#3D3832', 'lineColor': '#78716C', 'tertiaryColor': '#FBF8F3'}}}%%
flowchart LR
    subgraph BACKTEST
        B1[Mock Broker]
        B2[No Feed]
        B3[Safety OFF]
    end

    subgraph PAPER
        P1[Alpaca Paper]
        P2[Databento]
        P3[Safety Optional]
    end

    subgraph LIVE
        L1[Alpaca Live]
        L2[Databento]
        L3[Safety Required]
    end

    classDef backtest fill:#F5F5F4,stroke:#78716C,stroke-width:2px,color:#3D3832
    classDef paper fill:#FEF3C7,stroke:#D97706,stroke-width:2px,color:#3D3832
    classDef live fill:#FEE2E2,stroke:#EF4444,stroke-width:2px,color:#3D3832

    class B1,B2,B3 backtest
    class P1,P2,P3 paper
    class L1,L2,L3 live
```

### Constraint Checks

The execution engine validates every decision against:

- Position size limits (% of account)
- Sector concentration limits
- Options Greeks limits (portfolio delta/gamma/vega)
- PDT rule compliance
- Stop-loss requirement (every decision must have one)
