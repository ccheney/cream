"""
Evaluator Module - Trading Plan Evaluation

Provides scoring and evaluation of trading plans:
- Rule-based scoring for risk-reward and position sizing
- Bradley-Terry reward model for preference learning
- LLM-based evaluation for qualitative aspects (Phase 12)
- Probability calibration for confidence output
- Synthetic preference generation for training data augmentation
"""

from research.evaluator.bradley_terry import (
    BradleyTerryRewardModel,
    train_bradley_terry_model,
)
from research.evaluator.calibration import (
    CalibrationDriftDetector,
    ProbabilityCalibrator,
)
from research.evaluator.llm_judge import LLMJudge
from research.evaluator.rule_scorer import RuleBasedScorer, ScoringResult
from research.evaluator.synthetic_preferences import (
    MarketContext,
    PreferencePair,
    SyntheticPreferenceGenerator,
    TradeOutcome,
    TradingPlan,
    generate_random_contexts,
)

__all__ = [
    "BradleyTerryRewardModel",
    "CalibrationDriftDetector",
    "LLMJudge",
    "MarketContext",
    "PreferencePair",
    "ProbabilityCalibrator",
    "RuleBasedScorer",
    "ScoringResult",
    "SyntheticPreferenceGenerator",
    "TradeOutcome",
    "TradingPlan",
    "generate_random_contexts",
    "train_bradley_terry_model",
]
