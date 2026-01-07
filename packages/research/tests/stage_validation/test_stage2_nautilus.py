"""Tests for Stage 2 NautilusTrader Event-Driven Validation."""

from __future__ import annotations

from typing import Any

import numpy as np
import polars as pl
import pytest

from research.stage_validation.stage2_nautilus import (
    MonteCarloResults,
    Stage2Gates,
    Stage2Results,
    Stage2Validator,
    WalkForwardResults,
)
from research.strategies.base import FactorMetadata, ResearchFactor


class MockFactor(ResearchFactor):
    """Mock factor for testing."""

    def compute_signal(self, data: pl.DataFrame) -> pl.Series:
        """Simple momentum signal."""
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
def mock_factor() -> MockFactor:
    """Create a mock factor."""
    metadata = FactorMetadata(
        factor_id="test-stage2-001",
        hypothesis_id="hypo-001",
    )
    return MockFactor(metadata)


@pytest.fixture
def sample_data() -> pl.DataFrame:
    """Create sample OHLCV data for testing."""
    np.random.seed(42)
    n = 500

    close = 100 + np.cumsum(np.random.randn(n) * 0.5)
    high = close + np.abs(np.random.randn(n)) * 0.5
    low = close - np.abs(np.random.randn(n)) * 0.5
    open_ = low + np.random.rand(n) * (high - low)
    volume = np.random.uniform(1e6, 1e8, n)

    return pl.DataFrame(
        {
            "open": open_.tolist(),
            "high": high.tolist(),
            "low": low.tolist(),
            "close": close.tolist(),
            "volume": volume.tolist(),
        }
    )


def test_stage2_gates_defaults() -> None:
    """Test Stage2Gates default values."""
    gates = Stage2Gates()
    assert gates.pbo_max == 0.5
    assert gates.dsr_pvalue_min == 0.95
    assert gates.wfe_min == 0.5
    assert gates.mc_sharpe_5th_min == 0.5


def test_stage2_gates_custom() -> None:
    """Test Stage2Gates with custom values."""
    gates = Stage2Gates(
        pbo_max=0.3,
        dsr_pvalue_min=0.99,
        wfe_min=0.6,
        mc_sharpe_5th_min=0.7,
    )
    assert gates.pbo_max == 0.3
    assert gates.dsr_pvalue_min == 0.99


def test_validator_creation(mock_factor: MockFactor, sample_data: pl.DataFrame) -> None:
    """Test creating Stage2Validator."""
    validator = Stage2Validator(mock_factor, sample_data)
    assert validator.factor == mock_factor
    assert len(validator.data) == 500
    assert validator.gates.pbo_max == 0.5


def test_validator_custom_gates(mock_factor: MockFactor, sample_data: pl.DataFrame) -> None:
    """Test validator with custom gates."""
    gates = Stage2Gates(pbo_max=0.3)
    validator = Stage2Validator(mock_factor, sample_data, gates)
    assert validator.gates.pbo_max == 0.3


def test_compute_returns(mock_factor: MockFactor, sample_data: pl.DataFrame) -> None:
    """Test return computation from signals."""
    validator = Stage2Validator(mock_factor, sample_data)

    mock_factor.set_parameters({"period": 14})
    signals = mock_factor.compute_signal(sample_data)
    returns = validator._compute_returns(signals)

    assert len(returns) == len(sample_data)
    assert returns.dtype == pl.Float64


def test_compute_period_sharpe(mock_factor: MockFactor, sample_data: pl.DataFrame) -> None:
    """Test Sharpe computation for a period."""
    validator = Stage2Validator(mock_factor, sample_data)
    sharpe = validator._compute_period_sharpe(sample_data, {"period": 14})

    assert isinstance(sharpe, float)
    # Sharpe should be finite
    assert np.isfinite(sharpe)


@pytest.mark.asyncio
async def test_run_walk_forward(mock_factor: MockFactor, sample_data: pl.DataFrame) -> None:
    """Test walk-forward analysis."""
    validator = Stage2Validator(mock_factor, sample_data)
    results = await validator._run_walk_forward({"period": 14}, n_periods=3)

    assert isinstance(results, WalkForwardResults)
    assert results.n_periods == 3
    assert len(results.in_sample_sharpes) == 3
    assert len(results.out_of_sample_sharpes) == 3
    # Efficiency can be negative if OOS and IS have opposite signs
    assert isinstance(results.efficiency, float)


@pytest.mark.asyncio
async def test_run_monte_carlo(mock_factor: MockFactor, sample_data: pl.DataFrame) -> None:
    """Test Monte Carlo robustness."""
    validator = Stage2Validator(mock_factor, sample_data)

    # Compute returns first
    mock_factor.set_parameters({"period": 14})
    signals = mock_factor.compute_signal(sample_data)
    returns = validator._compute_returns(signals)

    results = await validator._run_monte_carlo(returns, n_simulations=100)

    assert isinstance(results, MonteCarloResults)
    assert results.n_simulations == 100
    assert len(results.sharpe_distribution) == 100
    assert results.sharpe_5th_percentile <= results.sharpe_median
    assert results.drawdown_median <= results.drawdown_95th_percentile


