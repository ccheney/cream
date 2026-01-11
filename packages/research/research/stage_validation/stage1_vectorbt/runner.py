"""
VectorBT backtest runner for Stage 1 validation.

Handles vectorized backtesting and metric extraction using VectorBT.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np
import vectorbt as vbt

if TYPE_CHECKING:
    import pandas as pd
    import polars as pl


def run_backtest(signals: pl.Series, pd_data: pd.DataFrame) -> dict[str, float]:
    """
    Run a single backtest and extract metrics.

    Args:
        signals: Polars Series with signal values
        pd_data: Pandas DataFrame with OHLCV data (VectorBT requires pandas)

    Returns:
        Dictionary of performance metrics
    """
    import pandas

    signals_np = signals.to_numpy()

    entries = signals_np > 0
    exits = signals_np < 0

    pf = vbt.Portfolio.from_signals(
        close=pd_data["close"],
        entries=entries,
        exits=exits,
        fees=0.001,
        freq="1D",
    )

    stats_dict = pf.stats()

    def safe_get(key: str, default: float = 0.0) -> float:
        val = stats_dict.get(key, default)
        return float(val) if pandas.notna(val) else default

    profit_factor = _compute_profit_factor(pf)

    return {
        "sharpe": safe_get("Sharpe Ratio", 0.0),
        "sortino": safe_get("Sortino Ratio", 0.0),
        "calmar": safe_get("Calmar Ratio", 0.0),
        "max_drawdown": safe_get("Max Drawdown [%]", 0.0) / 100.0,
        "win_rate": safe_get("Win Rate [%]", 0.0) / 100.0,
        "profit_factor": profit_factor,
        "num_trades": int(safe_get("Total Trades", 0)),
    }


def _compute_profit_factor(pf: vbt.Portfolio) -> float:
    """
    Compute profit factor from portfolio trades.

    Args:
        pf: VectorBT Portfolio object

    Returns:
        Profit factor (gross profits / gross losses)
    """
    if len(pf.trades.records) == 0:
        return 0.0

    trades = pf.trades.records_readable
    returns = trades["Return"].values
    wins = returns[returns > 0]
    losses = returns[returns < 0]

    if len(losses) == 0 or np.sum(np.abs(losses)) == 0:
        return 0.0

    return float(np.sum(wins) / np.sum(np.abs(losses)))


def to_pandas(data: pl.DataFrame) -> pd.DataFrame:
    """
    Convert Polars DataFrame to pandas for VectorBT compatibility.

    Args:
        data: Polars DataFrame with OHLCV columns

    Returns:
        Pandas DataFrame with same data
    """
    import pandas as pd

    return pd.DataFrame({col: data[col].to_list() for col in data.columns})
