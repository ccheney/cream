"""
Expected Value Types and Configuration

Provides core types for expected value computation:
- MarketRegime: Market regime classification enum
- EVConfig: Configuration for EV computation parameters
- REGIME_WIN_RATE_MODIFIERS: Regime-specific win rate adjustments
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import numpy as np


class MarketRegime(str, Enum):
    """Market regime types for probability adjustment."""

    BULL_TRENDING = "BULL_TRENDING"
    BEAR_TRENDING = "BEAR_TRENDING"
    HIGH_VOLATILITY = "HIGH_VOLATILITY"
    LOW_VOLATILITY = "LOW_VOLATILITY"
    MEAN_REVERTING = "MEAN_REVERTING"
    NEUTRAL = "NEUTRAL"


REGIME_WIN_RATE_MODIFIERS: dict[str, float] = {
    "BULL_TRENDING": 1.2,
    "BEAR_TRENDING": 1.2,
    "HIGH_VOLATILITY": 0.8,
    "LOW_VOLATILITY": 1.1,
    "MEAN_REVERTING": 0.9,
    "NEUTRAL": 1.0,
}


@dataclass
class EVConfig:
    """Configuration for expected value computation."""

    risk_aversion: float = 0.5
    historical_weight: float = 0.3
    model_weight: float = 0.5
    regime_weight: float = 0.2
    base_scratch_rate: float = 0.1
    scratch_decay_days: float = 10.0
    min_probability: float = 0.01
    max_probability: float = 0.99

    def __post_init__(self) -> None:
        """Validate configuration parameters."""
        if not 0 <= self.risk_aversion <= 2:
            raise ValueError(f"risk_aversion must be 0-2, got {self.risk_aversion}")

        weights_sum = self.historical_weight + self.model_weight + self.regime_weight
        if not np.isclose(weights_sum, 1.0, atol=0.01):
            raise ValueError(f"Probability weights must sum to 1.0, got {weights_sum:.3f}")

        if not 0 < self.base_scratch_rate < 0.5:
            raise ValueError(f"base_scratch_rate must be 0-0.5, got {self.base_scratch_rate}")


__all__ = [
    "EVConfig",
    "MarketRegime",
    "REGIME_WIN_RATE_MODIFIERS",
]