@pytest.mark.asyncio
async def test_run_monte_carlo_insufficient_data(mock_factor: MockFactor) -> None:
    """Test Monte Carlo with insufficient data."""
    # Create minimal data that produces few trades
    small_data = pl.DataFrame(
        {
            "open": [100.0] * 10,
            "high": [101.0] * 10,
            "low": [99.0] * 10,
            "close": [100.0] * 10,  # Flat - no signals
            "volume": [1e6] * 10,
        }
    )

    validator = Stage2Validator(mock_factor, small_data)
    mock_factor.set_parameters({"period": 5})
    signals = mock_factor.compute_signal(small_data)
    returns = validator._compute_returns(signals)

    results = await validator._run_monte_carlo(returns, n_simulations=100)

    # Should handle gracefully
    assert results.n_simulations == 0
    assert results.sharpe_5th_percentile == 0.0


@pytest.mark.asyncio
async def test_validate_full(mock_factor: MockFactor, sample_data: pl.DataFrame) -> None:
    """Test full Stage 2 validation."""
    validator = Stage2Validator(mock_factor, sample_data)
    results = await validator.validate(
        params={"period": 14},
        n_prior_trials=10,
        n_mc_simulations=50,
        n_wf_periods=3,
    )

    assert isinstance(results, Stage2Results)
    assert results.factor_id == "test-stage2-001"

    # Check all metrics are present
    assert isinstance(results.sharpe_realistic, float)
    assert isinstance(results.pbo, float)
    assert isinstance(results.dsr_pvalue, float)
    assert isinstance(results.wfe, float)
    assert isinstance(results.mc_sharpe_5th_pct, float)

    # Check gate status
    assert isinstance(results.passed_gates, bool)
    assert isinstance(results.gate_violations, list)


@pytest.mark.asyncio
async def test_validate_gate_violations(sample_data: pl.DataFrame) -> None:
    """Test that gate violations are detected."""
    # Create factor that will likely fail gates
    metadata = FactorMetadata(
        factor_id="test-failing",
        hypothesis_id="hypo-fail",
    )

    class FailingFactor(ResearchFactor):
        """Factor designed to fail gates."""

        def compute_signal(self, data: pl.DataFrame) -> pl.Series:
            # Random signals - should fail statistical tests
            np.random.seed(123)
            return pl.Series([float(np.random.choice([-1, 0, 1])) for _ in range(len(data))])

        def get_parameters(self) -> dict[str, Any]:
            return {}

        def get_required_features(self) -> list[str]:
            return ["close"]

    factor = FailingFactor(metadata)

    # Use very strict gates
    strict_gates = Stage2Gates(
        pbo_max=0.01,  # Very strict
        dsr_pvalue_min=0.999,
        wfe_min=0.99,
        mc_sharpe_5th_min=2.0,
    )

    validator = Stage2Validator(factor, sample_data, strict_gates)
    results = await validator.validate(
        params={},
        n_prior_trials=5,
        n_mc_simulations=20,
        n_wf_periods=2,
    )

    # Should have violations with strict gates
    assert results.passed_gates is False
    assert len(results.gate_violations) > 0


def test_walk_forward_results_dataclass() -> None:
    """Test WalkForwardResults dataclass."""
    results = WalkForwardResults(
        efficiency=0.75,
        in_sample_sharpes=[1.0, 1.2, 0.8],
        out_of_sample_sharpes=[0.7, 0.9, 0.6],
        n_periods=3,
        avg_is_sharpe=1.0,
        avg_oos_sharpe=0.73,
    )

    assert results.efficiency == 0.75
    assert len(results.in_sample_sharpes) == 3
    assert results.avg_oos_sharpe < results.avg_is_sharpe


def test_monte_carlo_results_dataclass() -> None:
    """Test MonteCarloResults dataclass."""
    results = MonteCarloResults(
        sharpe_5th_percentile=0.3,
        sharpe_median=0.7,
        drawdown_95th_percentile=0.25,
        drawdown_median=0.12,
        n_simulations=1000,
        sharpe_distribution=[0.5, 0.6, 0.7, 0.8],
    )

    assert results.sharpe_5th_percentile == 0.3
    assert results.n_simulations == 1000


def test_stage2_results_dataclass() -> None:
    """Test Stage2Results dataclass."""
    results = Stage2Results(
        factor_id="test-001",
        sharpe_realistic=1.2,
        sortino_realistic=1.5,
        max_drawdown_realistic=0.15,
        avg_slippage_bps=5.0,
        fill_rate=0.98,
        total_trades=120,
        pbo=0.25,
        dsr_pvalue=0.98,
        observed_sharpe=1.1,
        wfe=0.65,
        cpcv_sharpe_dist=[1.0, 1.1, 0.9, 1.2],
        mc_sharpe_5th_pct=0.6,
        mc_drawdown_95th_pct=0.22,
        passed_gates=True,
        gate_violations=[],
    )

    assert results.factor_id == "test-001"
    assert results.passed_gates is True
    assert results.pbo == 0.25
