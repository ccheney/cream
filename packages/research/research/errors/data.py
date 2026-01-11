"""Data-related errors for the research layer."""

from __future__ import annotations

from typing import Any

from .base import ResearchError


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
