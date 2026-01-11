"""
LLM-as-Judge Evaluator

Uses Google Gemini to evaluate qualitative dimensions of trading plans:
- Technical alignment: Does the plan align with technical indicators and chart patterns?
- Memory consistency: Is the plan consistent with historical decisions and outcomes?
- Context relevance: Does the plan account for current market regime and external events?

Scoring is on a 0-100 scale where:
- 90-100: Excellent
- 70-89: Good
- 50-69: Acceptable
- 30-49: Poor
- 0-29: Unacceptable

Example:
    from research.evaluator import LLMJudge

    judge = LLMJudge(api_key="your-api-key")

    # Score technical alignment
    tech_score = await judge.score_technical_alignment(
        plan={
            "action": "BUY",
            "symbol": "AAPL",
            "entry_price": 150.0,
            "stop_loss": 145.0,
            "take_profit": 165.0,
            "rationale": "Bullish RSI divergence with support at $145",
        },
        context={
            "rsi": 35.2,
            "price": 150.0,
            "support_levels": [145.0, 142.0],
            "resistance_levels": [165.0, 172.0],
        }
    )
    print(f"Technical Score: {tech_score.score}")
"""

from .judge import LLMJudge
from .prompts import (
    build_context_relevance_prompt,
    build_memory_consistency_prompt,
    build_technical_alignment_prompt,
)
from .types import CacheEntry

__all__ = [
    "CacheEntry",
    "LLMJudge",
    "build_context_relevance_prompt",
    "build_memory_consistency_prompt",
    "build_technical_alignment_prompt",
]
