"""
NautilusTrader Runner Helpers

Utility functions for metrics calculation, data conversion, and comparison.
"""

from typing import Any

import pandas as pd
from nautilus_trader.backtest.engine import BacktestEngine
from nautilus_trader.model.data import Bar, BarType
from nautilus_trader.model.identifiers import InstrumentId
from nautilus_trader.model.objects import Price, Quantity

from ..findings import PerformanceMetrics
from .types import BacktestResult


def dataframe_to_bars(
    prices: pd.DataFrame,
    instrument_id: InstrumentId,
) -> list[Bar]:
    """Convert DataFrame to NautilusTrader bars."""
    bars = []
    bar_type = BarType.from_str(f"{instrument_id}-1-HOUR-LAST-EXTERNAL")

    for idx, row in prices.iterrows():
        if isinstance(idx, pd.Timestamp):
            ts_event = int(idx.timestamp() * 1e9)
        else:
            ts_event = int(idx * 1e9)

        bar = Bar(
            bar_type=bar_type,
            open=Price.from_str(str(round(row["open"], 2))),
            high=Price.from_str(str(round(row["high"], 2))),
            low=Price.from_str(str(round(row["low"], 2))),
            close=Price.from_str(str(round(row["close"], 2))),
            volume=Quantity.from_str(str(int(row.get("volume", 1000000)))),
            ts_event=ts_event,
            ts_init=ts_event,
        )
        bars.append(bar)

    return bars


def extract_metrics(engine: BacktestEngine, account: Any) -> PerformanceMetrics:  # noqa: ARG001
    """Extract performance metrics from backtest results."""
    try:
        returns = engine.trader.portfolio.analyzer.get_performance_stats()
        sharpe = float(returns.get("sharpe_ratio", 0.0) or 0.0)
        sortino = float(returns.get("sortino_ratio", 0.0) or 0.0)
        max_dd = float(returns.get("max_drawdown", 0.0) or 0.0)
        total_return = float(returns.get("total_return", 0.0) or 0.0)
        win_rate = float(returns.get("win_rate", 0.0) or 0.0)
        avg_return = float(returns.get("avg_return", 0.0) or 0.0)
        profit_factor = float(returns.get("profit_factor", 0.0) or 0.0)
    except (AttributeError, KeyError):
        sharpe = 0.0
        sortino = 0.0
        max_dd = 0.0
        total_return = 0.0
        win_rate = 0.0
        avg_return = 0.0
        profit_factor = 0.0

    return PerformanceMetrics(
        sharpe=sharpe,
        sortino=sortino,
        max_drawdown=abs(max_dd),
        win_rate=win_rate,
        avg_return=avg_return,
        total_return=total_return,
        profit_factor=profit_factor,
    )


def combine_metrics(results: list[BacktestResult]) -> PerformanceMetrics:
    """Combine metrics from multiple backtest results."""
    if not results:
        return PerformanceMetrics(
            sharpe=0.0,
            sortino=0.0,
            max_drawdown=0.0,
            win_rate=0.0,
            avg_return=0.0,
            total_return=0.0,
            profit_factor=0.0,
        )

    total_trades = sum(r.total_trades for r in results)
    if total_trades == 0:
        total_trades = len(results)

    def weighted_avg(attr: str) -> float:
        total = sum(getattr(r.metrics, attr) * r.total_trades for r in results)
        return total / total_trades if total_trades > 0 else 0.0

    return PerformanceMetrics(
        sharpe=weighted_avg("sharpe"),
        sortino=weighted_avg("sortino"),
        max_drawdown=max(r.metrics.max_drawdown for r in results),
        win_rate=weighted_avg("win_rate"),
        avg_return=weighted_avg("avg_return"),
        total_return=sum(r.metrics.total_return for r in results) / len(results),
        profit_factor=weighted_avg("profit_factor"),
    )


def safe_pct_diff(a: float, b: float) -> float:
    """Calculate percentage difference, handling zeros."""
    if abs(b) < 1e-10:
        return 0.0 if abs(a) < 1e-10 else float("inf")
    return ((a - b) / abs(b)) * 100


def compare_with_vectorbt(
    nautilus_result: BacktestResult,
    vectorbt_metrics: PerformanceMetrics,
) -> dict[str, Any]:
    """
    Compare NautilusTrader results with Vectorbt results.

    Args:
        nautilus_result: Result from NautilusTrader backtest
        vectorbt_metrics: Metrics from Vectorbt backtest

    Returns:
        Comparison dictionary with differences
    """
    nm = nautilus_result.metrics
    vm = vectorbt_metrics

    return {
        "sharpe_diff_pct": safe_pct_diff(nm.sharpe, vm.sharpe),
        "sortino_diff_pct": safe_pct_diff(nm.sortino, vm.sortino),
        "max_drawdown_diff_pct": safe_pct_diff(nm.max_drawdown, vm.max_drawdown),
        "total_return_diff_pct": safe_pct_diff(nm.total_return, vm.total_return),
        "win_rate_diff_pct": safe_pct_diff(nm.win_rate, vm.win_rate),
        "nautilus_metrics": {
            "sharpe": nm.sharpe,
            "sortino": nm.sortino,
            "max_drawdown": nm.max_drawdown,
            "total_return": nm.total_return,
            "win_rate": nm.win_rate,
        },
        "vectorbt_metrics": {
            "sharpe": vm.sharpe,
            "sortino": vm.sortino,
            "max_drawdown": vm.max_drawdown,
            "total_return": vm.total_return,
            "win_rate": vm.win_rate,
        },
        "execution_cost_impact": nm.total_return - vm.total_return,
    }
