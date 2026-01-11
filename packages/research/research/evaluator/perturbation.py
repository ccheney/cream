"""
Plan Perturbation Generator

Generates perturbed versions of trading plans for counterfactual analysis.
Perturbations modify entry timing, exit levels, and position sizing.
"""

from __future__ import annotations

import random
from typing import TYPE_CHECKING

from research.evaluator.preference_types import Direction, TradingPlan

if TYPE_CHECKING:
    from research.evaluator.preference_types import MarketContext


ENTRY_PERTURBATION_RANGE = 0.02
EXIT_PERTURBATION_RANGE = 0.05
SIZE_PERTURBATION_RANGE = 0.50


class PlanPerturbationGenerator:
    """Generates perturbed versions of trading plans."""

    def __init__(self, rng: random.Random | None = None) -> None:
        """Initialize with optional random number generator."""
        self._rng = rng or random.Random()

    def generate_perturbations(
        self,
        plan: TradingPlan,
        context: MarketContext,
        n_perturbations: int,
    ) -> list[TradingPlan]:
        """
        Generate perturbations of the original plan.

        Args:
            plan: Original trading plan to perturb
            context: Market context (unused but kept for API consistency)
            n_perturbations: Number of perturbations to generate

        Returns:
            List of perturbed TradingPlan objects
        """
        perturbations: list[TradingPlan] = []
        perturbation_types = ["entry", "exit", "sizing", "mixed"]

        for i in range(n_perturbations):
            pert_type = perturbation_types[i % len(perturbation_types)]
            perturbed = self._create_perturbation(plan, pert_type)
            perturbations.append(perturbed)

        return perturbations

    def _create_perturbation(
        self,
        plan: TradingPlan,
        pert_type: str,
    ) -> TradingPlan:
        """Create a single perturbation of the given type."""
        entry_price = plan.entry_price
        stop_loss = plan.stop_loss
        take_profit = plan.take_profit
        size = plan.size
        conviction = plan.conviction

        if pert_type in ("entry", "mixed"):
            entry_price = self._perturb_entry(plan.entry_price)

        if pert_type in ("exit", "mixed"):
            stop_loss, take_profit = self._perturb_exits(
                plan.stop_loss, plan.take_profit, plan.direction
            )

        if pert_type in ("sizing", "mixed"):
            size, conviction = self._perturb_sizing(plan.size, plan.conviction)

        return TradingPlan.create(
            action=plan.action,
            direction=plan.direction,
            symbol=plan.symbol,
            entry_price=entry_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            size=size,
            size_unit=plan.size_unit,
            conviction=conviction,
            time_horizon=plan.time_horizon,
            rationale=f"Perturbation ({pert_type}) of {plan.plan_id}",
        )

    def _perturb_entry(self, entry_price: float) -> float:
        """Perturb entry price within configured range."""
        offset = self._rng.uniform(-ENTRY_PERTURBATION_RANGE, ENTRY_PERTURBATION_RANGE)
        return entry_price * (1 + offset)

    def _perturb_exits(
        self,
        stop_loss: float,
        take_profit: float,
        direction: Direction,
    ) -> tuple[float, float]:
        """Perturb stop loss and take profit within configured range."""
        stop_offset = self._rng.uniform(-EXIT_PERTURBATION_RANGE, EXIT_PERTURBATION_RANGE)
        target_offset = self._rng.uniform(-EXIT_PERTURBATION_RANGE, EXIT_PERTURBATION_RANGE)

        if direction == Direction.LONG:
            new_stop = stop_loss * (1 + stop_offset)
            new_target = take_profit * (1 + target_offset)
        elif direction == Direction.SHORT:
            new_stop = stop_loss * (1 - stop_offset)
            new_target = take_profit * (1 - target_offset)
        else:
            new_stop = stop_loss
            new_target = take_profit

        return new_stop, new_target

    def _perturb_sizing(
        self,
        size: float,
        conviction: float,
    ) -> tuple[float, float]:
        """Perturb size and proportionally adjust conviction."""
        size_offset = self._rng.uniform(-SIZE_PERTURBATION_RANGE, SIZE_PERTURBATION_RANGE)
        new_size = max(1, size * (1 + size_offset))
        new_conviction = min(1.0, max(0.1, conviction * (1 + size_offset * 0.5)))
        return new_size, new_conviction


def identify_perturbation_type(original: TradingPlan, perturbation: TradingPlan) -> str:
    """
    Identify what type of perturbation was applied.

    Returns one of: "entry", "stop", "target", "size", "mixed", or "none"
    """
    changes = []

    if abs(original.entry_price - perturbation.entry_price) > 0.001:
        changes.append("entry")
    if abs(original.stop_loss - perturbation.stop_loss) > 0.001:
        changes.append("stop")
    if abs(original.take_profit - perturbation.take_profit) > 0.001:
        changes.append("target")
    if abs(original.size - perturbation.size) > 0.01:
        changes.append("size")

    if len(changes) >= 3:
        return "mixed"
    if len(changes) == 0:
        return "none"
    return "_".join(changes)


__all__ = [
    "ENTRY_PERTURBATION_RANGE",
    "EXIT_PERTURBATION_RANGE",
    "SIZE_PERTURBATION_RANGE",
    "PlanPerturbationGenerator",
    "identify_perturbation_type",
]
