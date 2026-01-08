"""
Unit Tests for Backtest Runner

Tests the VectorBT backtest runner subprocess script.
See: docs/plans/28-backtest-execution-pipeline.md
"""

from __future__ import annotations

import json
import sys
from typing import Any
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

from research.backtest.runner import BacktestConfig, emit, main, run_backtest

# ============================================
# Fixtures
# ============================================


@pytest.fixture
def sample_prices_df() -> pd.DataFrame:
    """Create sample OHLCV data for testing."""
    np.random.seed(42)
    n = 100

    dates = pd.date_range(start="2024-01-01", periods=n, freq="1h")
    close = 100 * np.cumprod(1 + np.random.normal(0.0001, 0.01, n))

    return pd.DataFrame(
        {
            "open": close * (1 + np.random.uniform(-0.002, 0.002, n)),
            "high": close * (1 + np.abs(np.random.uniform(0, 0.005, n))),
            "low": close * (1 - np.abs(np.random.uniform(0, 0.005, n))),
            "close": close,
            "volume": np.random.uniform(1e6, 5e6, n),
        },
        index=dates,
    )


@pytest.fixture
def sample_signals_df() -> pd.DataFrame:
    """Create sample entry/exit signals for testing."""
    np.random.seed(42)
    n = 100
    dates = pd.date_range(start="2024-01-01", periods=n, freq="1h")

    # Create sparse signals (entry every ~20 bars, exit ~10 bars later)
    entries = np.zeros(n, dtype=bool)
    exits = np.zeros(n, dtype=bool)

    entries[10] = True
    exits[20] = True
    entries[40] = True
    exits[50] = True
    entries[70] = True
    exits[80] = True

    return pd.DataFrame(
        {
            "entries": entries,
            "exits": exits,
        },
        index=dates,
    )


@pytest.fixture
def valid_config_dict() -> dict[str, Any]:
    """Create a valid config dictionary with camelCase keys."""
    return {
        "backtestId": "test-123",
        "dataPath": "/tmp/test_prices.parquet",
        "signalsPath": "/tmp/test_signals.parquet",
        "initialCapital": 50000.0,
        "slippageBps": 10.0,
        "commissionPerShare": 0.005,
        "symbol": "AAPL",
    }


@pytest.fixture
def mock_portfolio():
    """Create a mock VectorBT Portfolio object."""
    mock_pf = MagicMock()

    # Mock stats
    mock_stats = pd.Series(
        {
            "Total Return [%]": 15.5,
            "Sharpe Ratio": 1.25,
            "Sortino Ratio": 1.8,
            "Max Drawdown [%]": 8.2,
            "Win Rate [%]": 55.0,
            "Profit Factor": 1.5,
            "Total Trades": 10,
            "Total Fees Paid": 25.0,
            "Start Value": 100000.0,
            "End Value": 115500.0,
        }
    )
    mock_pf.stats.return_value = mock_stats

    # Mock trades
    trades_df = pd.DataFrame(
        {
            "Entry Timestamp": ["2024-01-01 10:00", "2024-01-02 10:00"],
            "Exit Timestamp": ["2024-01-01 20:00", "2024-01-02 20:00"],
            "Direction": ["Long", "Short"],
            "Size": [100.0, 50.0],
            "Avg Entry Price": [100.0, 105.0],
            "Avg Exit Price": [105.0, 103.0],
            "PnL": [500.0, 100.0],
            "Return": [0.05, 0.02],
        }
    )
    mock_pf.trades.records_readable = trades_df

    # Mock equity curve and drawdown
    dates = pd.date_range("2024-01-01", periods=10, freq="1h")
    mock_pf.value.return_value = pd.Series(
        [100000, 100500, 101000, 100800, 101500, 102000, 101800, 102500, 103000, 103500],
        index=dates,
    )
    mock_pf.drawdown.return_value = pd.Series(
        [0.0, 0.0, 0.0, 0.002, 0.0, 0.0, 0.002, 0.0, 0.0, 0.0],
        index=dates,
    )

    return mock_pf


