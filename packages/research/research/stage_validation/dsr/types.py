"""
DSR Types: Dataclasses and configuration for Deflated Sharpe Ratio validation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class DSRResults:
    """Results from Deflated Sharpe Ratio analysis."""

    factor_id: str
    """Unique identifier for the factor."""

    observed_sharpe: float
    """Annualized Sharpe ratio from backtest."""

    expected_max_sharpe: float
    """Expected maximum Sharpe under null hypothesis given n_trials."""

    dsr_pvalue: float
    """Probability that observed Sharpe is statistically significant."""

    sharpe_std: float
    """Standard error of Sharpe estimate (adjusted for non-normality)."""

    skewness: float
    """Sample skewness of returns."""

    kurtosis: float
    """Sample excess kurtosis of returns."""

    n_observations: int
    """Number of return observations."""

    n_trials: int
    """Number of strategies tested (for multiple testing correction)."""

    min_backtest_length: int
    """Minimum backtest length required for statistical significance."""

    passed: bool
    """Whether DSR p-value exceeds threshold."""

    gate_threshold: float
    """Threshold used for gate checking."""

    params: dict[str, Any]
    """Parameters used for validation."""


@dataclass
class DSRConfig:
    """Configuration for DSR validation."""

    pvalue_threshold: float = 0.95
    """Minimum DSR p-value required (95% confidence)."""

    annualization_factor: int = 252
    """Annualization factor (252 for daily, 12 for monthly)."""

    min_observations: int = 100
    """Minimum observations required for DSR calculation."""


@dataclass
class CombinedStatisticalResults:
    """Combined results from CPCV (PBO) and DSR validation."""

    factor_id: str
    """Unique identifier for the factor."""

    pbo: float
    """Probability of Backtest Overfitting from CPCV."""

    dsr_pvalue: float
    """DSR p-value for multiple testing correction."""

    observed_sharpe: float
    """Observed Sharpe ratio."""

    expected_max_sharpe: float
    """Expected max Sharpe under null hypothesis."""

    sharpe_distribution: list[float]
    """OOS Sharpe distribution from CPCV."""

    n_trials_corrected: int
    """Number of trials used in correction."""

    min_backtest_length: int
    """Minimum required backtest length."""

    passed_pbo: bool
    """Whether PBO gate passed (< 50% overfitting probability)."""

    passed_dsr: bool
    """Whether DSR gate passed (> 95% confidence)."""

    passed_all: bool
    """Whether all statistical gates passed."""
