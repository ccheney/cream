"""
Helper functions for VectorBT runner.

Contains metrics extraction, consecutive calculation, and price DataFrame utilities.
"""

import numpy as np
import pandas as pd
import vectorbt as vbt
from numpy.typing import NDArray

from ..findings import PerformanceMetrics


def extract_metrics(portfolio: vbt.Portfolio) -> PerformanceMetrics:
    """Extract performance metrics from a vectorbt portfolio."""
    stats = portfolio.stats()

    def safe_get(key: str, default: float = 0.0) -> float:
        val = stats.get(key, default)
        return float(val) if pd.notna(val) else default

    trades = portfolio.trades.records_readable if len(portfolio.trades.records) > 0 else None
    num_trades = int(safe_get("Total Trades", 0))

    win_rate = 0.0
    avg_return = 0.0
    avg_win = 0.0
    avg_loss = 0.0
    max_cons_wins = 0
    max_cons_losses = 0

    if trades is not None and len(trades) > 0:
        returns = trades["Return"].values
        wins = returns > 0
        win_rate = float(np.sum(wins)) / len(returns) if len(returns) > 0 else 0.0
        avg_return = float(np.mean(returns)) if len(returns) > 0 else 0.0

        winning_returns = returns[wins]
        losing_returns = returns[~wins]
        avg_win = float(np.mean(winning_returns)) if len(winning_returns) > 0 else 0.0
        avg_loss = float(np.mean(losing_returns)) if len(losing_returns) > 0 else 0.0

        max_cons_wins, max_cons_losses = _calculate_consecutive(wins)

    profit_factor = 0.0
    if avg_loss != 0:
        gross_profit = avg_win * (win_rate * num_trades)
        gross_loss = abs(avg_loss) * ((1 - win_rate) * num_trades)
        if gross_loss > 0:
            profit_factor = gross_profit / gross_loss

    sharpe = safe_get("Sharpe Ratio", 0.0)
    sortino = safe_get("Sortino Ratio", 0.0)
    max_dd = safe_get("Max Drawdown [%]", 0.0) / 100.0
    total_return = safe_get("Total Return [%]", 0.0) / 100.0

    calmar = 0.0
    annual_return = safe_get("Annualized Return [%]", 0.0) / 100.0
    if max_dd > 0:
        calmar = annual_return / max_dd

    return PerformanceMetrics(
        sharpe=sharpe,
        sortino=sortino,
        max_drawdown=max_dd,
        win_rate=win_rate,
        avg_return=avg_return,
        total_return=total_return,
        num_trades=num_trades,
        profit_factor=profit_factor,
        avg_win=avg_win,
        avg_loss=avg_loss,
        max_consecutive_wins=max_cons_wins,
        max_consecutive_losses=max_cons_losses,
        calmar_ratio=calmar,
    )


def _calculate_consecutive(wins: NDArray[np.bool_]) -> tuple[int, int]:
    """Calculate max consecutive wins and losses."""
    if len(wins) == 0:
        return 0, 0

    max_wins = 0
    max_losses = 0
    current_wins = 0
    current_losses = 0

    for win in wins:
        if win:
            current_wins += 1
            current_losses = 0
            max_wins = max(max_wins, current_wins)
        else:
            current_losses += 1
            current_wins = 0
            max_losses = max(max_losses, current_losses)

    return max_wins, max_losses


def create_price_dataframe(
    close: pd.Series,
    open_: pd.Series | None = None,
    high: pd.Series | None = None,
    low: pd.Series | None = None,
    volume: pd.Series | None = None,
) -> pd.DataFrame:
    """
    Create a price DataFrame from individual series.

    If only close is provided, generates synthetic OHLV data.
    """
    df = pd.DataFrame({"close": close})

    if open_ is not None:
        df["open"] = open_
    else:
        df["open"] = close.shift(1).fillna(close.iloc[0])

    if high is not None:
        df["high"] = high
    else:
        df["high"] = df[["open", "close"]].max(axis=1) * 1.001

    if low is not None:
        df["low"] = low
    else:
        df["low"] = df[["open", "close"]].min(axis=1) * 0.999

    if volume is not None:
        df["volume"] = volume
    else:
        df["volume"] = 1000000

    return df[["open", "high", "low", "close", "volume"]]
