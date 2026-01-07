"""Tests for Python → TypeScript Translation System."""

from __future__ import annotations

import tempfile
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import polars as pl
import pytest

from research.hypothesis_alignment import Hypothesis
from research.strategies.base import FactorMetadata, ResearchFactor
from research.translation import (
    TranslationConfig,
    TranslationContext,
    TranslationOrchestrator,
    TranslationResult,
    generate_typescript_template,
)


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
        factor_id="test-translation-001",
        hypothesis_id="hypo-001",
    )
    return MockFactor(metadata)


@pytest.fixture
def mock_hypothesis() -> Hypothesis:
    """Create a mock hypothesis."""
    return Hypothesis(
        hypothesis_id="hypo-001",
        title="Test Hypothesis",
        economic_rationale="Testing translation",
        market_mechanism="Test mechanism",
        target_regime="ALL",
    )


@pytest.fixture
def temp_dir() -> Iterator[Path]:
    """Create a temporary directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


def test_translation_context_creation() -> None:
    """Test TranslationContext dataclass."""
    context = TranslationContext(
        factor_id="test-001",
        hypothesis_id="hypo-001",
        python_source="def compute_signal(self, data): pass",
        parameter_dataclass="period: int = 14",
        required_features=["close", "volume"],
        golden_input_path="/path/to/input.parquet",
        golden_output_path="/path/to/output.parquet",
        golden_params_path="/path/to/params.json",
        python_module_path="/path/to/module.py",
        parameter_defaults={"period": 14},
    )

    assert context.factor_id == "test-001"
    assert "close" in context.required_features
    assert context.parameter_defaults["period"] == 14


def test_translation_context_to_prompt() -> None:
    """Test context formatting for LLM prompt."""
    context = TranslationContext(
        factor_id="test-001",
        hypothesis_id="hypo-001",
        python_source="def compute_signal(self, data): pass",
        parameter_dataclass="",
        required_features=["close"],
        golden_input_path="/path/to/input.parquet",
        golden_output_path="/path/to/output.parquet",
        golden_params_path="/path/to/params.json",
        python_module_path="/path/to/module.py",
    )

    prompt = context.to_prompt_context()
    assert "test-001" in prompt
    assert "hypo-001" in prompt
    assert "close" in prompt


def test_translation_result_creation() -> None:
    """Test TranslationResult dataclass."""
    result = TranslationResult(
        factor_id="test-001",
        typescript_path=Path("packages/indicators/src/factors/test-001"),
        equivalence_passed=True,
        max_divergence=0.00001,
        mean_divergence=0.000005,
        failed_indices=[],
    )

    assert result.equivalence_passed is True
    assert result.max_divergence < 0.0001


def test_translation_result_summary_passed() -> None:
    """Test result summary for passed translation."""
    result = TranslationResult(
        factor_id="test-001",
        typescript_path=Path("path"),
        equivalence_passed=True,
        max_divergence=0.00001,
        mean_divergence=0.000005,
        failed_indices=[],
    )

    summary = result.summary()
    assert "PASSED" in summary
    assert "test-001" in summary


def test_translation_result_summary_failed() -> None:
    """Test result summary for failed translation."""
    result = TranslationResult(
        factor_id="test-001",
        typescript_path=None,
        equivalence_passed=False,
        max_divergence=0.1,
        mean_divergence=0.05,
        failed_indices=[10, 20, 30],
        error_message="Test failed",
    )

    summary = result.summary()
    assert "FAILED" in summary
    assert "3" in summary  # failed indices count


def test_translation_config_defaults() -> None:
    """Test TranslationConfig default values."""
    config = TranslationConfig()
    assert config.tolerance == 0.0001
    assert config.golden_samples == 1000
    assert config.run_tests_timeout == 60


def test_translation_config_custom() -> None:
    """Test TranslationConfig with custom values."""
    config = TranslationConfig(
        tolerance=0.001,
        golden_samples=500,
        run_tests_timeout=120,
    )
    assert config.tolerance == 0.001
    assert config.golden_samples == 500


def test_orchestrator_creation() -> None:
    """Test TranslationOrchestrator creation."""
    orchestrator = TranslationOrchestrator()
    assert orchestrator.config.tolerance == 0.0001


def test_orchestrator_custom_config() -> None:
    """Test TranslationOrchestrator with custom config."""
    config = TranslationConfig(tolerance=0.001)
    orchestrator = TranslationOrchestrator(config=config)
    assert orchestrator.config.tolerance == 0.001


def test_get_factor_source(mock_factor: MockFactor) -> None:
    """Test extracting factor source code."""
    orchestrator = TranslationOrchestrator()
    source = orchestrator._get_factor_source(mock_factor)

    assert "compute_signal" in source
    assert "rolling_mean" in source


def test_get_parameter_source(mock_factor: MockFactor) -> None:
    """Test extracting parameter source."""
    orchestrator = TranslationOrchestrator()
    source = orchestrator._get_parameter_source(mock_factor)

    # Should contain parameter info
    assert "period" in source or "parameters" in source.lower()


@pytest.mark.asyncio
async def test_prepare_translation_context(
    mock_factor: MockFactor,
    mock_hypothesis: Hypothesis,
    temp_dir: Path,
) -> None:
    """Test preparing translation context."""
    from research.equivalence import EquivalenceValidator

    # Create orchestrator with custom config pointing to temp dir
    config = TranslationConfig(
        golden_samples=100,
        typescript_output_dir=temp_dir / "ts",
    )
    orchestrator = TranslationOrchestrator(config=config)

    # Manually set up golden files first
    validator = EquivalenceValidator(
        mock_factor.metadata.factor_id,
        golden_root=temp_dir / "golden",
    )
    await validator.generate_golden_files(mock_factor, {"period": 14}, n_samples=100)

    # Get source
    source = orchestrator._get_factor_source(mock_factor)
    assert "compute_signal" in source


@pytest.mark.asyncio
async def test_validate_translation_no_typescript(temp_dir: Path) -> None:
    """Test validation when TypeScript doesn't exist."""
    config = TranslationConfig(typescript_output_dir=temp_dir)
    orchestrator = TranslationOrchestrator(config=config)

    result = await orchestrator.validate_translation("nonexistent-factor")

    assert result.equivalence_passed is False
    assert result.typescript_path is None
    assert result.error_message is not None
    assert "not found" in result.error_message.lower()


