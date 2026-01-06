"""Research Package - Analytics & Backtesting for Cream.

This package provides research and backtesting utilities including:
- NautilusTrader integration for strategy backtesting
- VectorBT for portfolio analytics
- Arrow Flight client for bulk data retrieval
- Rule-based evaluator scoring
- Statistical analysis tools
"""

from __future__ import annotations

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


def __getattr__(name: str):
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

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
