"""Golden Test Datasets for Agent Evaluation.

This module provides golden test cases for each agent type.
Each test case includes input context, expected output, and evaluation criteria.
"""

from dataclasses import dataclass, field

from deepeval.test_case import LLMTestCase


@dataclass
class GoldenTestCase:
    """A golden test case for agent evaluation."""

    agent_type: str
    name: str
    description: str
    input_context: str
    expected_output: str
    tags: list[str] = field(default_factory=list)

    def to_llm_test_case(self, actual_output: str) -> LLMTestCase:
        """Convert to DeepEval LLMTestCase."""
        return LLMTestCase(
            input=self.input_context,
            actual_output=actual_output,
            expected_output=self.expected_output,
        )


# ============================================
# Technical Analyst Golden Tests
# ============================================

TECHNICAL_ANALYST_TESTS = [
    GoldenTestCase(
        agent_type="technical_analyst",
        name="breakout_identification",
        description="Correctly identify a breakout pattern from consolidation",
        input_context="""
Instrument: AAPL
OHLCV Data (last 10 days):
- Day 1: O=175, H=177, L=174, C=176, V=50M
- Day 2: O=176, H=178, L=175, C=177, V=45M
- Day 3: O=177, H=178, L=176, C=177, V=40M
- Day 4: O=177, H=178, L=176, C=177, V=38M
- Day 5: O=177, H=178, L=176, C=178, V=35M
- Day 6: O=178, H=179, L=177, C=178, V=42M
- Day 7: O=178, H=179, L=177, C=178, V=40M
- Day 8: O=178, H=182, L=178, C=181, V=85M (breakout)
- Day 9: O=181, H=183, L=180, C=182, V=70M
- Day 10: O=182, H=184, L=181, C=183, V=65M

Indicators:
- RSI(14): 68
- ATR(14): 2.5
- SMA(20): 177.5
- SMA(50): 174
""",
        expected_output="""{
  "instrument_id": "AAPL",
  "setup_classification": "BREAKOUT",
  "key_levels": {
    "support": [178, 177],
    "resistance": [185, 190],
    "pivot": 180
  },
  "trend_assessment": "Strong uptrend, price above all moving averages, breakout from 178 consolidation",
  "momentum_assessment": "RSI 68 shows strength without overbought conditions, momentum supports continuation",
  "volatility_assessment": "ATR 2.5 indicates moderate volatility, breakout day volume 2x average confirms conviction",
  "technical_thesis": "AAPL broke out of 10-day consolidation at 178 on 2x volume, retested and held breakout level, now trending higher. Target 185-190 resistance zone.",
  "invalidation_conditions": ["Close below 178 breakout level", "RSI divergence with price", "Volume decline on continuation"]
}""",
        tags=["breakout", "volume_confirmation", "trend_following"],
    ),
    GoldenTestCase(
        agent_type="technical_analyst",
        name="range_bound_market",
        description="Correctly identify a range-bound market with no clear setup",
        input_context="""
Instrument: MSFT
OHLCV Data (last 10 days):
- Day 1-10: Price oscillating between 410-420 with no clear direction
- Average volume: 25M daily

Indicators:
- RSI(14): 52 (neutral)
- ATR(14): 5.0
- SMA(20): 415
- SMA(50): 415 (flat)
""",
        expected_output="""{
  "instrument_id": "MSFT",
  "setup_classification": "RANGE_BOUND",
  "key_levels": {
    "support": [410],
    "resistance": [420],
    "pivot": 415
  },
  "trend_assessment": "Sideways trend, price consolidating around 415, flat moving averages",
  "momentum_assessment": "RSI 52 neutral, no momentum divergences, awaiting catalyst",
  "volatility_assessment": "ATR 5.0 moderate, range compression suggests potential breakout",
  "technical_thesis": "MSFT in 10-point range (410-420) with neutral momentum. No actionable setup until range break.",
  "invalidation_conditions": ["Breakout above 420 with volume", "Breakdown below 410 with volume"]
}""",
        tags=["range", "neutral", "consolidation"],
    ),
    GoldenTestCase(
        agent_type="technical_analyst",
        name="bearish_reversal",
        description="Identify a bearish reversal pattern",
        input_context="""
Instrument: NVDA
OHLCV Data (last 5 days):
- Day 1: O=900, H=920, L=895, C=915, V=60M (rally peak)
- Day 2: O=915, H=918, L=880, C=885, V=90M (bearish engulfing)
- Day 3: O=885, H=890, L=870, C=875, V=75M
- Day 4: O=875, H=885, L=868, C=870, V=65M
- Day 5: O=870, H=878, L=865, C=868, V=55M

Indicators:
- RSI(14): 35 (oversold)
- ATR(14): 25
- SMA(20): 895 (price below)
- SMA(50): 880 (price below)
""",
        expected_output="""{
  "instrument_id": "NVDA",
  "setup_classification": "REVERSAL",
  "key_levels": {
    "support": [865, 850],
    "resistance": [885, 900],
    "pivot": 875
  },
  "trend_assessment": "Bearish reversal from 920, price below both MAs, lower highs and lower lows",
  "momentum_assessment": "RSI 35 oversold but no bullish divergence yet, momentum favors bears",
  "volatility_assessment": "ATR 25 elevated, high volatility on breakdown, sellers in control",
  "technical_thesis": "NVDA formed bearish engulfing at 920 on 1.5x volume, broke below 20 and 50 SMA. Trend reversed from bullish to bearish. Watch 865 support.",
  "invalidation_conditions": ["Reclaim 885 with volume", "RSI bullish divergence", "Close above 20 SMA"]
}""",
        tags=["reversal", "bearish", "trend_change"],
    ),
]


