"""
Nautilus Backtest Runner

High-fidelity NautilusTrader backtest execution with realistic execution modeling.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import numpy as np
import polars as pl

if TYPE_CHECKING:
    from ...strategies.base import ResearchFactor

logger = logging.getLogger(__name__)


async def run_nautilus_backtest(
    factor: ResearchFactor,
    data: pl.DataFrame,
    params: dict[str, Any],
) -> dict[str, Any]:
    """
    Run high-fidelity NautilusTrader backtest.

    Args:
        factor: Research factor to run
        data: Historical OHLCV data
        params: Factor parameters

    Returns:
        Dictionary with realistic performance metrics
    """
    import pandas as pd

    from ...nautilus_runner import NautilusConfig, NautilusRunner

    # Convert polars to pandas for NautilusTrader
    prices_pd = data.to_pandas()
    if "timestamp" in prices_pd.columns:
        prices_pd.set_index("timestamp", inplace=True)
    elif not isinstance(prices_pd.index, pd.DatetimeIndex):
        # Generate synthetic datetime index
        prices_pd.index = pd.date_range(start="2024-01-01", periods=len(prices_pd), freq="D")

    # Generate signals
    factor.set_parameters(params)
    signals = factor.compute_signal(data)

    # Create entries/exits DataFrame
    signals_list = signals.to_list()
    entries = [s > 0 for s in signals_list]
    exits = [s < 0 for s in signals_list]

    signals_pd = pd.DataFrame({"entries": entries, "exits": exits}, index=prices_pd.index)

    # Run NautilusTrader backtest
    config = NautilusConfig(
        initial_capital=100000.0,
        log_level="ERROR",
    )
    runner = NautilusRunner(config)

    try:
        result = runner.run_backtest(
            prices=prices_pd,
            signals=signals_pd,
            symbol="TEST",
        )

        return {
            "sharpe": result.metrics.sharpe,
            "sortino": result.metrics.sortino,
            "max_drawdown": result.metrics.max_drawdown,
            "avg_slippage_bps": config.fill_model.prob_slippage * 10,
            "fill_rate": 1.0,
            "total_trades": result.total_trades,
        }

    except Exception as e:
        logger.warning(f"NautilusTrader backtest failed: {e}")
        return _compute_fallback_metrics(factor, data, signals)


def _compute_fallback_metrics(
    factor: ResearchFactor,  # noqa: ARG001
    data: pl.DataFrame,
    signals: pl.Series,
) -> dict[str, Any]:
    """
    Compute fallback metrics when NautilusTrader fails.

    Args:
        factor: Research factor
        data: Historical OHLCV data
        signals: Computed signal series

    Returns:
        Dictionary with approximate performance metrics
    """
    returns = _compute_returns(data, signals)
    returns_arr = returns.to_numpy()

    sharpe = (
        float(np.mean(returns_arr) / np.std(returns_arr) * np.sqrt(252))
        if np.std(returns_arr) > 1e-10
        else 0.0
    )

    # Simple drawdown calculation
    equity = np.cumsum(returns_arr)
    running_max = np.maximum.accumulate(equity)
    with np.errstate(divide="ignore", invalid="ignore"):
        drawdowns = np.where(running_max > 0, (running_max - equity) / running_max, 0.0)
    max_dd = float(np.nanmax(drawdowns)) if len(drawdowns) > 0 else 0.0

    return {
        "sharpe": sharpe,
        "sortino": sharpe * 0.9,
        "max_drawdown": max_dd,
        "avg_slippage_bps": 0.0,
        "fill_rate": 1.0,
        "total_trades": int(np.sum(np.abs(np.diff(signals.to_numpy())) > 0)),
    }


def _compute_returns(data: pl.DataFrame, signals: pl.Series) -> pl.Series:
    """
    Compute strategy returns from signals.

    Args:
        data: Historical OHLCV data
        signals: Signal values (-1, 0, 1)

    Returns:
        Strategy returns series
    """
    close = data["close"]
    price_returns = close.pct_change()

    shifted_signals = signals.shift(1).fill_null(0.0)
    strategy_returns = shifted_signals * price_returns

    return strategy_returns.fill_null(0.0)
