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

from .base import ResearchError
from .data import (
    CalibrationDriftError,
    CalibrationError,
    CorporateActionError,
    DataAnomalyError,
    DataGapError,
    DataQualityError,
    DistributionShiftError,
    EmptyDatasetError,
    InsufficientDataError,
    InsufficientHistoryError,
    InsufficientLiquidityError,
    InsufficientSamplesError,
    LookAheadBiasError,
    SurvivorshipBiasError,
    TimezoneError,
)
from .execution import (
    BacktestConfigError,
    CommissionConfigError,
    EvaluationError,
    InvalidDateRangeError,
    InvalidScoreError,
    ModelNotFittedError,
    ParameterOverfittingWarning,
    SlippageConfigError,
)
from .validation import ErrorSeverity, ValidationIssue

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
