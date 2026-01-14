"""
Tests for LLM Judge module.

These tests verify the LLMJudge class and its components work correctly.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from research.evaluator import CacheEntry, LLMJudge, ScoringResult
from research.evaluator.llm_judge import (
    build_context_relevance_prompt,
    build_memory_consistency_prompt,
    build_technical_alignment_prompt,
)


class TestCacheEntry:
    """Tests for CacheEntry dataclass."""

    def test_cache_entry_creation(self) -> None:
        """Test creating a cache entry."""
        entry = CacheEntry(
            score=85.0,
            components={"indicator_alignment": 90.0, "pattern_alignment": 80.0},
            feedback="Good technical alignment",
        )
        assert entry.score == 85.0
        assert entry.components["indicator_alignment"] == 90.0
        assert entry.feedback == "Good technical alignment"


class TestPromptBuilders:
    """Tests for prompt builder functions."""

    def test_build_technical_alignment_prompt(self) -> None:
        """Test building technical alignment prompt."""
        plan = {
            "action": "BUY",
            "symbol": "AAPL",
            "entry_price": 150.0,
        }
        context = {
            "rsi": 35.2,
            "price": 150.0,
        }

        prompt = build_technical_alignment_prompt(plan, context)

        assert "TRADING PLAN:" in prompt
        assert "TECHNICAL CONTEXT:" in prompt
        assert "SCORE:" in prompt
        assert "COMPONENTS:" in prompt
        assert "FEEDBACK:" in prompt
        assert json.dumps(plan, indent=2) in prompt
        assert json.dumps(context, indent=2) in prompt

    def test_build_memory_consistency_prompt(self) -> None:
        """Test building memory consistency prompt."""
        plan = {
            "action": "BUY",
            "symbol": "AAPL",
            "strategy": "mean_reversion",
        }
        memory_nodes = [
            {
                "timestamp": "2025-12-01T10:00:00Z",
                "action": "BUY",
                "outcome": "WIN",
            },
        ]

        prompt = build_memory_consistency_prompt(plan, memory_nodes)

        assert "TRADING PLAN:" in prompt
        assert "HISTORICAL MEMORY" in prompt
        assert "strategy_consistency" in prompt
        assert "outcome_learning" in prompt
        assert json.dumps(plan, indent=2) in prompt

    def test_build_context_relevance_prompt(self) -> None:
        """Test building context relevance prompt."""
        plan = {"action": "BUY", "symbol": "AAPL"}
        regime = {"classification": "range_bound", "volatility": "normal"}
        external_events = [{"type": "earnings", "symbol": "AAPL"}]

        prompt = build_context_relevance_prompt(plan, regime, external_events)

        assert "TRADING PLAN:" in prompt
        assert "MARKET REGIME:" in prompt
        assert "EXTERNAL EVENTS:" in prompt
        assert "regime_fit" in prompt
        assert "event_awareness" in prompt


class TestLLMJudge:
    """Tests for LLMJudge class."""

    def test_init_with_api_key(self) -> None:
        """Test initializing LLMJudge with explicit API key and model from env var."""
        with (
            patch.dict("os.environ", {"LLM_MODEL_ID": "test-model"}),
            patch("research.evaluator.llm_judge.judge.genai") as mock_genai,
        ):
            judge = LLMJudge(api_key="test-key")
            assert judge.api_key == "test-key"
            assert judge.model_name == "test-model"
            assert judge.enable_cache is True
            mock_genai.Client.assert_called_once_with(api_key="test-key")

    def test_init_with_env_var(self) -> None:
        """Test initializing LLMJudge from environment variables."""
        with (
            patch.dict(
                "os.environ",
                {"GOOGLE_GENERATIVE_AI_API_KEY": "env-key", "LLM_MODEL_ID": "test-model"},
            ),
            patch("research.evaluator.llm_judge.judge.genai") as mock_genai,
        ):
            judge = LLMJudge()
            assert judge.api_key == "env-key"
            assert judge.model_name == "test-model"
            mock_genai.Client.assert_called_once_with(api_key="env-key")

    def test_init_without_api_key_raises(self) -> None:
        """Test that missing API key raises ValueError."""
        with (
            patch.dict("os.environ", {}, clear=True),
            patch("os.getenv", return_value=None),
        ):
            with pytest.raises(ValueError, match="API key required"):
                LLMJudge()

    def test_init_with_custom_model(self) -> None:
        """Test initializing with custom model."""
        with patch("research.evaluator.llm_judge.judge.genai"):
            judge = LLMJudge(api_key="test-key", model="gemini-custom")
            assert judge.model_name == "gemini-custom"

    def test_init_with_cache_disabled(self) -> None:
        """Test initializing with cache disabled."""
        with patch("research.evaluator.llm_judge.judge.genai"):
            judge = LLMJudge(api_key="test-key", model="test-model", enable_cache=False)
            assert judge.enable_cache is False

    def test_get_cache_key(self) -> None:
        """Test cache key generation."""
        with patch("research.evaluator.llm_judge.judge.genai"):
            judge = LLMJudge(api_key="test-key", model="test-model")
            key1 = judge._get_cache_key("prompt1", {"a": 1})
            key2 = judge._get_cache_key("prompt1", {"a": 1})
            key3 = judge._get_cache_key("prompt1", {"a": 2})

            assert key1 == key2
            assert key1 != key3
            assert len(key1) == 64  # SHA256 hex digest

    def test_parse_score_response(self) -> None:
        """Test parsing LLM response."""
        with patch("research.evaluator.llm_judge.judge.genai"):
            judge = LLMJudge(api_key="test-key", model="test-model")

            response = """SCORE: 85
