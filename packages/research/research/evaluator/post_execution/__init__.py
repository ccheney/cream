"""
Post-Execution Evaluator Module

Evaluates trade outcomes after execution for learning and performance attribution:
- Execution quality scoring (slippage, fill rate, timing)
- Brinson-style return attribution (market, alpha, timing)
- Outcome scoring for preference learning

See: docs/plans/10-research.md - Post-Execution Integration

Example:
    from research.evaluator import PostExecutionEvaluator, TradeOutcome, MarketData

    evaluator = PostExecutionEvaluator()

    outcome_score = evaluator.evaluate(
        plan_score=pre_execution_score,
        outcome=trade_outcome,
        market_data=market_data,
    )
    print(f"Outcome Score: {outcome_score.outcome_score}")
    print(f"Alpha: {outcome_score.attribution['alpha_contribution']}")
"""

from .evaluator import PostExecutionEvaluator
from .metrics import (
    attribute_returns,
    compute_aggregate_metrics,
    compute_execution_details,
    compute_execution_quality,
    compute_outcome_score,
    compute_risk_management_score,
    generate_notes,
)
from .types import Attribution, MarketData, OutcomeScore, TradeOutcome

__all__ = [
    "Attribution",
    "MarketData",
    "OutcomeScore",
    "PostExecutionEvaluator",
    "TradeOutcome",
    "attribute_returns",
    "compute_aggregate_metrics",
    "compute_execution_details",
    "compute_execution_quality",
    "compute_outcome_score",
    "compute_risk_management_score",
    "generate_notes",
]