# ============================================
# News Analyst Golden Tests
# ============================================

NEWS_ANALYST_TESTS = [
    GoldenTestCase(
        agent_type="news_analyst",
        name="earnings_beat",
        description="Assess positive earnings surprise impact",
        input_context="""
Instrument: GOOGL
News Events:
- Event ID: EVT001
  Type: EARNINGS
  Headline: "Alphabet Q4 Earnings Beat: EPS $1.89 vs $1.72 expected, Revenue $92B vs $90B"
  Content: Strong cloud growth, AI monetization progress, ad revenue resilient
  Timestamp: 2026-01-06 16:05 ET

Social Sentiment:
- Reddit r/investing: Mostly bullish, discussing cloud growth
- Twitter: Mixed, concerns about ad market
""",
        expected_output="""{
  "instrument_id": "GOOGL",
  "event_impacts": [
    {
      "event_id": "EVT001",
      "event_type": "EARNINGS",
      "impact_direction": "BULLISH",
      "impact_magnitude": "HIGH",
      "reasoning": "10% EPS beat with strong cloud growth and AI progress. Revenue beat shows resilient core business."
    }
  ],
  "overall_sentiment": "BULLISH",
  "sentiment_strength": 0.75,
  "duration_expectation": "DAYS",
  "linked_event_ids": ["EVT001"]
}""",
        tags=["earnings", "bullish", "catalyst"],
    ),
    GoldenTestCase(
        agent_type="news_analyst",
        name="regulatory_headwind",
        description="Assess negative regulatory news impact",
        input_context="""
Instrument: META
News Events:
- Event ID: EVT002
  Type: REGULATORY
  Headline: "EU Proposes $2B Fine Against Meta for Data Privacy Violations"
  Content: GDPR violation, potential restrictions on ad targeting in EU
  Timestamp: 2026-01-06 10:00 ET

Social Sentiment:
- Reddit: Bearish, concerns about recurring regulatory issues
- Twitter: Very negative, #BreakUpMeta trending
""",
        expected_output="""{
  "instrument_id": "META",
  "event_impacts": [
    {
      "event_id": "EVT002",
      "event_type": "REGULATORY",
      "impact_direction": "BEARISH",
      "impact_magnitude": "MEDIUM",
      "reasoning": "$2B fine is material but manageable. Bigger concern is potential ad targeting restrictions affecting EU revenue."
    }
  ],
  "overall_sentiment": "BEARISH",
  "sentiment_strength": 0.65,
  "duration_expectation": "WEEKS",
  "linked_event_ids": ["EVT002"]
}""",
        tags=["regulatory", "bearish", "headwind"],
    ),
]


