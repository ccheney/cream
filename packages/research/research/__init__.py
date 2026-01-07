"""Research Package - Analytics & Backtesting for Cream.

This package provides research and backtesting utilities including:
- NautilusTrader integration for strategy backtesting
- VectorBT for portfolio analytics
- Arrow Flight client for bulk data retrieval
- Rule-based evaluator scoring
- Statistical analysis tools
"""

from __future__ import annotations

from typing import Any

__version__ = "0.1.0"

# Lazy imports to avoid requiring all dependencies
__all__ = [
    # Flight client (requires polars, pyarrow)
    "ArrowFlightClient",
    "FlightClientConfig",
    "FlightError",
    "create_flight_client",
    # Evaluator (no external dependencies)
    "RuleBasedScorer",
    "ScoringResult",
    # Findings (dataclasses)
    "ResearchFinding",
    "PerformanceMetrics",
    "StrategyCondition",
    "ParameterScanConfig",
    "ScanResult",
    # Vectorbt runner
    "VectorbtRunner",
    "StrategyBase",
    "RSIMeanReversionStrategy",
    "SMACrossoverStrategy",
    "BollingerBandStrategy",
    # NautilusTrader runner
    "NautilusRunner",
    "NautilusConfig",
    "FillModelConfig",
    "CommissionConfig",
    "BacktestResult",
    "quick_backtest",
    # Research factors (requires polars)
    "ResearchFactor",
    "FactorMetadata",
    "RegularizationMetrics",
    # Originality checking
    "check_originality",
    "check_originality_batch",
    "subtree_similarity",
    "compute_factor_hash",
    # Hypothesis alignment (requires google-generativeai)
    "Hypothesis",
    "AlignmentResult",
    "HypothesisAlignmentEvaluator",
    "MockHypothesisAlignmentEvaluator",
    "compute_full_regularization",
    # Equivalence testing (requires polars, numpy)
    "EquivalenceValidator",
    "EquivalenceTestResult",
    "compare_outputs",
    # Feedback loop (requires polars, numpy)
    "ValidationFeedback",
    "FeedbackConfig",
    "FeedbackGenerator",
    "RefinementOrchestrator",
    # Translation (requires polars, numpy)
    "TranslationContext",
    "TranslationResult",
    "TranslationConfig",
    "TranslationOrchestrator",
    "generate_typescript_template",
    # Errors (no external dependencies)
    "ResearchError",
    "DataQualityError",
    "SurvivorshipBiasError",
    "LookAheadBiasError",
    "CorporateActionError",
    "TimezoneError",
    "DataGapError",
    "DataAnomalyError",
    "BacktestConfigError",
    "InvalidDateRangeError",
    "SlippageConfigError",
    "CommissionConfigError",
    "ParameterOverfittingWarning",
    "CalibrationError",
    "InsufficientSamplesError",
    "CalibrationDriftError",
    "DistributionShiftError",
    "InsufficientDataError",
    "EmptyDatasetError",
    "InsufficientHistoryError",
    "InsufficientLiquidityError",
    "EvaluationError",
    "ModelNotFittedError",
    "InvalidScoreError",
    "ErrorSeverity",
    "ValidationIssue",
    # Validation (requires pandas, numpy)
    "DataValidator",
    "ValidationConfig",
    "UniverseProvider",
    "CorporateActionProvider",
]


