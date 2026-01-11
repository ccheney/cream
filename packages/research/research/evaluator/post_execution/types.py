"""
Post-Execution Types

Dataclasses for post-execution evaluation:
- MarketData: Market data for attribution analysis
- TradeOutcome: Outcome of an executed trade
- Attribution: Return attribution breakdown
- OutcomeScore: Result of post-execution evaluation
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class MarketData:
    """Market data for attribution analysis."""

    entry_price: float
    """Actual entry price achieved."""

    exit_price: float
    """Actual exit price achieved."""

    entry_vwap: float
    """VWAP at entry time."""

    exit_vwap: float
    """VWAP at exit time."""

    benchmark_return_during_trade: float
    """Benchmark return (e.g., SPY) during trade period."""

    sector_return_during_trade: float = 0.0
    """Sector ETF return during trade period."""

    high_during_trade: float = 0.0
    """High price reached during trade."""

    low_during_trade: float = 0.0
    """Low price reached during trade."""

    avg_volume: float = 0.0
    """Average volume during trade period."""


@dataclass
class TradeOutcome:
    """Outcome of an executed trade."""

    decision_id: str
    """Identifier linking back to the decision."""

    realized_return: float
    """Realized P&L as decimal (0.05 = 5%)."""

    holding_duration_hours: float
    """Duration of position in hours."""

    total_slippage_bps: float
    """Total slippage in basis points."""

    fill_rate: float
    """Percentage of order filled (0.0-1.0)."""

    entry_slippage_bps: float = 0.0
    """Entry slippage in basis points."""

    exit_slippage_bps: float = 0.0
    """Exit slippage in basis points."""

    hit_stop: bool = False
    """Whether stop loss was hit."""

    hit_target: bool = False
    """Whether take profit was hit."""

    beta_exposure: float = 1.0
    """Beta exposure of the position to benchmark."""


@dataclass
class Attribution:
    """Return attribution breakdown."""

    market_contribution: float
    """Return attributable to market/beta exposure."""

    alpha_contribution: float
    """Return attributable to stock selection (alpha)."""

    timing_contribution: float
    """Return attributable to entry/exit timing."""

    sector_contribution: float = 0.0
    """Return attributable to sector allocation."""

    total: float = 0.0
    """Sum of all contributions."""

    residual: float = 0.0
    """Unexplained portion (interaction effects)."""

    def to_dict(self) -> dict[str, float]:
        """Convert to dictionary."""
        return {
            "market_contribution": self.market_contribution,
            "alpha_contribution": self.alpha_contribution,
            "timing_contribution": self.timing_contribution,
            "sector_contribution": self.sector_contribution,
            "total": self.total,
            "residual": self.residual,
        }


@dataclass
class OutcomeScore:
    """Result of post-execution evaluation."""

    decision_id: str
    """Identifier linking back to the decision."""

    plan_score: Any
    """Original pre-execution PlanScore."""

    realized_return: float
    """Realized return from the trade."""

    holding_duration: float
    """Duration of position in hours."""

    execution_quality: float
    """Execution quality score (0-100)."""

    outcome_score: float
    """Overall outcome score (0-100)."""

    attribution: Attribution
    """Return attribution breakdown."""

    execution_details: dict[str, Any] = field(default_factory=dict)
    """Detailed execution metrics."""

    notes: list[str] = field(default_factory=list)
    """Feedback notes."""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "decision_id": self.decision_id,
            "plan_score": self.plan_score.to_dict() if hasattr(self.plan_score, "to_dict") else {},
            "realized_return": self.realized_return,
            "holding_duration": self.holding_duration,
            "execution_quality": self.execution_quality,
            "outcome_score": self.outcome_score,
            "attribution": self.attribution.to_dict(),
            "execution_details": self.execution_details,
            "notes": self.notes,
        }
