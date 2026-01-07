"""Tests for golden test datasets."""

import pytest
from deepeval.test_case import LLMTestCase

from cream_evals import (
    GoldenTestCase,
    get_all_tests,
    get_tests_by_tag,
    get_tests_for_agent,
)


def test_golden_test_case_creation():
    """Test creating a GoldenTestCase."""
    test = GoldenTestCase(
        agent_type="test_agent",
        name="test_case",
        description="A test case",
        input_context="Input data",
        expected_output="Expected output",
        tags=["tag1", "tag2"],
    )
    assert test.agent_type == "test_agent"
    assert test.name == "test_case"
    assert len(test.tags) == 2


def test_golden_test_to_llm_test_case():
    """Test converting GoldenTestCase to LLMTestCase."""
    test = GoldenTestCase(
        agent_type="test_agent",
        name="test_case",
        description="A test case",
        input_context="Input data",
        expected_output="Expected output",
    )

    llm_test = test.to_llm_test_case("Actual output")

    assert isinstance(llm_test, LLMTestCase)
    assert llm_test.input == "Input data"
    assert llm_test.actual_output == "Actual output"
    assert llm_test.expected_output == "Expected output"


def test_get_tests_for_agent():
    """Test getting tests for a specific agent type."""
    tests = get_tests_for_agent("technical_analyst")
    assert len(tests) > 0
    assert all(t.agent_type == "technical_analyst" for t in tests)


def test_get_tests_for_unknown_agent():
    """Test that unknown agent types raise ValueError."""
    with pytest.raises(ValueError, match="Unknown agent type"):
        get_tests_for_agent("unknown_agent")


def test_get_all_tests():
    """Test getting all tests."""
    all_tests = get_all_tests()
    assert "technical_analyst" in all_tests
    assert "risk_manager" in all_tests


def test_get_tests_by_tag():
    """Test filtering tests by tag."""
    breakout_tests = get_tests_by_tag("breakout")
    assert len(breakout_tests) > 0
    assert all("breakout" in t.tags for t in breakout_tests)


def test_technical_analyst_tests_have_required_fields():
    """Test that technical analyst tests have proper structure."""
    tests = get_tests_for_agent("technical_analyst")
    for test in tests:
        assert test.input_context, f"Missing input_context in {test.name}"
        assert test.expected_output, f"Missing expected_output in {test.name}"
        assert "instrument" in test.input_context.lower() or "OHLCV" in test.input_context


def test_risk_manager_tests_include_constraint_scenarios():
    """Test that risk manager tests cover constraint violations."""
    tests = get_tests_for_agent("risk_manager")

    # Should have tests for constraint violations
    tags = set()
    for test in tests:
        tags.update(test.tags)

    assert "constraint_violation" in tags or "reject" in tags, (
        "Risk manager tests should include constraint violation scenarios"
    )
