"""
Tests for LLM-as-Judge Evaluator

Tests the LLMJudge class with mocked Google Gemini API responses.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from research.evaluator.llm_judge import CacheEntry, LLMJudge


class TestLLMJudgeInitialization:
    """Tests for LLMJudge initialization."""

    def test_init_with_api_key(self) -> None:
        """Test initialization with explicit API key."""
        with patch("google.generativeai.configure"):
            with patch("google.generativeai.GenerativeModel"):
                judge = LLMJudge(api_key="test-key")
                assert judge.api_key == "test-key"
                assert judge.model_name == LLMJudge.DEFAULT_MODEL
                assert judge.enable_cache is True

    def test_init_with_env_var(self) -> None:
        """Test initialization with GOOGLE_API_KEY environment variable."""
        with patch("os.getenv", return_value="env-key"):
            with patch("google.generativeai.configure"):
                with patch("google.generativeai.GenerativeModel"):
                    judge = LLMJudge()
                    assert judge.api_key == "env-key"

    def test_init_no_api_key_raises(self) -> None:
        """Test initialization without API key raises ValueError."""
        with patch("os.getenv", return_value=None):
            with pytest.raises(ValueError, match="API key required"):
                LLMJudge()

    def test_init_custom_model(self) -> None:
        """Test initialization with custom model."""
        with patch("google.generativeai.configure"):
            with patch("google.generativeai.GenerativeModel") as mock_model:
                judge = LLMJudge(api_key="test-key", model="custom-model")
                assert judge.model_name == "custom-model"
                mock_model.assert_called_once_with("custom-model")

    def test_init_cache_disabled(self) -> None:
        """Test initialization with cache disabled."""
        with patch("google.generativeai.configure"):
            with patch("google.generativeai.GenerativeModel"):
                judge = LLMJudge(api_key="test-key", enable_cache=False)
                assert judge.enable_cache is False


class TestCacheOperations:
    """Tests for cache operations."""

    def test_cache_key_generation(self) -> None:
        """Test cache key generation is deterministic."""
        with patch("google.generativeai.configure"):
            with patch("google.generativeai.GenerativeModel"):
                judge = LLMJudge(api_key="test-key")

                # Same input should produce same key
                key1 = judge._get_cache_key("test", {"a": 1, "b": 2})
                key2 = judge._get_cache_key("test", {"a": 1, "b": 2})
                assert key1 == key2

                # Different input should produce different key
                key3 = judge._get_cache_key("test", {"a": 1, "b": 3})
                assert key1 != key3

    def test_cache_clear(self) -> None:
        """Test cache clear operation."""
        with patch("google.generativeai.configure"):
            with patch("google.generativeai.GenerativeModel"):
                judge = LLMJudge(api_key="test-key")
                judge._cache["test"] = CacheEntry(85.0, {}, "Feedback")

                assert judge.get_cache_size() == 1
                judge.clear_cache()
                assert judge.get_cache_size() == 0

    def test_cache_size(self) -> None:
        """Test cache size tracking."""
        with patch("google.generativeai.configure"):
            with patch("google.generativeai.GenerativeModel"):
                judge = LLMJudge(api_key="test-key")
                assert judge.get_cache_size() == 0

                judge._cache["key1"] = CacheEntry(85.0, {}, "Feedback")
                assert judge.get_cache_size() == 1

                judge._cache["key2"] = CacheEntry(90.0, {}, "Feedback")
                assert judge.get_cache_size() == 2


class TestResponseParsing:
    """Tests for LLM response parsing."""

    def test_parse_valid_response(self) -> None:
        """Test parsing valid LLM response."""
        with patch("google.generativeai.configure"):
            with patch("google.generativeai.GenerativeModel"):
                judge = LLMJudge(api_key="test-key")

                response = """SCORE: 85
COMPONENTS: {"factor_a": 90, "factor_b": 80}
FEEDBACK: The plan shows strong alignment with technical indicators."""

                score, components, feedback = judge._parse_score_response(response)

                assert score == 85.0
                assert components == {"factor_a": 90, "factor_b": 80}
                assert feedback == "The plan shows strong alignment with technical indicators."

    def test_parse_invalid_response_raises(self) -> None:
        """Test parsing invalid response raises ValueError."""
        with patch("google.generativeai.configure"):
            with patch("google.generativeai.GenerativeModel"):
                judge = LLMJudge(api_key="test-key")

                # Missing score
                with pytest.raises(ValueError, match="Failed to parse"):
                    judge._parse_score_response("FEEDBACK: Some feedback")

                # Missing feedback
                with pytest.raises(ValueError, match="Failed to parse"):
                    judge._parse_score_response("SCORE: 85")


class TestTechnicalAlignment:
    """Tests for technical alignment scoring."""

    @pytest.mark.asyncio
    async def test_score_technical_alignment_success(self) -> None:
        """Test successful technical alignment scoring."""
        with patch("google.generativeai.configure"):
            with patch("google.generativeai.GenerativeModel") as mock_model_class:
                # Mock the model instance and its response
                mock_model = MagicMock()
                mock_response = MagicMock()
                mock_response.text = """SCORE: 85
COMPONENTS: {"indicator_alignment": 90, "pattern_alignment": 85, "level_alignment": 80}
FEEDBACK: Plan aligns well with technical indicators and support levels."""

                mock_model.generate_content_async = AsyncMock(return_value=mock_response)
                mock_model_class.return_value = mock_model

                judge = LLMJudge(api_key="test-key")

                plan = {
                    "action": "BUY",
                    "symbol": "AAPL",
                    "entry_price": 150.0,
                    "rationale": "Bullish divergence",
                }
                context = {"rsi": 35.2, "support_levels": [145.0]}

                result = await judge.score_technical_alignment(plan, context)

                assert result.score == 85.0
                assert result.grade == "B"
                assert "indicator_alignment" in result.components
                assert "Plan aligns well" in result.feedback

    @pytest.mark.asyncio
    async def test_score_technical_alignment_uses_cache(self) -> None:
        """Test technical alignment scoring uses cache on second call."""
        with patch("google.generativeai.configure"):
            with patch("google.generativeai.GenerativeModel") as mock_model_class:
                # Mock the model instance and its response
                mock_model = MagicMock()
                mock_response = MagicMock()
                mock_response.text = """SCORE: 85
