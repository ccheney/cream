"""Execution-related errors for the research layer (backtest and evaluation)."""

from __future__ import annotations

from typing import Any

from .base import ResearchError


class BacktestConfigError(ResearchError):
    """Base exception for backtest configuration issues."""

    pass


class InvalidDateRangeError(BacktestConfigError):
    """Raised when date range is invalid or too short."""

    def __init__(
        self,
        message: str,
        start_date: str | None = None,
        end_date: str | None = None,
        min_days: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        details = details or {}
        if start_date:
            details["start_date"] = start_date
        if end_date:
            details["end_date"] = end_date
        if min_days is not None:
            details["min_days_required"] = min_days
        super().__init__(message, details)


class SlippageConfigError(BacktestConfigError):
    """Raised when slippage configuration is unrealistic."""

    def __init__(
        self,
        message: str,
        configured_value: float | None = None,
        realistic_range: tuple[float, float] | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        details = details or {}
        if configured_value is not None:
            details["configured_value"] = configured_value
        if realistic_range:
            details["realistic_min"] = realistic_range[0]
            details["realistic_max"] = realistic_range[1]
        super().__init__(message, details)


class CommissionConfigError(BacktestConfigError):
    """Raised when commission configuration is incorrect."""

    pass


class ParameterOverfittingWarning(BacktestConfigError):
    """
    Raised when parameter optimization shows signs of overfitting.

    Signs include:
    - In-sample Sharpe >> out-of-sample Sharpe
    - Optimal parameters at grid boundaries
    - Results highly sensitive to parameter changes
    """

    def __init__(
        self,
        message: str,
        in_sample_sharpe: float | None = None,
        out_sample_sharpe: float | None = None,
        degradation_pct: float | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        details = details or {}
        if in_sample_sharpe is not None:
            details["in_sample_sharpe"] = in_sample_sharpe
        if out_sample_sharpe is not None:
            details["out_sample_sharpe"] = out_sample_sharpe
        if degradation_pct is not None:
            details["degradation_pct"] = degradation_pct
        super().__init__(message, details)


class EvaluationError(ResearchError):
    """Base exception for evaluation issues."""

    pass


class ModelNotFittedError(EvaluationError):
    """Raised when attempting to use an unfitted model."""

    pass


class InvalidScoreError(EvaluationError):
    """Raised when score computation produces invalid result."""

    def __init__(
        self,
        message: str,
        score_value: float | None = None,
        expected_range: tuple[float, float] | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        details = details or {}
        if score_value is not None:
            details["score_value"] = score_value
        if expected_range:
            details["expected_min"] = expected_range[0]
            details["expected_max"] = expected_range[1]
        super().__init__(message, details)
