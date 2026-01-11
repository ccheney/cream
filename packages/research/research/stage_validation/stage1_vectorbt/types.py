"""
Types for Stage 1 VectorBT validation.

Dataclasses and configuration types for Stage 1 validation results and gates.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Stage1Results:
    """Results from VectorBT Stage 1 validation."""

    factor_id: str
    """Unique identifier for the factor."""

    best_params: dict[str, Any]
    """Best performing parameter combination."""

    parameter_sensitivity: dict[str, float]
    """Sensitivity scores per parameter (lower = more stable)."""

    # Performance metrics
    sharpe: float
    """Sharpe ratio (annualized)."""

    sortino: float
    """Sortino ratio (downside deviation)."""

    calmar: float
    """Calmar ratio (return / max drawdown)."""

    max_drawdown: float
    """Maximum drawdown as decimal (0.25 = 25%)."""

    win_rate: float
    """Win rate as decimal (0.55 = 55%)."""

    profit_factor: float
    """Gross profits / gross losses."""

    # Information metrics
    ic_mean: float
    """Mean Information Coefficient (Pearson correlation with forward returns)."""

    icir: float
    """IC Information Ratio (IC mean / IC std)."""

    rank_ic: float
    """Rank IC (Spearman correlation with forward returns)."""

    # Gate results
    passed_gates: bool
    """Whether all gates passed."""

    gate_violations: list[str] = field(default_factory=list)
    """List of gate violation descriptions."""

    # Metadata
    num_combinations_tested: int = 0
    """Total parameter combinations evaluated."""

    scan_duration_seconds: float = 0.0
    """Time taken for validation."""


@dataclass
class Stage1Gates:
    """
    Gate thresholds for Stage 1 validation.

    Factors must pass all gates to proceed to Stage 2.
    """

    sharpe_min: float = 1.0
    """Minimum Sharpe ratio."""

    sortino_min: float = 1.2
    """Minimum Sortino ratio."""

    win_rate_min: float = 0.45
    """Minimum win rate (45%)."""

    max_drawdown_max: float = 0.25
    """Maximum allowed drawdown (25%)."""

    ic_min: float = 0.03
    """Minimum IC."""

    icir_min: float = 0.5
    """Minimum ICIR."""