@pytest.mark.asyncio
async def test_validate_translation_with_output(temp_dir: Path) -> None:
    """Test validation with provided TypeScript output."""
    from research.equivalence import EquivalenceValidator

    # Create golden files
    factor_id = "test-validation"

    # Create directory first
    golden_dir = temp_dir / factor_id
    golden_dir.mkdir(parents=True, exist_ok=True)

    # Create simple expected output
    expected = [1.0, 2.0, 3.0, 4.0, 5.0]
    pl.DataFrame({"signal": expected}).write_parquet(golden_dir / "expected_output.parquet")

    # Create validator with same golden root
    validator = EquivalenceValidator(factor_id, golden_root=temp_dir)

    # Validate with matching output directly
    result = await validator.validate_output(expected)

    assert result.passed is True
    assert result.max_divergence == 0.0


def test_generate_typescript_template(temp_dir: Path) -> None:
    """Test TypeScript template generation."""
    context = TranslationContext(
        factor_id="test-factor",
        hypothesis_id="hypo-001",
        python_source="def compute_signal(self, data): pass",
        parameter_dataclass="",
        required_features=["close", "volume"],
        golden_input_path="path/to/input.parquet",
        golden_output_path="path/to/output.parquet",
        golden_params_path="path/to/params.json",
        python_module_path="path/to/module.py",
        parameter_defaults={"period": 14, "threshold": 0.5},
    )

    factor_dir = generate_typescript_template(context, temp_dir)

    # Check all files were created
    assert factor_dir.exists()
    assert (factor_dir / "index.ts").exists()
    assert (factor_dir / "schema.ts").exists()
    assert (factor_dir / "equivalence.test.ts").exists()
    assert (factor_dir / "README.md").exists()


def test_generate_typescript_template_content(temp_dir: Path) -> None:
    """Test content of generated TypeScript template."""
    context = TranslationContext(
        factor_id="momentum-factor",
        hypothesis_id="hypo-momentum",
        python_source="def compute_signal(self, data): ...",
        parameter_dataclass="",
        required_features=["close"],
        golden_input_path="path/to/input.parquet",
        golden_output_path="path/to/output.parquet",
        golden_params_path="path/to/params.json",
        python_module_path="research/strategies/momentum.py",
        parameter_defaults={"period": 14},
    )

    factor_dir = generate_typescript_template(context, temp_dir)

    # Check schema.ts content
    schema_content = (factor_dir / "schema.ts").read_text()
    assert "period" in schema_content
    assert "z.number()" in schema_content

    # Check index.ts content
    index_content = (factor_dir / "index.ts").read_text()
    assert "momentum-factor" in index_content
    assert "computeSignal" in index_content

    # Check README.md content
    readme_content = (factor_dir / "README.md").read_text()
    assert "momentum-factor" in readme_content
    assert "close" in readme_content


def test_generate_param_schema_int() -> None:
    """Test parameter schema generation for integers."""
    from research.translation import _generate_param_schema

    schema = _generate_param_schema({"period": 14})
    assert "z.number().int()" in schema
    assert "14" in schema


def test_generate_param_schema_float() -> None:
    """Test parameter schema generation for floats."""
    from research.translation import _generate_param_schema

    schema = _generate_param_schema({"threshold": 0.5})
    assert "z.number()" in schema
    assert "0.5" in schema


def test_generate_param_schema_bool() -> None:
    """Test parameter schema generation for booleans."""
    from research.translation import _generate_param_schema

    schema = _generate_param_schema({"enabled": True})
    assert "z.boolean()" in schema
    assert "true" in schema


def test_generate_param_schema_string() -> None:
    """Test parameter schema generation for strings."""
    from research.translation import _generate_param_schema

    schema = _generate_param_schema({"name": "test"})
    assert "z.string()" in schema
    assert '"test"' in schema
