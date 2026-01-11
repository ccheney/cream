"""
Expected Value Calculator

Provides a stateful calculator for expected value computation
with persistent configuration across multiple calculations.
"""

from __future__ import annotations

from research.evaluator.expected_value.estimate import ExpectedValueEstimate
from research.evaluator.expected_value.probability import (
    compute_expected_value,
    estimate_probabilities,
)
from research.evaluator.expected_value.types import EVConfig, MarketRegime


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
        """Initialize calculator with optional configuration."""
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

        stop_distance_pct = abs(stop_price - entry_price) / entry_price

        p_win, p_loss, p_scratch = estimate_probabilities(
            historical_win_rate=historical_win_rate,
            model_prediction=model_prediction,
            regime=regime,
            holding_period_days=holding_period_days,
            stop_distance_pct=stop_distance_pct,
            config=self.config,
        )

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


__all__ = ["ExpectedValueCalculator"]
