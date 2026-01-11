"""
Trading Plan Generator

Generates candidate trading plans for West-of-N preference pair creation.
Plans are generated with regime-aware action probabilities and randomized
entry, exit, and sizing parameters.
"""

from __future__ import annotations

import random
from typing import TYPE_CHECKING

from research.evaluator.preference_types import (
    Action,
    Direction,
    SizeUnit,
    TradingPlan,
)

if TYPE_CHECKING:
    from research.evaluator.preference_types import MarketContext


class PlanGenerator:
    """
    Generates candidate trading plans for preference pair creation.

    Plans are generated with:
    - Regime-aware action probability weights
    - ATR-based entry offsets
    - Randomized stop loss and take profit distances
    - Risk-based position sizing
    """

    TIME_HORIZONS = ["SCALP", "DAY", "SWING", "POSITION"]

    def __init__(self, rng: random.Random | None = None) -> None:
        """
        Initialize the plan generator.

        Args:
            rng: Random number generator for reproducibility
        """
        self._rng = rng or random.Random()

    def generate_candidates(
        self,
        context: MarketContext,
        n_candidates: int,
    ) -> list[TradingPlan]:
        """
        Generate N diverse candidate plans for a context.

        Args:
            context: Market context for plan generation
            n_candidates: Number of candidates to generate

        Returns:
            List of TradingPlan candidates
        """
        action_weights = self._get_action_weights(context.regime)
        actions = list(action_weights.keys())
        weights = list(action_weights.values())

        candidates: list[TradingPlan] = []
        for _ in range(n_candidates):
            action = self._rng.choices(actions, weights=weights, k=1)[0]
            plan = self._create_plan(action, context)
            candidates.append(plan)

        return candidates

    def _get_action_weights(self, regime: str) -> dict[Action, float]:
        """Get action probability weights based on market regime."""
        if regime == "BULL_TREND":
            return {Action.BUY: 0.6, Action.SELL: 0.1, Action.HOLD: 0.3}
        if regime == "BEAR_TREND":
            return {Action.BUY: 0.1, Action.SELL: 0.6, Action.HOLD: 0.3}
        if regime == "RANGE":
            return {Action.BUY: 0.35, Action.SELL: 0.35, Action.HOLD: 0.3}
        return {Action.BUY: 0.25, Action.SELL: 0.25, Action.HOLD: 0.5}

    def _create_plan(self, action: Action, context: MarketContext) -> TradingPlan:
        """Create a random trading plan for the given action and context."""
        direction = self._action_to_direction(action)
        base_atr = context.atr_pct * context.current_price

        entry_offset = self._rng.uniform(-0.5, 0.5) * base_atr
        entry_price = context.current_price + entry_offset

        stop_distance = self._rng.uniform(1.0, 3.0) * base_atr
        target_distance = self._rng.uniform(2.0, 5.0) * base_atr

        if direction == Direction.LONG:
            stop_loss = entry_price - stop_distance
            take_profit = entry_price + target_distance
        elif direction == Direction.SHORT:
            stop_loss = entry_price + stop_distance
            take_profit = entry_price - target_distance
        else:
            stop_loss = context.current_price * 0.98
            take_profit = context.current_price * 1.02

        conviction = self._rng.uniform(0.3, 0.9)
        size = self._calculate_position_size(entry_price, stop_loss, conviction, context)

        return TradingPlan.create(
            action=action,
            direction=direction,
            symbol=context.symbol,
            entry_price=entry_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            size=size,
            size_unit=SizeUnit.SHARES,
            conviction=conviction,
            time_horizon=self._rng.choice(self.TIME_HORIZONS),
        )

    def _action_to_direction(self, action: Action) -> Direction:
        """Convert action to position direction."""
        if action == Action.BUY:
            return Direction.LONG
        if action == Action.SELL:
            return Direction.SHORT
        return Direction.FLAT

    def _calculate_position_size(
        self,
        entry_price: float,
        stop_loss: float,
        conviction: float,
        context: MarketContext,
    ) -> float:
        """Calculate position size based on risk parameters."""
        risk_pct = self._rng.uniform(0.005, 0.025)
        stop_pct = abs(entry_price - stop_loss) / entry_price if entry_price > 0 else 0.02

        if stop_pct > 0:
            position_value = (risk_pct * context.account_equity) / stop_pct
        else:
            position_value = context.account_equity * 0.05

        return position_value / entry_price if entry_price > 0 else 100


__all__ = [
    "PlanGenerator",
]