# ============================================
# emit() Tests
# ============================================


class TestEmit:
    """Tests for JSON event emission to stdout."""

    def test_emit_progress_event(self, capsys):
        """Emit a progress event and verify JSON output."""
        emit({"type": "progress", "pct": 50, "phase": "running"})

        captured = capsys.readouterr()
        event = json.loads(captured.out.strip())

        assert event["type"] == "progress"
        assert event["pct"] == 50
        assert event["phase"] == "running"

    def test_emit_trade_event(self, capsys):
        """Emit a trade event with all fields."""
        trade = {
            "type": "trade",
            "timestamp": "2024-01-01T10:00:00",
            "symbol": "AAPL",
            "action": "BUY",
            "quantity": 100,
            "entryPrice": 150.0,
            "exitPrice": 155.0,
            "pnl": 500.0,
            "returnPct": 3.33,
        }
        emit(trade)

        captured = capsys.readouterr()
        event = json.loads(captured.out.strip())

        assert event["type"] == "trade"
        assert event["symbol"] == "AAPL"
        assert event["quantity"] == 100
        assert event["pnl"] == 500.0

    def test_emit_error_event(self, capsys):
        """Emit an error event."""
        emit({"type": "error", "message": "Data file not found"})

        captured = capsys.readouterr()
        event = json.loads(captured.out.strip())

        assert event["type"] == "error"
        assert "not found" in event["message"]

    def test_emit_completed_event(self, capsys):
        """Emit a completed event with metrics."""
        emit(
            {
                "type": "completed",
                "metrics": {
                    "totalReturn": 0.155,
                    "sharpeRatio": 1.25,
                    "maxDrawdown": 0.082,
                },
            }
        )

        captured = capsys.readouterr()
        event = json.loads(captured.out.strip())

        assert event["type"] == "completed"
        assert event["metrics"]["sharpeRatio"] == 1.25

    def test_emit_equity_event(self, capsys):
        """Emit an equity curve data point."""
        emit(
            {
                "type": "equity",
                "timestamp": "2024-01-01T12:00:00",
                "nav": 100500.0,
                "drawdownPct": 0.5,
            }
        )

        captured = capsys.readouterr()
        event = json.loads(captured.out.strip())

        assert event["type"] == "equity"
        assert event["nav"] == 100500.0
        assert event["drawdownPct"] == 0.5

    def test_emit_multiple_events(self, capsys):
        """Multiple events are emitted as separate lines."""
        emit({"type": "progress", "pct": 10, "phase": "starting"})
        emit({"type": "progress", "pct": 50, "phase": "running"})
        emit({"type": "completed", "metrics": {}})

        captured = capsys.readouterr()
        lines = captured.out.strip().split("\n")

        assert len(lines) == 3
        assert json.loads(lines[0])["pct"] == 10
        assert json.loads(lines[1])["pct"] == 50
        assert json.loads(lines[2])["type"] == "completed"

    def test_emit_handles_unicode(self, capsys):
        """Emit handles unicode characters correctly."""
        emit({"type": "error", "message": "Failed: file 日本語.parquet not found"})

        captured = capsys.readouterr()
        event = json.loads(captured.out.strip())

        assert "日本語" in event["message"]


# ============================================
# BacktestConfig Tests
# ============================================


