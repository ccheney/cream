"""Tests for VectorbtRunner and research findings."""

import uuid
from datetime import datetime

import numpy as np
import pandas as pd
import pytest

from research.findings import (
    ParameterScanConfig,
    PerformanceMetrics,
    ResearchFinding,
    ScanResult,
    StrategyCondition,
)
from research.vectorbt_runner import (
    BUILTIN_STRATEGIES,
    BollingerBandStrategy,
    RSIMeanReversionStrategy,
    SMACrossoverStrategy,
    StrategyBase,
    VectorbtRunner,
    create_price_dataframe,
    extract_metrics,
)


# ============================================
# Fixtures
# ============================================


@pytest.fixture
def sample_prices() -> pd.DataFrame:
    """Create sample OHLCV data for testing."""
    np.random.seed(42)
    n = 500  # Enough data points for meaningful tests

    # Generate random walk price data
    returns = np.random.normal(0.0002, 0.02, n)
    close = 100 * np.cumprod(1 + returns)

    # Create DataFrame with proper index
    dates = pd.date_range(start="2024-01-01", periods=n, freq="1h")

    df = pd.DataFrame(
        {
            "open": close * (1 + np.random.uniform(-0.005, 0.005, n)),
            "high": close * (1 + np.abs(np.random.uniform(0, 0.01, n))),
            "low": close * (1 - np.abs(np.random.uniform(0, 0.01, n))),
            "close": close,
            "volume": np.random.uniform(1e6, 5e6, n),
        },
        index=dates,
    )

    return df


@pytest.fixture
def trending_prices() -> pd.DataFrame:
    """Create trending price data (for trend-following strategies)."""
    np.random.seed(123)
    n = 500

    # Upward trend with noise
    trend = np.linspace(0, 0.5, n)  # 50% total growth
    noise = np.random.normal(0, 0.01, n)
    returns = 0.001 + noise  # Small positive drift
    close = 100 * np.cumprod(1 + returns)

    dates = pd.date_range(start="2024-01-01", periods=n, freq="1h")

    df = pd.DataFrame(
        {
            "open": close * (1 + np.random.uniform(-0.003, 0.003, n)),
            "high": close * (1 + np.abs(np.random.uniform(0, 0.008, n))),
            "low": close * (1 - np.abs(np.random.uniform(0, 0.008, n))),
            "close": close,
            "volume": np.random.uniform(1e6, 5e6, n),
        },
        index=dates,
    )

    return df


@pytest.fixture
def mean_reverting_prices() -> pd.DataFrame:
    """Create mean-reverting price data (for mean-reversion strategies)."""
    np.random.seed(456)
    n = 500

    # Mean-reverting around 100
    close = np.zeros(n)
    close[0] = 100
    for i in range(1, n):
        # Pull toward mean
        mean_pull = 0.02 * (100 - close[i - 1])
        noise = np.random.normal(0, 1.0)
        close[i] = close[i - 1] + mean_pull + noise

    dates = pd.date_range(start="2024-01-01", periods=n, freq="1h")

    df = pd.DataFrame(
        {
            "open": close * (1 + np.random.uniform(-0.003, 0.003, n)),
            "high": np.maximum(close * 1.005, close + np.abs(np.random.normal(0, 0.5, n))),
            "low": np.minimum(close * 0.995, close - np.abs(np.random.normal(0, 0.5, n))),
            "close": close,
            "volume": np.random.uniform(1e6, 5e6, n),
        },
        index=dates,
    )

    return df


@pytest.fixture
def runner() -> VectorbtRunner:
    """Create a VectorbtRunner instance."""
    return VectorbtRunner()


# ============================================
# PerformanceMetrics Tests
# ============================================


class TestPerformanceMetrics:
    """Tests for PerformanceMetrics dataclass."""

    def test_create_metrics(self):
        """Test creating PerformanceMetrics."""
        metrics = PerformanceMetrics(
            sharpe=1.5,
            sortino=2.0,
            max_drawdown=0.15,
            win_rate=0.55,
            avg_return=0.02,
        )

        assert metrics.sharpe == 1.5
        assert metrics.sortino == 2.0
        assert metrics.max_drawdown == 0.15
        assert metrics.win_rate == 0.55
        assert metrics.avg_return == 0.02

    def test_default_values(self):
        """Test default values for optional fields."""
        metrics = PerformanceMetrics(
            sharpe=1.0,
            sortino=1.2,
            max_drawdown=0.10,
            win_rate=0.50,
            avg_return=0.01,
        )

        assert metrics.total_return == 0.0
        assert metrics.num_trades == 0
        assert metrics.profit_factor == 0.0


