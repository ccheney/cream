"""Tests for CPCV (Combinatorial Purged Cross-Validation)."""

from __future__ import annotations

from typing import Any

import numpy as np
import polars as pl
import pytest

from research.stage_validation.cpcv import (
    CPCVConfig,
    CPCVResults,
    CPCVValidator,
    compute_optimal_folds,
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
def sample_data() -> pl.DataFrame:
    """Generate sample OHLCV data with enough observations for CPCV."""
    np.random.seed(42)
    n = 500  # Need sufficient data for CPCV splits

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
        factor_id="test-cpcv-001",
        hypothesis_id="hypo-001",
    )
    return MockFactor(metadata)


def test_cpcv_config_defaults() -> None:
    """Test default CPCV configuration."""
    config = CPCVConfig()
    assert config.n_folds == 10
    assert config.n_test_folds == 2
    assert config.purge_size == 5
    assert config.embargo_size == 2
    assert config.pbo_threshold == 0.5
    assert config.min_sharpe_oos == 0.5
    assert config.max_degradation == 0.5


def test_cpcv_results_creation() -> None:
    """Test creating CPCVResults."""
    results = CPCVResults(
        factor_id="test-001",
        pbo=0.3,
        sharpe_distribution=[0.8, 1.0, 1.2, 0.9],
        sharpe_mean=0.975,
        sharpe_std=0.15,
        is_vs_oos_degradation=0.85,
        n_paths=4,
        passed_pbo_threshold=True,
        params={"period": 14},
    )
    assert results.factor_id == "test-001"
    assert results.pbo == 0.3
    assert results.passed_pbo_threshold is True


def test_cpcv_validator_creation(
    mock_factor: MockFactor,
    sample_data: pl.DataFrame,
) -> None:
    """Test creating a CPCVValidator."""
    validator = CPCVValidator(mock_factor, sample_data)
    assert validator.factor == mock_factor
    assert validator.config is not None


def test_cpcv_validator_custom_config(
    mock_factor: MockFactor,
    sample_data: pl.DataFrame,
) -> None:
    """Test CPCV validator with custom config."""
    config = CPCVConfig(
        n_folds=5,
        n_test_folds=2,
        purge_size=3,
        embargo_size=1,
    )
    validator = CPCVValidator(mock_factor, sample_data, config)
    assert validator.config.n_folds == 5
    assert validator.config.purge_size == 3


def test_get_cv_splitter(
    mock_factor: MockFactor,
    sample_data: pl.DataFrame,
) -> None:
    """Test getting the CV splitter object."""
    validator = CPCVValidator(mock_factor, sample_data)
    cv = validator.get_cv_splitter()
    assert cv.n_folds == 10
    assert cv.n_test_folds == 2


@pytest.mark.slow
def test_cpcv_split_generates_indices(
    mock_factor: MockFactor,
    sample_data: pl.DataFrame,
) -> None:
    """Test that CPCV split generates train/test indices."""
    config = CPCVConfig(n_folds=5, n_test_folds=2, purge_size=2, embargo_size=1)
    validator = CPCVValidator(mock_factor, sample_data, config)

    splits = list(validator.split())
    assert len(splits) > 0

    for train_idx, test_idx_list in splits:
        assert len(train_idx) > 0
        assert len(test_idx_list) > 0
        for test_idx in test_idx_list:
            assert len(test_idx) > 0


def test_pbo_logit_perfect_overfit() -> None:
    """Test PBO calculation on a perfectly overfit case."""
    # Create scenario where IS ranks are reversed from OOS ranks
    # High IS → Low OOS = overfitting
    is_perfs = [1.0, 2.0, 3.0, 4.0, 5.0]  # IS: strategy 5 is best
    oos_perfs = [5.0, 4.0, 3.0, 2.0, 1.0]  # OOS: strategy 5 is worst

    metadata = FactorMetadata(factor_id="test", hypothesis_id="hypo")
    factor = MockFactor(metadata)
    data = pl.DataFrame({"close": [100.0] * 100})
    validator = CPCVValidator(factor, data)

    pbo = validator._compute_pbo_logit(is_perfs, oos_perfs)
    # Should be high (close to 1.0) for perfect overfitting
    assert pbo >= 0.5


def test_pbo_logit_no_overfit() -> None:
    """Test PBO calculation when there's no overfitting."""
    # Create scenario where IS and OOS ranks are similar
    is_perfs = [1.0, 2.0, 3.0, 4.0, 5.0]
    oos_perfs = [1.1, 2.1, 3.1, 4.1, 5.1]  # Same ordering as IS

    metadata = FactorMetadata(factor_id="test", hypothesis_id="hypo")
    factor = MockFactor(metadata)
    data = pl.DataFrame({"close": [100.0] * 100})
    validator = CPCVValidator(factor, data)

    pbo = validator._compute_pbo_logit(is_perfs, oos_perfs)
    # Should be low (close to 0.0) for no overfitting
    assert pbo <= 0.5


@pytest.mark.slow
@pytest.mark.asyncio
async def test_full_cpcv_validation(
    mock_factor: MockFactor,
    sample_data: pl.DataFrame,
) -> None:
    """Test full CPCV validation workflow."""
    # Use smaller config for faster testing
    config = CPCVConfig(
        n_folds=5,
        n_test_folds=2,
        purge_size=2,
        embargo_size=1,
    )
    validator = CPCVValidator(mock_factor, sample_data, config)

    results = await validator.validate({"period": 14})

    assert isinstance(results, CPCVResults)
    assert results.factor_id == mock_factor.metadata.factor_id
    assert 0.0 <= results.pbo <= 1.0
    assert results.n_paths > 0
    assert len(results.sharpe_distribution) == results.n_paths


def test_compute_optimal_folds() -> None:
    """Test computing optimal fold numbers."""
    n_folds, n_test_folds = compute_optimal_folds(
        n_observations=1000,
        target_n_test_paths=50,
        target_train_size=200,
    )
    assert n_folds >= 3
    assert n_test_folds >= 2
    assert n_test_folds < n_folds