class TestBacktestConfig:
    """Tests for BacktestConfig dataclass."""

    def test_from_dict_full(self, valid_config_dict):
        """Create config from complete dictionary."""
        config = BacktestConfig.from_dict(valid_config_dict)

        assert config.backtest_id == "test-123"
        assert config.data_path == "/tmp/test_prices.parquet"
        assert config.signals_path == "/tmp/test_signals.parquet"
        assert config.initial_capital == 50000.0
        assert config.slippage_bps == 10.0
        assert config.commission_per_share == 0.005
        assert config.symbol == "AAPL"

    def test_from_dict_defaults(self):
        """Create config with minimal fields uses defaults."""
        minimal = {
            "backtestId": "minimal-test",
            "dataPath": "/data/prices.parquet",
            "signalsPath": "/data/signals.parquet",
        }
        config = BacktestConfig.from_dict(minimal)

        assert config.backtest_id == "minimal-test"
        assert config.initial_capital == 100_000.0
        assert config.slippage_bps == 5.0
        assert config.commission_per_share == 0.0
        assert config.symbol == "PORTFOLIO"

    def test_from_dict_missing_required_field(self):
        """Missing required field raises KeyError."""
        incomplete = {
            "backtestId": "test",
            # missing dataPath and signalsPath
        }

        with pytest.raises(KeyError):
            BacktestConfig.from_dict(incomplete)

    def test_dataclass_direct_creation(self):
        """Create config directly via dataclass."""
        config = BacktestConfig(
            backtest_id="direct-123",
            data_path="/path/to/data.parquet",
            signals_path="/path/to/signals.parquet",
        )

        assert config.backtest_id == "direct-123"
        assert config.initial_capital == 100_000.0  # default


# ============================================
# run_backtest() Tests
# ============================================


