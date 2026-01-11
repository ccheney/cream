"""
Backtest Runner

Standalone script that runs VectorBT backtests and streams JSON events to stdout.
Designed to be called as a subprocess from the dashboard-api.

Usage:
    uv run python -m research.backtest.runner --config '{"backtestId": "...", ...}'

Output:
    One JSON object per line to stdout:
    {"type": "progress", "pct": 10, "phase": "loading_data"}
    {"type": "trade", "timestamp": "...", "symbol": "...", ...}
    {"type": "equity", "timestamp": "...", "nav": ..., "drawdownPct": ...}
    {"type": "completed", "metrics": {...}}
    {"type": "error", "message": "..."}

See: docs/plans/28-backtest-execution-pipeline.md
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from typing import Any

import pandas as pd
import vectorbt as vbt


@dataclass
class BacktestConfig:
    """Configuration for backtest execution."""

    backtest_id: str
    data_path: str
    signals_path: str
    initial_capital: float = 100_000.0
    slippage_bps: float = 5.0
    commission_per_share: float = 0.0
    symbol: str = "PORTFOLIO"

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BacktestConfig:
        """Create config from dictionary (camelCase keys)."""
        return cls(
            backtest_id=data["backtestId"],
            data_path=data["dataPath"],
            signals_path=data["signalsPath"],
            initial_capital=data.get("initialCapital", 100_000.0),
            slippage_bps=data.get("slippageBps", 5.0),
            commission_per_share=data.get("commissionPerShare", 0.0),
            symbol=data.get("symbol", "PORTFOLIO"),
        )


def sanitize_for_json(obj: Any) -> Any:
    """Recursively sanitize values for JSON (handle inf/nan)."""
    import math

    if isinstance(obj, float):
        if math.isinf(obj) or math.isnan(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    return obj


def emit(event: dict[str, Any]) -> None:
    """Write JSON event to stdout (one per line)."""
    sanitized = sanitize_for_json(event)
    print(json.dumps(sanitized), flush=True)


def run_backtest(config: BacktestConfig) -> None:
    """
    Run backtest and emit progress events.

    Loads OHLCV data and signals from Parquet files, runs VectorBT
    Portfolio.from_signals(), and streams results as JSON events.
    """
    try:
        emit({"type": "progress", "pct": 5, "phase": "starting"})

        # Load price data
        emit({"type": "progress", "pct": 10, "phase": "loading_data"})
        prices_df = pd.read_parquet(config.data_path)

        # Ensure we have 'close' column (case-insensitive)
        close_col = None
        for col in prices_df.columns:
            if col.lower() == "close":
                close_col = col
                break

        if close_col is None:
            raise ValueError(f"No 'close' column found in data. Columns: {list(prices_df.columns)}")

        close_prices = prices_df[close_col]

        # Load signals
        emit({"type": "progress", "pct": 20, "phase": "loading_signals"})
        signals_df = pd.read_parquet(config.signals_path)

        # Get entry/exit signals (case-insensitive)
        entries_col = None
        exits_col = None
        for col in signals_df.columns:
            if col.lower() in ("entries", "entry"):
                entries_col = col
            elif col.lower() in ("exits", "exit"):
                exits_col = col

        if entries_col is None:
            raise ValueError(
                f"No 'entries' column found in signals. Columns: {list(signals_df.columns)}"
            )
        if exits_col is None:
            raise ValueError(
                f"No 'exits' column found in signals. Columns: {list(signals_df.columns)}"
            )

        entries = signals_df[entries_col].astype(bool)
        exits = signals_df[exits_col].astype(bool)

        # Run portfolio simulation
        emit({"type": "progress", "pct": 30, "phase": "running_simulation"})

        # Convert slippage from basis points to decimal
        slippage = config.slippage_bps / 10_000

        pf = vbt.Portfolio.from_signals(
            close=close_prices,
            entries=entries,
            exits=exits,
            init_cash=config.initial_capital,
            fees=slippage,
            freq="1h",
        )

        # Calculate metrics
        emit({"type": "progress", "pct": 60, "phase": "calculating_metrics"})
        stats = pf.stats()

        # Emit trades
        emit({"type": "progress", "pct": 70, "phase": "extracting_trades"})
        trades_df = pf.trades.records_readable

        if len(trades_df) > 0:
            for _, trade in trades_df.iterrows():
                # Determine direction
                direction = trade.get("Direction", "Long")
                action = "BUY" if direction == "Long" else "SHORT"

                emit(
                    {
                        "type": "trade",
                        "timestamp": str(trade.get("Entry Timestamp", "")),
                        "exitTimestamp": str(trade.get("Exit Timestamp", "")),
                        "symbol": config.symbol,
                        "action": action,
                        "quantity": float(trade.get("Size", 0)),
                        "entryPrice": float(trade.get("Avg Entry Price", 0)),
                        "exitPrice": float(trade.get("Avg Exit Price", 0)),
                        "pnl": float(trade.get("PnL", 0)),
                        "returnPct": float(trade.get("Return", 0)) * 100,
                    }
                )

        # Emit equity curve
        emit({"type": "progress", "pct": 85, "phase": "building_equity_curve"})
        equity = pf.value()
        drawdown = pf.drawdown()

        # Sample equity curve (max 1000 points for performance)
        step = max(1, len(equity) // 1000)
        for i in range(0, len(equity), step):
            timestamp = equity.index[i]
            emit(
                {
                    "type": "equity",
                    "timestamp": str(timestamp),
                    "nav": float(equity.iloc[i]),
                    "drawdownPct": float(drawdown.iloc[i] * 100),
                }
            )

        # Extract metrics safely
        def safe_get(key: str, default: float = 0.0) -> float:
            """Safely get stat value, handling NaN."""
            val = stats.get(key, default)
            if pd.isna(val):
                return default
            return float(val)

        # Emit completion with metrics
        emit(
            {
                "type": "completed",
                "metrics": {
                    "totalReturn": safe_get("Total Return [%]") / 100,
                    "sharpeRatio": safe_get("Sharpe Ratio"),
                    "sortinoRatio": safe_get("Sortino Ratio"),
                    "maxDrawdown": safe_get("Max Drawdown [%]") / 100,
                    "winRate": safe_get("Win Rate [%]") / 100,
                    "profitFactor": safe_get("Profit Factor"),
                    "totalTrades": int(safe_get("Total Trades")),
                    "totalFeesPaid": safe_get("Total Fees Paid"),
                    "startValue": safe_get("Start Value"),
                    "endValue": safe_get("End Value"),
                },
            }
        )

    except Exception as e:
        emit({"type": "error", "message": str(e)})
        sys.exit(1)


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Run VectorBT backtest and stream JSON events to stdout"
    )
    parser.add_argument(
        "--config",
        required=True,
        help="JSON config string with backtestId, dataPath, signalsPath, etc.",
    )
    args = parser.parse_args()

    config_dict = json.loads(args.config)
    config = BacktestConfig.from_dict(config_dict)
    run_backtest(config)


if __name__ == "__main__":
    main()
