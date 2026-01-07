"""Tests for Validation Feedback Loop Implementation."""

from __future__ import annotations

from typing import Any

import numpy as np
import polars as pl
import pytest

from research.feedback import (
    FeedbackConfig,
    FeedbackGenerator,
    ValidationFeedback,
)
from research.hypothesis_alignment import Hypothesis
from research.stage_validation.stage1_vectorbt import Stage1Results
from research.stage_validation.stage2_nautilus import Stage2Results
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
        factor_id="test-feedback-001",
        hypothesis_id="hypo-001",
    )
    return MockFactor(metadata)


@pytest.fixture
def mock_hypothesis() -> Hypothesis:
    """Create a mock hypothesis."""
    return Hypothesis(
        hypothesis_id="hypo-001",
        title="Test Hypothesis",
        economic_rationale="Testing feedback generation",
        market_mechanism="Test mechanism",
        target_regime="ALL",
    )


@pytest.fixture
def sample_data() -> pl.DataFrame:
    """Create sample OHLCV data for testing."""
    np.random.seed(42)
    n = 300

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


@pytest.fixture
def passing_stage1_results() -> Stage1Results:
    """Create passing Stage 1 results."""
    return Stage1Results(
        factor_id="test-001",
        best_params={"period": 14},
        parameter_sensitivity={"period": 0.3},
        sharpe=1.5,
        sortino=2.0,
        calmar=1.8,
        max_drawdown=0.08,
        win_rate=0.55,
        profit_factor=1.8,
        ic_mean=0.05,
        icir=0.8,
        rank_ic=0.04,
        passed_gates=True,
        gate_violations=[],
    )


@pytest.fixture
def failing_stage1_results() -> Stage1Results:
    """Create failing Stage 1 results."""
    return Stage1Results(
        factor_id="test-001",
        best_params={"period": 14},
        parameter_sensitivity={"period": 0.8},
        sharpe=0.3,
        sortino=0.4,
        calmar=0.2,
        max_drawdown=0.25,
        win_rate=0.42,
        profit_factor=0.9,
        ic_mean=0.01,
        icir=0.2,
        rank_ic=0.01,
        passed_gates=False,
        gate_violations=["Sharpe 0.30 < 0.50", "Max drawdown 0.25 > 0.20"],
    )


@pytest.fixture
def passing_stage2_results() -> Stage2Results:
    """Create passing Stage 2 results."""
    return Stage2Results(
        factor_id="test-001",
        sharpe_realistic=1.4,
        sortino_realistic=1.8,
        max_drawdown_realistic=0.10,
        avg_slippage_bps=3.0,
        fill_rate=0.98,
        total_trades=140,
        pbo=0.25,
        dsr_pvalue=0.98,
        observed_sharpe=1.4,
        wfe=0.65,
        cpcv_sharpe_dist=[1.2, 1.3, 1.5, 1.6],
        mc_sharpe_5th_pct=0.8,
        mc_drawdown_95th_pct=0.15,
        passed_gates=True,
        gate_violations=[],
    )


@pytest.fixture
def failing_stage2_results() -> Stage2Results:
    """Create failing Stage 2 results."""
    return Stage2Results(
        factor_id="test-001",
        sharpe_realistic=0.8,
        sortino_realistic=1.0,
        max_drawdown_realistic=0.18,
        avg_slippage_bps=5.0,
        fill_rate=0.95,
        total_trades=100,
        pbo=0.65,
        dsr_pvalue=0.85,
        observed_sharpe=0.8,
        wfe=0.35,
        cpcv_sharpe_dist=[0.6, 0.8, 0.7, 0.9],
        mc_sharpe_5th_pct=0.2,
        mc_drawdown_95th_pct=0.30,
        passed_gates=False,
        gate_violations=[
            "PBO 0.650 > 0.5",
            "DSR p-value 0.850 < 0.95",
            "WFE 0.350 < 0.5",
            "MC Sharpe 5th pct 0.200 < 0.5",
        ],
    )


