"""Tests for Golden File Generation & Equivalence Testing."""

from __future__ import annotations

import tempfile
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl
import pytest

from research.equivalence import (
    EquivalenceTestResult,
    EquivalenceValidator,
    compare_outputs,
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
        factor_id="test-equiv-001",
        hypothesis_id="hypo-001",
    )
    return MockFactor(metadata)


@pytest.fixture
def temp_golden_dir() -> Iterator[Path]:
    """Create a temporary directory for golden files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


def test_equivalence_test_result_creation() -> None:
    """Test creating EquivalenceTestResult."""
    result = EquivalenceTestResult(
        passed=True,
        max_divergence=0.00001,
        mean_divergence=0.000005,
        failed_indices=[],
        total_comparisons=1000,
        tolerance=0.0001,
    )
    assert result.passed is True
    assert result.max_divergence == 0.00001


def test_equivalence_test_result_summary_passed() -> None:
    """Test result summary for passed test."""
    result = EquivalenceTestResult(
        passed=True,
        max_divergence=0.00001,
        mean_divergence=0.000005,
        failed_indices=[],
        total_comparisons=1000,
        tolerance=0.0001,
    )
    summary = result.summary()
    assert "PASSED" in summary
    assert "1000" in summary


def test_equivalence_test_result_summary_failed() -> None:
    """Test result summary for failed test."""
    result = EquivalenceTestResult(
        passed=False,
        max_divergence=0.001,
        mean_divergence=0.0005,
        failed_indices=[10, 20, 30],
        total_comparisons=1000,
        tolerance=0.0001,
    )
    summary = result.summary()
    assert "FAILED" in summary
    assert "3" in summary  # failed count


def test_validator_creation() -> None:
    """Test creating EquivalenceValidator."""
    validator = EquivalenceValidator("test-factor")
    assert validator.factor_id == "test-factor"
    assert validator.tolerance == 0.0001


def test_validator_custom_tolerance() -> None:
    """Test validator with custom tolerance."""
    validator = EquivalenceValidator("test-factor", tolerance=0.001)
    assert validator.tolerance == 0.001


def test_generate_test_data() -> None:
    """Test test data generation."""
    validator = EquivalenceValidator("test")
    data = validator._generate_test_data(500)

    assert len(data) == 500
    assert "open" in data.columns
    assert "high" in data.columns
    assert "low" in data.columns
    assert "close" in data.columns
    assert "volume" in data.columns
    assert "timestamp" in data.columns


def test_generate_test_data_edge_cases() -> None:
    """Test that edge cases are included in test data."""
    validator = EquivalenceValidator("test")
    data = validator._generate_test_data(500)

    close = data["close"].to_numpy()

    # Check flat period (indices 100-109 should be 100.0)
    assert np.allclose(close[100:110], 100.0)

    # Check gap up at 200 (should be ~10% higher)
    gap = close[200] / close[199]
    assert 1.08 < gap < 1.12  # ~10% gap

    # Check low volume period
    volume = data["volume"].to_numpy()
    assert np.all(volume[300:310] == 1000)


def test_compare_outputs_identical() -> None:
    """Test comparing identical outputs."""
    expected = [1.0, 2.0, 3.0, 4.0, 5.0]
    actual = [1.0, 2.0, 3.0, 4.0, 5.0]

    result = compare_outputs(actual, expected)

    assert result.passed is True
    assert result.max_divergence == 0.0
    assert result.failed_indices == []


def test_compare_outputs_within_tolerance() -> None:
    """Test comparing outputs within tolerance."""
    expected = [1.0, 2.0, 3.0, 4.0, 5.0]
    actual = [1.00001, 2.00002, 3.00003, 4.00004, 5.00005]

    result = compare_outputs(actual, expected, tolerance=0.0001)

    assert result.passed is True
    assert result.max_divergence < 0.0001


def test_compare_outputs_exceeds_tolerance() -> None:
    """Test comparing outputs that exceed tolerance."""
    expected = [1.0, 2.0, 3.0, 4.0, 5.0]
    actual = [1.0, 2.1, 3.0, 4.0, 5.0]  # Index 1 differs by 0.1

    result = compare_outputs(actual, expected, tolerance=0.0001)

    assert result.passed is False
    assert 1 in result.failed_indices
    assert result.max_divergence > 0.0001


def test_compare_outputs_different_lengths() -> None:
    """Test comparing outputs of different lengths."""
    expected = [1.0, 2.0, 3.0]
    actual = [1.0, 2.0]

    result = compare_outputs(actual, expected)

    assert result.passed is False
    assert result.max_divergence == float("inf")


def test_compare_outputs_with_nan() -> None:
    """Test comparing outputs containing NaN values."""
    expected = [1.0, float("nan"), 3.0]
    actual = [1.0, float("nan"), 3.0]

    result = compare_outputs(actual, expected)

    # Both NaN should be treated as equal
    assert result.passed is True


def test_compare_outputs_nan_mismatch() -> None:
    """Test comparing outputs with NaN mismatch."""
    expected = [1.0, float("nan"), 3.0]
    actual = [1.0, 2.0, 3.0]  # Index 1 is NaN in expected, number in actual

    result = compare_outputs(actual, expected)

    assert result.passed is False
    assert 1 in result.failed_indices


@pytest.mark.asyncio
async def test_generate_golden_files(
    mock_factor: MockFactor,
    temp_golden_dir: Path,
) -> None:
    """Test generating golden files."""
    validator = EquivalenceValidator(
        "test-factor",
        golden_root=temp_golden_dir,
    )

    golden_path = await validator.generate_golden_files(
        mock_factor,
        {"period": 14},
        n_samples=100,
    )

    assert golden_path.exists()
    assert (golden_path / "input_sample.parquet").exists()
    assert (golden_path / "expected_output.parquet").exists()
    assert (golden_path / "params.json").exists()
    assert (golden_path / "metadata.json").exists()


@pytest.mark.asyncio
async def test_load_golden_files(
    mock_factor: MockFactor,
    temp_golden_dir: Path,
) -> None:
    """Test loading golden files."""
    validator = EquivalenceValidator(
        "test-factor",
        golden_root=temp_golden_dir,
    )

    await validator.generate_golden_files(
        mock_factor,
        {"period": 14},
        n_samples=100,
    )

    # Load and verify
    input_df = validator.load_golden_input()
    assert len(input_df) == 100
    assert "close" in input_df.columns

    params = validator.load_golden_params()
    assert params["period"] == 14

    metadata = validator.load_golden_metadata()
    assert metadata["factor_id"] == "test-factor"
    assert metadata["n_samples"] == 100


@pytest.mark.asyncio
async def test_validate_output_success(
    mock_factor: MockFactor,
    temp_golden_dir: Path,
) -> None:
    """Test validating matching output."""
    validator = EquivalenceValidator(
        "test-factor",
        golden_root=temp_golden_dir,
    )

    # Generate golden files
    await validator.generate_golden_files(
        mock_factor,
        {"period": 14},
        n_samples=100,
    )

    # Compute output again (should match exactly)
    input_df = validator.load_golden_input()
    # Add timestamp back for signal computation
    mock_factor.set_parameters({"period": 14})
    output = mock_factor.compute_signal(input_df)

    # Validate
    result = await validator.validate_output(output.to_list())

    assert result.passed is True
    assert result.max_divergence == 0.0


@pytest.mark.asyncio
async def test_validate_output_failure(
    mock_factor: MockFactor,
    temp_golden_dir: Path,
) -> None:
    """Test validating mismatched output."""
    validator = EquivalenceValidator(
        "test-factor",
        golden_root=temp_golden_dir,
    )

    # Generate golden files
    await validator.generate_golden_files(
        mock_factor,
        {"period": 14},
        n_samples=100,
    )

    # Create bad output
    bad_output = [0.5] * 100  # All same value

    # Validate
    result = await validator.validate_output(bad_output)

    assert result.passed is False
    assert len(result.failed_indices) > 0


def test_load_nonexistent_golden_input() -> None:
    """Test loading nonexistent golden input."""
    validator = EquivalenceValidator("nonexistent")

    with pytest.raises(FileNotFoundError):
        validator.load_golden_input()


def test_load_nonexistent_golden_params() -> None:
    """Test loading nonexistent golden params."""
    validator = EquivalenceValidator("nonexistent")

    with pytest.raises(FileNotFoundError):
        validator.load_golden_params()


def test_load_nonexistent_golden_metadata() -> None:
    """Test loading nonexistent golden metadata."""
    validator = EquivalenceValidator("nonexistent")

    with pytest.raises(FileNotFoundError):
        validator.load_golden_metadata()
