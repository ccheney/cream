<p align="center" width="100%">
    <img alt="Dollar dollar bill y'all" src="./ddby.jpeg">
</p>

# Cream

> Agentic Trading System for Equities & Options

---

## Critical Warnings

**READ BEFORE USING THIS SOFTWARE:**

1. **REAL MONEY AT RISK** — This system trades real money in live markets. Losses can be substantial and rapid.

2. **EXPERIMENTAL TECHNOLOGY** — LLM-based trading systems are experimental. Multi-agent consensus does not guarantee profitable trades.

3. **MANDATORY TESTING** — Thorough testing in `BACKTEST` and `PAPER` environments is **required** before any `LIVE` deployment.

4. **RISK MANAGEMENT** — Implement comprehensive risk management and position sizing controls. The system includes safeguards, but you must configure them appropriately.

5. **NO GUARANTEES** — Past performance in backtesting does not indicate future results. This software comes with absolutely no warranty.

6. **REGULATORY COMPLIANCE** — Ensure compliance with broker terms of service and all applicable regulatory requirements for automated trading in your jurisdiction.

7. **CONTINUOUS MONITORING** — Monitor performance metrics continuously. Do not deploy and forget.

**By using this software, you acknowledge that you understand and accept all risks associated with automated trading. You assume full responsibility for any financial losses.**

---

## What is Cream?

Cream is a **personal, always-on research + trading system** that:

- Runs an hourly **OODA loop** (Observe → Orient → Decide → Act)
- Trades **equities and listed options** (no crypto)
- Uses **8 specialized agents** with multi-agent consensus for decision-making
- Allocates **portfolio-wide** across multiple instruments
- Combines **LLM reasoning** (TypeScript/Mastra) with **deterministic execution** (Rust)
- Uses **HelixDB** as unified **graph + vector memory** for retrieval and reasoning

### Key Features

