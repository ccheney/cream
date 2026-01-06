"""
Expected Value Computation Module

Implements expected value computation for trading plans combining probability
estimates (win/loss/scratch) with magnitude estimates and transaction costs.

Features:
- ExpectedValueEstimate dataclass with EV and risk-adjusted EV
- Probability estimation combining historical, model, and regime factors
- Regime-specific success rate modifiers
- Scratch probability estimation
- Integration with pre-execution evaluator

See: docs/plans/10-research.md - Expected Value Computation (lines 515-603)

Example:
    from research.evaluator.expected_value import (
        ExpectedValueEstimate,
        estimate_probabilities,
        REGIME_WIN_RATE_MODIFIERS,
    )

    # Direct EV computation
    ev_estimate = ExpectedValueEstimate(
        p_win=0.6,
        p_loss=0.3,
        p_scratch=0.1,
        expected_win=500.0,
        expected_loss=-200.0,
        expected_scratch=-10.0,
        estimated_slippage=5.0,
        estimated_commission=2.0,
    )
    print(f"Expected Value: ${ev_estimate.expected_value:.2f}")
    print(f"Risk-Adjusted EV: ${ev_estimate.risk_adjusted_ev:.2f}")

    # Probability estimation from multiple sources
    p_win, p_loss, p_scratch = estimate_probabilities(
        historical_win_rate=0.55,
        model_prediction=0.65,
        regime="BULL_TRENDING",
        holding_period_days=5,
        stop_distance_pct=0.02,
    )
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


# ============================================
# Constants and Configuration
# ============================================


class MarketRegime(str, Enum):
    """Market regime types for probability adjustment."""

    BULL_TRENDING = "BULL_TRENDING"
    """Upward trending market - favor long positions."""

    BEAR_TRENDING = "BEAR_TRENDING"
    """Downward trending market - favor short positions."""

    HIGH_VOLATILITY = "HIGH_VOLATILITY"
    """High volatility regime - increased risk."""

    LOW_VOLATILITY = "LOW_VOLATILITY"
    """Low volatility regime - smaller but more predictable moves."""

    MEAN_REVERTING = "MEAN_REVERTING"
    """Range-bound, mean-reverting market."""

    NEUTRAL = "NEUTRAL"
    """No clear regime identified."""


REGIME_WIN_RATE_MODIFIERS: dict[str, float] = {
    "BULL_TRENDING": 1.2,  # 20% boost for trending markets
    "BEAR_TRENDING": 1.2,  # 20% boost for trending markets
    "HIGH_VOLATILITY": 0.8,  # 20% penalty for high vol
    "LOW_VOLATILITY": 1.1,  # 10% boost for stable markets
    "MEAN_REVERTING": 0.9,  # 10% penalty for choppy markets
    "NEUTRAL": 1.0,  # No adjustment
}
"""
Regime-specific win rate multipliers.

