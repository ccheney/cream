"""Tests for DeepEval metrics configuration."""

import pytest

from cream_evals import (
    AGENT_METRICS,
    get_all_metrics,
    get_metric_for_agent,
)


def test_agent_metrics_registry() -> None:
    """Test that all agent types have metrics registered."""
    expected_agents = [
        "technical_analyst",
        "news_analyst",
        "fundamentals_analyst",
        "bullish_researcher",
        "bearish_researcher",
        "trader",
        "risk_manager",
        "critic",
    ]
    for agent in expected_agents:
        assert agent in AGENT_METRICS, f"Missing metric for {agent}"


def test_get_metric_for_agent() -> None:
    """Test getting a metric for a specific agent type."""
    metric = get_metric_for_agent("technical_analyst")
    assert metric.name == "TechnicalAnalystAccuracy"
    assert metric.threshold == 0.75


def test_get_metric_for_unknown_agent() -> None:
    """Test that unknown agent types raise ValueError."""
    with pytest.raises(ValueError, match="Unknown agent type"):
        get_metric_for_agent("unknown_agent")


def test_get_all_metrics() -> None:
    """Test getting all metrics at once."""
    metrics = get_all_metrics()
    assert len(metrics) == 8
    assert "trader" in metrics
    assert "risk_manager" in metrics


def test_metric_thresholds() -> None:
    """Test that metrics have appropriate thresholds."""
    metrics = get_all_metrics()

    # Risk manager should have highest threshold (most critical)
    assert metrics["risk_manager"].threshold >= 0.85

    # Trader decisions are important
    assert metrics["trader"].threshold >= 0.8

    # Technical analyst can have lower threshold
    assert metrics["technical_analyst"].threshold >= 0.7
