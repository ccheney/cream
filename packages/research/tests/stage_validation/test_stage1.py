"""Tests for Stage 1 VectorBT validation."""

from __future__ import annotations

from typing import Any

import numpy as np
import polars as pl
import pytest

from research.stage_validation.stage1_vectorbt import Stage1Gates, Stage1Results, Stage1Validator
from research.strategies.base import FactorMetadata, ResearchFactor


class MockFactor(ResearchFactor):
    """Mock factor for testing."""

    def compute_signal(self, data: pl.DataFrame) -> pl.Series:
        """Simple RSI-like signal."""
        close = data["close"]
        period = self.get_parameter("period", 14)
        threshold = self.get_parameter("threshold", 30)

        # Simple momentum proxy
        returns = close.pct_change()
        momentum = returns.rolling_mean(period)

        # Signal: buy when momentum is negative (oversold)
        signal = (momentum < -threshold / 1000).cast(pl.Float64) - (
            momentum > threshold / 1000
        ).cast(pl.Float64)
        return signal.fill_null(0.0)

    def get_parameters(self) -> dict[str, Any]:
        return {"period": 14, "threshold": 30}

    def get_required_features(self) -> list[str]:
        return ["close"]


@pytest.fixture
def sample_data() -> pl.DataFrame:
    """Generate sample OHLCV data."""
    np.random.seed(42)
    n = 500

    # Generate trending price data
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
        factor_id="test-mock-001",
        hypothesis_id="hypo-001",
    )
    return MockFactor(metadata)


def test_stage1_gates_defaults() -> None:
    """Test default gate thresholds."""
    gates = Stage1Gates()
    assert gates.sharpe_min == 1.0
    assert gates.sortino_min == 1.2
    assert gates.win_rate_min == 0.45
    assert gates.max_drawdown_max == 0.25
    assert gates.ic_min == 0.03
    assert gates.icir_min == 0.5


def test_stage1_results_creation() -> None:
    """Test creating Stage1Results."""
    results = Stage1Results(
        factor_id="test-001",
        best_params={"period": 14},
        parameter_sensitivity={"period": 0.05},
        sharpe=1.5,
        sortino=1.8,
        calmar=2.0,
        max_drawdown=0.15,
        win_rate=0.55,
        profit_factor=1.5,
        ic_mean=0.05,
        icir=0.8,
        rank_ic=0.04,
        passed_gates=True,
        gate_violations=[],
    )
    assert results.factor_id == "test-001"
    assert results.passed_gates is True
    assert results.sharpe == 1.5


def test_stage1_validator_creation(
    mock_factor: MockFactor,
    sample_data: pl.DataFrame,
) -> None:
    """Test creating a Stage1Validator."""
    validator = Stage1Validator(mock_factor, sample_data)
    assert validator.factor == mock_factor
    assert validator.gates is not None


def test_check_gates_pass() -> None:
    """Test gate checking when all pass."""
    metadata = FactorMetadata(factor_id="test", hypothesis_id="hypo")
    factor = MockFactor(metadata)
    data = pl.DataFrame(
        {
            "open": [100.0] * 100,
            "high": [101.0] * 100,
            "low": [99.0] * 100,
            "close": [100.0] * 100,
            "volume": [1e6] * 100,
        }
    )
    validator = Stage1Validator(factor, data)

    metrics = {
        "sharpe": 1.5,
        "sortino": 1.5,
        "win_rate": 0.55,
        "max_drawdown": 0.15,
        "ic": 0.05,
        "icir": 0.7,
    }

    passed, violations = validator.check_gates(metrics)
    assert passed is True
    assert len(violations) == 0


def test_check_gates_fail() -> None:
    """Test gate checking when some fail."""
    metadata = FactorMetadata(factor_id="test", hypothesis_id="hypo")
    factor = MockFactor(metadata)
    data = pl.DataFrame(
        {
            "open": [100.0] * 100,
            "high": [101.0] * 100,
            "low": [99.0] * 100,
            "close": [100.0] * 100,
            "volume": [1e6] * 100,
        }
    )
    validator = Stage1Validator(factor, data)

    metrics = {
        "sharpe": 0.5,  # Fails
        "sortino": 0.8,  # Fails
        "win_rate": 0.55,
        "max_drawdown": 0.35,  # Fails
        "ic": 0.02,  # Fails
        "icir": 0.3,  # Fails
    }

    passed, violations = validator.check_gates(metrics)
    assert passed is False
    assert len(violations) == 5


@pytest.mark.slow
@pytest.mark.asyncio
async def test_parameter_scan(
    mock_factor: MockFactor,
    sample_data: pl.DataFrame,
) -> None:
    """Test parameter scanning."""
    validator = Stage1Validator(mock_factor, sample_data)

    param_grid = {
        "period": [7, 14],
        "threshold": [20, 30],
    }

    results = await validator.run_parameter_scan(param_grid)
    assert len(results) == 4  # 2 * 2 combinations
    assert all("sharpe" in r for r in results)


@pytest.mark.slow
@pytest.mark.asyncio
async def test_ic_computation(
    mock_factor: MockFactor,
    sample_data: pl.DataFrame,
) -> None:
    """Test IC/ICIR/Rank IC computation."""
    validator = Stage1Validator(mock_factor, sample_data)
    params = {"period": 14, "threshold": 30}

    ic, icir, rank_ic = validator.compute_ic(params)

    # IC values should be in reasonable range
    assert -1.0 <= ic <= 1.0
    assert -1.0 <= rank_ic <= 1.0
    # ICIR can be larger in absolute value


@pytest.mark.slow
@pytest.mark.asyncio
async def test_parameter_sensitivity(
    mock_factor: MockFactor,
    sample_data: pl.DataFrame,
) -> None:
    """Test parameter sensitivity testing."""
    validator = Stage1Validator(mock_factor, sample_data)
    params = {"period": 14, "threshold": 30}

    sensitivity = await validator.run_parameter_sensitivity(
        params,
        n_iterations=10,  # Few iterations for speed
    )

    assert "period" in sensitivity
    assert "threshold" in sensitivity
    assert all(s >= 0 for s in sensitivity.values())


@pytest.mark.slow
@pytest.mark.asyncio
async def test_full_validation(
    mock_factor: MockFactor,
    sample_data: pl.DataFrame,
) -> None:
    """Test full validation workflow."""
    validator = Stage1Validator(mock_factor, sample_data)

    param_grid = {
        "period": [7, 14],
        "threshold": [20, 30],
    }

    results = await validator.validate(
        param_grid,
        n_sensitivity_iterations=10,
    )

    assert isinstance(results, Stage1Results)
    assert results.factor_id == mock_factor.metadata.factor_id
    assert results.num_combinations_tested > 0
    assert results.scan_duration_seconds > 0
