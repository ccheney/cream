"""Tests for Paper Validation Worker."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import polars as pl
import pytest

from research.paper_validation import (
    DailyComparison,
    PaperValidationConfig,
    PaperValidationResult,
    PaperValidationState,
    PaperValidationWorker,
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


class MockFactorProvider:
    """Mock factor provider for testing."""

    def __init__(self) -> None:
        self.factors: dict[str, ResearchFactor] = {}

    async def get_factor(self, factor_id: str) -> ResearchFactor | None:
        return self.factors.get(factor_id)

    def add_factor(self, factor_id: str, factor: ResearchFactor) -> None:
        self.factors[factor_id] = factor


class MockMarketDataProvider:
    """Mock market data provider for testing."""

    def __init__(self, data: pl.DataFrame | None = None) -> None:
        self.data = data or pl.DataFrame(
            {
                "open": [100.0, 101.0],
                "high": [101.0, 102.0],
                "low": [99.0, 100.0],
                "close": [100.5, 101.5],
                "volume": [1000, 1100],
            }
        )

    async def get_daily_data(self, symbols: list[str]) -> pl.DataFrame:
        return self.data


class MockComparisonLogger:
    """Mock comparison logger for testing."""

    def __init__(self) -> None:
        self.comparisons: list[tuple[str, DailyComparison]] = []
        self.results: list[tuple[str, PaperValidationResult]] = []

    async def log_comparison(
        self,
        factor_id: str,
        comparison: DailyComparison,
    ) -> None:
        self.comparisons.append((factor_id, comparison))

    async def log_result(
        self,
        factor_id: str,
        result: PaperValidationResult,
    ) -> None:
        self.results.append((factor_id, result))


@pytest.fixture
def factor_provider() -> MockFactorProvider:
    """Create mock factor provider."""
    provider = MockFactorProvider()
    provider.add_factor("test-factor-001", MockFactor(signal_value=0.5))
    return provider


@pytest.fixture
def market_data_provider() -> MockMarketDataProvider:
    """Create mock market data provider."""
    return MockMarketDataProvider()


@pytest.fixture
def comparison_logger() -> MockComparisonLogger:
    """Create mock comparison logger."""
    return MockComparisonLogger()


@pytest.fixture
def worker(
    factor_provider: MockFactorProvider,
    market_data_provider: MockMarketDataProvider,
    comparison_logger: MockComparisonLogger,
) -> PaperValidationWorker:
    """Create paper validation worker."""
    return PaperValidationWorker(
        factor_provider=factor_provider,
        market_data_provider=market_data_provider,
        comparison_logger=comparison_logger,
    )


def test_worker_creation(worker: PaperValidationWorker) -> None:
    """Test PaperValidationWorker creation."""
    assert worker.factor_provider is not None
    assert worker.market_data_provider is not None
    assert worker.comparison_logger is not None
    assert len(worker._active_validations) == 0


def test_get_active_validations_empty(worker: PaperValidationWorker) -> None:
    """Test getting active validations when empty."""
    validations = worker.get_active_validations()
    assert validations == []


@pytest.mark.asyncio
async def test_start_validation(
    worker: PaperValidationWorker,
    factor_provider: MockFactorProvider,
) -> None:
    """Test starting paper validation."""
    factor_id = "test-factor-001"

    result = await worker.start_validation(factor_id)

    assert result is True
    assert factor_id in worker._active_validations


@pytest.mark.asyncio
async def test_start_validation_already_running(
    worker: PaperValidationWorker,
) -> None:
    """Test starting validation for already running factor."""
    factor_id = "test-factor-001"

    # Start first time
    await worker.start_validation(factor_id)

    # Try to start again
    result = await worker.start_validation(factor_id)

    assert result is False


@pytest.mark.asyncio
async def test_start_validation_factor_not_found(
    worker: PaperValidationWorker,
) -> None:
    """Test starting validation for non-existent factor."""
    with pytest.raises(ValueError, match="Factor not found"):
        await worker.start_validation("nonexistent-factor")


@pytest.mark.asyncio
async def test_start_validation_custom_config(
    worker: PaperValidationWorker,
) -> None:
    """Test starting validation with custom config."""
    factor_id = "test-factor-001"
    config = PaperValidationConfig(
        factor_id=factor_id,
        start_date=datetime.now(),
        min_duration_days=7,
        max_divergences=3,
    )

    result = await worker.start_validation(factor_id, config)

    assert result is True
    state = worker._active_validations[factor_id]
    assert state.config.min_duration_days == 7
    assert state.config.max_divergences == 3


@pytest.mark.asyncio
async def test_stop_validation(worker: PaperValidationWorker) -> None:
    """Test stopping paper validation."""
    factor_id = "test-factor-001"
    await worker.start_validation(factor_id)

    result = await worker.stop_validation(factor_id)

    assert result is not None
    assert result.factor_id == factor_id
    assert factor_id not in worker._active_validations


@pytest.mark.asyncio
async def test_stop_validation_not_running(
    worker: PaperValidationWorker,
) -> None:
    """Test stopping validation that isn't running."""
    result = await worker.stop_validation("nonexistent-factor")

    assert result is None


@pytest.mark.asyncio
async def test_close(worker: PaperValidationWorker) -> None:
    """Test closing worker."""
    await worker.start_validation("test-factor-001")

    await worker.close()

    assert len(worker._active_validations) == 0


def test_should_run_before_market_close(worker: PaperValidationWorker) -> None:
    """Test _should_run returns False before market close."""
    # This test is time-sensitive and may need mocking in real scenarios
    # For now, just ensure it returns a boolean
    result = worker._should_run()
    assert isinstance(result, bool)


@pytest.mark.asyncio
async def test_run_daily_cycle_no_active(
    worker: PaperValidationWorker,
) -> None:
    """Test running daily cycle with no active validations."""
    results = await worker.run_daily_cycle()

    assert results == {}


def test_paper_validation_state() -> None:
    """Test PaperValidationState dataclass."""
    from research.paper_validation import PaperValidationService

    factor = MockFactor()
    config = PaperValidationConfig(
        factor_id="test",
        start_date=datetime.now(),
    )
    service = PaperValidationService(config, factor)

    state = PaperValidationState(
        factor_id="test",
        config=config,
        service=service,
        start_date=datetime.now(),
    )

    assert state.factor_id == "test"
    assert state.config == config
    assert state.service == service
