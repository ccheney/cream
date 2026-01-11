"""
Validation Configuration Module

Provides configuration dataclass for data validation settings.
"""

from __future__ import annotations

from dataclasses import dataclass


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


__all__ = ["ValidationConfig"]
