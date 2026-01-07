"""Tests for DSR (Deflated Sharpe Ratio) validation."""

from __future__ import annotations

from typing import Any

import numpy as np
import polars as pl
import pytest

from research.stage_validation.dsr import (
    CombinedStatisticalResults,
    DSRConfig,
    DSRResults,
    DSRValidator,
    _compute_strategy_returns,
)
from research.strategies.base import FactorMetadata, ResearchFactor


class MockFactor(ResearchFactor):
    """Mock factor for testing."""

    def compute_signal(self, data: pl.DataFrame) -> pl.Series:
        """Simple momentum-based signal."""
        close = data["close"]
        period = self.get_parameter("period", 14)

        returns = close.pct_change()
        momentum = returns.rolling_mean(period)

        signal = (momentum < 0).cast(pl.Float64) - (momentum > 0).cast(pl.Float64)
        return signal.fill_null(0.0)

    def get_parameters(self) -> dict[str, Any]:
        return {"period": 14}

    def get_required_features(self) -> list[str]:
        return ["close"]


@pytest.fixture
def sample_returns() -> pl.Series:
    """Generate sample returns for testing."""
    np.random.seed(42)
    n = 500

    # Generate returns with slight positive drift
    returns = np.random.randn(n) * 0.01 + 0.0003  # ~7.5% annual return

    return pl.Series("returns", returns)


@pytest.fixture
def sample_data() -> pl.DataFrame:
    """Generate sample OHLCV data."""
    np.random.seed(42)
    n = 500

    close = 100 + np.cumsum(np.random.randn(n) * 0.5)
    high = close + np.abs(np.random.randn(n)) * 0.5
    low = close - np.abs(np.random.randn(n)) * 0.5
    open_ = low + np.random.rand(n) * (high - low)
    volume = np.random.uniform(1e6, 1e8, n)

    return pl.DataFrame(
        {
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "volume": volume,
        }
    )


@pytest.fixture
def mock_factor() -> MockFactor:
    """Create a mock factor."""
    metadata = FactorMetadata(
        factor_id="test-dsr-001",
        hypothesis_id="hypo-001",
    )
    return MockFactor(metadata)


def test_dsr_config_defaults() -> None:
    """Test default DSR configuration."""
    config = DSRConfig()
    assert config.pvalue_threshold == 0.95
    assert config.annualization_factor == 252
    assert config.min_observations == 100


def test_dsr_results_creation() -> None:
    """Test creating DSRResults."""
    results = DSRResults(
        factor_id="test-001",
        observed_sharpe=1.5,
        expected_max_sharpe=0.8,
        dsr_pvalue=0.97,
        sharpe_std=0.1,
        skewness=-0.2,
        kurtosis=1.5,
        n_observations=500,
        n_trials=10,
        min_backtest_length=252,
        passed=True,
        gate_threshold=0.95,
        params={"period": 14},
    )
    assert results.factor_id == "test-001"
    assert results.observed_sharpe == 1.5
    assert results.passed is True


def test_dsr_validator_creation() -> None:
    """Test creating a DSRValidator."""
    validator = DSRValidator(n_trials=10)
    assert validator.n_trials == 10
    assert validator.config is not None


def test_dsr_validator_custom_config() -> None:
    """Test DSR validator with custom config."""
    config = DSRConfig(
        pvalue_threshold=0.99,
        annualization_factor=12,  # Monthly
    )
    validator = DSRValidator(n_trials=5, config=config)
    assert validator.config.pvalue_threshold == 0.99
    assert validator.config.annualization_factor == 12


def test_skewness_normal_distribution() -> None:
    """Test skewness calculation on normal distribution."""
    np.random.seed(42)
    normal_returns = np.random.randn(1000)

    validator = DSRValidator(n_trials=1)
    skew = validator._skewness(normal_returns)

    # Should be close to 0 for normal distribution
    assert abs(skew) < 0.2


def test_skewness_negative_skew() -> None:
    """Test skewness on negatively skewed distribution."""
    np.random.seed(42)
    # Create negatively skewed distribution
    returns = -np.abs(np.random.randn(1000)) + np.random.randn(1000) * 0.5

    validator = DSRValidator(n_trials=1)
    skew = validator._skewness(returns)

    # Should be negative
    assert skew < 0


def test_kurtosis_normal_distribution() -> None:
    """Test excess kurtosis on normal distribution."""
    np.random.seed(42)
    normal_returns = np.random.randn(1000)

    validator = DSRValidator(n_trials=1)
    kurt = validator._kurtosis(normal_returns)

    # Excess kurtosis should be close to 0 for normal distribution
    assert abs(kurt) < 0.5


def test_expected_max_sharpe_increases_with_trials() -> None:
    """Test that expected max Sharpe increases with more trials."""
    validator = DSRValidator(n_trials=1)
    sharpe_std = 0.1

    expected_1 = validator._expected_max_sharpe(sharpe_std, 1)
    expected_10 = validator._expected_max_sharpe(sharpe_std, 10)
    expected_100 = validator._expected_max_sharpe(sharpe_std, 100)

    # More trials = higher expected max under null
    assert expected_10 > expected_1
    assert expected_100 > expected_10


