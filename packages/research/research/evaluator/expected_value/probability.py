"""
Probability Estimation Functions

Provides functions for estimating win/loss/scratch probabilities
from multiple sources including historical data, model predictions,
and market regime adjustments.
"""

from __future__ import annotations

import numpy as np

from research.evaluator.expected_value.estimate import ExpectedValueEstimate
from research.evaluator.expected_value.types import (
    REGIME_WIN_RATE_MODIFIERS,
    EVConfig,
    MarketRegime,
)


def estimate_scratch_probability(
    holding_period_days: float,
    stop_distance_pct: float,
    config: EVConfig | None = None,
) -> float:
    """
    Estimate probability of trade exiting near breakeven (scratch).

    Scratch probability decreases with longer holding periods and
    is affected by stop distance.

    Args:
        holding_period_days: Expected holding period in days.
        stop_distance_pct: Stop loss distance as percentage (e.g., 0.02 = 2%).
        config: EV configuration with scratch parameters.

    Returns:
        Estimated scratch probability (0-1).
    """
    if config is None:
        config = EVConfig()

    time_factor = np.exp(-holding_period_days / config.scratch_decay_days)
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

    Combines historical win rate, model prediction, and regime-adjusted
    rate using configurable weights.

    Args:
        historical_win_rate: Historical win rate from similar trades (0-1).
        model_prediction: Model-predicted win probability (0-1).
        regime: Current market regime for adjustment.
        holding_period_days: Expected holding period.
        stop_distance_pct: Stop loss distance as percentage.
        config: EV configuration.

    Returns:
        Tuple of (p_win, p_loss, p_scratch) that sum to 1.0.
    """
    if config is None:
        config = EVConfig()

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

    regime_str = regime.value if isinstance(regime, MarketRegime) else regime
    regime_modifier = REGIME_WIN_RATE_MODIFIERS.get(regime_str, 1.0)
    regime_adjusted_rate = np.clip(historical_win_rate * regime_modifier, 0.0, 1.0)

    total_weight = hist_weight + model_weight + config.regime_weight
    if total_weight < 0.01:
        combined_p_win = 0.5
    else:
        combined_p_win = (
            hist_weight * historical_win_rate
            + model_weight * model_prediction
            + config.regime_weight * regime_adjusted_rate
        ) / total_weight

    combined_p_win = np.clip(combined_p_win, config.min_probability, config.max_probability)

    p_scratch = estimate_scratch_probability(
        holding_period_days=holding_period_days,
        stop_distance_pct=stop_distance_pct,
        config=config,
    )

    p_win = combined_p_win * (1 - p_scratch)
    p_loss = (1 - combined_p_win) * (1 - p_scratch)

    total = p_win + p_loss + p_scratch
    if not np.isclose(total, 1.0, atol=0.001):
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
    """
    if config is None:
        config = EVConfig()

    profit_per_share = target_price - entry_price
    loss_per_share = stop_price - entry_price

    expected_win = profit_per_share * position_size
    expected_loss = loss_per_share * position_size
    expected_scratch = -abs(entry_price * slippage_pct * position_size)

    estimated_slippage = abs(entry_price * slippage_pct * position_size * 2)
    estimated_commission = commission_per_share * position_size * 2

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


__all__ = [
    "compute_expected_value",
    "estimate_probabilities",
    "estimate_scratch_probability",
]
