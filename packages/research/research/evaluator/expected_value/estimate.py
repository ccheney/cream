"""
Expected Value Estimate Dataclass

Provides the ExpectedValueEstimate dataclass that combines probability
estimates with magnitude estimates and transaction costs to produce
gross and risk-adjusted expected values.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from research.evaluator.expected_value.types import EVConfig

logger = logging.getLogger(__name__)


@dataclass
class ExpectedValueEstimate:
    """
    Expected value estimate for a trading plan.

    Combines probability estimates with magnitude estimates and
    transaction costs to produce gross and risk-adjusted expected values.
    """

    p_win: float
    p_loss: float
    p_scratch: float
    expected_win: float
    expected_loss: float
    expected_scratch: float
    estimated_slippage: float = 0.0
    estimated_commission: float = 0.0
    config: EVConfig = field(default_factory=EVConfig)
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        """Validate probability estimates sum to 1.0."""
        prob_sum = self.p_win + self.p_loss + self.p_scratch
        if not np.isclose(prob_sum, 1.0, atol=0.01):
            logger.warning(
                f"Probabilities sum to {prob_sum:.4f}, expected 1.0. Consider normalizing."
            )

    @property
    def expected_value(self) -> float:
        """Compute gross expected value."""
        gross_ev = (
            self.p_win * self.expected_win
            + self.p_loss * self.expected_loss
            + self.p_scratch * self.expected_scratch
        )
        return gross_ev - self.estimated_slippage - self.estimated_commission

    @property
    def variance(self) -> float:
        """Compute variance of the expected value estimate."""
        ev = self.expected_value + self.estimated_slippage + self.estimated_commission
        return (
            self.p_win * (self.expected_win - ev) ** 2
            + self.p_loss * (self.expected_loss - ev) ** 2
            + self.p_scratch * (self.expected_scratch - ev) ** 2
        )

    @property
    def standard_deviation(self) -> float:
        """Compute standard deviation of the expected value estimate."""
        return np.sqrt(self.variance)

    @property
    def risk_adjusted_ev(self) -> float:
        """Compute risk-adjusted expected value using certainty equivalent."""
        return self.expected_value - (self.config.risk_aversion / 2) * self.variance

    @property
    def sharpe_ratio(self) -> float:
        """Compute Sharpe-like ratio for this trade."""
        std_dev = self.standard_deviation
        if std_dev < 1e-6:
            return 0.0
        return self.expected_value / std_dev

    @property
    def kelly_fraction(self) -> float:
        """Compute Kelly criterion optimal fraction."""
        if self.expected_loss >= 0 or self.expected_win <= 0:
            return 0.0

        b = abs(self.expected_win / self.expected_loss)
        p = self.p_win
        q = self.p_loss

        kelly = (p * b - q) / b if b > 0 else 0.0
        return max(0.0, min(kelly, 1.0))

    @property
    def ev_to_risk_ratio(self) -> float:
        """Compute expected value to maximum risk ratio."""
        if self.expected_loss >= 0:
            return float("inf") if self.expected_value > 0 else 0.0
        return self.expected_value / abs(self.expected_loss)

    def is_positive_ev(self) -> bool:
        """Check if trade has positive expected value."""
        return self.expected_value > 0

    def is_positive_risk_adjusted_ev(self) -> bool:
        """Check if trade has positive risk-adjusted expected value."""
        return self.risk_adjusted_ev > 0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "p_win": self.p_win,
            "p_loss": self.p_loss,
            "p_scratch": self.p_scratch,
            "expected_win": self.expected_win,
            "expected_loss": self.expected_loss,
            "expected_scratch": self.expected_scratch,
            "estimated_slippage": self.estimated_slippage,
            "estimated_commission": self.estimated_commission,
            "expected_value": self.expected_value,
            "risk_adjusted_ev": self.risk_adjusted_ev,
            "variance": self.variance,
            "standard_deviation": self.standard_deviation,
            "sharpe_ratio": self.sharpe_ratio,
            "kelly_fraction": self.kelly_fraction,
            "ev_to_risk_ratio": self.ev_to_risk_ratio,
            "is_positive_ev": self.is_positive_ev(),
            "is_positive_risk_adjusted_ev": self.is_positive_risk_adjusted_ev(),
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ExpectedValueEstimate:
        """Create instance from dictionary."""
        config = EVConfig(**data.pop("config", {}))
        computed_keys = [
            "expected_value",
            "risk_adjusted_ev",
            "variance",
            "standard_deviation",
            "sharpe_ratio",
            "kelly_fraction",
            "ev_to_risk_ratio",
            "is_positive_ev",
            "is_positive_risk_adjusted_ev",
        ]
        for key in computed_keys:
            data.pop(key, None)
        return cls(config=config, **data)


__all__ = ["ExpectedValueEstimate"]
