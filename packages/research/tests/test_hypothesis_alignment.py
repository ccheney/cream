"""Tests for Hypothesis Alignment LLM Evaluation."""

from __future__ import annotations

from typing import Any

import polars as pl
import pytest

from research.hypothesis_alignment import (
    AlignmentResult,
    Hypothesis,
    HypothesisAlignmentEvaluator,
    MockHypothesisAlignmentEvaluator,
)
from research.strategies.base import FactorMetadata, ResearchFactor


class MockFactor(ResearchFactor):
    """Mock factor for testing."""

    def compute_signal(self, data: pl.DataFrame) -> pl.Series:
        """RSI mean reversion signal."""
        close = data["close"]
        period = self.get_parameter("period", 14)
        threshold = self.get_parameter("threshold", 30)

        # Compute RSI-like momentum
        returns = close.pct_change()
        momentum = returns.rolling_mean(period)

        # Buy when oversold (momentum < -threshold/1000)
        signal = (momentum < -threshold / 1000).cast(pl.Float64)
        return signal.fill_null(0.0)

    def get_parameters(self) -> dict[str, Any]:
        return {"period": 14, "threshold": 30}

    def get_required_features(self) -> list[str]:
        return ["close"]


@pytest.fixture
def sample_hypothesis() -> Hypothesis:
    """Create a sample hypothesis for RSI mean reversion."""
    return Hypothesis(
        hypothesis_id="hypo-rsi-001",
        title="RSI Mean Reversion",
        economic_rationale="Oversold conditions lead to price rebounds as selling exhaustion sets in.",
        market_mechanism="RSI below 30 indicates extreme selling, which typically reverses.",
        required_features=["close"],
        target_regime="RANGE",
        expected_horizon="short",
        failure_conditions=["strong trending markets", "low liquidity"],
    )


@pytest.fixture
def mock_factor() -> MockFactor:
    """Create a mock factor."""
    metadata = FactorMetadata(
        factor_id="test-rsi-001",
        hypothesis_id="hypo-rsi-001",
    )
    return MockFactor(metadata)


def test_hypothesis_creation() -> None:
    """Test creating a Hypothesis."""
    hypothesis = Hypothesis(
        hypothesis_id="hypo-001",
        title="Test Hypothesis",
        economic_rationale="Test rationale",
        market_mechanism="Test mechanism",
    )
    assert hypothesis.hypothesis_id == "hypo-001"
    assert hypothesis.title == "Test Hypothesis"
    assert hypothesis.target_regime == "ALL"  # Default


def test_hypothesis_to_prompt_context(sample_hypothesis: Hypothesis) -> None:
    """Test formatting hypothesis for prompt."""
    context = sample_hypothesis.to_prompt_context()
    assert "RSI Mean Reversion" in context
    assert "Oversold conditions" in context
    assert "close" in context
    assert "RANGE" in context


def test_alignment_result_creation() -> None:
    """Test creating an AlignmentResult."""
    result = AlignmentResult(
        alignment_score=0.85,
        reasoning="Good alignment with hypothesis",
        gaps=["Missing volume check"],
        extras=["Added threshold parameter"],
        passed=True,
        threshold=0.7,
        model_used="test-model",
    )
    assert result.alignment_score == 0.85
    assert result.passed is True
    assert len(result.gaps) == 1


def test_alignment_result_passed_threshold() -> None:
    """Test pass/fail based on threshold."""
    passed_result = AlignmentResult(
        alignment_score=0.75,
        reasoning="",
        gaps=[],
        extras=[],
        passed=True,
        threshold=0.7,
    )
    assert passed_result.passed is True

    failed_result = AlignmentResult(
        alignment_score=0.65,
        reasoning="",
        gaps=[],
        extras=[],
        passed=False,
        threshold=0.7,
    )
    assert failed_result.passed is False


def test_evaluator_initialization() -> None:
    """Test HypothesisAlignmentEvaluator initialization."""
    evaluator = HypothesisAlignmentEvaluator()
    assert evaluator.model == "gemini-3-flash-preview"
    assert evaluator.threshold == 0.7


def test_evaluator_custom_config() -> None:
    """Test evaluator with custom configuration."""
    evaluator = HypothesisAlignmentEvaluator(
        model="gemini-3-pro-preview",
        threshold=0.8,
    )
    assert evaluator.model == "gemini-3-pro-preview"
    assert evaluator.threshold == 0.8


def test_build_evaluation_prompt(
    sample_hypothesis: Hypothesis,
    mock_factor: MockFactor,
) -> None:
    """Test building the evaluation prompt."""
    evaluator = HypothesisAlignmentEvaluator()
    source = """def compute_signal(self, data):
    close = data["close"]
    rsi = compute_rsi(close, 14)
    return (rsi < 30).cast(float)
"""
    prompt = evaluator._build_evaluation_prompt(sample_hypothesis, source)

    # Check hypothesis context is included
    assert "RSI Mean Reversion" in prompt
    assert "Oversold conditions" in prompt

    # Check source code is included
    assert "compute_signal" in prompt
    assert "rsi" in prompt

    # Check instructions are included
    assert "Alignment Score" in prompt
    assert "JSON" in prompt


