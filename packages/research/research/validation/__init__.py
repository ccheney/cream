"""
Data Validation Package

Provides comprehensive validation for research data quality,
backtest configuration, and calibration data.

See: docs/plans/10-research.md - Common Pitfalls & Edge Cases

Example:
    from research.validation import DataValidator

    validator = DataValidator()
    issues = validator.validate_historical_data(
        prices=price_df,
        symbols=["AAPL", "MSFT"],
        start_date="2020-01-01",
        end_date="2023-12-31",
    )

    for issue in issues:
        if issue.severity == ErrorSeverity.CRITICAL:
            raise DataQualityError(issue.message, issue.details)
"""

from .backtest import validate_backtest_config
from .calibration import validate_calibration_data
from .config import ValidationConfig
from .historical import (
    check_anomalies,
    check_data_gaps,
    check_lookahead_bias,
    check_survivorship_bias,
    check_timezone,
    validate_historical_data,
)
from .protocols import CorporateActionProvider, UniverseProvider
from .utils import compute_brier, compute_ece, compute_kl_divergence, to_date
from .validator import DataValidator

__all__ = [
    "CorporateActionProvider",
    "DataValidator",
    "UniverseProvider",
    "ValidationConfig",
    "check_anomalies",
    "check_data_gaps",
    "check_lookahead_bias",
    "check_survivorship_bias",
    "check_timezone",
    "compute_brier",
    "compute_ece",
    "compute_kl_divergence",
    "to_date",
    "validate_backtest_config",
    "validate_calibration_data",
    "validate_historical_data",
]