def test_validation_feedback_dataclass() -> None:
    """Test ValidationFeedback dataclass."""
    feedback = ValidationFeedback(
        factor_id="test-001",
        hypothesis_id="hypo-001",
        iteration=1,
        stage1_violations=["Sharpe too low"],
        stage2_violations=[],
        regime_performance={"HIGH_VOL": 0.3, "LOW_VOL": 1.2},
        parameter_sensitivity={"period": 0.8},
        correlation_to_existing={"factor-001": 0.15},
        suggested_modifications=["Add volatility filter"],
        alternative_hypotheses=[],
        action="REFINE",
    )

    assert feedback.factor_id == "test-001"
    assert feedback.action == "REFINE"
    assert len(feedback.suggested_modifications) == 1


def test_validation_feedback_summary() -> None:
    """Test feedback summary generation."""
    feedback = ValidationFeedback(
        factor_id="test-001",
        hypothesis_id="hypo-001",
        iteration=2,
        stage1_violations=["Sharpe too low"],
        stage2_violations=["PBO too high"],
        regime_performance={},
        parameter_sensitivity={},
        correlation_to_existing={},
        suggested_modifications=["Suggestion 1", "Suggestion 2"],
        alternative_hypotheses=[],
        action="REFINE",
    )

    summary = feedback.summary()
    assert "REFINE" in summary
    assert "2/3" in summary
    assert "Sharpe too low" in summary


def test_feedback_config_defaults() -> None:
    """Test FeedbackConfig default values."""
    config = FeedbackConfig()
    assert config.max_iterations == 3
    assert config.correlation_threshold == 0.7
    assert config.poor_regime_sharpe == 0.5


def test_feedback_config_custom() -> None:
    """Test FeedbackConfig with custom values."""
    config = FeedbackConfig(
        max_iterations=5,
        correlation_threshold=0.8,
        poor_regime_sharpe=0.3,
    )
    assert config.max_iterations == 5
    assert config.correlation_threshold == 0.8


def test_feedback_generator_creation() -> None:
    """Test FeedbackGenerator creation."""
    generator = FeedbackGenerator()
    assert generator.config.max_iterations == 3


def test_feedback_generator_custom_config() -> None:
    """Test FeedbackGenerator with custom config."""
    config = FeedbackConfig(max_iterations=5)
    generator = FeedbackGenerator(config=config)
    assert generator.config.max_iterations == 5


def test_determine_action_accept(
    passing_stage1_results: Stage1Results,
    passing_stage2_results: Stage2Results,
) -> None:
    """Test action determination for passing results."""
    generator = FeedbackGenerator()
    action = generator._determine_action(
        passing_stage1_results, passing_stage2_results, iteration=1
    )
    assert action == "ACCEPT"


def test_determine_action_refine(
    failing_stage1_results: Stage1Results,
) -> None:
    """Test action determination for failing Stage 1."""
    generator = FeedbackGenerator()
    action = generator._determine_action(failing_stage1_results, None, iteration=1)
    assert action == "REFINE"


def test_determine_action_abandon_max_iterations(
    failing_stage1_results: Stage1Results,
) -> None:
    """Test action determination at max iterations."""
    generator = FeedbackGenerator()
    action = generator._determine_action(failing_stage1_results, None, iteration=3)
    assert action == "ABANDON"


def test_generate_suggestions_sharpe() -> None:
    """Test suggestion generation for Sharpe violations."""
    generator = FeedbackGenerator()
    suggestions = generator._generate_suggestions(
        stage1_violations=["Sharpe 0.30 < 0.50"],
        stage2_violations=[],
        regime_perf={},
        correlations={},
    )

    assert len(suggestions) > 0
    assert any("volatility" in s.lower() for s in suggestions)


def test_generate_suggestions_pbo() -> None:
    """Test suggestion generation for PBO violations."""
    generator = FeedbackGenerator()
    suggestions = generator._generate_suggestions(
        stage1_violations=[],
        stage2_violations=["PBO 0.65 > 0.5"],
        regime_perf={},
        correlations={},
    )

    assert len(suggestions) > 0
    assert any("parameter" in s.lower() or "overfit" in s.lower() for s in suggestions)


def test_generate_suggestions_regime() -> None:
    """Test suggestion generation for poor regime performance."""
    generator = FeedbackGenerator()
    suggestions = generator._generate_suggestions(
        stage1_violations=[],
        stage2_violations=[],
        regime_perf={"HIGH_VOL": 0.2, "LOW_VOL": 1.5},
        correlations={},
    )

    assert len(suggestions) > 0
    assert any("HIGH_VOL" in s for s in suggestions)