These modifiers adjust base win rate probabilities based on market regime:
- Trending markets (bull/bear) favor directional trades
- High volatility increases uncertainty and whipsaw risk
- Low volatility provides cleaner signals
- Mean-reverting markets are harder to profit from with trend strategies
"""


@dataclass
class EVConfig:
    """Configuration for expected value computation."""

    risk_aversion: float = 0.5
    """Risk aversion coefficient for certainty equivalent (0-2)."""

    historical_weight: float = 0.3
    """Weight for historical win rate in probability estimation."""

    model_weight: float = 0.5
    """Weight for model prediction in probability estimation."""

    regime_weight: float = 0.2
    """Weight for regime-adjusted rate in probability estimation."""

    base_scratch_rate: float = 0.1
    """Base probability of trade scratching (breakeven exit)."""

    scratch_decay_days: float = 10.0
    """Days until scratch probability halves (time decay)."""

    min_probability: float = 0.01
    """Minimum probability value to avoid division issues."""

    max_probability: float = 0.99
    """Maximum probability value to avoid overconfidence."""

    def __post_init__(self) -> None:
        """Validate configuration parameters."""
        if not 0 <= self.risk_aversion <= 2:
            raise ValueError(f"risk_aversion must be 0-2, got {self.risk_aversion}")

        weights_sum = self.historical_weight + self.model_weight + self.regime_weight
        if not np.isclose(weights_sum, 1.0, atol=0.01):
            raise ValueError(f"Probability weights must sum to 1.0, got {weights_sum:.3f}")

        if not 0 < self.base_scratch_rate < 0.5:
            raise ValueError(f"base_scratch_rate must be 0-0.5, got {self.base_scratch_rate}")


# ============================================
# Expected Value Estimate
# ============================================


@dataclass
class ExpectedValueEstimate:
    """
    Expected value estimate for a trading plan.

    Combines probability estimates with magnitude estimates and
    transaction costs to produce gross and risk-adjusted expected values.

    Attributes:
        p_win: Probability of trade hitting profit target (0-1)
        p_loss: Probability of trade hitting stop loss (0-1)
        p_scratch: Probability of trade exiting near breakeven (0-1)
        expected_win: Expected profit if win (after slippage/fees)
        expected_loss: Expected loss if loss (negative value, after slippage/fees)
        expected_scratch: Expected P/L if scratch (usually small negative)
        estimated_slippage: Estimated slippage cost
        estimated_commission: Estimated commission/fee cost
        config: Configuration for EV computation
        metadata: Additional metadata (regime, sources, etc.)

    Example:
        ev = ExpectedValueEstimate(
            p_win=0.55,
            p_loss=0.35,
            p_scratch=0.10,
            expected_win=400.0,
            expected_loss=-150.0,
            expected_scratch=-5.0,
            estimated_slippage=3.0,
            estimated_commission=1.0,
        )
        print(f"EV: ${ev.expected_value:.2f}")
        print(f"Risk-Adjusted EV: ${ev.risk_adjusted_ev:.2f}")
        print(f"Kelly Fraction: {ev.kelly_fraction:.3f}")
    """

    # Probability estimates (should sum to 1.0)
    p_win: float
    """Probability of trade hitting target."""

    p_loss: float
    """Probability of trade hitting stop."""

    p_scratch: float
    """Probability of trade exiting near breakeven."""

    # Magnitude estimates (in dollars or percent)
    expected_win: float
    """Expected profit if win (after slippage/fees)."""

    expected_loss: float
    """Expected loss if loss (negative value, after slippage/fees)."""

    expected_scratch: float
    """Expected P/L if scratch (usually small negative)."""

    # Transaction costs
    estimated_slippage: float = 0.0
    """Estimated slippage cost."""

    estimated_commission: float = 0.0
    """Estimated commission/fee cost."""

    # Configuration
    config: EVConfig = field(default_factory=EVConfig)
    """Configuration for EV computation."""

    # Metadata
    metadata: dict[str, Any] = field(default_factory=dict)
    """Additional metadata (regime, probability sources, etc.)."""

    def __post_init__(self) -> None:
        """Validate probability estimates sum to 1.0."""
        prob_sum = self.p_win + self.p_loss + self.p_scratch
        if not np.isclose(prob_sum, 1.0, atol=0.01):
            logger.warning(
                f"Probabilities sum to {prob_sum:.4f}, expected 1.0. Consider normalizing."
            )

    @property
    def expected_value(self) -> float:
        """
        Compute gross expected value.

        EV = P(win) * E[win] + P(loss) * E[loss] + P(scratch) * E[scratch]
             - slippage - commission

        Returns:
            Expected value in same units as magnitude estimates.
        """
        gross_ev = (
            self.p_win * self.expected_win
            + self.p_loss * self.expected_loss
            + self.p_scratch * self.expected_scratch
        )
        return gross_ev - self.estimated_slippage - self.estimated_commission

    @property
    def variance(self) -> float:
        """
        Compute variance of the expected value estimate.

        Var = sum(P(outcome) * (E[outcome] - EV)^2)

        Returns:
            Variance of the outcome distribution.
        """
        ev = self.expected_value + self.estimated_slippage + self.estimated_commission
        return (
            self.p_win * (self.expected_win - ev) ** 2
            + self.p_loss * (self.expected_loss - ev) ** 2
            + self.p_scratch * (self.expected_scratch - ev) ** 2
        )

    @property
    def standard_deviation(self) -> float:
        """
        Compute standard deviation of the expected value estimate.

        Returns:
            Standard deviation in same units as magnitude estimates.
        """
        return np.sqrt(self.variance)

    @property
    def risk_adjusted_ev(self) -> float:
        """
        Compute risk-adjusted expected value using certainty equivalent.

        Uses mean-variance utility with configurable risk aversion:
        CE = EV - (risk_aversion / 2) * Var

        Higher risk aversion = larger penalty for variance.

        Returns:
            Risk-adjusted expected value (certainty equivalent).
        """
        return self.expected_value - (self.config.risk_aversion / 2) * self.variance

    @property
    def sharpe_ratio(self) -> float:
        """
        Compute Sharpe-like ratio for this trade.

        Returns:
            EV / std_dev, or 0 if std_dev is very small.
        """
        std_dev = self.standard_deviation
        if std_dev < 1e-6:
            return 0.0
        return self.expected_value / std_dev

    @property
    def kelly_fraction(self) -> float:
        """
        Compute Kelly criterion optimal fraction.

        Kelly = (p * b - q) / b
        where p = win prob, q = loss prob, b = win/loss ratio

        This simplified Kelly assumes binary outcome (ignores scratch).
        For actual position sizing, use with conservative multiplier (e.g., 0.25).

        Returns:
            Kelly fraction (0-1), capped at 0 if negative (don't trade).
        """
        if self.expected_loss >= 0 or self.expected_win <= 0:
            return 0.0

        # Effective win/loss ratio
        b = abs(self.expected_win / self.expected_loss)

        # Effective win probability (combine win + scratch as "not losing")
        p = self.p_win
        q = self.p_loss

        kelly = (p * b - q) / b if b > 0 else 0.0
        return max(0.0, min(kelly, 1.0))

    @property
    def ev_to_risk_ratio(self) -> float:
        """
        Compute expected value to maximum risk ratio.

        Returns:
            EV / |expected_loss|, or 0 if no risk.
        """
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
        # Remove computed properties
        for key in [
            "expected_value",
            "risk_adjusted_ev",
            "variance",
            "standard_deviation",
            "sharpe_ratio",
            "kelly_fraction",
            "ev_to_risk_ratio",
            "is_positive_ev",
            "is_positive_risk_adjusted_ev",
        ]:
            data.pop(key, None)
        return cls(config=config, **data)


# ============================================
# Probability Estimation
# ============================================


def estimate_scratch_probability(
    holding_period_days: float,
    stop_distance_pct: float,
    config: EVConfig | None = None,
) -> float:
    """
    Estimate probability of trade exiting near breakeven (scratch).

    Scratch probability decreases with:
    - Longer holding periods (more time for directional move)
    - Wider stops (less likely to hit either target)

    Formula:
        P(scratch) = base_rate * exp(-days / decay) * (1 + stop_distance)

    Args:
        holding_period_days: Expected holding period in days.
        stop_distance_pct: Stop loss distance as percentage (e.g., 0.02 = 2%).
        config: EV configuration with scratch parameters.

    Returns:
        Estimated scratch probability (0-1).

    Example:
        >>> p_scratch = estimate_scratch_probability(
        ...     holding_period_days=5,
        ...     stop_distance_pct=0.02,
        ... )
        >>> 0.05 < p_scratch < 0.15
        True
    """
    if config is None:
        config = EVConfig()

    # Time decay: longer trades less likely to scratch
    time_factor = np.exp(-holding_period_days / config.scratch_decay_days)

    # Stop distance factor: wider stops = more room for scratch
    # Normalized so 2% stop gives factor of 1.0
    stop_factor = 1.0 + (stop_distance_pct - 0.02) * 5

    p_scratch = config.base_scratch_rate * time_factor * max(0.5, min(stop_factor, 2.0))

    return np.clip(p_scratch, config.min_probability, 0.3)


def estimate_probabilities(
    historical_win_rate: float | None = None,
    model_prediction: float | None = None,
    regime: str | MarketRegime = "NEUTRAL",
    holding_period_days: float = 5.0,
    stop_distance_pct: float = 0.02,
    config: EVConfig | None = None,
) -> tuple[float, float, float]:
    """
    Estimate win/loss/scratch probabilities from multiple sources.

    Combines:
    1. Historical win rate from similar setups
    2. Model prediction (calibrated classifier)
    3. Regime-adjusted rate (historical * regime modifier)

    Formula:
        combined_p_win = w_hist * hist + w_model * model + w_regime * (hist * regime_mod)
        p_scratch = estimate_scratch_probability(...)
        p_win = combined_p_win * (1 - p_scratch)
        p_loss = (1 - combined_p_win) * (1 - p_scratch)

    Args:
        historical_win_rate: Historical win rate from similar trades (0-1).
        model_prediction: Model-predicted win probability (0-1).
        regime: Current market regime for adjustment.
        holding_period_days: Expected holding period.
        stop_distance_pct: Stop loss distance as percentage.
        config: EV configuration.

    Returns:
        Tuple of (p_win, p_loss, p_scratch) that sum to 1.0.

    Example:
        >>> p_win, p_loss, p_scratch = estimate_probabilities(
        ...     historical_win_rate=0.55,
        ...     model_prediction=0.65,
        ...     regime="BULL_TRENDING",
        ... )
        >>> abs(p_win + p_loss + p_scratch - 1.0) < 0.01
        True
    """
    if config is None:
        config = EVConfig()

    # Use defaults if sources not provided
    if historical_win_rate is None:
        historical_win_rate = 0.5
        hist_weight = 0.0
    else:
        hist_weight = config.historical_weight

    if model_prediction is None:
        model_prediction = 0.5
        model_weight = 0.0
    else:
        model_weight = config.model_weight

    # Get regime modifier
    regime_str = regime.value if isinstance(regime, MarketRegime) else regime
    regime_modifier = REGIME_WIN_RATE_MODIFIERS.get(regime_str, 1.0)
    regime_adjusted_rate = np.clip(historical_win_rate * regime_modifier, 0.0, 1.0)

    # Calculate weights (renormalize if some sources missing)
    total_weight = hist_weight + model_weight + config.regime_weight
    if total_weight < 0.01:
        # No valid sources, use uniform
        combined_p_win = 0.5
    else:
        combined_p_win = (
            hist_weight * historical_win_rate
            + model_weight * model_prediction
            + config.regime_weight * regime_adjusted_rate
        ) / total_weight

    # Clip to valid range
    combined_p_win = np.clip(combined_p_win, config.min_probability, config.max_probability)

    # Estimate scratch probability
    p_scratch = estimate_scratch_probability(
        holding_period_days=holding_period_days,
        stop_distance_pct=stop_distance_pct,
        config=config,
    )

    # Normalize win/loss given scratch
    p_win = combined_p_win * (1 - p_scratch)
    p_loss = (1 - combined_p_win) * (1 - p_scratch)

    # Final validation
    total = p_win + p_loss + p_scratch
    if not np.isclose(total, 1.0, atol=0.001):
        # Normalize
        p_win /= total
        p_loss /= total
        p_scratch /= total

    return p_win, p_loss, p_scratch


def compute_expected_value(
    p_win: float,
    p_loss: float,
    p_scratch: float,
    target_price: float,
    stop_price: float,
    entry_price: float,
    position_size: float,
    slippage_pct: float = 0.001,
    commission_per_share: float = 0.0,
    config: EVConfig | None = None,
) -> ExpectedValueEstimate:
    """
    Compute expected value estimate from trade parameters.

    Convenience function that constructs an ExpectedValueEstimate
    from typical trade plan parameters.

    Args:
        p_win: Probability of hitting target.
        p_loss: Probability of hitting stop.
        p_scratch: Probability of scratching near entry.
        target_price: Target exit price.
        stop_price: Stop loss price.
        entry_price: Entry price.
        position_size: Number of shares/contracts.
        slippage_pct: Expected slippage as percentage of price.
        commission_per_share: Commission per share.
        config: EV configuration.

    Returns:
        ExpectedValueEstimate with all calculations.

    Example:
        >>> ev = compute_expected_value(
        ...     p_win=0.55,
        ...     p_loss=0.35,
        ...     p_scratch=0.10,
        ...     target_price=105.0,
        ...     stop_price=98.0,
        ...     entry_price=100.0,
        ...     position_size=100,
        ... )
        >>> ev.expected_win > 0
        True
        >>> ev.expected_loss < 0
        True
    """
    if config is None:
        config = EVConfig()

    # Calculate magnitude estimates
    profit_per_share = target_price - entry_price
    loss_per_share = stop_price - entry_price  # Will be negative for long

    expected_win = profit_per_share * position_size
    expected_loss = loss_per_share * position_size
    expected_scratch = -abs(entry_price * slippage_pct * position_size)  # Small loss

    # Transaction costs
    estimated_slippage = abs(entry_price * slippage_pct * position_size * 2)  # Round trip
    estimated_commission = commission_per_share * position_size * 2  # Round trip

    return ExpectedValueEstimate(
        p_win=p_win,
        p_loss=p_loss,
        p_scratch=p_scratch,
        expected_win=expected_win,
        expected_loss=expected_loss,
        expected_scratch=expected_scratch,
        estimated_slippage=estimated_slippage,
        estimated_commission=estimated_commission,
        config=config,
        metadata={
            "entry_price": entry_price,
            "target_price": target_price,
            "stop_price": stop_price,
            "position_size": position_size,
        },
    )


# ============================================
# Expected Value Calculator
# ============================================


class ExpectedValueCalculator:
    """
    Calculator for expected value with persistent configuration.

    Provides a stateful interface for computing expected values
    with consistent configuration across multiple calculations.

    Example:
        calculator = ExpectedValueCalculator(
            config=EVConfig(risk_aversion=0.7)
        )

        ev = calculator.compute(
            historical_win_rate=0.55,
            model_prediction=0.60,
            regime="BULL_TRENDING",
            target_price=105.0,
            stop_price=98.0,
            entry_price=100.0,
            position_size=100,
        )
        print(f"EV: ${ev.expected_value:.2f}")
    """

    def __init__(self, config: EVConfig | None = None) -> None:
        """
        Initialize calculator.

        Args:
            config: EV configuration. Uses defaults if not provided.
        """
        self.config = config or EVConfig()
        self._calculation_count = 0

    def compute(
        self,
        target_price: float,
        stop_price: float,
        entry_price: float,
        position_size: float,
        historical_win_rate: float | None = None,
        model_prediction: float | None = None,
        regime: str | MarketRegime = "NEUTRAL",
        holding_period_days: float = 5.0,
        slippage_pct: float = 0.001,
        commission_per_share: float = 0.0,
    ) -> ExpectedValueEstimate:
        """
        Compute expected value for a trade.

        Args:
            target_price: Target exit price.
            stop_price: Stop loss price.
            entry_price: Entry price.
            position_size: Number of shares/contracts.
            historical_win_rate: Historical win rate from similar trades.
            model_prediction: Model-predicted win probability.
            regime: Current market regime.
            holding_period_days: Expected holding period.
            slippage_pct: Expected slippage percentage.
            commission_per_share: Commission per share.

        Returns:
            ExpectedValueEstimate with computed values.
        """
        self._calculation_count += 1

        # Calculate stop distance for scratch estimation
        stop_distance_pct = abs(stop_price - entry_price) / entry_price

        # Estimate probabilities
        p_win, p_loss, p_scratch = estimate_probabilities(
            historical_win_rate=historical_win_rate,
            model_prediction=model_prediction,
            regime=regime,
            holding_period_days=holding_period_days,
            stop_distance_pct=stop_distance_pct,
            config=self.config,
        )

        # Compute expected value
        ev = compute_expected_value(
            p_win=p_win,
            p_loss=p_loss,
            p_scratch=p_scratch,
            target_price=target_price,
            stop_price=stop_price,
            entry_price=entry_price,
            position_size=position_size,
            slippage_pct=slippage_pct,
            commission_per_share=commission_per_share,
            config=self.config,
        )

        # Add metadata
        ev.metadata.update(
            {
                "regime": str(regime),
                "historical_win_rate": historical_win_rate,
                "model_prediction": model_prediction,
                "holding_period_days": holding_period_days,
                "calculation_number": self._calculation_count,
            }
        )

        return ev

    @property
    def calculation_count(self) -> int:
        """Number of calculations performed."""
        return self._calculation_count


# ============================================
# Module Exports
# ============================================


__all__ = [
    "EVConfig",
    "ExpectedValueCalculator",
    "ExpectedValueEstimate",
    "MarketRegime",
    "REGIME_WIN_RATE_MODIFIERS",
    "compute_expected_value",
    "estimate_probabilities",
    "estimate_scratch_probability",
]