# ============================================
# StrategyCondition Tests
# ============================================


class TestStrategyCondition:
    """Tests for StrategyCondition dataclass."""

    def test_create_condition(self):
        """Test creating a strategy condition."""
        condition = StrategyCondition(
            indicator="rsi_14",
            operator="<",
            value=30,
            description="RSI oversold",
        )

        assert condition.indicator == "rsi_14"
        assert condition.operator == "<"
        assert condition.value == 30
        assert condition.description == "RSI oversold"

    def test_crossover_condition(self):
        """Test creating a crossover condition."""
        condition = StrategyCondition(
            indicator="sma_10",
            operator="crosses_above",
            value="sma_50",
        )

        assert condition.operator == "crosses_above"
        assert condition.value == "sma_50"


# ============================================
# ResearchFinding Tests
# ============================================


class TestResearchFinding:
    """Tests for ResearchFinding dataclass."""

    def test_create_finding(self):
        """Test creating a research finding."""
        metrics = PerformanceMetrics(
            sharpe=1.5,
            sortino=2.0,
            max_drawdown=0.15,
            win_rate=0.55,
            avg_return=0.02,
        )

        finding = ResearchFinding(
            finding_id=str(uuid.uuid4()),
            setup_name="RSI_Test",
            description="RSI mean reversion strategy",
            entry_conditions=[
                StrategyCondition(indicator="rsi_14", operator="<", value=30)
            ],
            exit_conditions=[
                StrategyCondition(indicator="rsi_14", operator=">", value=70)
            ],
            parameters={"rsi_period": 14, "entry_threshold": 30},
            metrics=metrics,
        )

        assert finding.setup_name == "RSI_Test"
        assert len(finding.entry_conditions) == 1
        assert len(finding.exit_conditions) == 1
        assert finding.metrics.sharpe == 1.5

    def test_auto_scan_date(self):
        """Test that scan_date is auto-set."""
        metrics = PerformanceMetrics(
            sharpe=1.0, sortino=1.0, max_drawdown=0.1, win_rate=0.5, avg_return=0.01
        )

        finding = ResearchFinding(
            finding_id="test",
            setup_name="Test",
            description="Test",
            entry_conditions=[],
            exit_conditions=[],
            parameters={},
            metrics=metrics,
        )

        assert finding.scan_date != ""
        # Should be valid ISO-8601
        datetime.fromisoformat(finding.scan_date)

    def test_to_dict(self):
        """Test serialization to dictionary."""
        metrics = PerformanceMetrics(
            sharpe=1.5,
            sortino=2.0,
            max_drawdown=0.15,
            win_rate=0.55,
            avg_return=0.02,
        )

        finding = ResearchFinding(
            finding_id="test-123",
            setup_name="RSI_Test",
            description="Test strategy",
            entry_conditions=[
                StrategyCondition(indicator="rsi_14", operator="<", value=30)
            ],
            exit_conditions=[],
            parameters={"rsi_period": 14},
            metrics=metrics,
            regime_compatibility=["RANGE"],
            symbols_tested=["AAPL", "MSFT"],
        )

        data = finding.to_dict()

        assert data["finding_id"] == "test-123"
        assert data["setup_name"] == "RSI_Test"
        assert data["metrics"]["sharpe"] == 1.5
        assert len(data["entry_conditions"]) == 1
        assert data["regime_compatibility"] == ["RANGE"]
        assert data["symbols_tested"] == ["AAPL", "MSFT"]

    def test_from_dict(self):
        """Test deserialization from dictionary."""
        data = {
            "finding_id": "test-456",
            "setup_name": "SMA_Test",
            "description": "SMA crossover",
            "entry_conditions": [
                {"indicator": "sma_10", "operator": "crosses_above", "value": "sma_50"}
            ],
            "exit_conditions": [],
            "parameters": {"fast_period": 10, "slow_period": 50},
            "metrics": {
                "sharpe": 1.2,
                "sortino": 1.5,
                "max_drawdown": 0.12,
                "win_rate": 0.52,
                "avg_return": 0.015,
            },
            "regime_compatibility": ["BULL_TREND"],
            "data_range": ["2024-01-01", "2024-06-01"],
        }

        finding = ResearchFinding.from_dict(data)

        assert finding.finding_id == "test-456"
        assert finding.setup_name == "SMA_Test"
        assert finding.metrics.sharpe == 1.2
        assert finding.data_range == ("2024-01-01", "2024-06-01")
        assert finding.regime_compatibility == ["BULL_TREND"]


