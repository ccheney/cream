"""
Vectorbt Runner Module

High-performance parameter scanning and backtesting using vectorbt.
Leverages Numba JIT compilation for speed.

See: docs/plans/10-research.md - Rapid Hypothesis Generation
"""

from .helpers import create_price_dataframe, extract_metrics
from .runner import VectorbtRunner
from .strategies import (
    BUILTIN_STRATEGIES,
    BollingerBandStrategy,
    RSIMeanReversionStrategy,
    SMACrossoverStrategy,
)
from .types import StrategyBase, StrategySignals

__all__ = [
    "BUILTIN_STRATEGIES",
    "BollingerBandStrategy",
    "RSIMeanReversionStrategy",
    "SMACrossoverStrategy",
    "StrategyBase",
    "StrategySignals",
    "VectorbtRunner",
    "create_price_dataframe",
    "extract_metrics",
]