def test_generate_suggestions_correlation() -> None:
    """Test suggestion generation for high correlation."""
    generator = FeedbackGenerator()
    suggestions = generator._generate_suggestions(
        stage1_violations=[],
        stage2_violations=[],
        regime_perf={},
        correlations={"existing-factor-001": 0.85},
    )

    assert len(suggestions) > 0
    assert any("correlation" in s.lower() for s in suggestions)


def test_suggest_alternatives(mock_hypothesis: Hypothesis) -> None:
    """Test alternative hypothesis suggestions."""
    generator = FeedbackGenerator()
    alternatives = generator._suggest_alternatives(
        mock_hypothesis, regime_perf={"HIGH_VOL": 1.2, "LOW_VOL": 0.3}
    )

    assert len(alternatives) > 0
    assert any("HIGH_VOL" in a for a in alternatives)


@pytest.mark.asyncio
async def test_generate_feedback_accept(
    mock_factor: MockFactor,
    mock_hypothesis: Hypothesis,
    passing_stage1_results: Stage1Results,
    passing_stage2_results: Stage2Results,
    sample_data: pl.DataFrame,
) -> None:
    """Test feedback generation for passing validation."""
    generator = FeedbackGenerator()
    feedback = await generator.generate_feedback(
        factor=mock_factor,
        stage1_results=passing_stage1_results,
        stage2_results=passing_stage2_results,
        hypothesis=mock_hypothesis,
        iteration=1,
        data=sample_data,
    )

    assert feedback.action == "ACCEPT"
    assert feedback.factor_id == "test-feedback-001"
    assert len(feedback.stage1_violations) == 0
    assert len(feedback.stage2_violations) == 0


@pytest.mark.asyncio
async def test_generate_feedback_refine(
    mock_factor: MockFactor,
    mock_hypothesis: Hypothesis,
    failing_stage1_results: Stage1Results,
    sample_data: pl.DataFrame,
) -> None:
    """Test feedback generation for failing validation."""
    generator = FeedbackGenerator()
    feedback = await generator.generate_feedback(
        factor=mock_factor,
        stage1_results=failing_stage1_results,
        stage2_results=None,
        hypothesis=mock_hypothesis,
        iteration=1,
        data=sample_data,
    )

    assert feedback.action == "REFINE"
    assert len(feedback.stage1_violations) > 0
    assert len(feedback.suggested_modifications) > 0


@pytest.mark.asyncio
async def test_generate_feedback_abandon(
    mock_factor: MockFactor,
    mock_hypothesis: Hypothesis,
    failing_stage1_results: Stage1Results,
    sample_data: pl.DataFrame,
) -> None:
    """Test feedback generation at max iterations."""
    generator = FeedbackGenerator()
    feedback = await generator.generate_feedback(
        factor=mock_factor,
        stage1_results=failing_stage1_results,
        stage2_results=None,
        hypothesis=mock_hypothesis,
        iteration=3,
        data=sample_data,
    )

    assert feedback.action == "ABANDON"
    assert len(feedback.alternative_hypotheses) > 0


@pytest.mark.asyncio
async def test_simple_regime_analysis(
    mock_factor: MockFactor,
    sample_data: pl.DataFrame,
) -> None:
    """Test simple regime analysis."""
    generator = FeedbackGenerator()
    regime_perf = generator._simple_regime_analysis(mock_factor, sample_data)

    # Should have at least some regime performance data
    assert isinstance(regime_perf, dict)


@pytest.mark.asyncio
async def test_factor_correlations(
    mock_factor: MockFactor,
    sample_data: pl.DataFrame,
) -> None:
    """Test factor correlation computation."""
    # Create another factor
    metadata2 = FactorMetadata(
        factor_id="other-factor-001",
        hypothesis_id="hypo-002",
    )
    other_factor = MockFactor(metadata2)
    other_factor.set_parameters({"period": 20})

    generator = FeedbackGenerator()
    correlations = generator._compute_factor_correlations(mock_factor, [other_factor], sample_data)

    assert "other-factor-001" in correlations
    assert -1.0 <= correlations["other-factor-001"] <= 1.0