# ============================================
# Strategy Tests
# ============================================


class TestRSIMeanReversionStrategy:
    """Tests for RSI mean reversion strategy."""

    def test_strategy_name(self):
        """Test strategy name."""
        strategy = RSIMeanReversionStrategy()
        assert strategy.name == "RSI_Mean_Reversion"

    def test_parameter_space(self):
        """Test default parameter space."""
        strategy = RSIMeanReversionStrategy()
        space = strategy.parameter_space

        assert "rsi_period" in space
        assert "entry_threshold" in space
        assert "exit_threshold" in space
        assert 14 in space["rsi_period"]
        assert 30 in space["entry_threshold"]

    def test_generate_signals(self, mean_reverting_prices):
        """Test signal generation."""
        strategy = RSIMeanReversionStrategy()
        params = {"rsi_period": 14, "entry_threshold": 30, "exit_threshold": 70}

        signals = strategy.generate_signals(mean_reverting_prices, params)

        assert isinstance(signals.entries, pd.Series)
        assert isinstance(signals.exits, pd.Series)
        assert len(signals.entries) == len(mean_reverting_prices)
        assert signals.parameters == params

    def test_entry_conditions(self):
        """Test entry condition generation."""
        strategy = RSIMeanReversionStrategy()
        params = {"rsi_period": 14, "entry_threshold": 25}

        conditions = strategy.get_entry_conditions(params)

        assert len(conditions) == 1
        assert conditions[0].indicator == "rsi_14"
        assert conditions[0].operator == "<"
        assert conditions[0].value == 25


class TestSMACrossoverStrategy:
    """Tests for SMA crossover strategy."""

    def test_strategy_name(self):
        """Test strategy name."""
        strategy = SMACrossoverStrategy()
        assert strategy.name == "SMA_Crossover"

    def test_parameter_space(self):
        """Test default parameter space."""
        strategy = SMACrossoverStrategy()
        space = strategy.parameter_space

        assert "fast_period" in space
        assert "slow_period" in space

    def test_generate_signals(self, trending_prices):
        """Test signal generation on trending data."""
        strategy = SMACrossoverStrategy()
        params = {"fast_period": 10, "slow_period": 50}

        signals = strategy.generate_signals(trending_prices, params)

        assert isinstance(signals.entries, pd.Series)
        assert isinstance(signals.exits, pd.Series)
        # Crossover signals should be sparse
        assert signals.entries.sum() < len(signals.entries) / 2


class TestBollingerBandStrategy:
    """Tests for Bollinger Band strategy."""

    def test_strategy_name(self):
        """Test strategy name."""
        strategy = BollingerBandStrategy()
        assert strategy.name == "Bollinger_Band_Reversion"

    def test_generate_signals(self, mean_reverting_prices):
        """Test signal generation."""
        strategy = BollingerBandStrategy()
        params = {"bb_period": 20, "bb_std": 2.0}

        signals = strategy.generate_signals(mean_reverting_prices, params)

        assert isinstance(signals.entries, pd.Series)
        assert isinstance(signals.exits, pd.Series)


# ============================================
# VectorbtRunner Tests
# ============================================


