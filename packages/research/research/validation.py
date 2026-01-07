"""
Data Validation Module

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

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import TYPE_CHECKING, Any, Protocol

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

if TYPE_CHECKING:
    from collections.abc import Sequence


# ============================================
# Configuration
# ============================================


@dataclass
class ValidationConfig:
    """Configuration for data validation."""

    # Survivorship bias checks
    min_history_days: int = 252
    """Minimum trading days of history required."""

    max_missing_symbols_pct: float = 0.1
    """Maximum percentage of symbols that can be missing from universe."""

    # Look-ahead bias checks
    earnings_blackout_hours: int = 4
    """Hours before earnings when data should be suspect."""

    corporate_action_lag_days: int = 1
    """Days after corporate action before adjusted data is reliable."""

    # Data gap checks
    max_gap_days: int = 5
    """Maximum consecutive missing days before flagging."""

    expected_trading_days_per_year: int = 252
    """Expected number of trading days per year."""

    # Anomaly detection
    price_change_threshold: float = 0.5
    """Maximum single-day price change (50% = 0.5) before flagging."""

    volume_spike_threshold: float = 10.0
    """Volume spike threshold as multiple of average."""

    zscore_threshold: float = 5.0
    """Z-score threshold for anomaly detection."""

    # Backtest configuration
    min_backtest_days: int = 252
    """Minimum days for a valid backtest."""

    realistic_slippage_range: tuple[float, float] = (0.0001, 0.01)
    """Realistic slippage range (0.01% to 1%)."""

    realistic_commission_range: tuple[float, float] = (0.0, 0.01)
    """Realistic commission range (0 to $0.01 per share)."""

    # Calibration checks
    min_calibration_samples: int = 100
    """Minimum samples for calibration."""

    ece_threshold: float = 0.1
    """Expected Calibration Error threshold."""

    brier_threshold: float = 0.25
    """Brier score threshold."""

    distribution_shift_threshold: float = 0.1
    """KL divergence threshold for distribution shift."""

    # Overfitting detection
    sharpe_degradation_threshold: float = 0.5
    """Maximum allowed Sharpe ratio degradation (50%)."""


# ============================================
# Protocols
# ============================================


class UniverseProvider(Protocol):
    """Protocol for providing historical universe constituents."""

    def get_constituents(self, as_of_date: date) -> set[str]:
        """Get universe constituents as of a specific date."""
        ...


class CorporateActionProvider(Protocol):
    """Protocol for providing corporate action data."""

    def get_actions(
        self,
        symbol: str,
        start_date: date,
        end_date: date,
    ) -> list[dict[str, Any]]:
        """Get corporate actions for a symbol in date range."""
        ...


# ============================================
# Data Validator
# ============================================


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

    # ============================================
    # Historical Data Validation
    # ============================================

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
        issues: list[ValidationIssue] = []

        # Normalize dates
        start = self._to_date(start_date)
        end = self._to_date(end_date)

        if check_survivorship:
            issues.extend(self._check_survivorship_bias(prices, symbols, start, end))

        if check_lookahead:
            issues.extend(self._check_lookahead_bias(prices, symbols, start, end))

        if check_gaps:
            issues.extend(self._check_data_gaps(prices, symbols, start, end))

        if check_anomalies:
            issues.extend(self._check_anomalies(prices, symbols))

        if check_timezone:
            issues.extend(self._check_timezone(prices))

        return issues

    def _check_survivorship_bias(
        self,
        prices: pd.DataFrame,
        symbols: Sequence[str],
        start_date: date,
        _end_date: date,
    ) -> list[ValidationIssue]:
        """Check for survivorship bias in the data."""
        issues: list[ValidationIssue] = []

        # Check if we have universe provider for historical constituents
        if self.universe_provider is not None:
            historical_universe = self.universe_provider.get_constituents(start_date)
            current_symbols = set(symbols)

            # Find symbols in current list that weren't in historical universe
            new_symbols = current_symbols - historical_universe
            if new_symbols:
                issues.append(
                    ValidationIssue(
                        severity=ErrorSeverity.WARNING,
                        error_type="SurvivorshipBiasWarning",
                        message=(
                            f"Found {len(new_symbols)} symbols in current universe "
                            f"that weren't constituents on {start_date}"
                        ),
                        details={
                            "new_symbols": list(new_symbols)[:10],
                            "total_new": len(new_symbols),
                        },
                    )
                )

            # Find symbols that were delisted (in historical but not current)
            delisted = historical_universe - current_symbols
            if delisted:
                missing_pct = len(delisted) / len(historical_universe)
                severity = (
                    ErrorSeverity.ERROR
                    if missing_pct > self.config.max_missing_symbols_pct
                    else ErrorSeverity.WARNING
                )
                issues.append(
                    ValidationIssue(
                        severity=severity,
                        error_type="SurvivorshipBias",
                        message=(
                            f"Missing {len(delisted)} symbols ({missing_pct:.1%}) "
                            f"that were in universe on {start_date}"
                        ),
                        details={
                            "delisted_symbols": list(delisted)[:10],
                            "total_delisted": len(delisted),
                            "missing_pct": missing_pct,
                        },
                    )
                )

        # Check for symbols with insufficient history
        if "date" in prices.columns and "symbol" in prices.columns:
            for symbol in symbols:
                symbol_data = prices[prices["symbol"] == symbol]
                if len(symbol_data) < self.config.min_history_days:
                    issues.append(
                        ValidationIssue(
                            severity=ErrorSeverity.WARNING,
                            error_type="InsufficientHistory",
                            message=(
                                f"Symbol {symbol} has only {len(symbol_data)} days "
                                f"of history (minimum: {self.config.min_history_days})"
                            ),
                            details={
                                "symbol": symbol,
                                "available_days": len(symbol_data),
                                "required_days": self.config.min_history_days,
                            },
                        )
                    )

        return issues

    def _check_lookahead_bias(
        self,
        prices: pd.DataFrame,
        symbols: Sequence[str],
        start_date: date,
        end_date: date,
    ) -> list[ValidationIssue]:
        """Check for look-ahead bias in the data."""
        issues: list[ValidationIssue] = []

        # Check for corporate actions that might cause look-ahead bias
        if self.corporate_action_provider is not None:
            for symbol in symbols:
                actions = self.corporate_action_provider.get_actions(symbol, start_date, end_date)
                for action in actions:
                    action_date = action.get("date")
                    action_type = action.get("type", "unknown")

                    # Check if data around corporate actions looks suspicious
                    # (e.g., perfectly adjusted prices before announcement)
                    if action_date and action_type in ("split", "dividend", "merger"):
                        issues.append(
                            ValidationIssue(
                                severity=ErrorSeverity.WARNING,
                                error_type="CorporateActionWarning",
                                message=(
                                    f"Corporate action ({action_type}) for {symbol} "
                                    f"on {action_date} - verify data is point-in-time"
                                ),
                                details={
                                    "symbol": symbol,
                                    "action_type": action_type,
                                    "action_date": str(action_date),
                                    "lag_days": self.config.corporate_action_lag_days,
                                },
                            )
                        )

        # Check for future data leakage in timestamps
        if "timestamp" in prices.columns:
            # Check if any timestamps are in the future relative to 'date' column
            if "date" in prices.columns:
                prices_copy = prices.copy()
                prices_copy["date_dt"] = pd.to_datetime(prices_copy["date"])
                prices_copy["ts_dt"] = pd.to_datetime(prices_copy["timestamp"])

                future_data = prices_copy[prices_copy["ts_dt"] > prices_copy["date_dt"]]
                if not future_data.empty:
                    issues.append(
                        ValidationIssue(
                            severity=ErrorSeverity.CRITICAL,
                            error_type="LookAheadBias",
                            message=(
                                f"Found {len(future_data)} records with timestamps "
                                "after their date - possible look-ahead bias"
                            ),
                            details={
                                "affected_records": len(future_data),
                                "sample_symbols": future_data["symbol"].unique()[:5].tolist()
                                if "symbol" in future_data.columns
                                else [],
                            },
                        )
                    )

        return issues

    def _check_data_gaps(
        self,
        prices: pd.DataFrame,
        symbols: Sequence[str],
        start_date: date,
        end_date: date,
    ) -> list[ValidationIssue]:
        """Check for gaps in the data."""
        issues: list[ValidationIssue] = []

        if "date" not in prices.columns or "symbol" not in prices.columns:
            return issues

        # Generate expected trading days (simplified - weekdays)
        all_days = pd.date_range(start=start_date, end=end_date, freq="B")
        expected_days = len(all_days)

        for symbol in symbols:
            symbol_data = prices[prices["symbol"] == symbol]
            if symbol_data.empty:
                issues.append(
                    ValidationIssue(
                        severity=ErrorSeverity.ERROR,
                        error_type="DataGap",
                        message=f"No data found for symbol {symbol}",
                        details={"symbol": symbol, "expected_days": expected_days},
                    )
                )
                continue

            symbol_dates = pd.to_datetime(symbol_data["date"]).dt.date
            unique_dates = set(symbol_dates)

            # Check for missing days
            missing_count = expected_days - len(unique_dates)
            if missing_count > 0:
                # Check for consecutive gaps
                sorted_dates = sorted(unique_dates)
                max_gap = 0
                gap_start = None
                gap_end = None

                for i in range(1, len(sorted_dates)):
                    gap = (sorted_dates[i] - sorted_dates[i - 1]).days
                    if gap > max_gap:
                        max_gap = gap
                        gap_start = sorted_dates[i - 1]
                        gap_end = sorted_dates[i]

                if max_gap > self.config.max_gap_days:
                    issues.append(
                        ValidationIssue(
                            severity=ErrorSeverity.ERROR,
                            error_type="DataGap",
                            message=(
                                f"Found {max_gap}-day gap in {symbol} data "
                                f"from {gap_start} to {gap_end}"
                            ),
                            details={
                                "symbol": symbol,
                                "gap_days": max_gap,
                                "gap_start": str(gap_start),
                                "gap_end": str(gap_end),
                                "total_missing": missing_count,
                            },
                        )
                    )
                elif missing_count > expected_days * 0.1:  # >10% missing
                    issues.append(
                        ValidationIssue(
                            severity=ErrorSeverity.WARNING,
                            error_type="DataGap",
                            message=(
                                f"Symbol {symbol} missing {missing_count} days "
                                f"({missing_count / expected_days:.1%})"
                            ),
                            details={
                                "symbol": symbol,
                                "missing_days": missing_count,
                                "expected_days": expected_days,
                                "actual_days": len(unique_dates),
                            },
                        )
                    )

        return issues

    def _check_anomalies(
        self,
        prices: pd.DataFrame,
        symbols: Sequence[str],
    ) -> list[ValidationIssue]:
        """Check for price and volume anomalies."""
        issues: list[ValidationIssue] = []

        if "close" not in prices.columns:
            return issues

        for symbol in symbols:
            if "symbol" in prices.columns:
                symbol_data = prices[prices["symbol"] == symbol].copy()
            else:
                symbol_data = prices.copy()

            if len(symbol_data) < 2:
                continue

            # Sort by date
            if "date" in symbol_data.columns:
                symbol_data = symbol_data.sort_values("date")

            # Check for extreme price changes
            symbol_data["pct_change"] = symbol_data["close"].pct_change()
            extreme_changes = symbol_data[
                symbol_data["pct_change"].abs() > self.config.price_change_threshold
            ]

            for _, row in extreme_changes.iterrows():
                issues.append(
                    ValidationIssue(
                        severity=ErrorSeverity.WARNING,
                        error_type="DataAnomaly",
                        message=(f"Extreme price change of {row['pct_change']:.1%} for {symbol}"),
                        details={
                            "symbol": symbol,
                            "date": str(row.get("date", "unknown")),
                            "pct_change": float(row["pct_change"]),
                            "close": float(row["close"]),
                            "threshold": self.config.price_change_threshold,
                        },
                    )
                )

            # Check for volume spikes
            if "volume" in symbol_data.columns:
                avg_volume = symbol_data["volume"].mean()
                if avg_volume > 0:
                    volume_spikes = symbol_data[
                        symbol_data["volume"] > avg_volume * self.config.volume_spike_threshold
                    ]
                    for _, row in volume_spikes.iterrows():
                        issues.append(
                            ValidationIssue(
                                severity=ErrorSeverity.WARNING,
                                error_type="DataAnomaly",
                                message=(
                                    f"Volume spike ({row['volume'] / avg_volume:.1f}x average) "
                                    f"for {symbol}"
                                ),
                                details={
                                    "symbol": symbol,
                                    "date": str(row.get("date", "unknown")),
                                    "volume": int(row["volume"]),
                                    "avg_volume": int(avg_volume),
                                    "multiple": float(row["volume"] / avg_volume),
                                },
                            )
                        )

            # Check for negative prices
            negative_prices = symbol_data[symbol_data["close"] <= 0]
            if not negative_prices.empty:
                issues.append(
                    ValidationIssue(
                        severity=ErrorSeverity.CRITICAL,
                        error_type="DataAnomaly",
                        message=f"Found {len(negative_prices)} negative/zero prices for {symbol}",
                        details={
                            "symbol": symbol,
                            "count": len(negative_prices),
                        },
                    )
                )

        return issues

    def _check_timezone(self, prices: pd.DataFrame) -> list[ValidationIssue]:
        """Check for timezone issues in the data."""
        issues: list[ValidationIssue] = []

        # Check timestamp column for timezone awareness
        if "timestamp" in prices.columns:
            sample_ts = prices["timestamp"].iloc[0] if len(prices) > 0 else None
            if sample_ts is not None:
                if isinstance(sample_ts, datetime):
                    if sample_ts.tzinfo is None:
                        issues.append(
                            ValidationIssue(
                                severity=ErrorSeverity.WARNING,
                                error_type="TimezoneWarning",
                                message="Timestamps are timezone-naive - should be UTC",
                                details={"sample_timestamp": str(sample_ts)},
                            )
                        )
                    elif str(sample_ts.tzinfo) != "UTC":
                        issues.append(
                            ValidationIssue(
                                severity=ErrorSeverity.WARNING,
                                error_type="TimezoneWarning",
                                message=(
                                    f"Timestamps use {sample_ts.tzinfo} timezone - should be UTC"
                                ),
                                details={
                                    "actual_timezone": str(sample_ts.tzinfo),
                                    "expected_timezone": "UTC",
                                },
                            )
                        )

        return issues

    # ============================================
    # Backtest Configuration Validation
    # ============================================

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
        issues: list[ValidationIssue] = []

        start = self._to_date(start_date)
        end = self._to_date(end_date)

        # Check date range
        if end <= start:
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.CRITICAL,
                    error_type="InvalidDateRange",
                    message="End date must be after start date",
                    details={"start_date": str(start), "end_date": str(end)},
                )
            )
        else:
            days = (end - start).days
            trading_days = int(days * (252 / 365))  # Approximate trading days

            if trading_days < self.config.min_backtest_days:
                issues.append(
                    ValidationIssue(
                        severity=ErrorSeverity.ERROR,
                        error_type="InvalidDateRange",
                        message=(
                            f"Backtest period too short: ~{trading_days} trading days "
                            f"(minimum: {self.config.min_backtest_days})"
                        ),
                        details={
                            "calendar_days": days,
                            "estimated_trading_days": trading_days,
                            "min_required": self.config.min_backtest_days,
                        },
                    )
                )

        # Check slippage configuration
        if slippage_bps is not None:
            slippage_pct = slippage_bps / 10000
            min_slip, max_slip = self.config.realistic_slippage_range

            if slippage_pct < min_slip:
                issues.append(
                    ValidationIssue(
                        severity=ErrorSeverity.WARNING,
                        error_type="SlippageConfig",
                        message=(
                            f"Slippage {slippage_bps:.1f}bps may be too low - "
                            "results may be unrealistically optimistic"
                        ),
                        details={
                            "configured_bps": slippage_bps,
                            "realistic_min_bps": min_slip * 10000,
                            "realistic_max_bps": max_slip * 10000,
                        },
                    )
                )
            elif slippage_pct > max_slip:
                issues.append(
                    ValidationIssue(
                        severity=ErrorSeverity.WARNING,
                        error_type="SlippageConfig",
                        message=(
                            f"Slippage {slippage_bps:.1f}bps is unusually high - "
                            "verify this is intentional"
                        ),
                        details={
                            "configured_bps": slippage_bps,
                            "realistic_min_bps": min_slip * 10000,
                            "realistic_max_bps": max_slip * 10000,
                        },
                    )
                )

        # Check commission configuration
        if commission_per_share is not None:
            min_comm, max_comm = self.config.realistic_commission_range
            if commission_per_share > max_comm:
                issues.append(
                    ValidationIssue(
                        severity=ErrorSeverity.WARNING,
                        error_type="CommissionConfig",
                        message=(
                            f"Commission ${commission_per_share:.4f}/share is high - "
                            "most brokers are commission-free"
                        ),
                        details={
                            "configured": commission_per_share,
                            "realistic_max": max_comm,
                        },
                    )
                )

        # Check for overfitting
        if in_sample_sharpe is not None and out_sample_sharpe is not None:
            if in_sample_sharpe > 0:
                degradation = 1 - (out_sample_sharpe / in_sample_sharpe)
                if degradation > self.config.sharpe_degradation_threshold:
                    issues.append(
                        ValidationIssue(
                            severity=ErrorSeverity.ERROR,
                            error_type="ParameterOverfitting",
                            message=(
                                f"Sharpe ratio degraded {degradation:.1%} out-of-sample - "
                                "likely overfitting"
                            ),
                            details={
                                "in_sample_sharpe": in_sample_sharpe,
                                "out_sample_sharpe": out_sample_sharpe,
                                "degradation_pct": degradation,
                                "threshold": self.config.sharpe_degradation_threshold,
                            },
                        )
                    )

        # Check initial capital
        if initial_capital is not None and initial_capital <= 0:
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.CRITICAL,
                    error_type="InvalidConfig",
                    message="Initial capital must be positive",
                    details={"initial_capital": initial_capital},
                )
            )

        return issues

    # ============================================
    # Calibration Data Validation
    # ============================================

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
        issues: list[ValidationIssue] = []

        predictions = np.asarray(predictions)
        actuals = np.asarray(actuals)

        # Check sample size
        n_samples = len(predictions)
        if n_samples < self.config.min_calibration_samples:
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.ERROR,
                    error_type="InsufficientSamples",
                    message=(
                        f"Only {n_samples} samples for calibration "
                        f"(minimum: {self.config.min_calibration_samples})"
                    ),
                    details={
                        "available_samples": n_samples,
                        "required_samples": self.config.min_calibration_samples,
                    },
                )
            )

        # Check prediction range
        if predictions.min() < 0 or predictions.max() > 1:
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.CRITICAL,
                    error_type="InvalidPredictions",
                    message="Predictions must be in range [0, 1]",
                    details={
                        "min_prediction": float(predictions.min()),
                        "max_prediction": float(predictions.max()),
                    },
                )
            )

        # Check actuals are binary
        unique_actuals = np.unique(actuals)
        if not np.all(np.isin(unique_actuals, [0, 1])):
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.CRITICAL,
                    error_type="InvalidActuals",
                    message="Actuals must be binary (0 or 1)",
                    details={"unique_values": unique_actuals.tolist()},
                )
            )

        # Check class balance
        positive_rate = actuals.mean()
        if positive_rate < 0.05 or positive_rate > 0.95:
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.WARNING,
                    error_type="ClassImbalance",
                    message=(f"Severe class imbalance: {positive_rate:.1%} positive rate"),
                    details={"positive_rate": float(positive_rate)},
                )
            )

        # Calculate current ECE and Brier score
        current_ece = self._compute_ece(predictions, actuals)
        current_brier = self._compute_brier(predictions, actuals)

        # Check calibration thresholds
        if current_ece > self.config.ece_threshold:
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.WARNING,
                    error_type="PoorCalibration",
                    message=(
                        f"ECE {current_ece:.3f} exceeds threshold ({self.config.ece_threshold})"
                    ),
                    details={
                        "current_ece": current_ece,
                        "threshold": self.config.ece_threshold,
                    },
                )
            )

        if current_brier > self.config.brier_threshold:
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.WARNING,
                    error_type="PoorCalibration",
                    message=(
                        f"Brier score {current_brier:.3f} exceeds threshold "
                        f"({self.config.brier_threshold})"
                    ),
                    details={
                        "current_brier": current_brier,
                        "threshold": self.config.brier_threshold,
                    },
                )
            )

        # Check for calibration drift
        if historical_ece is not None:
            ece_drift = current_ece - historical_ece
            if ece_drift > self.config.ece_threshold:
                issues.append(
                    ValidationIssue(
                        severity=ErrorSeverity.ERROR,
                        error_type="CalibrationDrift",
                        message=(f"ECE increased by {ece_drift:.3f} from historical baseline"),
                        details={
                            "historical_ece": historical_ece,
                            "current_ece": current_ece,
                            "drift": ece_drift,
                        },
                    )
                )

        if historical_brier is not None:
            brier_drift = current_brier - historical_brier
            if brier_drift > self.config.brier_threshold / 2:
                issues.append(
                    ValidationIssue(
                        severity=ErrorSeverity.ERROR,
                        error_type="CalibrationDrift",
                        message=(f"Brier score increased by {brier_drift:.3f} from baseline"),
                        details={
                            "historical_brier": historical_brier,
                            "current_brier": current_brier,
                            "drift": brier_drift,
                        },
                    )
                )

        # Check for distribution shift
        if feature_distributions:
            for feature_name, (hist_dist, curr_dist) in feature_distributions.items():
                kl_div = self._compute_kl_divergence(hist_dist, curr_dist)
                if kl_div > self.config.distribution_shift_threshold:
                    issues.append(
                        ValidationIssue(
                            severity=ErrorSeverity.WARNING,
                            error_type="DistributionShift",
                            message=(
                                f"Distribution shift detected in '{feature_name}' "
                                f"(KL divergence: {kl_div:.3f})"
                            ),
                            details={
                                "feature": feature_name,
                                "kl_divergence": kl_div,
                                "threshold": self.config.distribution_shift_threshold,
                            },
                        )
                    )

        return issues

    # ============================================
    # Utility Methods
    # ============================================

    def _to_date(self, d: date | str) -> date:
        """Convert string or date to date object."""
        if isinstance(d, str):
            return datetime.strptime(d, "%Y-%m-%d").date()
        return d

    def _compute_ece(
        self,
        predictions: np.ndarray,
        actuals: np.ndarray,
        n_bins: int = 10,
    ) -> float:
        """Compute Expected Calibration Error."""
        bin_boundaries = np.linspace(0, 1, n_bins + 1)
        ece = 0.0

        for i in range(n_bins):
            mask = (predictions >= bin_boundaries[i]) & (predictions < bin_boundaries[i + 1])
            if i == n_bins - 1:  # Include right boundary in last bin
                mask = (predictions >= bin_boundaries[i]) & (predictions <= bin_boundaries[i + 1])

            if mask.sum() > 0:
                bin_accuracy = actuals[mask].mean()
                bin_confidence = predictions[mask].mean()
                ece += mask.sum() * abs(bin_accuracy - bin_confidence)

        return ece / len(predictions) if len(predictions) > 0 else 0.0

    def _compute_brier(
        self,
        predictions: np.ndarray,
        actuals: np.ndarray,
    ) -> float:
        """Compute Brier score."""
        return float(np.mean((predictions - actuals) ** 2))

    def _compute_kl_divergence(
        self,
        p: np.ndarray,
        q: np.ndarray,
        epsilon: float = 1e-10,
    ) -> float:
        """Compute KL divergence between two distributions."""
        p = np.asarray(p, dtype=float)
        q = np.asarray(q, dtype=float)

        # Normalize to probabilities
        p = p / (p.sum() + epsilon)
        q = q / (q.sum() + epsilon)

        # Add epsilon to avoid log(0)
        p = p + epsilon
        q = q + epsilon

        return float(np.sum(p * np.log(p / q)))

    # ============================================
    # Convenience Methods
    # ============================================

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

        issue = critical[0]  # Raise first critical issue

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


# ============================================
# Module Exports
# ============================================


__all__ = [
    "CorporateActionProvider",
    "DataValidator",
    "UniverseProvider",
    "ValidationConfig",
]
