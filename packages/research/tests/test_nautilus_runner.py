"""Tests for NautilusRunner and configuration classes."""

import uuid
from datetime import datetime

import numpy as np
import pandas as pd
import pytest

from research.findings import PerformanceMetrics, StrategyCondition
from research.nautilus_runner import (
    BacktestResult,
    CommissionConfig,
    FillModelConfig,
    NautilusConfig,
    NautilusRunner,
)


# ============================================
# Fixtures
# ============================================


@pytest.fixture
def sample_prices() -> pd.DataFrame:
    """Create sample OHLCV data for testing."""
    np.random.seed(42)
    n = 100

    returns = np.random.normal(0.0002, 0.02, n)
    close = 100 * np.cumprod(1 + returns)

    dates = pd.date_range(start="2024-01-01", periods=n, freq="1h")

    # Generate OHLC data ensuring proper relationships:
    # low <= open <= high and low <= close <= high
    open_prices = close * (1 + np.random.uniform(-0.002, 0.002, n))
    high_prices = np.maximum(open_prices, close) * (1 + np.abs(np.random.uniform(0, 0.005, n)))
    low_prices = np.minimum(open_prices, close) * (1 - np.abs(np.random.uniform(0, 0.005, n)))

    return pd.DataFrame(
        {
            "open": open_prices,
            "high": high_prices,
            "low": low_prices,
            "close": close,
            "volume": np.random.uniform(1e6, 5e6, n),
        },
        index=dates,
    )


@pytest.fixture
def sample_signals(sample_prices) -> pd.DataFrame:
    """Create sample entry/exit signals."""
    n = len(sample_prices)
    entries = np.zeros(n, dtype=bool)
    exits = np.zeros(n, dtype=bool)

    # Simple alternating signals
    entries[10] = True
    exits[20] = True
    entries[30] = True
    exits[40] = True

    return pd.DataFrame(
        {"entries": entries, "exits": exits},
        index=sample_prices.index,
    )


# ============================================
# FillModelConfig Tests
# ============================================


class TestFillModelConfig:
    """Tests for FillModelConfig dataclass."""

    def test_default_values(self):
        """Test default configuration values."""
        config = FillModelConfig()

        assert config.prob_fill_on_limit == 0.2
        assert config.prob_slippage == 0.5
        assert config.random_seed == 42

    def test_custom_values(self):
        """Test custom configuration values."""
        config = FillModelConfig(
            prob_fill_on_limit=0.5,
            prob_slippage=0.3,
            random_seed=123,
        )

        assert config.prob_fill_on_limit == 0.5
        assert config.prob_slippage == 0.3
        assert config.random_seed == 123

    def test_none_random_seed(self):
        """Test None random seed for non-reproducible results."""
        config = FillModelConfig(random_seed=None)
        assert config.random_seed is None


# ============================================
# CommissionConfig Tests
# ============================================


class TestCommissionConfig:
    """Tests for CommissionConfig dataclass."""

    def test_default_values(self):
        """Test default commission values."""
        config = CommissionConfig()

        assert config.equity_per_share == 0.005
        assert config.option_per_contract == 0.65
        assert config.minimum == 1.0

    def test_custom_values(self):
        """Test custom commission values."""
        config = CommissionConfig(
            equity_per_share=0.01,
            option_per_contract=1.25,
            minimum=2.0,
        )

        assert config.equity_per_share == 0.01
        assert config.option_per_contract == 1.25
        assert config.minimum == 2.0


# ============================================
# NautilusConfig Tests
# ============================================


class TestNautilusConfig:
    """Tests for NautilusConfig dataclass."""

    def test_default_values(self):
        """Test default configuration."""
        config = NautilusConfig()

        assert config.trader_id == "BACKTEST-001"
        assert config.venue_name == "SIM"
        assert config.base_currency == "USD"
        assert config.initial_capital == 100000.0
        assert config.oms_type == "NETTING"
        assert config.account_type == "CASH"
        assert config.log_level == "WARNING"

    def test_nested_configs(self):
        """Test that nested configs are created."""
        config = NautilusConfig()

        assert isinstance(config.fill_model, FillModelConfig)
        assert isinstance(config.commission, CommissionConfig)

    def test_custom_values(self):
        """Test custom configuration."""
        config = NautilusConfig(
            trader_id="CUSTOM-001",
            venue_name="NYSE",
            initial_capital=500000.0,
            oms_type="HEDGING",
            account_type="MARGIN",
        )

        assert config.trader_id == "CUSTOM-001"
        assert config.venue_name == "NYSE"
        assert config.initial_capital == 500000.0
        assert config.oms_type == "HEDGING"
        assert config.account_type == "MARGIN"

    def test_custom_fill_model(self):
        """Test custom fill model configuration."""
        fill_config = FillModelConfig(prob_slippage=0.8)
        config = NautilusConfig(fill_model=fill_config)

        assert config.fill_model.prob_slippage == 0.8


# ============================================
# BacktestResult Tests
# ============================================