COMPONENTS: {"indicator_alignment": 90, "pattern_alignment": 85, "level_alignment": 80}
FEEDBACK: Plan aligns well with technical indicators."""

                mock_model.generate_content_async = AsyncMock(return_value=mock_response)
                mock_model_class.return_value = mock_model

                judge = LLMJudge(api_key="test-key")

                plan = {"action": "BUY", "symbol": "AAPL"}
                context = {"rsi": 35.2}

                # First call
                result1 = await judge.score_technical_alignment(plan, context)
                assert result1.score == 85.0

                # Second call should use cache
                result2 = await judge.score_technical_alignment(plan, context)
                assert result2.score == 85.0

                # LLM should only be called once
                assert mock_model.generate_content_async.call_count == 1

    @pytest.mark.asyncio
    async def test_score_technical_alignment_retry_on_failure(self) -> None:
        """Test technical alignment scoring retries on API failure."""
        with patch("google.generativeai.configure"):
            with patch("google.generativeai.GenerativeModel") as mock_model_class:
                # Mock the model instance to fail twice then succeed
                mock_model = MagicMock()
                mock_response = MagicMock()
                mock_response.text = """SCORE: 85
COMPONENTS: {"indicator_alignment": 90, "pattern_alignment": 85, "level_alignment": 80}
FEEDBACK: Plan aligns well."""

                mock_model.generate_content_async = AsyncMock(
                    side_effect=[
                        Exception("API Error"),
                        Exception("API Error"),
                        mock_response,
                    ]
                )
                mock_model_class.return_value = mock_model

                judge = LLMJudge(api_key="test-key")

                plan = {"action": "BUY"}
                context = {"rsi": 35.2}

                # Should succeed after retries
                result = await judge.score_technical_alignment(plan, context)
                assert result.score == 85.0

                # Should have retried 3 times (2 failures + 1 success)
                assert mock_model.generate_content_async.call_count == 3


class TestMemoryConsistency:
    """Tests for memory consistency scoring."""

    @pytest.mark.asyncio
    async def test_score_memory_consistency_success(self) -> None:
        """Test successful memory consistency scoring."""
        with patch("google.generativeai.configure"):
            with patch("google.generativeai.GenerativeModel") as mock_model_class:
                mock_model = MagicMock()
                mock_response = MagicMock()
                mock_response.text = """SCORE: 78
COMPONENTS: {"strategy_consistency": 80, "outcome_learning": 75, "pattern_recognition": 80}
FEEDBACK: Plan shows good consistency with historical patterns."""

                mock_model.generate_content_async = AsyncMock(return_value=mock_response)
                mock_model_class.return_value = mock_model

                judge = LLMJudge(api_key="test-key")

                plan = {
                    "action": "BUY",
                    "strategy": "mean_reversion",
                }
                memory_nodes = [
                    {"action": "BUY", "strategy": "mean_reversion", "outcome": "WIN"},
                    {"action": "BUY", "strategy": "mean_reversion", "outcome": "LOSS"},
                ]

                result = await judge.score_memory_consistency(plan, memory_nodes)

                assert result.score == 78.0
                assert result.grade == "C"
                assert "strategy_consistency" in result.components


class TestContextRelevance:
    """Tests for context relevance scoring."""

    @pytest.mark.asyncio
    async def test_score_context_relevance_success(self) -> None:
        """Test successful context relevance scoring."""
        with patch("google.generativeai.configure"):
            with patch("google.generativeai.GenerativeModel") as mock_model_class:
                mock_model = MagicMock()
                mock_response = MagicMock()
                mock_response.text = """SCORE: 92
COMPONENTS: {"regime_fit": 95, "event_awareness": 90, "timing": 90}
FEEDBACK: Excellent awareness of current market regime and upcoming earnings."""

                mock_model.generate_content_async = AsyncMock(return_value=mock_response)
                mock_model_class.return_value = mock_model

                judge = LLMJudge(api_key="test-key")

                plan = {"action": "BUY", "symbol": "AAPL"}
                regime = {"classification": "trending_up", "volatility": "normal"}
                external_events = [{"type": "earnings", "symbol": "AAPL", "sentiment": "positive"}]

                result = await judge.score_context_relevance(plan, regime, external_events)

                assert result.score == 92.0
                assert result.grade == "A"
                assert "regime_fit" in result.components
                assert "event_awareness" in result.components


class TestErrorHandling:
    """Tests for error handling."""

    @pytest.mark.asyncio
    async def test_max_retries_exceeded(self) -> None:
        """Test that max retries raises exception."""
        with patch("google.generativeai.configure"):
            with patch("google.generativeai.GenerativeModel") as mock_model_class:
                # Mock to always fail
                mock_model = MagicMock()
                mock_model.generate_content_async = AsyncMock(side_effect=Exception("API Error"))
                mock_model_class.return_value = mock_model

                judge = LLMJudge(api_key="test-key")

                plan = {"action": "BUY"}
                context = {"rsi": 35.2}

                # Should raise after max retries
                with pytest.raises(Exception, match="API Error"):
                    await judge.score_technical_alignment(plan, context)

                # Should have tried MAX_RETRIES times
                assert mock_model.generate_content_async.call_count == judge.MAX_RETRIES
