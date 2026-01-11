"""
Stage 2 Validation Types

Dataclasses and configuration types for NautilusTrader event-driven validation.

Stage 2 Gates (Stricter):
- PBO < 0.5 (max 50% overfitting probability)
- DSR p-value > 0.95 (95% confidence in Sharpe)
- Walk-Forward Efficiency > 0.5 (OOS/IS ratio > 50%)
- MC Sharpe 5th percentile > 0.5 (robust under randomization)
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Stage2Gates:
    """Stage 2 gate thresholds (stricter than Stage 1)."""

    pbo_max: float = 0.5
    """Max 50% probability of backtest overfitting."""

    dsr_pvalue_min: float = 0.95
    """95% confidence in Sharpe ratio."""

    wfe_min: float = 0.5
    """Walk-forward efficiency minimum (OOS/IS > 50%)."""

    mc_sharpe_5th_min: float = 0.5
    """Monte Carlo 5th percentile Sharpe minimum."""


@dataclass
class MonteCarloResults:
    """Results from Monte Carlo robustness testing."""

    sharpe_5th_percentile: float
    """5th percentile Sharpe from MC simulations."""

    sharpe_median: float
    """Median Sharpe from MC simulations."""

    drawdown_95th_percentile: float
    """95th percentile max drawdown from MC simulations."""

    drawdown_median: float
    """Median max drawdown from MC simulations."""

    n_simulations: int
    """Number of Monte Carlo simulations run."""

    sharpe_distribution: list[float]
    """Full Sharpe distribution for analysis."""


@dataclass
class WalkForwardResults:
    """Results from walk-forward analysis."""

    efficiency: float
    """Walk-forward efficiency (OOS Sharpe / IS Sharpe)."""

    in_sample_sharpes: list[float]
    """In-sample Sharpe ratios per period."""

    out_of_sample_sharpes: list[float]
    """Out-of-sample Sharpe ratios per period."""

    n_periods: int
    """Number of walk-forward periods."""

    avg_is_sharpe: float
    """Average in-sample Sharpe."""

    avg_oos_sharpe: float
    """Average out-of-sample Sharpe."""


@dataclass
class Stage2Results:
    """Results from NautilusTrader event-driven validation."""

    factor_id: str
    """Factor identifier."""

    # Performance with realistic execution
    sharpe_realistic: float
    """Sharpe ratio with realistic execution."""

    sortino_realistic: float
    """Sortino ratio with realistic execution."""

    max_drawdown_realistic: float
    """Maximum drawdown with realistic execution."""

    # Execution quality
    avg_slippage_bps: float
    """Average slippage in basis points."""

    fill_rate: float
    """Order fill rate (filled / submitted)."""

    total_trades: int
    """Total number of trades executed."""

    # Statistical validation
    pbo: float
    """Probability of Backtest Overfitting from CPCV."""

    dsr_pvalue: float
    """Deflated Sharpe Ratio p-value."""

    observed_sharpe: float
    """Observed Sharpe ratio from backtest."""

    wfe: float
    """Walk-Forward Efficiency (OOS/IS ratio)."""

    cpcv_sharpe_dist: list[float]
    """CPCV Sharpe distribution across folds."""

    # Monte Carlo robustness
    mc_sharpe_5th_pct: float
    """5th percentile Sharpe from Monte Carlo."""

    mc_drawdown_95th_pct: float
    """95th percentile drawdown from Monte Carlo."""

    # Gate results
    passed_gates: bool
    """Whether all Stage 2 gates passed."""

    gate_violations: list[str]
    """List of gate violations (empty if passed)."""

    # Detailed results
    walk_forward_results: WalkForwardResults | None = None
    """Detailed walk-forward results."""

    monte_carlo_results: MonteCarloResults | None = None
    """Detailed Monte Carlo results."""
