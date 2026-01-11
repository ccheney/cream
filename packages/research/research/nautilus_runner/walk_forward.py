"""
Walk-Forward Optimization

Run walk-forward optimization to detect overfitting.
"""

import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Any

import pandas as pd
from dateutil.relativedelta import relativedelta  # type: ignore[import-untyped]

from ..findings import PerformanceMetrics
from .helpers import combine_metrics
from .runner import NautilusRunner
from .types import NautilusConfig, WalkForwardResult, WalkForwardWindow


def generate_walk_forward_windows(
    start_date: str,
    end_date: str,
    train_months: int = 12,
    test_months: int = 3,
    step_months: int = 3,
) -> list[WalkForwardWindow]:
    """
    Generate walk-forward windows for optimization.

    Args:
        start_date: Start date (ISO-8601)
        end_date: End date (ISO-8601)
        train_months: Number of months for training window
        test_months: Number of months for testing window
        step_months: Number of months to step forward

    Returns:
        List of WalkForwardWindow objects
    """
    windows = []
    current_start = datetime.fromisoformat(start_date)
    end_dt = datetime.fromisoformat(end_date)

    while True:
        train_end = current_start + relativedelta(months=train_months)
        test_start = train_end
        test_end = test_start + relativedelta(months=test_months)

        if test_end > end_dt:
            break

        windows.append(
            WalkForwardWindow(
                train_start=current_start.isoformat(),
                train_end=train_end.isoformat(),
                test_start=test_start.isoformat(),
                test_end=test_end.isoformat(),
            )
        )

        current_start += relativedelta(months=step_months)

    return windows


def _create_empty_metrics() -> PerformanceMetrics:
    """Create empty PerformanceMetrics with zero values."""
    return PerformanceMetrics(
        sharpe=0.0,
        sortino=0.0,
        max_drawdown=0.0,
        win_rate=0.0,
        avg_return=0.0,
        total_return=0.0,
        profit_factor=0.0,
    )


def run_walk_forward_optimization(
    prices: pd.DataFrame,
    signals_generator: Callable[[pd.DataFrame, dict[str, Any]], pd.DataFrame],
    symbol: str,
    param_grid: list[dict[str, Any]],
    windows: list[WalkForwardWindow],
    config: NautilusConfig | None = None,
    metric_to_optimize: str = "sharpe",
) -> WalkForwardResult:
    """
    Run walk-forward optimization.

    For each window:
    1. Optimize parameters on in-sample data
    2. Test with optimized parameters on out-of-sample data

    Args:
        prices: Full OHLCV DataFrame
        signals_generator: Function(prices, params) -> signals DataFrame
        symbol: Ticker symbol
        param_grid: List of parameter combinations to test
        windows: Walk-forward windows
        config: Optional NautilusConfig
        metric_to_optimize: Metric to maximize ('sharpe', 'sortino', 'total_return')

    Returns:
        WalkForwardResult with combined OOS metrics
    """
    runner = NautilusRunner(config=config)

    for window in windows:
        is_mask = (prices.index >= window.train_start) & (prices.index < window.train_end)
        is_prices = prices[is_mask]

        best_params: dict[str, Any] = {}
        best_metric = float("-inf")
        best_is_result = None

        for params in param_grid:
            signals = signals_generator(is_prices, params)
            result = runner.run_backtest(
                is_prices,
                signals,
                symbol,
                start_date=window.train_start,
                end_date=window.train_end,
            )
            metric_value = getattr(result.metrics, metric_to_optimize)
            if metric_value > best_metric:
                best_metric = metric_value
                best_params = params
                best_is_result = result

        window.optimized_params = best_params
        window.in_sample_result = best_is_result

        oos_mask = (prices.index >= window.test_start) & (prices.index < window.test_end)
        oos_prices = prices[oos_mask]

        if len(oos_prices) > 0:
            oos_signals = signals_generator(oos_prices, best_params)
            window.out_of_sample_result = runner.run_backtest(
                oos_prices,
                oos_signals,
                symbol,
                start_date=window.test_start,
                end_date=window.test_end,
            )

    is_results = [w.in_sample_result for w in windows if w.in_sample_result]
    oos_results = [w.out_of_sample_result for w in windows if w.out_of_sample_result]

    combined_is = combine_metrics(is_results) if is_results else _create_empty_metrics()
    combined_oos = combine_metrics(oos_results) if oos_results else _create_empty_metrics()

    overfitting_ratio = combined_oos.sharpe / combined_is.sharpe if combined_is.sharpe != 0 else 0.0

    return WalkForwardResult(
        result_id=str(uuid.uuid4()),
        strategy_name=f"WalkForward-{symbol}",
        windows=windows,
        combined_oos_metrics=combined_oos,
        combined_is_metrics=combined_is,
        overfitting_ratio=overfitting_ratio,
    )
