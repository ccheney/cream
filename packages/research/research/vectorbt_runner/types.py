"""
Type definitions for VectorBT runner.

Contains dataclasses and abstract base classes used across the module.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

import pandas as pd

from ..findings import StrategyCondition


@dataclass
class StrategySignals:
    """Entry and exit signals from a strategy."""

    entries: pd.Series
    """Boolean series for entry signals."""

    exits: pd.Series
    """Boolean series for exit signals."""

    parameters: dict[str, Any]
    """Parameters used to generate signals."""


class StrategyBase(ABC):
    """Base class for strategy implementations."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Strategy name."""
        ...

    @property
    @abstractmethod
    def parameter_space(self) -> dict[str, list[Any]]:
        """Default parameter space for scanning."""
        ...

    @abstractmethod
    def generate_signals(
        self,
        prices: pd.DataFrame,
        parameters: dict[str, Any],
    ) -> StrategySignals:
        """Generate entry and exit signals."""
        ...

    def get_entry_conditions(self, parameters: dict[str, Any]) -> list[StrategyCondition]:  # noqa: ARG002
        """Get entry conditions for given parameters."""
        return []

    def get_exit_conditions(self, parameters: dict[str, Any]) -> list[StrategyCondition]:  # noqa: ARG002
        """Get exit conditions for given parameters."""
        return []