# ============================================
# Fundamentals Analyst Golden Tests
# ============================================

FUNDAMENTALS_ANALYST_TESTS = [
    GoldenTestCase(
        agent_type="fundamentals_analyst",
        name="growth_stock_analysis",
        description="Analyze a high-growth tech stock with prediction market data",
        input_context="""
Instrument: CRM
Fundamental Data:
- P/E: 45x (sector avg: 35x)
- Revenue Growth: 25% YoY
- Operating Margin: 22% (improving)
- FCF Yield: 3.5%
- Guidance: Raised FY outlook

Macro Context:
- Fed Funds Rate: 4.5%
- 10Y Treasury: 4.2%

Prediction Market Data:
- fedCutProbability: 0.65 (next meeting)
- macroUncertaintyIndex: 0.45
- liquidityScore: 0.8

Upcoming Events:
- Earnings: 2026-02-25
- Fed Decision: 2026-01-29
""",
        expected_output="""{
  "instrument_id": "CRM",
  "fundamental_drivers": ["Strong 25% revenue growth", "Improving operating margins to 22%", "Raised guidance signals confidence", "Potential rate cuts support growth valuations"],
  "fundamental_headwinds": ["Premium valuation at 45x P/E vs 35x sector", "Rate-sensitive with 3.5% FCF yield"],
  "valuation_context": "Trading at 29% premium to sector on P/E basis, justified by 25% growth vs sector 15%",
  "macro_context": "High rates pressure growth valuations, but 65% probability of rate cut provides support",
  "event_risk": [
    {
      "event": "Fed Decision",
      "date": "2026-01-29",
      "potential_impact": "MEDIUM",
      "prediction_market_probability": 0.65,
      "expected_outcome": "Rate cut likely, bullish for growth stocks"
    },
    {
      "event": "Q4 Earnings",
      "date": "2026-02-25",
      "potential_impact": "HIGH",
      "prediction_market_probability": null,
      "expected_outcome": null
    }
  ],
  "prediction_market_signals": {
    "fedOutlook": "DOVISH",
    "surprisePotential": "Rate cut more likely than hawkish surprise",
    "policyUncertainty": "MEDIUM",
    "signalConfidence": 0.8
  },
  "fundamental_thesis": "CRM commands premium valuation on strong growth and improving margins. Dovish Fed outlook (65% cut probability) supports growth multiple. Near-term volatility around Jan Fed meeting and Feb earnings.",
  "linked_event_ids": []
}""",
        tags=["growth", "valuation", "prediction_markets"],
    ),
]


# ============================================
# Trader Golden Tests
# ============================================

