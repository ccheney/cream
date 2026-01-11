"""
Counterfactual Outcome Estimator

Estimates counterfactual outcomes for perturbed trading plans based on
actual trade outcomes and plan differences.
"""

from __future__ import annotations

import random
from typing import TYPE_CHECKING

from research.evaluator.preference_types import Direction, TradeOutcome, TradingPlan

if TYPE_CHECKING:
    from research.evaluator.preference_types import MarketContext


class CounterfactualEstimator:
    """Estimates counterfactual outcomes for perturbed plans."""

    def __init__(self, rng: random.Random | None = None) -> None:
        """Initialize with optional random number generator."""
        self._rng = rng or random.Random()

    def estimate_outcome(
        self,
        perturbation: TradingPlan,
        original_plan: TradingPlan,
        actual_outcome: TradeOutcome,
        context: MarketContext,
    ) -> TradeOutcome:
        """
        Estimate counterfactual outcome for a perturbed plan.

        Uses the actual outcome as a baseline and adjusts based on
        how the perturbation differs from the original plan.

        Args:
            perturbation: The perturbed plan to estimate outcome for
            original_plan: The original executed plan
            actual_outcome: The actual outcome from the original plan
            context: Market context at execution time

        Returns:
            Estimated TradeOutcome for the perturbation
        """
        cf_pnl = actual_outcome.realized_pnl

        cf_pnl = self._adjust_for_entry(cf_pnl, perturbation, original_plan)
        cf_pnl = self._adjust_for_stop_loss(cf_pnl, perturbation, original_plan, actual_outcome)
        cf_pnl = self._adjust_for_take_profit(cf_pnl, perturbation, original_plan, actual_outcome)
        cf_pnl = self._adjust_for_size(cf_pnl, perturbation, original_plan)

        cf_pnl += self._rng.gauss(0, 0.005)

        return TradeOutcome(
            realized_pnl=round(cf_pnl, 4),
            slippage=actual_outcome.slippage * (1 + self._rng.uniform(-0.1, 0.1)),
            fill_rate=min(1.0, actual_outcome.fill_rate * (1 + self._rng.uniform(-0.05, 0.05))),
            hit_stop=actual_outcome.hit_stop and self._rng.random() > 0.3,
            hit_target=actual_outcome.hit_target and self._rng.random() > 0.3,
            hold_duration_hours=actual_outcome.hold_duration_hours
            * (1 + self._rng.uniform(-0.2, 0.2)),
        )

    def _adjust_for_entry(
        self,
        pnl: float,
        perturbation: TradingPlan,
        original: TradingPlan,
    ) -> float:
        """Adjust PnL based on entry price difference."""
        if perturbation.entry_price == original.entry_price:
            return pnl

        entry_diff_pct = (perturbation.entry_price - original.entry_price) / original.entry_price

        if original.direction == Direction.LONG:
            return pnl - entry_diff_pct
        if original.direction == Direction.SHORT:
            return pnl + entry_diff_pct
        return pnl

    def _adjust_for_stop_loss(
        self,
        pnl: float,
        perturbation: TradingPlan,
        original: TradingPlan,
        outcome: TradeOutcome,
    ) -> float:
        """Adjust PnL based on stop loss placement."""
        if perturbation.stop_loss == original.stop_loss:
            return pnl

        if not outcome.hit_stop:
            return pnl

        if original.direction == Direction.LONG:
            if perturbation.stop_loss >= original.stop_loss:
                return outcome.realized_pnl + self._rng.uniform(0, 0.02)
        elif original.direction == Direction.SHORT:
            if perturbation.stop_loss <= original.stop_loss:
                return outcome.realized_pnl + self._rng.uniform(0, 0.02)

        return pnl

    def _adjust_for_take_profit(
        self,
        pnl: float,
        perturbation: TradingPlan,
        original: TradingPlan,
        outcome: TradeOutcome,
    ) -> float:
        """Adjust PnL based on take profit placement."""
        if perturbation.take_profit == original.take_profit:
            return pnl

        if not outcome.hit_target:
            return pnl

        target_diff_pct = (
            abs(perturbation.take_profit - original.take_profit) / original.entry_price
        )

        if original.direction == Direction.LONG:
            if perturbation.take_profit < original.take_profit:
                return outcome.realized_pnl - target_diff_pct
            return outcome.realized_pnl - self._rng.uniform(0, target_diff_pct)

        return pnl

    def _adjust_for_size(
        self,
        pnl: float,
        perturbation: TradingPlan,
        original: TradingPlan,
    ) -> float:
        """Adjust PnL based on position size difference."""
        if perturbation.size == original.size:
            return pnl

        size_ratio = perturbation.size / original.size if original.size > 0 else 1.0
        return pnl * size_ratio


__all__ = [
    "CounterfactualEstimator",
]