class TestRunBacktest:
    """Tests for the main backtest execution function."""

    def test_successful_backtest(self, capsys, sample_prices_df, sample_signals_df, mock_portfolio):
        """Successful backtest emits progress and completion events."""
        config = BacktestConfig(
            backtest_id="success-test",
            data_path="/tmp/prices.parquet",
            signals_path="/tmp/signals.parquet",
        )

        with (
            patch("pandas.read_parquet") as mock_read,
            patch("vectorbt.Portfolio.from_signals") as mock_pf_create,
        ):
            # Setup mocks
            mock_read.side_effect = [sample_prices_df, sample_signals_df]
            mock_pf_create.return_value = mock_portfolio

            run_backtest(config)

        captured = capsys.readouterr()
        lines = [json.loads(line) for line in captured.out.strip().split("\n")]

        # Check progress events
        progress_events = [e for e in lines if e["type"] == "progress"]
        assert len(progress_events) >= 5

        # Check phases
        phases = [e["phase"] for e in progress_events]
        assert "starting" in phases
        assert "loading_data" in phases
        assert "running_simulation" in phases

        # Check completion
        completed = [e for e in lines if e["type"] == "completed"][0]
        assert "metrics" in completed
        assert completed["metrics"]["sharpeRatio"] == 1.25

    def test_emits_trade_events(self, capsys, sample_prices_df, sample_signals_df, mock_portfolio):
        """Backtest emits trade events for each trade."""
        config = BacktestConfig(
            backtest_id="trade-test",
            data_path="/tmp/prices.parquet",
            signals_path="/tmp/signals.parquet",
            symbol="TEST",
        )

        with (
            patch("pandas.read_parquet") as mock_read,
            patch("vectorbt.Portfolio.from_signals") as mock_pf_create,
        ):
            mock_read.side_effect = [sample_prices_df, sample_signals_df]
            mock_pf_create.return_value = mock_portfolio

            run_backtest(config)

        captured = capsys.readouterr()
        lines = [json.loads(line) for line in captured.out.strip().split("\n")]

        trade_events = [e for e in lines if e["type"] == "trade"]
        assert len(trade_events) == 2  # Mock has 2 trades

        # Check first trade
        assert trade_events[0]["symbol"] == "TEST"
        assert trade_events[0]["action"] == "BUY"  # Long direction
        assert trade_events[0]["quantity"] == 100.0
        assert trade_events[0]["pnl"] == 500.0

        # Check second trade (Short)
        assert trade_events[1]["action"] == "SHORT"

    def test_emits_equity_events(self, capsys, sample_prices_df, sample_signals_df, mock_portfolio):
        """Backtest emits equity curve events."""
        config = BacktestConfig(
            backtest_id="equity-test",
            data_path="/tmp/prices.parquet",
            signals_path="/tmp/signals.parquet",
        )

        with (
            patch("pandas.read_parquet") as mock_read,
            patch("vectorbt.Portfolio.from_signals") as mock_pf_create,
        ):
            mock_read.side_effect = [sample_prices_df, sample_signals_df]
            mock_pf_create.return_value = mock_portfolio

            run_backtest(config)

        captured = capsys.readouterr()
        lines = [json.loads(line) for line in captured.out.strip().split("\n")]

        equity_events = [e for e in lines if e["type"] == "equity"]
        assert len(equity_events) > 0

        # Check equity event structure
        eq = equity_events[0]
        assert "timestamp" in eq
        assert "nav" in eq
        assert "drawdownPct" in eq

    def test_error_no_close_column(self, capsys):
        """Error when price data has no close column."""
        config = BacktestConfig(
            backtest_id="no-close-test",
            data_path="/tmp/prices.parquet",
            signals_path="/tmp/signals.parquet",
        )

        bad_prices = pd.DataFrame(
            {
                "open": [100, 101, 102],
                "high": [102, 103, 104],
                "low": [99, 100, 101],
                # Missing 'close' column
            }
        )

        with (
            patch("pandas.read_parquet") as mock_read,
            pytest.raises(SystemExit) as exc_info,
        ):
            mock_read.return_value = bad_prices
            run_backtest(config)

        assert exc_info.value.code == 1

        captured = capsys.readouterr()
        lines = [json.loads(line) for line in captured.out.strip().split("\n")]

        error_events = [e for e in lines if e["type"] == "error"]
        assert len(error_events) == 1
        assert "close" in error_events[0]["message"].lower()

    def test_error_no_entries_column(self, capsys, sample_prices_df):
        """Error when signals data has no entries column."""
        config = BacktestConfig(
            backtest_id="no-entries-test",
            data_path="/tmp/prices.parquet",
            signals_path="/tmp/signals.parquet",
        )

        bad_signals = pd.DataFrame(
            {
                "exits": [True, False, True],
                # Missing 'entries' column
            }
        )

        with (
            patch("pandas.read_parquet") as mock_read,
            pytest.raises(SystemExit) as exc_info,
        ):
            mock_read.side_effect = [sample_prices_df, bad_signals]
            run_backtest(config)

        assert exc_info.value.code == 1

        captured = capsys.readouterr()
        lines = [json.loads(line) for line in captured.out.strip().split("\n")]

        error_events = [e for e in lines if e["type"] == "error"]
        assert len(error_events) == 1
        assert "entries" in error_events[0]["message"].lower()

    def test_error_no_exits_column(self, capsys, sample_prices_df):
        """Error when signals data has no exits column."""
        config = BacktestConfig(
            backtest_id="no-exits-test",
            data_path="/tmp/prices.parquet",
            signals_path="/tmp/signals.parquet",
        )

        bad_signals = pd.DataFrame(
            {
                "entries": [True, False, True],
                # Missing 'exits' column
            }
        )

        with (
            patch("pandas.read_parquet") as mock_read,
            pytest.raises(SystemExit) as exc_info,
        ):
            mock_read.side_effect = [sample_prices_df, bad_signals]
            run_backtest(config)

        assert exc_info.value.code == 1

        captured = capsys.readouterr()
        lines = [json.loads(line) for line in captured.out.strip().split("\n")]

        error_events = [e for e in lines if e["type"] == "error"]
        assert len(error_events) == 1
        assert "exits" in error_events[0]["message"].lower()

    def test_file_not_found_error(self, capsys):
        """Error when data file doesn't exist."""
        config = BacktestConfig(
            backtest_id="file-not-found-test",
            data_path="/nonexistent/path.parquet",
            signals_path="/tmp/signals.parquet",
        )

        with (
            patch("pandas.read_parquet") as mock_read,
            pytest.raises(SystemExit) as exc_info,
        ):
            mock_read.side_effect = FileNotFoundError("File not found")
            run_backtest(config)

        assert exc_info.value.code == 1

        captured = capsys.readouterr()
        lines = [json.loads(line) for line in captured.out.strip().split("\n")]

        error_events = [e for e in lines if e["type"] == "error"]
        assert len(error_events) == 1

    def test_slippage_conversion(self, sample_prices_df, sample_signals_df, mock_portfolio):
        """Slippage is converted from bps to decimal for VectorBT."""
        config = BacktestConfig(
            backtest_id="slippage-test",
            data_path="/tmp/prices.parquet",
            signals_path="/tmp/signals.parquet",
            slippage_bps=15.0,  # 15 basis points
        )

        with (
            patch("pandas.read_parquet") as mock_read,
            patch("vectorbt.Portfolio.from_signals") as mock_pf_create,
        ):
            mock_read.side_effect = [sample_prices_df, sample_signals_df]
            mock_pf_create.return_value = mock_portfolio

            run_backtest(config)

            # Check that VectorBT was called with correct fee (decimal)
            call_kwargs = mock_pf_create.call_args.kwargs
            assert call_kwargs["fees"] == pytest.approx(0.0015)  # 15 bps = 0.0015

    def test_initial_capital_passed(self, sample_prices_df, sample_signals_df, mock_portfolio):
        """Initial capital is passed to VectorBT."""
        config = BacktestConfig(
            backtest_id="capital-test",
            data_path="/tmp/prices.parquet",
            signals_path="/tmp/signals.parquet",
            initial_capital=250_000.0,
        )

        with (
            patch("pandas.read_parquet") as mock_read,
            patch("vectorbt.Portfolio.from_signals") as mock_pf_create,
        ):
            mock_read.side_effect = [sample_prices_df, sample_signals_df]
            mock_pf_create.return_value = mock_portfolio

            run_backtest(config)

            call_kwargs = mock_pf_create.call_args.kwargs
            assert call_kwargs["init_cash"] == 250_000.0

    def test_handles_case_insensitive_columns(self, capsys, sample_signals_df, mock_portfolio):
        """Column names are matched case-insensitively."""
        config = BacktestConfig(
            backtest_id="case-test",
            data_path="/tmp/prices.parquet",
            signals_path="/tmp/signals.parquet",
        )

        # Use uppercase column names
        uppercase_prices = pd.DataFrame(
            {
                "OPEN": [100, 101, 102],
                "HIGH": [102, 103, 104],
                "LOW": [99, 100, 101],
                "CLOSE": [101, 102, 103],  # Uppercase CLOSE
                "VOLUME": [1e6, 2e6, 1.5e6],
            },
            index=pd.date_range("2024-01-01", periods=3, freq="1h"),
        )

        uppercase_signals = pd.DataFrame(
            {
                "ENTRIES": [True, False, False],  # Uppercase
                "EXITS": [False, True, False],  # Uppercase
            },
            index=pd.date_range("2024-01-01", periods=3, freq="1h"),
        )

        with (
            patch("pandas.read_parquet") as mock_read,
            patch("vectorbt.Portfolio.from_signals") as mock_pf_create,
        ):
            mock_read.side_effect = [uppercase_prices, uppercase_signals]
            mock_pf_create.return_value = mock_portfolio

            run_backtest(config)

        captured = capsys.readouterr()
        lines = [json.loads(line) for line in captured.out.strip().split("\n")]

        # Should complete without errors
        completed = [e for e in lines if e["type"] == "completed"]
        assert len(completed) == 1

    def test_handles_empty_trades(self, capsys, sample_prices_df, sample_signals_df):
        """Handles backtest with no trades gracefully."""
        config = BacktestConfig(
            backtest_id="no-trades-test",
            data_path="/tmp/prices.parquet",
            signals_path="/tmp/signals.parquet",
        )

        mock_pf = MagicMock()
        mock_pf.stats.return_value = pd.Series(
            {
                "Total Return [%]": 0.0,
                "Sharpe Ratio": float("nan"),
                "Sortino Ratio": float("nan"),
                "Max Drawdown [%]": 0.0,
                "Win Rate [%]": float("nan"),
                "Profit Factor": float("nan"),
                "Total Trades": 0,
                "Total Fees Paid": 0.0,
                "Start Value": 100000.0,
                "End Value": 100000.0,
            }
        )
        mock_pf.trades.records_readable = pd.DataFrame()  # Empty trades
        dates = pd.date_range("2024-01-01", periods=5, freq="1h")
        mock_pf.value.return_value = pd.Series([100000] * 5, index=dates)
        mock_pf.drawdown.return_value = pd.Series([0.0] * 5, index=dates)

        with (
            patch("pandas.read_parquet") as mock_read,
            patch("vectorbt.Portfolio.from_signals") as mock_pf_create,
        ):
            mock_read.side_effect = [sample_prices_df, sample_signals_df]
            mock_pf_create.return_value = mock_pf

            run_backtest(config)

        captured = capsys.readouterr()
        lines = [json.loads(line) for line in captured.out.strip().split("\n")]

        # Should complete successfully
        completed = [e for e in lines if e["type"] == "completed"]
        assert len(completed) == 1

        # NaN values should be converted to 0.0
        metrics = completed[0]["metrics"]
        assert metrics["sharpeRatio"] == 0.0  # NaN -> 0.0
        assert metrics["totalTrades"] == 0

    def test_handles_nan_metrics(self, capsys, sample_prices_df, sample_signals_df):
        """NaN metrics are safely converted to defaults."""
        config = BacktestConfig(
            backtest_id="nan-test",
            data_path="/tmp/prices.parquet",
            signals_path="/tmp/signals.parquet",
        )

        mock_pf = MagicMock()
        mock_pf.stats.return_value = pd.Series(
            {
                "Total Return [%]": float("nan"),
                "Sharpe Ratio": float("nan"),
                "Sortino Ratio": float("inf"),  # Also test inf
                "Max Drawdown [%]": -float("inf"),
            }
        )
        mock_pf.trades.records_readable = pd.DataFrame()
        dates = pd.date_range("2024-01-01", periods=5, freq="1h")
        mock_pf.value.return_value = pd.Series([100000] * 5, index=dates)
        mock_pf.drawdown.return_value = pd.Series([0.0] * 5, index=dates)

        with (
            patch("pandas.read_parquet") as mock_read,
            patch("vectorbt.Portfolio.from_signals") as mock_pf_create,
        ):
            mock_read.side_effect = [sample_prices_df, sample_signals_df]
            mock_pf_create.return_value = mock_pf

            run_backtest(config)

        captured = capsys.readouterr()
        lines = [json.loads(line) for line in captured.out.strip().split("\n")]

        completed = [e for e in lines if e["type"] == "completed"]
        assert len(completed) == 1

        # NaN should become 0.0
        metrics = completed[0]["metrics"]
        assert metrics["totalReturn"] == 0.0
        assert metrics["sharpeRatio"] == 0.0