TRADER_TESTS = [
    GoldenTestCase(
        agent_type="trader",
        name="high_conviction_long",
        description="Create a long position with high conviction",
        input_context="""
Portfolio Context:
- Buying Power: $100,000
- Current Positions: 3
- Max Positions: 10
- Max Position %: 15%
- Max Risk Per Trade: 2%

Bullish Research (AAPL):
- Conviction: 0.85
- Supporting factors: Breakout setup, strong earnings, AI tailwinds
- Target conditions: Break above 185

Bearish Research (AAPL):
- Conviction: 0.35
- Strongest counter: Elevated valuation

Technical Levels:
- Support: 178
- Resistance: 185, 190
- Current Price: 182
""",
        expected_output="""{
  "cycleId": "cycle-001",
  "timestamp": "2026-01-07T10:00:00Z",
  "decisions": [
    {
      "decisionId": "dec-001",
      "instrumentId": "AAPL",
      "action": "BUY",
      "direction": "LONG",
      "size": { "value": 10, "unit": "PCT_EQUITY" },
      "stopLoss": { "price": 178, "type": "FIXED" },
      "takeProfit": { "price": 190 },
      "strategyFamily": "EQUITY_LONG",
      "timeHorizon": "SWING",
      "rationale": {
        "summary": "Strong bullish setup with technical breakout confirmation and fundamental tailwinds",
        "bullishFactors": ["Technical breakout above 178", "Strong Q4 earnings", "AI product momentum"],
        "bearishFactors": ["Valuation concerns at 30x P/E"],
        "decisionLogic": "Bullish conviction 0.85 vs bearish 0.35 = 0.50 delta favoring long. Using 0.67x position size due to high conviction.",
        "memoryReferences": [],
        "predictionMarketContext": null
      },
      "thesisState": "ENTERED"
    }
  ],
  "portfolioNotes": "Adding 4th position of 10 max. AAPL uncorrelated to existing holdings.",
  "predictionMarketNotes": null
}""",
        tags=["long", "high_conviction", "breakout"],
    ),
]


# ============================================
# Risk Manager Golden Tests
# ============================================

RISK_MANAGER_TESTS = [
    GoldenTestCase(
        agent_type="risk_manager",
        name="constraint_violation_detection",
        description="Detect position size constraint violation",
        input_context="""
Portfolio Context:
- Portfolio Value: $100,000
- Max Position %: 15%
- Max Risk Per Trade: 2%

Proposed Decision:
- Instrument: TSLA
- Action: BUY
- Size: 20% of portfolio ($20,000)
- Stop Loss: 5% below entry
- Current Positions: 8 of 10 max
""",
        expected_output="""{
  "verdict": "REJECT",
  "violations": [
    {
      "constraint": "max_position_pct",
      "current_value": "20%",
      "limit": "15%",
      "severity": "CRITICAL",
      "affected_decisions": ["dec-tsla-001"]
    }
  ],
  "prediction_market_violations": [],
  "required_changes": [
    {
      "decisionId": "dec-tsla-001",
      "change": "Reduce position size from 20% to 15% or less",
      "reason": "Position size exceeds max_position_pct constraint"
    }
  ],
  "risk_notes": "TSLA position 33% above allowed maximum. Reduce to comply.",
  "prediction_market_notes": null
}""",
        tags=["constraint_violation", "position_sizing", "reject"],
    ),
    GoldenTestCase(
        agent_type="risk_manager",
        name="missing_stop_loss",
        description="Detect missing stop-loss on new position",
        input_context="""
Portfolio Context:
- Portfolio Value: $100,000
- Max Position %: 15%

Proposed Decision:
- Instrument: AMD
- Action: BUY
- Size: 10% of portfolio
- Stop Loss: NOT SET
- Take Profit: $180
""",
        expected_output="""{
  "verdict": "REJECT",
  "violations": [
    {
      "constraint": "stop_loss_required",
      "current_value": "NOT SET",
      "limit": "Required for all new positions",
      "severity": "CRITICAL",
      "affected_decisions": ["dec-amd-001"]
    }
  ],
  "prediction_market_violations": [],
  "required_changes": [
    {
      "decisionId": "dec-amd-001",
      "change": "Add stop-loss level based on technical support",
      "reason": "All new positions must have stop-loss defined"
    }
  ],
  "risk_notes": "Missing stop-loss is a hard rejection criterion.",
  "prediction_market_notes": null
}""",
        tags=["missing_stop", "reject", "risk_control"],
    ),
]


# ============================================
# Critic Golden Tests
# ============================================

