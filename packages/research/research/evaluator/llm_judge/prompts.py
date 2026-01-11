"""
LLM Judge Prompts

Prompt templates and builders for trading plan evaluation.
"""

from __future__ import annotations

import json
from typing import Any

SCORING_GUIDELINES = """Scoring guidelines:
- 90-100: Excellent
- 70-89: Good
- 50-69: Acceptable
- 30-49: Poor
- 0-29: Unacceptable"""


def build_technical_alignment_prompt(
    plan: dict[str, Any],
    context: dict[str, Any],
) -> str:
    """
    Build prompt for technical alignment scoring.

    Evaluates whether the plan aligns with technical indicators,
    chart patterns, support/resistance levels, and momentum signals.
    """
    return f"""You are an expert trading system evaluator. Score the technical alignment of this trading plan on a 0-100 scale.

TRADING PLAN:
{json.dumps(plan, indent=2)}

TECHNICAL CONTEXT:
{json.dumps(context, indent=2)}

Evaluate whether the plan aligns with technical indicators, chart patterns, support/resistance levels, and momentum signals.

Provide your response in this exact format:
SCORE: <0-100>
COMPONENTS: {{"indicator_alignment": <0-100>, "pattern_alignment": <0-100>, "level_alignment": <0-100>}}
FEEDBACK: <2-3 sentence explanation>

{SCORING_GUIDELINES.replace("Excellent", "Excellent alignment, plan strongly supported by technicals").replace("Good", "Good alignment, most indicators support the plan").replace("Acceptable", "Acceptable alignment, mixed signals").replace("Poor", "Poor alignment, technicals suggest caution").replace("Unacceptable", "Unacceptable alignment, technicals contradict plan")}"""


def build_memory_consistency_prompt(
    plan: dict[str, Any],
    memory_nodes: list[dict[str, Any]],
) -> str:
    """
    Build prompt for memory consistency scoring.

    Evaluates whether the plan is consistent with historical decisions,
    learned patterns, and past outcomes for similar market conditions.
    """
    return f"""You are an expert trading system evaluator. Score the memory consistency of this trading plan on a 0-100 scale.

TRADING PLAN:
{json.dumps(plan, indent=2)}

HISTORICAL MEMORY (recent similar decisions):
{json.dumps(memory_nodes, indent=2)}

Evaluate whether the plan is consistent with historical decisions and learned patterns. Consider:
- Similar strategies in similar conditions
- Past outcomes (wins vs losses)
- Lessons learned from previous trades

Provide your response in this exact format:
SCORE: <0-100>
COMPONENTS: {{"strategy_consistency": <0-100>, "outcome_learning": <0-100>, "pattern_recognition": <0-100>}}
FEEDBACK: <2-3 sentence explanation>

Scoring guidelines:
- 90-100: Excellent consistency, plan aligns with successful historical patterns
- 70-89: Good consistency, plan builds on past experience
- 50-69: Acceptable consistency, some alignment with history
- 30-49: Poor consistency, plan contradicts historical lessons
- 0-29: Unacceptable consistency, plan ignores past failures"""


def build_context_relevance_prompt(
    plan: dict[str, Any],
    regime: dict[str, Any],
    external_events: list[dict[str, Any]],
) -> str:
    """
    Build prompt for context relevance scoring.

    Evaluates whether the plan accounts for current market regime,
    volatility conditions, and external events (earnings, macro data, news).
    """
    return f"""You are an expert trading system evaluator. Score the context relevance of this trading plan on a 0-100 scale.

TRADING PLAN:
{json.dumps(plan, indent=2)}

MARKET REGIME:
{json.dumps(regime, indent=2)}

EXTERNAL EVENTS:
{json.dumps(external_events, indent=2)}

Evaluate whether the plan accounts for current market regime, volatility, and external events. Consider:
- Regime appropriateness (does the strategy fit the current market state?)
- Event awareness (does the plan acknowledge key catalysts/risks?)
- Timing appropriateness (is now the right time given context?)

Provide your response in this exact format:
SCORE: <0-100>
COMPONENTS: {{"regime_fit": <0-100>, "event_awareness": <0-100>, "timing": <0-100>}}
FEEDBACK: <2-3 sentence explanation>

Scoring guidelines:
- 90-100: Excellent context awareness, plan perfectly suited to current environment
- 70-89: Good context awareness, plan accounts for key factors
- 50-69: Acceptable context awareness, some consideration of environment
- 30-49: Poor context awareness, plan misses important context
- 0-29: Unacceptable context awareness, plan ignores critical factors"""
