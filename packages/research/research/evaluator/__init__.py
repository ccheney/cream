"""
Evaluator Module - Trading Plan Evaluation

Provides scoring and evaluation of trading plans:
- Rule-based scoring for risk-reward and position sizing
- Bradley-Terry reward model for preference learning
- LLM-based evaluation for qualitative aspects (Phase 12)
- Probability calibration for confidence output
- Synthetic preference generation for training data augmentation
- Pre-execution evaluation with weighted aggregation
- Post-execution evaluation with Brinson-style attribution
- Evaluator training pipeline with four-phase curriculum
- Expected value computation with probability estimation
"""

from research.evaluator.bradley_terry import (
    BradleyTerryRewardModel,
    train_bradley_terry_model,
)
from research.evaluator.calibration import (
    CalibrationDriftDetector,
    ProbabilityCalibrator,
)
from research.evaluator.expected_value import (
    REGIME_WIN_RATE_MODIFIERS,
    EVConfig,
    ExpectedValueCalculator,
    ExpectedValueEstimate,
    MarketRegime,
    compute_expected_value,
    estimate_probabilities,
    estimate_scratch_probability,
)
from research.evaluator.llm_judge import LLMJudge
from research.evaluator.post_execution import (
    Attribution,
    MarketData,
    OutcomeScore,
    PostExecutionEvaluator,
)
from research.evaluator.post_execution import TradeOutcome as ExecutedTradeOutcome
from research.evaluator.pre_execution import (
    DimensionScores,
    PlanScore,
    PreExecutionEvaluator,
)
from research.evaluator.rule_scorer import RuleBasedScorer, ScoringResult
from research.evaluator.synthetic_preferences import (
    MarketContext,
    PreferencePair,
    SyntheticPreferenceGenerator,
    TradeOutcome,
    TradingPlan,
    generate_random_contexts,
)
from research.evaluator.training import (
    EvaluatorTrainingPipeline,
    ExpertAnnotation,
    HistoricalOutcome,
    PhaseProgress,
    TrainingConfig,
    TrainingPhase,
    TrainingResult,
)

__all__ = [
    "Attribution",
    "BradleyTerryRewardModel",
    "CalibrationDriftDetector",
    "DimensionScores",
    "EVConfig",
    "EvaluatorTrainingPipeline",
    "ExecutedTradeOutcome",
    "ExpectedValueCalculator",
    "ExpectedValueEstimate",
    "ExpertAnnotation",
    "HistoricalOutcome",
    "LLMJudge",
    "MarketContext",
    "MarketData",
    "MarketRegime",
    "OutcomeScore",
    "PhaseProgress",
    "PlanScore",
    "PostExecutionEvaluator",
    "PreExecutionEvaluator",
    "PreferencePair",
    "ProbabilityCalibrator",
    "REGIME_WIN_RATE_MODIFIERS",
    "RuleBasedScorer",
    "ScoringResult",
    "SyntheticPreferenceGenerator",
    "TradeOutcome",
    "TradingPlan",
    "TrainingConfig",
    "TrainingPhase",
    "TrainingResult",
    "compute_expected_value",
    "estimate_probabilities",
    "estimate_scratch_probability",
    "generate_random_contexts",
    "train_bradley_terry_model",
]