CRITIC_TESTS = [
    GoldenTestCase(
        agent_type="critic",
        name="hallucination_detection",
        description="Detect hallucinated evidence not in analyst outputs",
        input_context="""
Analyst Outputs:
- Technical: Breakout setup at 180, RSI 65
- News: No material news
- Fundamentals: P/E 25x, stable margins

Trader Decision:
- Action: BUY AAPL
- Rationale: "Strong earnings beat yesterday with 15% revenue surprise"
- Rationale references earnings event that did NOT appear in news analyst output
""",
        expected_output="""{
  "verdict": "REJECT",
  "inconsistencies": [],
  "missing_justifications": [],
  "hallucination_flags": [
    {
      "decisionId": "dec-aapl-001",
      "claim": "Strong earnings beat yesterday with 15% revenue surprise",
      "evidence_status": "NOT_FOUND"
    }
  ],
  "required_changes": [
    {
      "decisionId": "dec-aapl-001",
      "change": "Remove hallucinated earnings reference or provide valid evidence source"
    }
  ]
}""",
        tags=["hallucination", "reject", "evidence_check"],
    ),
    GoldenTestCase(
        agent_type="critic",
        name="logic_reversal_detection",
        description="Detect when action contradicts evidence",
        input_context="""
Research Outputs:
- Bullish Conviction: 0.3
- Bearish Conviction: 0.8
- Bearish factors: Technical breakdown, negative guidance, macro headwinds

Trader Decision:
- Action: BUY MSFT
- Direction: LONG
- Rationale: "Going long based on research consensus"
""",
        expected_output="""{
  "verdict": "REJECT",
  "inconsistencies": [
    {
      "decisionId": "dec-msft-001",
      "issue": "Direction contradicts research consensus",
      "expected": "SELL/SHORT or AVOID (bearish 0.8 > bullish 0.3)",
      "found": "BUY LONG"
    }
  ],
  "missing_justifications": [],
  "hallucination_flags": [],
  "required_changes": [
    {
      "decisionId": "dec-msft-001",
      "change": "Change action to SELL/SHORT or provide justification for overriding research"
    }
  ]
}""",
        tags=["logic_reversal", "reject", "consistency_check"],
    ),
]


# ============================================
# Dataset Registry
# ============================================

ALL_GOLDEN_TESTS: dict[str, list[GoldenTestCase]] = {
    "technical_analyst": TECHNICAL_ANALYST_TESTS,
    "news_analyst": NEWS_ANALYST_TESTS,
    "fundamentals_analyst": FUNDAMENTALS_ANALYST_TESTS,
    "bullish_researcher": [],  # Use researcher tests
    "bearish_researcher": [],  # Use researcher tests
    "trader": TRADER_TESTS,
    "risk_manager": RISK_MANAGER_TESTS,
    "critic": CRITIC_TESTS,
}


def get_tests_for_agent(agent_type: str) -> list[GoldenTestCase]:
    """Get golden test cases for an agent type.

    Args:
        agent_type: One of the 8 agent types

    Returns:
        List of golden test cases

    Raises:
        ValueError: If agent_type is not recognized
    """
    if agent_type not in ALL_GOLDEN_TESTS:
        raise ValueError(
            f"Unknown agent type: {agent_type}. Valid types: {list(ALL_GOLDEN_TESTS.keys())}"
        )
    return ALL_GOLDEN_TESTS[agent_type]


def get_all_tests() -> dict[str, list[GoldenTestCase]]:
    """Get all golden test cases."""
    return ALL_GOLDEN_TESTS.copy()


def get_tests_by_tag(tag: str) -> list[GoldenTestCase]:
    """Get all test cases with a specific tag.

    Args:
        tag: Tag to filter by

    Returns:
        List of matching test cases
    """
    results = []
    for tests in ALL_GOLDEN_TESTS.values():
        results.extend(t for t in tests if tag in t.tags)
    return results