COMPONENTS: {"factor_a": 90, "factor_b": 80}
FEEDBACK: Good alignment with technicals."""

            score, components, feedback = judge._parse_score_response(response)

            assert score == 85.0
            assert components == {"factor_a": 90, "factor_b": 80}
            assert feedback == "Good alignment with technicals."

    def test_parse_score_response_missing_fields(self) -> None:
        """Test parsing response with missing fields raises ValueError."""
        with patch("research.evaluator.llm_judge.judge.genai"):
            judge = LLMJudge(api_key="test-key", model="test-model")

            response = "Some invalid response"

            with pytest.raises(ValueError, match="Failed to parse LLM response"):
                judge._parse_score_response(response)

    def test_clear_cache(self) -> None:
        """Test clearing cache."""
        with patch("research.evaluator.llm_judge.judge.genai"):
            judge = LLMJudge(api_key="test-key", model="test-model")
            judge._cache["key1"] = CacheEntry(85.0, {}, "test")
            judge._cache["key2"] = CacheEntry(90.0, {}, "test")

            assert judge.get_cache_size() == 2
            judge.clear_cache()
            assert judge.get_cache_size() == 0

    @pytest.mark.asyncio
    async def test_score_technical_alignment_with_cache(self) -> None:
        """Test technical alignment scoring returns cached result."""
        with patch("research.evaluator.llm_judge.judge.genai"):
            judge = LLMJudge(api_key="test-key", model="test-model")

            plan = {"action": "BUY", "symbol": "AAPL"}
            context = {"rsi": 35.2}

            cache_key = judge._get_cache_key(
                "technical_alignment", {"plan": plan, "context": context}
            )
            judge._cache[cache_key] = CacheEntry(
                score=85.0,
                components={"indicator_alignment": 90.0},
                feedback="Test feedback",
            )

            result = await judge.score_technical_alignment(plan, context)

            assert isinstance(result, ScoringResult)
            assert result.score == 85.0
            assert result.feedback == "Test feedback"

    @pytest.mark.asyncio
    async def test_score_memory_consistency_with_cache(self) -> None:
        """Test memory consistency scoring returns cached result."""
        with patch("research.evaluator.llm_judge.judge.genai"):
            judge = LLMJudge(api_key="test-key", model="test-model")

            plan = {"action": "BUY", "symbol": "AAPL"}
            memory_nodes = [{"outcome": "WIN"}]

            cache_key = judge._get_cache_key(
                "memory_consistency", {"plan": plan, "memory_nodes": memory_nodes}
            )
            judge._cache[cache_key] = CacheEntry(
                score=90.0,
                components={"strategy_consistency": 95.0},
                feedback="Memory feedback",
            )

            result = await judge.score_memory_consistency(plan, memory_nodes)

            assert isinstance(result, ScoringResult)
            assert result.score == 90.0
            assert result.feedback == "Memory feedback"

    @pytest.mark.asyncio
    async def test_score_context_relevance_with_cache(self) -> None:
        """Test context relevance scoring returns cached result."""
        with patch("research.evaluator.llm_judge.judge.genai"):
            judge = LLMJudge(api_key="test-key", model="test-model")

            plan = {"action": "BUY", "symbol": "AAPL"}
            regime = {"classification": "range_bound"}
            external_events = [{"type": "earnings"}]

            cache_key = judge._get_cache_key(
                "context_relevance",
                {"plan": plan, "regime": regime, "external_events": external_events},
            )
            judge._cache[cache_key] = CacheEntry(
                score=75.0,
                components={"regime_fit": 80.0},
                feedback="Context feedback",
            )

            result = await judge.score_context_relevance(plan, regime, external_events)

            assert isinstance(result, ScoringResult)
            assert result.score == 75.0
            assert result.feedback == "Context feedback"

    @pytest.mark.asyncio
    async def test_score_technical_alignment_calls_llm(self) -> None:
        """Test technical alignment calls LLM when not cached."""
        with patch("research.evaluator.llm_judge.judge.genai") as mock_genai:
            mock_client = MagicMock()
            mock_response = MagicMock()
            mock_response.text = """SCORE: 85