- **Multi-Agent Consensus**: Decisions require approval from Risk Manager and Critic agents
- **Mandatory Risk Controls**: Stop-loss and take-profit levels required for all positions
- **Three Environments**: `BACKTEST`, `PAPER`, `LIVE` with a single switch
- **Hourly Decision Cadence**: Aligned to 1-hour candle closes
- **Full Audit Trail**: All decisions logged with rationale and supporting evidence

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Bun v1.3+, Rust 1.92+, Python 3.15+ (uv) |
| **TypeScript** | TypeScript Go (tsgo) v7+ |
| **Orchestration** | Mastra v0.24+ |
| **LLM** | Google Gemini (`gemini-3-pro-preview`, `gemini-3-flash-preview`) |
| **Graph + Vector DB** | HelixDB |
| **Structured State** | Turso Database |
| **Serialization** | Protobuf (Buf CLI) + Zod v4 |
| **Monorepo** | Turborepo v2.7+ |

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.3+
- [Rust](https://rustup.rs/) 1.92+
- [Docker](https://www.docker.com/) (for HelixDB + Turso)
- API keys for: Alpaca, Polygon/Massive, FMP, Alpha Vantage, Google Gemini

### Installation

```bash
# Clone the repository
git clone https://github.com/ccheney/cream.git
cd cream

# Install TypeScript dependencies
bun install

# Build Rust execution engine
cargo build --release

# Start infrastructure
docker-compose up -d
```

### Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required environment variables:

```bash
CREAM_ENV=PAPER              # BACKTEST | PAPER | LIVE
CREAM_BROKER=ALPACA          # Broker selection

# Database
TURSO_DATABASE_URL=          # Turso database URL
TURSO_AUTH_TOKEN=            # Turso auth token (optional)

# Market Data
DATABENTO_KEY=               # Execution-grade market data
POLYGON_KEY=                 # Cognitive market data
FMP_KEY=                     # Fundamentals & transcripts
ALPHAVANTAGE_KEY=            # Macro indicators

# Brokerage
ALPACA_KEY=                  # Broker API key
ALPACA_SECRET=               # Broker API secret

# LLM
GEMINI_API_KEY=              # Google Gemini API key
```

### First Run (PAPER Environment)

```bash
# Start in PAPER mode (default)
CREAM_ENV=PAPER bun run apps/api

# In a separate terminal, start the hourly scheduler
CREAM_ENV=PAPER bun run apps/worker

# Start the Rust execution engine
cargo run --bin execution-engine --release
```

---

## Development

### Build Commands

```bash
# TypeScript
bun install                    # Install dependencies
bun run apps/api               # Start Mastra server
bun run apps/worker            # Start hourly scheduler
bun test                       # Run all TS tests
bun test packages/domain       # Run specific package tests

# Rust
cargo build                    # Build execution engine
cargo test                     # Run Rust tests
cargo run --bin execution-engine  # Start gRPC server (port 50051)

# Python
pytest                         # Run Python tests

# Code Generation
buf generate                   # Generate Protobuf stubs (TS + Rust)

# Linting
biome check                    # TypeScript/JS linting
cargo clippy                   # Rust linting
ruff check                     # Python linting
```

### Project Structure

```
cream/
  apps/
    api/                    # Mastra server (agents + workflows + HTTP)
    worker/                 # Hourly scheduler for tradingCycleWorkflow
    execution-engine/       # Rust core (gRPC, order routing, constraints)
    filings-service/        # Python (transcripts/filings → HelixDB)
    vision-service/         # Python (chart features, computer vision)

  packages/
    schema/                 # Protobuf definitions (.proto) + Buf config
    domain/                 # Zod schemas (mirrors Protobuf)
    helix-schema/           # HelixDB schema + HelixQL helpers
    storage/                # Turso client wrapper
    config/                 # Configuration loading and validation
    marketdata/             # Polygon/Massive adapters
    indicators/             # Technical indicators (RSI, ATR, SMA, etc.)
    regime/                 # Regime classification
    broker/                 # Broker adapters (Alpaca)
    mastra-kit/             # Agent prompts, tools, utilities

  docs/plans/               # Architecture documentation
  infrastructure/           # Docker Compose + deployment configs
```

---

## Documentation

All planning and architecture documentation is in `docs/plans/`:

| Document | Description |
|----------|-------------|
| [00-overview](./docs/plans/00-overview.md) | System overview and design principles |
| [01-architecture](./docs/plans/01-architecture.md) | Polyglot architecture, OODA loop, component map |
| [02-data-layer](./docs/plans/02-data-layer.md) | Data ingestion, features, regime classification |
| [03-market-snapshot](./docs/plans/03-market-snapshot.md) | JSON snapshot schema for LLM input |
| [04-memory-helixdb](./docs/plans/04-memory-helixdb.md) | HelixDB nodes, edges, retrieval policies |
| [05-agents](./docs/plans/05-agents.md) | Multi-agent roles, consensus, workflow |
| [06-decision-contract](./docs/plans/06-decision-contract.md) | DecisionPlan output format, action semantics |
| [07-execution](./docs/plans/07-execution.md) | Order routing, constraints, stops/targets |
| [08-options](./docs/plans/08-options.md) | Options-specific logic, multi-leg strategies |
| [09-rust-core](./docs/plans/09-rust-core.md) | Rust execution engine, gRPC API |
| [10-research](./docs/plans/10-research.md) | Python research layer, backtesting |
| [11-configuration](./docs/plans/11-configuration.md) | Configuration schemas and examples |
| [12-backtest](./docs/plans/12-backtest.md) | Simulation engine, fill models |
| [13-operations](./docs/plans/13-operations.md) | Deployment, monitoring, secrets |
| [14-testing](./docs/plans/14-testing.md) | Testing strategy |
| [15-implementation](./docs/plans/15-implementation.md) | Implementation order, milestones |
| [16-tech-stack](./docs/plans/16-tech-stack.md) | Technology choices and rationale |

---

## Agent Network

Cream uses 8 specialized agents for trading decisions:

1. **Technical Analyst** — Price action, indicators, chart patterns
2. **News & Sentiment Analyst** — News, social sentiment, market mood
3. **Fundamentals & Macro Analyst** — Earnings, economic data, sector trends
4. **Bullish Research Agent** — Makes the case for long positions
5. **Bearish Research Agent** — Makes the case for short positions
6. **Trader Agent** — Synthesizes research into actionable trade plans
7. **Risk Manager Agent** — Validates risk parameters, can APPROVE/REJECT
8. **Critic Agent** — Devil's advocate, challenges assumptions, can APPROVE/REJECT

**Consensus Rule**: A trade plan proceeds only when BOTH Risk Manager AND Critic approve.

---

## License

This software is provided for personal use only. See LICENSE file for details.

---

## Disclaimer

THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

**TRADING INVOLVES SUBSTANTIAL RISK OF LOSS AND IS NOT SUITABLE FOR ALL INVESTORS.**

The developers of this software are not registered investment advisors, broker-dealers, or financial planners. Nothing in this software or its documentation should be construed as investment advice or a recommendation to buy or sell any security.

You are solely responsible for your own trading decisions and the consequences thereof. Always do your own research and consider consulting with a qualified financial advisor before making any investment decisions.