def test_parse_response_valid_json() -> None:
    """Test parsing a valid JSON response."""
    evaluator = HypothesisAlignmentEvaluator()

    response = '{"alignment_score": 0.8, "reasoning": "Good match", "gaps": [], "extras": []}'
    data = evaluator._parse_response(response)

    assert data["alignment_score"] == 0.8
    assert data["reasoning"] == "Good match"


def test_parse_response_with_markdown() -> None:
    """Test parsing JSON wrapped in markdown code blocks."""
    evaluator = HypothesisAlignmentEvaluator()

    response = """```json
{"alignment_score": 0.75, "reasoning": "Partial match", "gaps": ["Missing X"], "extras": []}
```"""
    data = evaluator._parse_response(response)

    assert data["alignment_score"] == 0.75
    assert data["gaps"] == ["Missing X"]


def test_parse_response_with_extra_text() -> None:
    """Test parsing JSON with extra text around it."""
    evaluator = HypothesisAlignmentEvaluator()

    response = """Here's my analysis:
{"alignment_score": 0.9, "reasoning": "Excellent alignment", "gaps": [], "extras": []}
This looks good."""
    data = evaluator._parse_response(response)

    assert data["alignment_score"] == 0.9


def test_parse_response_invalid_json() -> None:
    """Test handling invalid JSON response."""
    evaluator = HypothesisAlignmentEvaluator()

    response = "This is not valid JSON"
    with pytest.raises(ValueError, match="No JSON object found"):
        evaluator._parse_response(response)


@pytest.mark.asyncio
async def test_mock_evaluator_basic(
    sample_hypothesis: Hypothesis,
    mock_factor: MockFactor,
) -> None:
    """Test MockHypothesisAlignmentEvaluator."""
    evaluator = MockHypothesisAlignmentEvaluator(
        mock_score=0.85,
        mock_reasoning="Mock: Good alignment",
        mock_gaps=["Volume check missing"],
        mock_extras=[],
    )

    result = await evaluator.evaluate_alignment(sample_hypothesis, mock_factor)

    assert result.alignment_score == 0.85
    assert result.reasoning == "Mock: Good alignment"
    assert "Volume check missing" in result.gaps
    assert result.passed is True
    assert result.model_used == "mock"


@pytest.mark.asyncio
async def test_mock_evaluator_from_source(sample_hypothesis: Hypothesis) -> None:
    """Test MockHypothesisAlignmentEvaluator with source code."""
    evaluator = MockHypothesisAlignmentEvaluator(mock_score=0.9)

    source = "def compute_signal(self, data): return data['close']"
    result = await evaluator.evaluate_alignment_from_source(sample_hypothesis, source)

    assert result.alignment_score == 0.9
    assert result.passed is True


@pytest.mark.asyncio
async def test_mock_evaluator_failing_score(
    sample_hypothesis: Hypothesis,
    mock_factor: MockFactor,
) -> None:
    """Test MockHypothesisAlignmentEvaluator with failing score."""
    evaluator = MockHypothesisAlignmentEvaluator(
        mock_score=0.5,
        mock_reasoning="Significant gaps in implementation",
        mock_gaps=["Wrong indicator", "Wrong threshold logic"],
    )

    result = await evaluator.evaluate_alignment(sample_hypothesis, mock_factor)

    assert result.alignment_score == 0.5
    assert result.passed is False
    assert len(result.gaps) == 2


@pytest.mark.asyncio
async def test_mock_evaluator_custom_threshold(
    sample_hypothesis: Hypothesis,
    mock_factor: MockFactor,
) -> None:
    """Test mock evaluator with custom threshold."""
    # Score 0.75 with threshold 0.8 should fail
    evaluator = MockHypothesisAlignmentEvaluator(mock_score=0.75, threshold=0.8)

    result = await evaluator.evaluate_alignment(sample_hypothesis, mock_factor)

    assert result.alignment_score == 0.75
    assert result.threshold == 0.8
    assert result.passed is False


def test_hypothesis_defaults() -> None:
    """Test Hypothesis default values."""
    hypothesis = Hypothesis(
        hypothesis_id="hypo-001",
        title="Test",
        economic_rationale="Test rationale",
        market_mechanism="Test mechanism",
    )
    assert hypothesis.required_features == []
    assert hypothesis.target_regime == "ALL"
    assert hypothesis.expected_horizon == "short"
    assert hypothesis.failure_conditions == []


def test_alignment_result_raw_response() -> None:
    """Test that raw_response is captured."""
    result = AlignmentResult(
        alignment_score=0.8,
        reasoning="Good",
        gaps=[],
        extras=[],
        passed=True,
        threshold=0.7,
        model_used="test",
        raw_response='{"alignment_score": 0.8}',
    )
    assert result.raw_response == '{"alignment_score": 0.8}'
