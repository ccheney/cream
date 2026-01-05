"""
Evaluator Module - Trading Plan Evaluation

Provides scoring and evaluation of trading plans:
- Rule-based scoring for risk-reward and position sizing
- Bradley-Terry reward model for preference learning
- LLM-based evaluation for qualitative aspects (Phase 12)
"""

from research.evaluator.bradley_terry import (
    BradleyTerryRewardModel,
    train_bradley_terry_model,
)
from research.evaluator.llm_judge import LLMJudge
from research.evaluator.rule_scorer import RuleBasedScorer, ScoringResult

__all__ = [
    "BradleyTerryRewardModel",
    "LLMJudge",
    "RuleBasedScorer",
    "ScoringResult",
    "train_bradley_terry_model",
]