class TestVectorbtRunner:
    """Tests for VectorbtRunner class."""

    def test_init_with_builtin_strategies(self, runner):
        """Test initialization with built-in strategies."""
        assert "RSI_Mean_Reversion" in runner.strategies
        assert "SMA_Crossover" in runner.strategies
        assert "Bollinger_Band_Reversion" in runner.strategies

    def test_get_strategy(self, runner):
        """Test getting a strategy by name."""
        strategy = runner.get_strategy("RSI_Mean_Reversion")
        assert isinstance(strategy, RSIMeanReversionStrategy)

    def test_get_unknown_strategy(self, runner):
        """Test getting an unknown strategy raises error."""
        with pytest.raises(ValueError, match="Unknown strategy"):
            runner.get_strategy("NonexistentStrategy")

    def test_register_custom_strategy(self, runner):
        """Test registering a custom strategy."""

        class CustomStrategy(StrategyBase):
            @property
            def name(self):
                return "Custom"

            @property
            def parameter_space(self):
                return {"param": [1, 2, 3]}

            def generate_signals(self, prices, parameters):
                from research.vectorbt_runner import StrategySignals

                entries = pd.Series(False, index=prices.index)
                exits = pd.Series(False, index=prices.index)
                return StrategySignals(entries=entries, exits=exits, parameters=parameters)

        runner.register_strategy(CustomStrategy())
        assert "Custom" in runner.strategies

    def test_run_parameter_scan(self, runner, sample_prices):
        """Test running a parameter scan."""
        config = ParameterScanConfig(
            strategy_name="RSI_Mean_Reversion",
            parameter_space={
                "rsi_period": [14],
                "entry_threshold": [30],
                "exit_threshold": [70],
            },
            symbols=["TEST"],
            start_date="2024-01-01",
            end_date="2024-01-21",
            min_trades=1,  # Lower for test
            min_sharpe=-10.0,  # Accept any Sharpe for test
        )

        result = runner.run_parameter_scan(sample_prices, config)

        assert isinstance(result, ScanResult)
        assert result.total_combinations == 1
        assert result.scan_duration_seconds > 0

    def test_run_parameter_scan_grid(self, runner, sample_prices):
        """Test grid search parameter scan."""
        config = ParameterScanConfig(
            strategy_name="RSI_Mean_Reversion",
            parameter_space={
                "rsi_period": [7, 14],
                "entry_threshold": [25, 30],
                "exit_threshold": [70, 75],
            },
            symbols=["TEST"],
            start_date="2024-01-01",
            end_date="2024-01-21",
            search_method="grid",
            min_trades=1,
            min_sharpe=-10.0,
        )

        result = runner.run_parameter_scan(sample_prices, config)

        # 2 * 2 * 2 = 8 combinations
        assert result.total_combinations == 8

    def test_run_parameter_scan_random(self, runner, sample_prices):
        """Test random search parameter scan."""
        config = ParameterScanConfig(
            strategy_name="RSI_Mean_Reversion",
            parameter_space={
                "rsi_period": [7, 14, 21],
                "entry_threshold": [20, 25, 30],
                "exit_threshold": [70, 75, 80],
            },
            symbols=["TEST"],
            start_date="2024-01-01",
            end_date="2024-01-21",
            search_method="random",
            random_samples=5,
            min_trades=1,
            min_sharpe=-10.0,
        )

        result = runner.run_parameter_scan(sample_prices, config)

        assert result.total_combinations == 5

    def test_quick_scan(self, runner, sample_prices):
        """Test quick scan convenience method."""
        result = runner.quick_scan(
            prices=sample_prices,
            strategy_name="RSI_Mean_Reversion",
            symbols=["TEST"],
            start_date="2024-01-01",
            end_date="2024-01-21",
        )

        assert isinstance(result, ScanResult)
        assert result.config.strategy_name == "RSI_Mean_Reversion"

    def test_top_k_filtering(self, runner, sample_prices):
        """Test that top_k limits results."""
        config = ParameterScanConfig(
            strategy_name="RSI_Mean_Reversion",
            parameter_space={
                "rsi_period": [7, 14, 21],
                "entry_threshold": [25, 30],
                "exit_threshold": [70, 75],
            },
            symbols=["TEST"],
            start_date="2024-01-01",
            end_date="2024-01-21",
            top_k=3,
            min_trades=1,
            min_sharpe=-10.0,
        )

        result = runner.run_parameter_scan(sample_prices, config)

        assert len(result.findings) <= 3


# ============================================
# Utility Function Tests
# ============================================


class TestCreatePriceDataframe:
    """Tests for create_price_dataframe utility."""

    def test_create_from_close_only(self):
        """Test creating DataFrame from close prices only."""
        close = pd.Series([100, 101, 102, 101, 100])
        df = create_price_dataframe(close)

        assert "open" in df.columns
        assert "high" in df.columns
        assert "low" in df.columns
        assert "close" in df.columns
        assert "volume" in df.columns
        assert len(df) == 5

    def test_create_from_all_columns(self):
        """Test creating DataFrame with all data provided."""
        close = pd.Series([100, 101, 102, 101, 100])
        open_ = pd.Series([99, 100, 101, 102, 101])
        high = pd.Series([101, 102, 103, 103, 102])
        low = pd.Series([99, 100, 101, 100, 99])
        volume = pd.Series([1000, 1100, 1200, 1100, 1000])

        df = create_price_dataframe(close, open_, high, low, volume)

        pd.testing.assert_series_equal(df["close"], close, check_names=False)
        pd.testing.assert_series_equal(df["volume"], volume, check_names=False)


# ============================================
# ParameterScanConfig Tests
# ============================================