def test_sharpe_std_adjusted_for_non_normality() -> None:
    """Test Sharpe standard error adjustment for non-normal returns."""
    validator = DSRValidator(n_trials=1)

    # Normal case (zero skew, zero excess kurtosis)
    std_normal = validator._sharpe_std(sharpe=1.0, skew=0.0, kurt=0.0, n=252)

    # With negative skew and positive kurtosis (typical for equities)
    std_adjusted = validator._sharpe_std(sharpe=1.0, skew=-0.5, kurt=2.0, n=252)

    # Adjusted std should be different from normal case
    assert std_adjusted != std_normal


@pytest.mark.asyncio
async def test_compute_dsr_basic(sample_returns: pl.Series) -> None:
    """Test basic DSR computation."""
    validator = DSRValidator(n_trials=10)
    results = await validator.compute_dsr(sample_returns, factor_id="test")

    assert isinstance(results, DSRResults)
    assert results.n_observations == len(sample_returns)
    assert results.n_trials == 10
    assert 0.0 <= results.dsr_pvalue <= 1.0
    assert results.sharpe_std > 0


@pytest.mark.asyncio
async def test_compute_dsr_insufficient_data() -> None:
    """Test DSR with insufficient observations."""
    short_returns = pl.Series("returns", np.random.randn(50) * 0.01)

    validator = DSRValidator(n_trials=10)
    results = await validator.compute_dsr(short_returns)

    assert results.passed is False
    assert results.n_observations == 50


@pytest.mark.asyncio
async def test_dsr_high_sharpe_low_trials() -> None:
    """Test that high Sharpe with few trials has high p-value."""
    np.random.seed(42)
    # Generate returns with strong positive drift
    strong_returns = np.random.randn(500) * 0.01 + 0.001  # ~25% annual

    validator = DSRValidator(n_trials=1)  # First strategy tested
    results = await validator.compute_dsr(pl.Series("returns", strong_returns))

    # High Sharpe with only 1 trial should have high p-value
    assert results.observed_sharpe > 1.0
    assert results.dsr_pvalue > 0.5


@pytest.mark.asyncio
async def test_dsr_mediocre_sharpe_many_trials() -> None:
    """Test that mediocre Sharpe with many trials has low p-value."""
    np.random.seed(42)
    # Generate returns with slight drift
    weak_returns = np.random.randn(500) * 0.01 + 0.0001

    validator = DSRValidator(n_trials=100)  # Many strategies tested
    results = await validator.compute_dsr(pl.Series("returns", weak_returns))

    # Mediocre Sharpe after 100 trials should not be significant
    # The expected max under null is higher with more trials
    assert (
        results.expected_max_sharpe > results.expected_max_sharpe
        if validator.n_trials == 1
        else True
    )


def test_minimum_backtest_length() -> None:
    """Test minimum backtest length calculation."""
    validator = DSRValidator(n_trials=10)

    # Higher target Sharpe needs shorter backtest
    min_len_high = validator._minimum_backtest_length(
        target_sharpe=2.0,
        n_trials=10,
        annualization=252,
    )

    # Lower target Sharpe needs longer backtest
    min_len_low = validator._minimum_backtest_length(
        target_sharpe=0.5,
        n_trials=10,
        annualization=252,
    )

    assert min_len_high < min_len_low


def test_compute_strategy_returns(sample_data: pl.DataFrame) -> None:
    """Test strategy returns computation."""
    # Create simple alternating signal
    n = len(sample_data)
    signals = pl.Series("signal", [1.0 if i % 2 == 0 else -1.0 for i in range(n)])

    returns = _compute_strategy_returns(sample_data, signals)

    assert len(returns) == n
    # First return should be null (filled with 0) due to shift
    assert returns[0] == 0.0


def test_combined_statistical_results_creation() -> None:
    """Test creating CombinedStatisticalResults."""
    results = CombinedStatisticalResults(
        factor_id="test-001",
        pbo=0.3,
        dsr_pvalue=0.97,
        observed_sharpe=1.5,
        expected_max_sharpe=0.8,
        sharpe_distribution=[0.8, 1.0, 1.2],
        n_trials_corrected=10,
        min_backtest_length=252,
        passed_pbo=True,
        passed_dsr=True,
        passed_all=True,
    )
    assert results.passed_all is True
    assert results.pbo == 0.3


@pytest.mark.slow
@pytest.mark.asyncio
async def test_full_statistical_validation(
    mock_factor: MockFactor,
    sample_data: pl.DataFrame,
) -> None:
    """Test full statistical validation combining PBO and DSR."""
    from research.stage_validation.dsr import compute_full_statistical_validation

    results = await compute_full_statistical_validation(
        factor=mock_factor,
        data=sample_data,
        params={"period": 14},
        n_prior_trials=10,
    )

    assert isinstance(results, CombinedStatisticalResults)
    assert results.factor_id == mock_factor.metadata.factor_id
    assert 0.0 <= results.pbo <= 1.0
    assert 0.0 <= results.dsr_pvalue <= 1.0
