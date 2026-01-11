"""
Built-in trading strategies for VectorBT runner.

Contains RSI mean reversion, SMA crossover, and Bollinger Band strategies.
"""

from typing import Any

import pandas as pd
import vectorbt as vbt

from ..findings import StrategyCondition
from .types import StrategyBase, StrategySignals


class RSIMeanReversionStrategy(StrategyBase):
    """RSI mean reversion strategy."""

    @property
    def name(self) -> str:
        return "RSI_Mean_Reversion"

    @property
    def parameter_space(self) -> dict[str, list[Any]]:
        return {
            "rsi_period": [7, 14, 21],
            "entry_threshold": [20, 25, 30],
            "exit_threshold": [70, 75, 80],
        }

    def generate_signals(
        self,
        prices: pd.DataFrame,
        parameters: dict[str, Any],
    ) -> StrategySignals:
        close = prices["close"]
        rsi_period = parameters.get("rsi_period", 14)
        entry_threshold = parameters.get("entry_threshold", 30)
        exit_threshold = parameters.get("exit_threshold", 70)

        rsi = vbt.RSI.run(close, window=rsi_period).rsi

        entries = rsi < entry_threshold
        exits = rsi > exit_threshold

        return StrategySignals(entries=entries, exits=exits, parameters=parameters)

    def get_entry_conditions(self, parameters: dict[str, Any]) -> list[StrategyCondition]:
        return [
            StrategyCondition(
                indicator=f"rsi_{parameters.get('rsi_period', 14)}",
                operator="<",
                value=parameters.get("entry_threshold", 30),
                description=f"RSI below {parameters.get('entry_threshold', 30)} (oversold)",
            )
        ]

    def get_exit_conditions(self, parameters: dict[str, Any]) -> list[StrategyCondition]:
        return [
            StrategyCondition(
                indicator=f"rsi_{parameters.get('rsi_period', 14)}",
                operator=">",
                value=parameters.get("exit_threshold", 70),
                description=f"RSI above {parameters.get('exit_threshold', 70)} (overbought)",
            )
        ]


class SMACrossoverStrategy(StrategyBase):
    """Simple Moving Average crossover strategy."""

    @property
    def name(self) -> str:
        return "SMA_Crossover"

    @property
    def parameter_space(self) -> dict[str, list[Any]]:
        return {
            "fast_period": [5, 10, 20],
            "slow_period": [20, 50, 100],
        }

    def generate_signals(
        self,
        prices: pd.DataFrame,
        parameters: dict[str, Any],
    ) -> StrategySignals:
        close = prices["close"]
        fast_period = parameters.get("fast_period", 10)
        slow_period = parameters.get("slow_period", 50)

        fast_sma = vbt.MA.run(close, window=fast_period).ma
        slow_sma = vbt.MA.run(close, window=slow_period).ma

        entries = fast_sma > slow_sma
        exits = fast_sma < slow_sma

        entries_shifted = entries.shift(1).fillna(False).infer_objects(copy=False)
        exits_shifted = exits.shift(1).fillna(False).infer_objects(copy=False)
        entries = entries & (~entries_shifted)
        exits = exits & (~exits_shifted)

        return StrategySignals(entries=entries, exits=exits, parameters=parameters)

    def get_entry_conditions(self, parameters: dict[str, Any]) -> list[StrategyCondition]:
        fast = parameters.get("fast_period", 10)
        slow = parameters.get("slow_period", 50)
        return [
            StrategyCondition(
                indicator=f"sma_{fast}",
                operator="crosses_above",
                value=f"sma_{slow}",
                description=f"Fast SMA({fast}) crosses above Slow SMA({slow})",
            )
        ]

    def get_exit_conditions(self, parameters: dict[str, Any]) -> list[StrategyCondition]:
        fast = parameters.get("fast_period", 10)
        slow = parameters.get("slow_period", 50)
        return [
            StrategyCondition(
                indicator=f"sma_{fast}",
                operator="crosses_below",
                value=f"sma_{slow}",
                description=f"Fast SMA({fast}) crosses below Slow SMA({slow})",
            )
        ]


class BollingerBandStrategy(StrategyBase):
    """Bollinger Band mean reversion strategy."""

    @property
    def name(self) -> str:
        return "Bollinger_Band_Reversion"

    @property
    def parameter_space(self) -> dict[str, list[Any]]:
        return {
            "bb_period": [10, 20, 30],
            "bb_std": [1.5, 2.0, 2.5],
        }

    def generate_signals(
        self,
        prices: pd.DataFrame,
        parameters: dict[str, Any],
    ) -> StrategySignals:
        close = prices["close"]
        bb_period = parameters.get("bb_period", 20)
        bb_std = parameters.get("bb_std", 2.0)

        bb = vbt.BBANDS.run(close, window=bb_period, alpha=bb_std)

        entries = close < bb.lower
        exits = close > bb.upper

        return StrategySignals(entries=entries, exits=exits, parameters=parameters)

    def get_entry_conditions(self, parameters: dict[str, Any]) -> list[StrategyCondition]:
        period = parameters.get("bb_period", 20)
        std = parameters.get("bb_std", 2.0)
        return [
            StrategyCondition(
                indicator="close",
                operator="<",
                value=f"bb_lower_{period}_{std}",
                description=f"Price below lower Bollinger Band({period}, {std})",
            )
        ]

    def get_exit_conditions(self, parameters: dict[str, Any]) -> list[StrategyCondition]:
        period = parameters.get("bb_period", 20)
        std = parameters.get("bb_std", 2.0)
        return [
            StrategyCondition(
                indicator="close",
                operator=">",
                value=f"bb_upper_{period}_{std}",
                description=f"Price above upper Bollinger Band({period}, {std})",
            )
        ]


BUILTIN_STRATEGIES: dict[str, type[StrategyBase]] = {
    "RSI_Mean_Reversion": RSIMeanReversionStrategy,
    "SMA_Crossover": SMACrossoverStrategy,
    "Bollinger_Band_Reversion": BollingerBandStrategy,
}