COMPONENTS: {"indicator_alignment": 90, "pattern_alignment": 80, "level_alignment": 85}
FEEDBACK: Good technical alignment."""

            mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
            mock_genai.Client.return_value = mock_client

            judge = LLMJudge(api_key="test-key", model="test-model")

            plan = {"action": "BUY", "symbol": "AAPL"}
            context = {"rsi": 35.2}

            result = await judge.score_technical_alignment(plan, context)

            assert isinstance(result, ScoringResult)
            assert result.score == 85.0
            assert result.feedback == "Good technical alignment."
            mock_client.aio.models.generate_content.assert_called_once()


class TestImports:
    """Test that all imports work correctly."""

    def test_import_from_evaluator(self) -> None:
        """Test importing LLMJudge from evaluator module."""
        from research.evaluator import CacheEntry, LLMJudge

        assert LLMJudge is not None
        assert CacheEntry is not None

    def test_import_from_llm_judge_package(self) -> None:
        """Test importing from llm_judge package."""
        from research.evaluator.llm_judge import (
            CacheEntry,
            LLMJudge,
            build_context_relevance_prompt,
            build_memory_consistency_prompt,
            build_technical_alignment_prompt,
        )

        assert LLMJudge is not None
        assert CacheEntry is not None
        assert build_technical_alignment_prompt is not None
        assert build_memory_consistency_prompt is not None
        assert build_context_relevance_prompt is not None

    def test_import_from_submodules(self) -> None:
        """Test importing from individual submodules."""
        from research.evaluator.llm_judge.judge import LLMJudge
        from research.evaluator.llm_judge.prompts import build_technical_alignment_prompt
        from research.evaluator.llm_judge.types import CacheEntry

        assert LLMJudge is not None
        assert CacheEntry is not None
        assert build_technical_alignment_prompt is not None