class TestBacktestResult:
    """Tests for BacktestResult dataclass."""

    def test_create_result(self):
        """Test creating a backtest result."""
        metrics = PerformanceMetrics(
            sharpe=1.5,
            sortino=2.0,
            max_drawdown=0.15,
            win_rate=0.55,
            avg_return=0.02,
        )

        result = BacktestResult(
            result_id=str(uuid.uuid4()),
            strategy_name="TestStrategy",
            metrics=metrics,
            start_date="2024-01-01",
            end_date="2024-06-01",
            symbols=["AAPL", "MSFT"],
            config=NautilusConfig(),
            total_trades=50,
            total_orders=55,
            run_duration_seconds=5.5,
            events_processed=10000,
        )

        assert result.strategy_name == "TestStrategy"
        assert result.metrics.sharpe == 1.5
        assert len(result.symbols) == 2
        assert result.total_trades == 50
        assert result.run_duration_seconds == 5.5

    def test_empty_orders_and_fills(self):
        """Test that orders and fills default to empty lists."""
        metrics = PerformanceMetrics(
            sharpe=1.0, sortino=1.0, max_drawdown=0.1, win_rate=0.5, avg_return=0.01
        )

        result = BacktestResult(
            result_id="test",
            strategy_name="Test",
            metrics=metrics,
            start_date="2024-01-01",
            end_date="2024-06-01",
            symbols=["TEST"],
            config=NautilusConfig(),
            total_trades=0,
            total_orders=0,
            run_duration_seconds=1.0,
            events_processed=100,
        )

        assert result.orders == []
        assert result.fills == []


# ============================================
# NautilusRunner Tests
# ============================================


class TestNautilusRunner:
    """Tests for NautilusRunner class."""

    def test_init_default_config(self):
        """Test initialization with default config."""
        runner = NautilusRunner()

        assert runner.config is not None
        assert runner.config.trader_id == "BACKTEST-001"

    def test_init_custom_config(self):
        """Test initialization with custom config."""
        config = NautilusConfig(trader_id="CUSTOM-001", initial_capital=500000.0)
        runner = NautilusRunner(config=config)

        assert runner.config.trader_id == "CUSTOM-001"
        assert runner.config.initial_capital == 500000.0

    def test_create_fill_model(self):
        """Test fill model creation."""
        config = NautilusConfig(
            fill_model=FillModelConfig(prob_slippage=0.7, prob_fill_on_limit=0.3)
        )
        runner = NautilusRunner(config=config)

        fill_model = runner._create_fill_model()

        assert fill_model.prob_slippage == 0.7
        assert fill_model.prob_fill_on_limit == 0.3

    def test_get_oms_type_netting(self):
        """Test OMS type NETTING."""
        config = NautilusConfig(oms_type="NETTING")
        runner = NautilusRunner(config=config)

        from nautilus_trader.model.enums import OmsType

        assert runner._get_oms_type() == OmsType.NETTING

    def test_get_oms_type_hedging(self):
        """Test OMS type HEDGING."""
        config = NautilusConfig(oms_type="HEDGING")
        runner = NautilusRunner(config=config)

        from nautilus_trader.model.enums import OmsType

        assert runner._get_oms_type() == OmsType.HEDGING

    def test_get_account_type_cash(self):
        """Test account type CASH."""
        config = NautilusConfig(account_type="CASH")
        runner = NautilusRunner(config=config)

        from nautilus_trader.model.enums import AccountType

        assert runner._get_account_type() == AccountType.CASH

    def test_get_account_type_margin(self):
        """Test account type MARGIN."""
        config = NautilusConfig(account_type="MARGIN")
        runner = NautilusRunner(config=config)

        from nautilus_trader.model.enums import AccountType

        assert runner._get_account_type() == AccountType.MARGIN

    def test_compare_with_vectorbt(self):
        """Test comparison with Vectorbt results."""
        nautilus_metrics = PerformanceMetrics(
            sharpe=1.5,
            sortino=2.0,
            max_drawdown=0.15,
            win_rate=0.55,
            avg_return=0.02,
            total_return=0.25,
        )

        vectorbt_metrics = PerformanceMetrics(
            sharpe=1.6,
            sortino=2.1,
            max_drawdown=0.14,
            win_rate=0.56,
            avg_return=0.021,
            total_return=0.28,
        )

        nautilus_result = BacktestResult(
            result_id="test",
            strategy_name="Test",
            metrics=nautilus_metrics,
            start_date="2024-01-01",
            end_date="2024-06-01",
            symbols=["TEST"],
            config=NautilusConfig(),
            total_trades=50,
            total_orders=55,
            run_duration_seconds=5.0,
            events_processed=1000,
        )

        runner = NautilusRunner()
        comparison = runner.compare_with_vectorbt(nautilus_result, vectorbt_metrics)

        # Check comparison has expected keys
        assert "sharpe_diff_pct" in comparison
        assert "sortino_diff_pct" in comparison
        assert "max_drawdown_diff_pct" in comparison
        assert "nautilus_metrics" in comparison
        assert "vectorbt_metrics" in comparison
        assert "execution_cost_impact" in comparison

        # Check execution cost impact (nautilus - vectorbt)
        assert comparison["execution_cost_impact"] == pytest.approx(0.25 - 0.28, rel=1e-6)

    def test_to_research_finding(self):
        """Test conversion to ResearchFinding."""
        metrics = PerformanceMetrics(
            sharpe=1.5,
            sortino=2.0,
            max_drawdown=0.15,
            win_rate=0.55,
            avg_return=0.02,
        )

        result = BacktestResult(
            result_id="test-123",
            strategy_name="RSI_Strategy",
            metrics=metrics,
            start_date="2024-01-01",
            end_date="2024-06-01",
            symbols=["AAPL"],
            config=NautilusConfig(),
            total_trades=50,
            total_orders=55,
            run_duration_seconds=5.0,
            events_processed=1000,
        )

        entry_conditions = [
            StrategyCondition(indicator="rsi_14", operator="<", value=30)
        ]
        exit_conditions = [
            StrategyCondition(indicator="rsi_14", operator=">", value=70)
        ]

        runner = NautilusRunner()
        finding = runner.to_research_finding(
            result=result,
            entry_conditions=entry_conditions,
            exit_conditions=exit_conditions,
            parameters={"rsi_period": 14},
            description="RSI mean reversion validated",
        )

        assert finding.finding_id == "test-123"
        assert finding.setup_name == "RSI_Strategy"
        assert finding.description == "RSI mean reversion validated"
        assert len(finding.entry_conditions) == 1
        assert len(finding.exit_conditions) == 1
        assert finding.parameters == {"rsi_period": 14}
        assert finding.metrics.sharpe == 1.5
        assert finding.data_range == ("2024-01-01", "2024-06-01")
        assert finding.symbols_tested == ["AAPL"]
        assert "nautilus_trader" in finding.model_version


