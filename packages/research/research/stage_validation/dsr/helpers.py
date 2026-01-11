"""
DSR Helpers: Utility functions for DSR calculations.
"""

from __future__ import annotations

import numpy as np
import polars as pl


def compute_skewness(x: np.ndarray) -> float:
    """
    Compute sample skewness.

    Skewness measures asymmetry of the return distribution.
    Negative skewness (fat left tail) is common in equity returns.
    """
    n = len(x)
    if n < 3:
        return 0.0

    mean = np.mean(x)
    std = np.std(x, ddof=1)
    if std == 0:
        return 0.0

    return (n / ((n - 1) * (n - 2))) * np.sum(((x - mean) / std) ** 3)


def compute_kurtosis(x: np.ndarray) -> float:
    """
    Compute sample excess kurtosis.

    Excess kurtosis > 0 indicates fat tails (more extreme events
    than normal distribution). Financial returns typically have
    positive excess kurtosis.
    """
    n = len(x)
    if n < 4:
        return 0.0

    mean = np.mean(x)
    std = np.std(x, ddof=1)
    if std == 0:
        return 0.0

    m4 = np.mean((x - mean) ** 4)
    return (m4 / std**4) - 3


def compute_strategy_returns(data: pl.DataFrame, signals: pl.Series) -> pl.Series:
    """
    Compute strategy returns from signals.

    Simple implementation: buy on signal > 0, sell on signal < 0.

    Args:
        data: DataFrame with 'close' column
        signals: Signal series

    Returns:
        Strategy returns series
    """
    close = data["close"]
    price_returns = close.pct_change()

    # Position: 1 when signal > 0, -1 when signal < 0, 0 otherwise
    positions = (signals > 0).cast(pl.Float64) - (signals < 0).cast(pl.Float64)

    # Strategy return = position[t-1] * price_return[t]
    strategy_returns = positions.shift(1) * price_returns

    return strategy_returns.fill_null(0.0)
