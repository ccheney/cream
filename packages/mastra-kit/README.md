# @cream/mastra-kit

Agent prompts, tools, and consensus infrastructure for the Cream trading system.

## Overview

Provides:

- **10 Specialized Agents** - Analysis, research, decision, approval
- **30+ Trading Tools** - Market data, indicators, external context
- **Dual-Approval Consensus** - Risk Manager + Critic gate
- **Quality Scoring** - Pre and post execution evaluation

## Agent Network

### Phase 1: Analysis (Parallel)
- `technical_analyst` - Price action, indicators
- `news_analyst` - Event impact, sentiment
- `fundamentals_analyst` - Valuation, macro

### Phase 2: Research (Parallel)
- `bullish_researcher` - Bull case development
- `bearish_researcher` - Bear case with counterarguments

### Phase 3: Decision (Sequential)
- `trader` - Synthesizes into DecisionPlan

### Phase 4: Approval (Dual Gate)
- `risk_manager` - Constraint validation
- `critic` - Consistency, hallucination prevention

## Consensus Gate

```typescript
import { ConsensusGate, runConsensusLoop } from "@cream/mastra-kit";

const gate = new ConsensusGate({ maxIterations: 3 });

const result = await runConsensusLoop(
  gate,
  initialPlan,
  async (plan) => ({
    riskManager: await riskManagerAgent.run(plan),
    critic: await criticAgent.run(plan),
  }),
  async (plan, rejections) => await traderAgent.run({ rejections })
);
```

## Tools

Categories:
- **Market Data** - get_quotes, get_market_snapshots, get_option_chain
- **Technical** - recalc_indicator, check_indicator_trigger
- **Fundamentals** - search_filings, extract_transcript
- **External** - web_search, news_search
- **Portfolio** - get_portfolio_state

## Quality Scoring

### Pre-Execution

```typescript
import { scorePlan } from "@cream/mastra-kit";

const score = scorePlan(plan, portfolioValue, marketContext);
// Returns: overall score, components, expected value, recommendations
```

### Post-Execution

```typescript
import { OutcomeScorer } from "@cream/mastra-kit";

const outcome = new OutcomeScorer().scoreOutcome(completedTrade);
// Returns: realized return, execution quality, attribution
```

## Configuration

All agents use global model from `trading_config.global_model`.

```typescript
import { AGENT_CONFIGS, getAgentConfig } from "@cream/mastra-kit";

const config = getAgentConfig("technical_analyst");
```

## Dependencies

- `@mastra/core` - Agent orchestration
- `@cream/broker` - Trading operations
- `@cream/helix` - Memory retrieval
- `@cream/indicators` - Technical analysis
