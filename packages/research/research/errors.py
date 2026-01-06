"""
Research Layer Error Definitions

Provides a comprehensive error hierarchy for the research layer,
covering data quality issues, backtest configuration problems,
calibration failures, and common edge cases.

See: docs/plans/10-research.md - Common Pitfalls & Edge Cases

Example:
    from research.errors import (
        DataQualityError,
        SurvivorshipBiasError,
        LookAheadBiasError,
    )

    try:
        validate_historical_data(data)
    except SurvivorshipBiasError as e:
        logger.warning(f"Survivorship bias detected: {e}")
    except LookAheadBiasError as e:
        logger.error(f"Look-ahead bias violation: {e}")
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

# ============================================
# Base Exceptions
# ============================================


class ResearchError(Exception):
    """Base exception for all research layer errors."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        """
        Initialize research error.

        Args:
            message: Human-readable error message.
            details: Additional error context.
        """
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "error_type": self.__class__.__name__,
            "message": self.message,
            "details": self.details,
        }


# ============================================
# Data Quality Errors
# ============================================


class DataQualityError(ResearchError):
    """Base exception for data quality issues."""

    pass


class SurvivorshipBiasError(DataQualityError):
    """
    Raised when survivorship bias is detected.

    Survivorship bias occurs when historical analysis only includes
    instruments that survived to the present, ignoring failed/delisted
    companies which can artificially inflate performance metrics.

    Examples:
        - Using current S&P 500 constituents for backtests in 2020
        - Excluding companies that went bankrupt or were acquired
        - Using "clean" datasets that filter out delisted tickers
    """

    def __init__(
        self,
        message: str,
        missing_instruments: list[str] | None = None,
        time_period: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        details = details or {}
        if missing_instruments:
            details["missing_instruments"] = missing_instruments
        if time_period:
            details["time_period"] = time_period
        super().__init__(message, details)


class LookAheadBiasError(DataQualityError):
    """
    Raised when look-ahead bias is detected.

    Look-ahead bias occurs when analysis uses information that was
    not available at the time of the decision, such as:
    - Using restated financials instead of originally reported values
    - Using earnings data before the actual release time
    - Using revised index constituents
    - Using price data adjusted for splits before announcement
    """

    def __init__(
        self,
        message: str,
        data_timestamp: str | None = None,
        decision_timestamp: str | None = None,
        data_type: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        details = details or {}
        if data_timestamp:
            details["data_timestamp"] = data_timestamp
        if decision_timestamp:
            details["decision_timestamp"] = decision_timestamp
        if data_type:
            details["data_type"] = data_type
        super().__init__(message, details)


class CorporateActionError(DataQualityError):
    """
    Raised when corporate action handling is incorrect.

    Corporate actions include splits, dividends, mergers, spinoffs,
    and other events that affect price/volume data. Incorrect handling
    can lead to false signals and inflated returns.
    """

    def __init__(
        self,
        message: str,
        action_type: str | None = None,
        symbol: str | None = None,
        date: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        details = details or {}
        if action_type:
            details["action_type"] = action_type
        if symbol:
            details["symbol"] = symbol
        if date:
            details["date"] = date
        super().__init__(message, details)


class TimezoneError(DataQualityError):
    """
    Raised when timezone handling is inconsistent.

    All data in the system should use UTC. Mixed timezones or
    naive datetime objects can cause incorrect time alignment
    and erroneous trade signals.
    """

    def __init__(
        self,
        message: str,
        expected_tz: str = "UTC",
        actual_tz: str | None = None,
        timestamp: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        details = details or {}
        details["expected_timezone"] = expected_tz
        if actual_tz:
            details["actual_timezone"] = actual_tz
        if timestamp:
            details["timestamp"] = timestamp
        super().__init__(message, details)


class DataGapError(DataQualityError):
    """
    Raised when gaps in data are detected.

    Data gaps can occur due to market holidays, data provider issues,
    or missing records. Undetected gaps can lead to incorrect
    calculations and false signals.
    """

    def __init__(
        self,
        message: str,
        symbol: str | None = None,
        gap_start: str | None = None,
        gap_end: str | None = None,
        expected_records: int | None = None,
        actual_records: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        details = details or {}
        if symbol:
            details["symbol"] = symbol
        if gap_start:
            details["gap_start"] = gap_start
        if gap_end:
            details["gap_end"] = gap_end
        if expected_records is not None:
            details["expected_records"] = expected_records
        if actual_records is not None:
            details["actual_records"] = actual_records
        super().__init__(message, details)


class DataAnomalyError(DataQualityError):
    """
    Raised when anomalies in data are detected.

    Anomalies include price spikes, volume outliers, and
    statistically improbable values that may indicate
    data errors or unusual market conditions.
    """

    def __init__(
        self,
        message: str,
        anomaly_type: str | None = None,
        symbol: str | None = None,
        timestamp: str | None = None,
        value: float | None = None,
        threshold: float | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        details = details or {}
        if anomaly_type:
            details["anomaly_type"] = anomaly_type
        if symbol:
            details["symbol"] = symbol
        if timestamp:
            details["timestamp"] = timestamp
        if value is not None:
            details["value"] = value
        if threshold is not None:
            details["threshold"] = threshold
        super().__init__(message, details)


# ============================================
# Backtest Configuration Errors
# ============================================


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


# ============================================
# Calibration Errors
# ============================================


class CalibrationError(ResearchError):
    """Base exception for calibration issues."""

    pass


class InsufficientSamplesError(CalibrationError):
    """Raised when there are not enough samples for calibration."""

    def __init__(
        self,
        message: str,
        available_samples: int | None = None,
        required_samples: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        details = details or {}
        if available_samples is not None:
            details["available_samples"] = available_samples
        if required_samples is not None:
            details["required_samples"] = required_samples
        super().__init__(message, details)


class CalibrationDriftError(CalibrationError):
    """
    Raised when calibration drift is detected.

    Calibration drift occurs when the relationship between
    predicted probabilities and actual outcomes changes over time,
    making the model's confidence estimates unreliable.
    """

    def __init__(
        self,
        message: str,
        ece_current: float | None = None,
        ece_threshold: float | None = None,
        brier_current: float | None = None,
        brier_threshold: float | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        details = details or {}
        if ece_current is not None:
            details["ece_current"] = ece_current
        if ece_threshold is not None:
            details["ece_threshold"] = ece_threshold
        if brier_current is not None:
            details["brier_current"] = brier_current
        if brier_threshold is not None:
            details["brier_threshold"] = brier_threshold
        super().__init__(message, details)


class DistributionShiftError(CalibrationError):
    """
    Raised when significant distribution shift is detected.

    Distribution shift (covariate shift) occurs when the
    input distribution changes between training and inference,
    potentially degrading model performance.
    """

    def __init__(
        self,
        message: str,
        shift_magnitude: float | None = None,
        affected_features: list[str] | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        details = details or {}
        if shift_magnitude is not None:
            details["shift_magnitude"] = shift_magnitude
        if affected_features:
            details["affected_features"] = affected_features
        super().__init__(message, details)


# ============================================
# Insufficient Data Errors
# ============================================


class InsufficientDataError(ResearchError):
    """Base exception for insufficient data issues."""

    pass


class EmptyDatasetError(InsufficientDataError):
    """Raised when dataset is empty."""

    def __init__(
        self,
        message: str,
        source: str | None = None,
        query: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        details = details or {}
        if source:
            details["source"] = source
        if query:
            details["query"] = query
        super().__init__(message, details)


class InsufficientHistoryError(InsufficientDataError):
    """Raised when there's not enough historical data."""

    def __init__(
        self,
        message: str,
        symbol: str | None = None,
        available_days: int | None = None,
        required_days: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        details = details or {}
        if symbol:
            details["symbol"] = symbol
        if available_days is not None:
            details["available_days"] = available_days
        if required_days is not None:
            details["required_days"] = required_days
        super().__init__(message, details)


class InsufficientLiquidityError(InsufficientDataError):
    """Raised when liquidity data is insufficient for analysis."""

    def __init__(
        self,
        message: str,
        symbol: str | None = None,
        avg_volume: float | None = None,
        min_volume: float | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        details = details or {}
        if symbol:
            details["symbol"] = symbol
        if avg_volume is not None:
            details["avg_volume"] = avg_volume
        if min_volume is not None:
            details["min_volume_required"] = min_volume
        super().__init__(message, details)


# ============================================
# Evaluation Errors
# ============================================


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


# ============================================
# Error Severity Levels
# ============================================


class ErrorSeverity(Enum):
    """Severity level for research errors."""

    WARNING = "warning"
    """Minor issue that should be logged but doesn't block execution."""

    ERROR = "error"
    """Significant issue that may affect results quality."""

    CRITICAL = "critical"
    """Severe issue that should block execution."""


@dataclass
class ValidationIssue:
    """A single validation issue found during data quality checks."""

    severity: ErrorSeverity
    """Severity level of the issue."""

    error_type: str
    """Error type identifier."""

    message: str
    """Human-readable description."""

    details: dict[str, Any] = field(default_factory=dict)
    """Additional context."""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "severity": self.severity.value,
            "error_type": self.error_type,
            "message": self.message,
            "details": self.details,
        }


# ============================================
# Module Exports
# ============================================


__all__ = [
    "BacktestConfigError",
    "CalibrationDriftError",
    "CalibrationError",
    "CommissionConfigError",
    "CorporateActionError",
    "DataAnomalyError",
    "DataGapError",
    "DataQualityError",
    "DistributionShiftError",
    "EmptyDatasetError",
    "ErrorSeverity",
    "EvaluationError",
    "InsufficientDataError",
    "InsufficientHistoryError",
    "InsufficientLiquidityError",
    "InsufficientSamplesError",
    "InvalidDateRangeError",
    "InvalidScoreError",
    "LookAheadBiasError",
    "ModelNotFittedError",
    "ParameterOverfittingWarning",
    "ResearchError",
    "SlippageConfigError",
    "SurvivorshipBiasError",
    "TimezoneError",
    "ValidationIssue",
]