# ============================================
# main() CLI Tests
# ============================================


class TestMain:
    """Tests for CLI entry point."""

    def test_main_with_valid_config(self, sample_prices_df, sample_signals_df, mock_portfolio):
        """Main parses JSON config and runs backtest."""
        config_json = json.dumps(
            {
                "backtestId": "cli-test",
                "dataPath": "/tmp/prices.parquet",
                "signalsPath": "/tmp/signals.parquet",
            }
        )

        with (
            patch("pandas.read_parquet") as mock_read,
            patch("vectorbt.Portfolio.from_signals") as mock_pf_create,
            patch.object(sys, "argv", ["runner.py", "--config", config_json]),
        ):
            mock_read.side_effect = [sample_prices_df, sample_signals_df]
            mock_pf_create.return_value = mock_portfolio

            main()  # Should not raise

    def test_main_invalid_json(self):
        """Main raises error on invalid JSON."""
        with (
            patch.object(sys, "argv", ["runner.py", "--config", "not valid json"]),
            pytest.raises(json.JSONDecodeError),
        ):
            main()

    def test_main_missing_config_arg(self):
        """Main raises error when --config is missing."""
        with (
            patch.object(sys, "argv", ["runner.py"]),
            pytest.raises(SystemExit),
        ):
            main()


