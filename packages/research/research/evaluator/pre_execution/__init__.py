"""
Pre-Execution Evaluator

Evaluates trading plans before execution using multiple scoring components:
- Rule-based scorer for quantifiable dimensions (risk-reward, sizing)
- LLM judge for qualitative assessment (memory consistency, context relevance)
- Bradley-Terry reward model for learned preferences

See: docs/plans/10-research.md - Pre-Execution Integration

Example:
    from research.evaluator import PreExecutionEvaluator, ProbabilityCalibrator
    from research.evaluator import RuleBasedScorer, BradleyTerryRewardModel

    evaluator = PreExecutionEvaluator(
        rule_scorer=RuleBasedScorer(),
        bt_model=BradleyTerryRewardModel(),
        calibrator=ProbabilityCalibrator(),
    )

    plan_score = evaluator.evaluate(
        plan=trading_plan,
        context=market_context,
        memory_context={"relevant_nodes": [...]},
    )
    print(f"Overall Score: {plan_score.overall_score}")
"""

from .checks import compute_context_score, compute_memory_score, compute_technical_score
from .evaluator import PreExecutionEvaluator
from .types import DimensionScores, PlanScore

__all__ = [
    "DimensionScores",
    "PlanScore",
    "PreExecutionEvaluator",
    "compute_context_score",
    "compute_memory_score",
    "compute_technical_score",
]
