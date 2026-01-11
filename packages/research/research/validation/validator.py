"""
Data Validator Class

Provides the main DataValidator class that orchestrates all validation
functions with a convenient object-oriented interface.
"""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

import numpy as np
import pandas as pd

from research.errors import (
    CalibrationDriftError,
    CorporateActionError,
    DataAnomalyError,
    DataGapError,
    DataQualityError,
    DistributionShiftError,
    ErrorSeverity,
    InsufficientHistoryError,
    InsufficientSamplesError,
    InvalidDateRangeError,
    LookAheadBiasError,
    ParameterOverfittingWarning,
    ResearchError,
    SlippageConfigError,
    SurvivorshipBiasError,
    TimezoneError,
    ValidationIssue,
)

from .backtest import validate_backtest_config as _validate_backtest
from .calibration import validate_calibration_data as _validate_calibration
from .config import ValidationConfig
from .historical import validate_historical_data as _validate_historical
from .protocols import CorporateActionProvider, UniverseProvider
from .utils import compute_brier, compute_ece, compute_kl_divergence, to_date

if TYPE_CHECKING:
    from collections.abc import Sequence


class DataValidator:
    """
    Comprehensive data validator for research layer.

    Validates:
    - Historical data quality (gaps, anomalies, biases)
    - Backtest configuration (dates, costs, parameters)
    - Calibration data (samples, drift, distribution shift)
    """

    def __init__(
        self,
        config: ValidationConfig | None = None,
        universe_provider: UniverseProvider | None = None,
        corporate_action_provider: CorporateActionProvider | None = None,
    ) -> None:
        """
        Initialize validator.

        Args:
            config: Validation configuration.
            universe_provider: Provider for historical universe data.
            corporate_action_provider: Provider for corporate actions.
        """
        self.config = config or ValidationConfig()
        self.universe_provider = universe_provider
        self.corporate_action_provider = corporate_action_provider

    def validate_historical_data(
        self,
        prices: pd.DataFrame,
        symbols: Sequence[str],
        start_date: date | str,
        end_date: date | str,
        check_survivorship: bool = True,
        check_lookahead: bool = True,
        check_gaps: bool = True,
        check_anomalies: bool = True,
        check_timezone: bool = True,
    ) -> list[ValidationIssue]:
        """
        Validate historical price data for common issues.

        Args:
            prices: DataFrame with columns [date, symbol, open, high, low, close, volume].
            symbols: List of symbols that should be present.
            start_date: Start of the analysis period.
            end_date: End of the analysis period.
            check_survivorship: Check for survivorship bias.
            check_lookahead: Check for look-ahead bias.
            check_gaps: Check for data gaps.
            check_anomalies: Check for price/volume anomalies.
            check_timezone: Check for timezone issues.

        Returns:
            List of validation issues found.
        """
        return _validate_historical(
            prices=prices,
            symbols=symbols,
            start_date=start_date,
            end_date=end_date,
            config=self.config,
            universe_provider=self.universe_provider,
            corporate_action_provider=self.corporate_action_provider,
            check_survivorship=check_survivorship,
            check_lookahead=check_lookahead,
            check_gaps=check_gaps,
            check_anomalies_flag=check_anomalies,
            check_timezone_flag=check_timezone,
        )

    def validate_backtest_config(
        self,
        start_date: date | str,
        end_date: date | str,
        slippage_bps: float | None = None,
        commission_per_share: float | None = None,
        initial_capital: float | None = None,
        in_sample_sharpe: float | None = None,
        out_sample_sharpe: float | None = None,
    ) -> list[ValidationIssue]:
        """
        Validate backtest configuration parameters.

        Args:
            start_date: Backtest start date.
            end_date: Backtest end date.
            slippage_bps: Slippage in basis points.
            commission_per_share: Commission per share.
            initial_capital: Initial portfolio capital.
            in_sample_sharpe: In-sample Sharpe ratio (for overfitting check).
            out_sample_sharpe: Out-of-sample Sharpe ratio (for overfitting check).

        Returns:
            List of validation issues found.
        """
        return _validate_backtest(
            start_date=start_date,
            end_date=end_date,
            config=self.config,
            slippage_bps=slippage_bps,
            commission_per_share=commission_per_share,
            initial_capital=initial_capital,
            in_sample_sharpe=in_sample_sharpe,
            out_sample_sharpe=out_sample_sharpe,
        )

    def validate_calibration_data(
        self,
        predictions: np.ndarray | Sequence[float],
        actuals: np.ndarray | Sequence[int],
        historical_ece: float | None = None,
        historical_brier: float | None = None,
        feature_distributions: dict[str, tuple[np.ndarray, np.ndarray]] | None = None,
    ) -> list[ValidationIssue]:
        """
        Validate calibration data quality.

        Args:
            predictions: Predicted probabilities (0-1).
            actuals: Actual binary outcomes (0 or 1).
            historical_ece: Historical Expected Calibration Error for drift detection.
            historical_brier: Historical Brier score for drift detection.
            feature_distributions: Dict of feature name to (historical, current) distributions.

        Returns:
            List of validation issues found.
        """
        return _validate_calibration(
            predictions=predictions,
            actuals=actuals,
            config=self.config,
            historical_ece=historical_ece,
            historical_brier=historical_brier,
            feature_distributions=feature_distributions,
        )

    def _to_date(self, d: date | str) -> date:
        """Convert string or date to date object."""
        return to_date(d)

    def _compute_ece(
        self,
        predictions: np.ndarray,
        actuals: np.ndarray,
        n_bins: int = 10,
    ) -> float:
        """Compute Expected Calibration Error."""
        return compute_ece(predictions, actuals, n_bins)

    def _compute_brier(
        self,
        predictions: np.ndarray,
        actuals: np.ndarray,
    ) -> float:
        """Compute Brier score."""
        return compute_brier(predictions, actuals)

    def _compute_kl_divergence(
        self,
        p: np.ndarray,
        q: np.ndarray,
        epsilon: float = 1e-10,
    ) -> float:
        """Compute KL divergence between two distributions."""
        return compute_kl_divergence(p, q, epsilon)

    def raise_critical_issues(self, issues: list[ValidationIssue]) -> None:
        """
        Raise exceptions for critical issues.

        Args:
            issues: List of validation issues.

        Raises:
            Appropriate exception based on error type.
        """
        critical = [i for i in issues if i.severity == ErrorSeverity.CRITICAL]

        if not critical:
            return

        issue = critical[0]

        error_map: dict[str, type[ResearchError]] = {
            "SurvivorshipBias": SurvivorshipBiasError,
            "LookAheadBias": LookAheadBiasError,
            "CorporateActionError": CorporateActionError,
            "TimezoneError": TimezoneError,
            "DataGap": DataGapError,
            "DataAnomaly": DataAnomalyError,
            "InvalidDateRange": InvalidDateRangeError,
            "SlippageConfig": SlippageConfigError,
            "ParameterOverfitting": ParameterOverfittingWarning,
            "InsufficientSamples": InsufficientSamplesError,
            "CalibrationDrift": CalibrationDriftError,
            "DistributionShift": DistributionShiftError,
            "InsufficientHistory": InsufficientHistoryError,
        }

        error_cls = error_map.get(issue.error_type, DataQualityError)
        raise error_cls(issue.message, details=issue.details)

    def get_issues_by_severity(
        self,
        issues: list[ValidationIssue],
        severity: ErrorSeverity,
    ) -> list[ValidationIssue]:
        """Filter issues by severity level."""
        return [i for i in issues if i.severity == severity]

    def has_blocking_issues(self, issues: list[ValidationIssue]) -> bool:
        """Check if there are any critical or error-level issues."""
        return any(i.severity in (ErrorSeverity.CRITICAL, ErrorSeverity.ERROR) for i in issues)


__all__ = ["DataValidator"]
