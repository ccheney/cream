"""
Multi-Asset Backtest

Run backtests across multiple symbols with combined metrics.
"""

import time
import uuid

import pandas as pd

from .helpers import combine_metrics
from .runner import NautilusRunner
from .types import MultiAssetBacktestResult, NautilusConfig


def run_multi_asset_backtest(
    prices_by_symbol: dict[str, pd.DataFrame],
    signals_by_symbol: dict[str, pd.DataFrame],
    config: NautilusConfig | None = None,
) -> MultiAssetBacktestResult:
    """
    Run a multi-asset backtest across multiple symbols.

    Args:
        prices_by_symbol: Dict mapping symbol to OHLCV DataFrame
        signals_by_symbol: Dict mapping symbol to signals DataFrame
        config: Optional NautilusConfig

    Returns:
        MultiAssetBacktestResult with combined metrics
    """
    start_time = time.time()
    runner = NautilusRunner(config=config)

    per_symbol_results = {}
    for symbol in prices_by_symbol:
        if symbol not in signals_by_symbol:
            continue
        result = runner.run_backtest(
            prices_by_symbol[symbol],
            signals_by_symbol[symbol],
            symbol,
        )
        per_symbol_results[symbol] = result

    combined_metrics = combine_metrics(list(per_symbol_results.values()))

    all_starts = [r.start_date for r in per_symbol_results.values()]
    all_ends = [r.end_date for r in per_symbol_results.values()]

    return MultiAssetBacktestResult(
        result_id=str(uuid.uuid4()),
        strategy_name="MultiAssetStrategy",
        metrics=combined_metrics,
        start_date=min(all_starts) if all_starts else "",
        end_date=max(all_ends) if all_ends else "",
        symbols=list(prices_by_symbol.keys()),
        config=config or NautilusConfig(),
        per_symbol_results=per_symbol_results,
        total_trades=sum(r.total_trades for r in per_symbol_results.values()),
        run_duration_seconds=time.time() - start_time,
    )