# ============================================
# Edge Cases
# ============================================


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    def test_large_equity_curve_sampling(self, capsys, sample_signals_df, mock_portfolio):
        """Large equity curves are sampled to max 1000 points."""
        config = BacktestConfig(
            backtest_id="large-curve-test",
            data_path="/tmp/prices.parquet",
            signals_path="/tmp/signals.parquet",
        )

        # Create large price data
        n = 5000
        dates = pd.date_range("2024-01-01", periods=n, freq="1h")
        large_prices = pd.DataFrame(
            {
                "close": np.linspace(100, 150, n),
            },
            index=dates,
        )

        # Create large equity curve
        mock_pf = MagicMock()
        mock_pf.stats.return_value = pd.Series(
            {
                "Total Return [%]": 50.0,
                "Sharpe Ratio": 2.0,
                "Sortino Ratio": 2.5,
                "Max Drawdown [%]": 5.0,
                "Win Rate [%]": 60.0,
                "Profit Factor": 2.0,
                "Total Trades": 50,
                "Total Fees Paid": 100.0,
                "Start Value": 100000.0,
                "End Value": 150000.0,
            }
        )
        mock_pf.trades.records_readable = pd.DataFrame()
        mock_pf.value.return_value = pd.Series(np.linspace(100000, 150000, n), index=dates)
        mock_pf.drawdown.return_value = pd.Series(np.zeros(n), index=dates)

        large_signals = pd.DataFrame(
            {
                "entries": np.zeros(n, dtype=bool),
                "exits": np.zeros(n, dtype=bool),
            },
            index=dates,
        )

        with (
            patch("pandas.read_parquet") as mock_read,
            patch("vectorbt.Portfolio.from_signals") as mock_pf_create,
        ):
            mock_read.side_effect = [large_prices, large_signals]
            mock_pf_create.return_value = mock_pf

            run_backtest(config)

        captured = capsys.readouterr()
        lines = [json.loads(line) for line in captured.out.strip().split("\n")]

        equity_events = [e for e in lines if e["type"] == "equity"]
        # With step = max(1, 5000 // 1000) = 5, we get 1000 points
        assert len(equity_events) <= 1000

    def test_alternative_column_names(self, capsys, sample_prices_df, mock_portfolio):
        """Accepts 'entry'/'exit' as alternative to 'entries'/'exits'."""
        config = BacktestConfig(
            backtest_id="alt-names-test",
            data_path="/tmp/prices.parquet",
            signals_path="/tmp/signals.parquet",
        )

        alt_signals = pd.DataFrame(
            {
                "entry": [True, False, True],  # singular
                "exit": [False, True, False],  # singular
            },
            index=pd.date_range("2024-01-01", periods=3, freq="1h"),
        )

        with (
            patch("pandas.read_parquet") as mock_read,
            patch("vectorbt.Portfolio.from_signals") as mock_pf_create,
        ):
            mock_read.side_effect = [sample_prices_df, alt_signals]
            mock_pf_create.return_value = mock_portfolio

            run_backtest(config)

        captured = capsys.readouterr()
        lines = [json.loads(line) for line in captured.out.strip().split("\n")]

        completed = [e for e in lines if e["type"] == "completed"]
        assert len(completed) == 1