def __getattr__(name: str) -> Any:
    """Lazy import of optional dependencies."""
    if name in ("ArrowFlightClient", "FlightClientConfig", "FlightError", "create_flight_client"):
        from research.flight_client import (
            ArrowFlightClient,
            FlightClientConfig,
            FlightError,
            create_flight_client,
        )

        return {
            "ArrowFlightClient": ArrowFlightClient,
            "FlightClientConfig": FlightClientConfig,
            "FlightError": FlightError,
            "create_flight_client": create_flight_client,
        }[name]

    if name in ("RuleBasedScorer", "ScoringResult"):
        from research.evaluator.rule_scorer import RuleBasedScorer, ScoringResult

        return {"RuleBasedScorer": RuleBasedScorer, "ScoringResult": ScoringResult}[name]

    if name in (
        "ResearchFinding",
        "PerformanceMetrics",
        "StrategyCondition",
        "ParameterScanConfig",
        "ScanResult",
    ):
        from research.findings import (
            ParameterScanConfig,
            PerformanceMetrics,
            ResearchFinding,
            ScanResult,
            StrategyCondition,
        )

        return {
            "ResearchFinding": ResearchFinding,
            "PerformanceMetrics": PerformanceMetrics,
            "StrategyCondition": StrategyCondition,
            "ParameterScanConfig": ParameterScanConfig,
            "ScanResult": ScanResult,
        }[name]

    if name in (
        "VectorbtRunner",
        "StrategyBase",
        "RSIMeanReversionStrategy",
        "SMACrossoverStrategy",
        "BollingerBandStrategy",
    ):
        from research.vectorbt_runner import (
            BollingerBandStrategy,
            RSIMeanReversionStrategy,
            SMACrossoverStrategy,
            StrategyBase,
            VectorbtRunner,
        )

        return {
            "VectorbtRunner": VectorbtRunner,
            "StrategyBase": StrategyBase,
            "RSIMeanReversionStrategy": RSIMeanReversionStrategy,
            "SMACrossoverStrategy": SMACrossoverStrategy,
            "BollingerBandStrategy": BollingerBandStrategy,
        }[name]

    if name in (
        "NautilusRunner",
        "NautilusConfig",
        "FillModelConfig",
        "CommissionConfig",
        "BacktestResult",
        "quick_backtest",
    ):
        from research.nautilus_runner import (
            BacktestResult,
            CommissionConfig,
            FillModelConfig,
            NautilusConfig,
            NautilusRunner,
            quick_backtest,
        )

        return {
            "NautilusRunner": NautilusRunner,
            "NautilusConfig": NautilusConfig,
            "FillModelConfig": FillModelConfig,
            "CommissionConfig": CommissionConfig,
            "BacktestResult": BacktestResult,
            "quick_backtest": quick_backtest,
        }[name]

    # Errors module
    error_exports = (
        "ResearchError",
        "DataQualityError",
        "SurvivorshipBiasError",
        "LookAheadBiasError",
        "CorporateActionError",
        "TimezoneError",
        "DataGapError",
        "DataAnomalyError",
        "BacktestConfigError",
        "InvalidDateRangeError",
        "SlippageConfigError",
        "CommissionConfigError",
        "ParameterOverfittingWarning",
        "CalibrationError",
        "InsufficientSamplesError",
        "CalibrationDriftError",
        "DistributionShiftError",
        "InsufficientDataError",
        "EmptyDatasetError",
        "InsufficientHistoryError",
        "InsufficientLiquidityError",
        "EvaluationError",
        "ModelNotFittedError",
        "InvalidScoreError",
        "ErrorSeverity",
        "ValidationIssue",
    )
    if name in error_exports:
        from research import errors

        return getattr(errors, name)

    # Validation module
    validation_exports = (
        "DataValidator",
        "ValidationConfig",
        "UniverseProvider",
        "CorporateActionProvider",
    )
    if name in validation_exports:
        from research import validation

        return getattr(validation, name)

    # Research factors (strategies)
    if name in ("ResearchFactor", "FactorMetadata", "RegularizationMetrics"):
        from research.strategies.base import (
            FactorMetadata,
            RegularizationMetrics,
            ResearchFactor,
        )

        return {
            "ResearchFactor": ResearchFactor,
            "FactorMetadata": FactorMetadata,
            "RegularizationMetrics": RegularizationMetrics,
        }[name]

    # Originality checking
    if name in (
        "check_originality",
        "check_originality_batch",
        "subtree_similarity",
        "compute_factor_hash",
    ):
        from research.originality import (
            check_originality,
            check_originality_batch,
            compute_factor_hash,
            subtree_similarity,
        )

        return {
            "check_originality": check_originality,
            "check_originality_batch": check_originality_batch,
            "subtree_similarity": subtree_similarity,
            "compute_factor_hash": compute_factor_hash,
        }[name]

    # Hypothesis alignment
    if name in (
        "Hypothesis",
        "AlignmentResult",
        "HypothesisAlignmentEvaluator",
        "MockHypothesisAlignmentEvaluator",
        "compute_full_regularization",
    ):
        from research.hypothesis_alignment import (
            AlignmentResult,
            Hypothesis,
            HypothesisAlignmentEvaluator,
            MockHypothesisAlignmentEvaluator,
            compute_full_regularization,
        )

        return {
            "Hypothesis": Hypothesis,
            "AlignmentResult": AlignmentResult,
            "HypothesisAlignmentEvaluator": HypothesisAlignmentEvaluator,
            "MockHypothesisAlignmentEvaluator": MockHypothesisAlignmentEvaluator,
            "compute_full_regularization": compute_full_regularization,
        }[name]

    # Equivalence testing
    if name in ("EquivalenceValidator", "EquivalenceTestResult", "compare_outputs"):
        from research.equivalence import (
            EquivalenceTestResult,
            EquivalenceValidator,
            compare_outputs,
        )

        return {
            "EquivalenceValidator": EquivalenceValidator,
            "EquivalenceTestResult": EquivalenceTestResult,
            "compare_outputs": compare_outputs,
        }[name]

    # Feedback loop
    if name in (
        "ValidationFeedback",
        "FeedbackConfig",
        "FeedbackGenerator",
        "RefinementOrchestrator",
    ):
        from research.feedback import (
            FeedbackConfig,
            FeedbackGenerator,
            RefinementOrchestrator,
            ValidationFeedback,
        )

        return {
            "ValidationFeedback": ValidationFeedback,
            "FeedbackConfig": FeedbackConfig,
            "FeedbackGenerator": FeedbackGenerator,
            "RefinementOrchestrator": RefinementOrchestrator,
        }[name]

    # Translation
    if name in (
        "TranslationContext",
        "TranslationResult",
        "TranslationConfig",
        "TranslationOrchestrator",
        "generate_typescript_template",
    ):
        from research.translation import (
            TranslationConfig,
            TranslationContext,
            TranslationOrchestrator,
            TranslationResult,
            generate_typescript_template,
        )

        return {
            "TranslationContext": TranslationContext,
            "TranslationResult": TranslationResult,
            "TranslationConfig": TranslationConfig,
            "TranslationOrchestrator": TranslationOrchestrator,
            "generate_typescript_template": generate_typescript_template,
        }[name]

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
