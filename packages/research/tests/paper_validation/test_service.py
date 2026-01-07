"""Tests for Paper Validation Service."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import numpy as np
import polars as pl
import pytest

from research.paper_validation import (
    DailyComparison,
    PaperValidationConfig,
    PaperValidationResult,
    PaperValidationService,
)
from research.strategies.base import FactorMetadata, ResearchFactor


class MockFactor(ResearchFactor):
    """Mock factor for testing."""

    def __init__(self, signal_value: float = 0.5) -> None:
        metadata = FactorMetadata(
            factor_id="mock-factor-001",
            hypothesis_id="hypo-001",
        )
        super().__init__(metadata)
        self.signal_value = signal_value

    def compute_signal(self, data: pl.DataFrame) -> pl.Series:
        """Return constant signal."""
        return pl.Series([self.signal_value] * len(data))

    def get_parameters(self) -> dict[str, Any]:
        return {"period": 14}

    def get_required_features(self) -> list[str]:
        return ["close"]


@pytest.fixture
def mock_factor() -> MockFactor:
    """Create a mock factor."""
    return MockFactor(signal_value=0.5)


@pytest.fixture
def config() -> PaperValidationConfig:
    """Create test configuration."""
    return PaperValidationConfig(
        factor_id="test-factor-001",
        start_date=datetime.now(),
        min_duration_days=14,
        max_duration_days=30,
        max_divergences=5,
        divergence_tolerance=0.001,
    )


@pytest.fixture
def sample_data() -> pl.DataFrame:
    """Create sample market data."""
    return pl.DataFrame(
        {
            "open": [100.0, 101.0, 102.0, 103.0, 104.0],
            "high": [101.0, 102.0, 103.0, 104.0, 105.0],
            "low": [99.0, 100.0, 101.0, 102.0, 103.0],
            "close": [100.5, 101.5, 102.5, 103.5, 104.5],
            "volume": [1000, 1100, 1200, 1300, 1400],
        }
    )


def test_paper_validation_config_defaults() -> None:
    """Test PaperValidationConfig default values."""
    config = PaperValidationConfig(
        factor_id="test",
        start_date=datetime.now(),
    )

    assert config.min_duration_days == 14
    assert config.max_duration_days == 30
    assert config.max_divergences == 5
    assert config.divergence_tolerance == 0.001


def test_paper_validation_config_custom() -> None:
    """Test PaperValidationConfig with custom values."""
    config = PaperValidationConfig(
        factor_id="test",
        start_date=datetime.now(),
        min_duration_days=7,
        max_duration_days=21,
        max_divergences=3,
        divergence_tolerance=0.01,
    )

    assert config.min_duration_days == 7
    assert config.max_duration_days == 21
    assert config.max_divergences == 3
    assert config.divergence_tolerance == 0.01


def test_daily_comparison_creation() -> None:
    """Test DailyComparison dataclass."""
    comparison = DailyComparison(
        date=datetime.now(),
        python_signal=0.5,
        typescript_signal=0.5001,
        divergence=0.0001,
        is_divergent=False,
    )

    assert comparison.python_signal == 0.5
    assert comparison.typescript_signal == 0.5001
    assert comparison.divergence == 0.0001
    assert comparison.is_divergent is False


def test_daily_comparison_divergent() -> None:
    """Test DailyComparison with divergent signals."""
    comparison = DailyComparison(
        date=datetime.now(),
        python_signal=0.5,
        typescript_signal=0.6,
        divergence=0.1,
        is_divergent=True,
    )

    assert comparison.divergence == 0.1
    assert comparison.is_divergent is True


def test_paper_validation_result_passed() -> None:
    """Test PaperValidationResult for passed validation."""
    result = PaperValidationResult(
        factor_id="test-001",
        start_date=datetime.now() - timedelta(days=14),
        end_date=datetime.now(),
        total_days=14,
        total_comparisons=14,
        divergent_days=0,
        max_divergence=0.0001,
        mean_divergence=0.00005,
        correlation=0.999,
        python_sharpe=1.5,
        typescript_sharpe=1.5,
        passed=True,
        recommendation="PROMOTE",
    )

    assert result.passed is True
    assert result.recommendation == "PROMOTE"


def test_paper_validation_result_failed() -> None:
    """Test PaperValidationResult for failed validation."""
    result = PaperValidationResult(
        factor_id="test-001",
        start_date=datetime.now() - timedelta(days=10),
        end_date=datetime.now(),
        total_days=10,
        total_comparisons=10,
        divergent_days=6,
        max_divergence=0.05,
        mean_divergence=0.02,
        correlation=0.85,
        python_sharpe=1.0,
        typescript_sharpe=0.8,
        passed=False,
        failure_reason="Divergent days (6) exceeded max (5)",
        recommendation="REJECT",
    )

    assert result.passed is False
    assert result.recommendation == "REJECT"
    assert result.failure_reason is not None
    assert "Divergent days" in result.failure_reason


def test_paper_validation_result_summary() -> None:
    """Test PaperValidationResult summary method."""
    result = PaperValidationResult(
        factor_id="test-001",
        start_date=datetime.now(),
        end_date=datetime.now(),
        total_days=14,
        total_comparisons=14,
        divergent_days=0,
        max_divergence=0.0001,
        mean_divergence=0.00005,
        correlation=0.999,
        python_sharpe=1.5,
        typescript_sharpe=1.5,
        passed=True,
        recommendation="PROMOTE",
    )

    summary = result.summary()
    assert "PASSED" in summary
    assert "test-001" in summary
    assert "PROMOTE" in summary


def test_service_creation(config: PaperValidationConfig, mock_factor: MockFactor) -> None:
    """Test PaperValidationService creation."""
    service = PaperValidationService(config, mock_factor)

    assert service.config == config
    assert service.factor == mock_factor
    assert len(service.comparisons) == 0


@pytest.mark.asyncio
async def test_service_close(config: PaperValidationConfig, mock_factor: MockFactor) -> None:
    """Test service close."""
    service = PaperValidationService(config, mock_factor)

    # Get client to initialize it
    await service.get_http_client()

    # Close should not error
    await service.close()
    assert service._http_client is None


@pytest.mark.asyncio
async def test_run_python_factor(
    config: PaperValidationConfig,
    mock_factor: MockFactor,
    sample_data: pl.DataFrame,
) -> None:
    """Test running Python factor."""
    service = PaperValidationService(config, mock_factor)

    signal = await service._run_python_factor(sample_data, {"period": 14})

    assert signal == 0.5  # MockFactor returns constant 0.5


@pytest.mark.asyncio
async def test_check_early_termination_no_comparisons(
    config: PaperValidationConfig,
    mock_factor: MockFactor,
) -> None:
    """Test early termination check with no comparisons."""
    service = PaperValidationService(config, mock_factor)

    should_terminate, reason = await service.check_early_termination()

    assert should_terminate is False
    assert reason is None


@pytest.mark.asyncio
async def test_check_early_termination_too_many_divergences(
    config: PaperValidationConfig,
    mock_factor: MockFactor,
) -> None:
    """Test early termination due to too many divergences."""
    service = PaperValidationService(config, mock_factor)

    # Add 6 divergent comparisons (max is 5)
    for _ in range(6):
        service.comparisons.append(
            DailyComparison(
                date=datetime.now(),
                python_signal=0.5,
                typescript_signal=0.6,
                divergence=0.1,
                is_divergent=True,
            )
        )

    should_terminate, reason = await service.check_early_termination()

    assert should_terminate is True
    assert reason is not None
    assert "Too many divergences" in reason


@pytest.mark.asyncio
async def test_check_early_termination_drift_detection(
    config: PaperValidationConfig,
    mock_factor: MockFactor,
) -> None:
    """Test early termination due to divergence drift."""
    service = PaperValidationService(config, mock_factor)

    # Add 7 comparisons with increasing divergence (drift)
    for i in range(7):
        service.comparisons.append(
            DailyComparison(
                date=datetime.now(),
                python_signal=0.5,
                typescript_signal=0.5 + i * 0.001,
                divergence=i * 0.001,
                is_divergent=False,
            )
        )

    should_terminate, reason = await service.check_early_termination()

    assert should_terminate is True
    assert reason is not None
    assert "trending upward" in reason


def test_get_final_result_no_comparisons(
    config: PaperValidationConfig,
    mock_factor: MockFactor,
) -> None:
    """Test final result with no comparisons."""
    service = PaperValidationService(config, mock_factor)

    result = service.get_final_result()

    assert result.passed is False
    assert result.recommendation == "REJECT"
    assert result.failure_reason is not None
    assert "No comparisons" in result.failure_reason


def test_get_final_result_passed(
    config: PaperValidationConfig,
    mock_factor: MockFactor,
) -> None:
    """Test final result for passed validation."""
    service = PaperValidationService(config, mock_factor)

    # Add 14 perfect comparisons
    for _ in range(14):
        service.comparisons.append(
            DailyComparison(
                date=datetime.now(),
                python_signal=0.5,
                typescript_signal=0.5,
                divergence=0.0,
                is_divergent=False,
            )
        )

    result = service.get_final_result()

    assert result.passed is True
    assert result.correlation == 1.0
    assert result.divergent_days == 0


def test_get_final_result_high_correlation(
    config: PaperValidationConfig,
    mock_factor: MockFactor,
) -> None:
    """Test final result with high correlation recommends PROMOTE."""
    service = PaperValidationService(config, mock_factor)

    # Add 14 very close comparisons
    for i in range(14):
        service.comparisons.append(
            DailyComparison(
                date=datetime.now(),
                python_signal=0.5 + i * 0.01,
                typescript_signal=0.5 + i * 0.01 + 0.00001,
                divergence=0.00001,
                is_divergent=False,
            )
        )

    result = service.get_final_result()

    assert result.passed is True
    assert result.correlation > 0.99
    assert result.recommendation == "PROMOTE"


def test_compute_sharpe_empty(
    config: PaperValidationConfig,
    mock_factor: MockFactor,
) -> None:
    """Test Sharpe computation with empty signals."""
    service = PaperValidationService(config, mock_factor)

    sharpe = service._compute_sharpe([])
    assert sharpe == 0.0


def test_compute_sharpe_single(
    config: PaperValidationConfig,
    mock_factor: MockFactor,
) -> None:
    """Test Sharpe computation with single signal."""
    service = PaperValidationService(config, mock_factor)

    sharpe = service._compute_sharpe([1.0])
    assert sharpe == 0.0


def test_compute_sharpe_valid(
    config: PaperValidationConfig,
    mock_factor: MockFactor,
) -> None:
    """Test Sharpe computation with valid signals."""
    service = PaperValidationService(config, mock_factor)

    # Create signals that should produce a positive Sharpe
    signals = [100 + i * 0.1 for i in range(100)]
    sharpe = service._compute_sharpe(signals)

    assert sharpe != 0.0
    assert not np.isnan(sharpe)