class TestParameterScanConfig:
    """Tests for ParameterScanConfig dataclass."""

    def test_create_config(self):
        """Test creating a scan configuration."""
        config = ParameterScanConfig(
            strategy_name="RSI_Mean_Reversion",
            parameter_space={"rsi_period": [14, 21]},
            symbols=["AAPL", "MSFT"],
            start_date="2024-01-01",
            end_date="2024-06-01",
        )

        assert config.strategy_name == "RSI_Mean_Reversion"
        assert len(config.parameter_space["rsi_period"]) == 2
        assert len(config.symbols) == 2

    def test_default_values(self):
        """Test default configuration values."""
        config = ParameterScanConfig(
            strategy_name="Test",
            parameter_space={},
            symbols=[],
            start_date="2024-01-01",
            end_date="2024-06-01",
        )

        assert config.timeframe == "1h"
        assert config.initial_capital == 100000.0
        assert config.search_method == "grid"
        assert config.top_k == 10
        assert config.min_trades == 30
        assert config.min_sharpe == 0.5


# ============================================
# ScanResult Tests
# ============================================


class TestScanResult:
    """Tests for ScanResult dataclass."""

    def test_create_result(self):
        """Test creating a scan result."""
        config = ParameterScanConfig(
            strategy_name="Test",
            parameter_space={},
            symbols=[],
            start_date="2024-01-01",
            end_date="2024-06-01",
        )

        result = ScanResult(
            config=config,
            findings=[],
            total_combinations=100,
            valid_combinations=80,
            scan_duration_seconds=5.5,
        )

        assert result.total_combinations == 100
        assert result.valid_combinations == 80
        assert result.scan_duration_seconds == 5.5
        assert result.scan_date != ""


# ============================================
# Integration Tests
# ============================================


class TestIntegration:
    """Integration tests for the full pipeline."""

    @pytest.mark.slow
    def test_full_scan_pipeline(self, runner, sample_prices):
        """Test full parameter scan pipeline."""
        config = ParameterScanConfig(
            strategy_name="RSI_Mean_Reversion",
            parameter_space={
                "rsi_period": [7, 14, 21],
                "entry_threshold": [25, 30],
                "exit_threshold": [70, 75],
            },
            symbols=["TEST"],
            start_date="2024-01-01",
            end_date="2024-01-21",
            min_trades=1,
            min_sharpe=-10.0,
            top_k=5,
        )

        result = runner.run_parameter_scan(sample_prices, config)

        # Should have results
        assert result.total_combinations > 0

        # Check findings are valid
        for finding in result.findings:
            assert finding.finding_id
            assert finding.setup_name
            assert finding.metrics.sharpe is not None
            assert len(finding.parameters) > 0

    @pytest.mark.slow
    def test_scan_with_trending_data(self, runner, trending_prices):
        """Test scan on trending data (SMA crossover should work well)."""
        config = ParameterScanConfig(
            strategy_name="SMA_Crossover",
            parameter_space={
                "fast_period": [5, 10],
                "slow_period": [20, 50],
            },
            symbols=["TEST"],
            start_date="2024-01-01",
            end_date="2024-01-21",
            min_trades=1,
            min_sharpe=-10.0,
        )

        result = runner.run_parameter_scan(trending_prices, config)

        assert result.total_combinations == 4
        assert result.valid_combinations >= 0

    @pytest.mark.slow
    def test_scan_with_mean_reverting_data(self, runner, mean_reverting_prices):
        """Test scan on mean-reverting data (RSI should work well)."""
        config = ParameterScanConfig(
            strategy_name="RSI_Mean_Reversion",
            parameter_space={
                "rsi_period": [14],
                "entry_threshold": [30],
                "exit_threshold": [70],
            },
            symbols=["TEST"],
            start_date="2024-01-01",
            end_date="2024-01-21",
            min_trades=1,
            min_sharpe=-10.0,
        )

        result = runner.run_parameter_scan(mean_reverting_prices, config)

        assert result.valid_combinations >= 0


class TestBuiltinStrategiesRegistry:
    """Tests for the built-in strategies registry."""

    def test_all_builtin_strategies_exist(self):
        """Test that all expected strategies are registered."""
        expected = ["RSI_Mean_Reversion", "SMA_Crossover", "Bollinger_Band_Reversion"]

        for name in expected:
            assert name in BUILTIN_STRATEGIES
            assert issubclass(BUILTIN_STRATEGIES[name], StrategyBase)

    def test_builtin_strategies_instantiate(self):
        """Test that all built-in strategies can be instantiated."""
        for name, cls in BUILTIN_STRATEGIES.items():
            instance = cls()
            assert instance.name == name
            assert isinstance(instance.parameter_space, dict)