# ============================================
# DataFrame Conversion Tests
# ============================================


class TestDataFrameConversion:
    """Tests for DataFrame to NautilusTrader conversion."""

    def test_dataframe_to_bars(self, sample_prices):
        """Test converting DataFrame to bars."""
        runner = NautilusRunner()

        from nautilus_trader.model.identifiers import InstrumentId, Symbol, Venue

        instrument_id = InstrumentId(Symbol("AAPL"), Venue("SIM"))
        bars = runner._dataframe_to_bars(sample_prices, instrument_id)

        assert len(bars) == len(sample_prices)

        # Check first bar
        first_bar = bars[0]
        first_row = sample_prices.iloc[0]

        assert float(first_bar.close) == pytest.approx(
            round(first_row["close"], 2), rel=0.01
        )

    def test_dataframe_to_bars_with_volume(self, sample_prices):
        """Test that volume is preserved."""
        runner = NautilusRunner()

        from nautilus_trader.model.identifiers import InstrumentId, Symbol, Venue

        instrument_id = InstrumentId(Symbol("AAPL"), Venue("SIM"))
        bars = runner._dataframe_to_bars(sample_prices, instrument_id)

        # Check volume is set
        first_bar = bars[0]
        assert float(first_bar.volume) > 0


# ============================================
# Integration Tests (Skipped by default)
# ============================================


class TestIntegration:
    """Integration tests that require full NautilusTrader setup."""

    @pytest.mark.skip(reason="Requires full NautilusTrader setup")
    def test_run_backtest(self, sample_prices, sample_signals):
        """Test running a full backtest."""
        runner = NautilusRunner()

        result = runner.run_backtest(
            prices=sample_prices,
            signals=sample_signals,
            symbol="TEST",
        )

        assert result is not None
        assert result.strategy_name == "SignalStrategy"
        assert result.events_processed > 0


# ============================================
# Edge Case Tests
# ============================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_compare_with_zero_metrics(self):
        """Test comparison when vectorbt metrics are zero."""
        nautilus_metrics = PerformanceMetrics(
            sharpe=1.0,
            sortino=1.0,
            max_drawdown=0.1,
            win_rate=0.5,
            avg_return=0.01,
            total_return=0.1,
        )

        vectorbt_metrics = PerformanceMetrics(
            sharpe=0.0,
            sortino=0.0,
            max_drawdown=0.0,
            win_rate=0.0,
            avg_return=0.0,
            total_return=0.0,
        )

        nautilus_result = BacktestResult(
            result_id="test",
            strategy_name="Test",
            metrics=nautilus_metrics,
            start_date="2024-01-01",
            end_date="2024-06-01",
            symbols=["TEST"],
            config=NautilusConfig(),
            total_trades=10,
            total_orders=10,
            run_duration_seconds=1.0,
            events_processed=100,
        )

        runner = NautilusRunner()
        comparison = runner.compare_with_vectorbt(nautilus_result, vectorbt_metrics)

        # Should handle division by zero gracefully
        assert "sharpe_diff_pct" in comparison
        assert comparison["sharpe_diff_pct"] == float("inf")

    def test_empty_config_inheritance(self):
        """Test that empty config uses all defaults."""
        runner = NautilusRunner()

        assert runner.config.fill_model.prob_fill_on_limit == 0.2
        assert runner.config.commission.equity_per_share == 0.005
