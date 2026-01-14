"""
LLM-as-Judge Evaluator

Uses Google Gemini to evaluate qualitative dimensions of trading plans:
- Technical alignment: Does the plan align with technical indicators and chart patterns?
- Memory consistency: Is the plan consistent with historical decisions and outcomes?
- Context relevance: Does the plan account for current market regime and external events?

Scoring is on a 0-100 scale where:
- 90-100: Excellent
- 70-89: Good
- 50-69: Acceptable
- 30-49: Poor
- 0-29: Unacceptable

Example:
    from research.evaluator import LLMJudge

    judge = LLMJudge(api_key="your-api-key")

    # Score technical alignment
    tech_score = await judge.score_technical_alignment(
        plan={
            "action": "BUY",
            "symbol": "AAPL",
            "entry_price": 150.0,
            "stop_loss": 145.0,
            "take_profit": 165.0,
            "rationale": "Bullish RSI divergence with support at $145",
        },
        context={
            "rsi": 35.2,
            "price": 150.0,
            "support_levels": [145.0, 142.0],
            "resistance_levels": [165.0, 172.0],
        }
    )
    print(f"Technical Score: {tech_score.score}")
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import Any

from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential

from research.evaluator.rule_scorer import ScoringResult

from .prompts import (
    build_context_relevance_prompt,
    build_memory_consistency_prompt,
    build_technical_alignment_prompt,
)
from .types import CacheEntry


class LLMJudge:
    """
    LLM-as-Judge evaluator using Google Gemini.

    Provides qualitative scoring for trading plan evaluation:
    - Technical alignment with indicators and chart patterns
    - Memory consistency with historical decisions
    - Context relevance to market regime and events

    All scores are on a 0-100 scale.
    """

    # Model is determined by LLM_MODEL_ID env var (no fallback)
    DEFAULT_MODEL_ENV = "LLM_MODEL_ID"

    # Temperature for consistency (lower = more deterministic)
    TEMPERATURE = 0.1

    # Retry configuration
    MAX_RETRIES = 3
    RETRY_MIN_WAIT = 1  # seconds
    RETRY_MAX_WAIT = 10  # seconds

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        enable_cache: bool = True,
    ) -> None:
        """
        Initialize the LLM judge.

        Args:
            api_key: Google AI API key (defaults to GOOGLE_API_KEY env var)
            model: Model to use (defaults to LLM_MODEL_ID env var)
            enable_cache: Enable response caching (default: True)

        Raises:
            ValueError: If API key is not provided and not in environment
        """
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY")
        if not self.api_key:
            raise ValueError(
                "API key required: pass api_key argument or set GOOGLE_API_KEY environment variable"
            )

        self.client = genai.Client(api_key=self.api_key)
        default_model = os.getenv(self.DEFAULT_MODEL_ENV)
        if not default_model and not model:
            raise ValueError(
                f"Model required: pass model argument or set {self.DEFAULT_MODEL_ENV} environment variable"
            )
        self.model_name = model or default_model

        self.enable_cache = enable_cache
        self._cache: dict[str, CacheEntry] = {}

    def _get_cache_key(self, prompt: str, data: dict[str, Any]) -> str:
        """Generate cache key from prompt and data."""
        content = json.dumps({"prompt": prompt, "data": data}, sort_keys=True)
        return hashlib.sha256(content.encode()).hexdigest()

    @retry(
        stop=stop_after_attempt(MAX_RETRIES),
        wait=wait_exponential(multiplier=1, min=RETRY_MIN_WAIT, max=RETRY_MAX_WAIT),
        reraise=True,
    )
    async def _call_llm(self, prompt: str) -> str:
        """
        Call LLM with retry logic.

        Args:
            prompt: The prompt to send to the LLM

        Returns:
            LLM response text

        Raises:
            Exception: If all retries fail
        """
        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=self.TEMPERATURE,
                ),
            )
            return response.text
        except Exception as e:
            print(f"LLM call failed: {e}")
            raise

    def _parse_score_response(self, response: str) -> tuple[float, dict[str, float], str]:
        """
        Parse LLM response to extract score, components, and feedback.

        Expected response format:
        SCORE: 85
        COMPONENTS: {"factor_a": 90, "factor_b": 80}
        FEEDBACK: The plan shows strong technical alignment...

        Args:
            response: Raw LLM response

        Returns:
            Tuple of (score, components, feedback)

        Raises:
            ValueError: If response cannot be parsed
        """
        lines = response.strip().split("\n")
        score = 0.0
        components: dict[str, float] = {}
        feedback = ""

        for line in lines:
            if line.startswith("SCORE:"):
                score_str = line.replace("SCORE:", "").strip()
                score = float(score_str)
            elif line.startswith("COMPONENTS:"):
                components_str = line.replace("COMPONENTS:", "").strip()
                components = json.loads(components_str)
            elif line.startswith("FEEDBACK:"):
                feedback = line.replace("FEEDBACK:", "").strip()

        if score == 0.0 or not feedback:
            raise ValueError(f"Failed to parse LLM response: {response}")

        return score, components, feedback

    async def score_technical_alignment(
        self,
        plan: dict[str, Any],
        context: dict[str, Any],
    ) -> ScoringResult:
        """
        Score technical alignment of the trading plan.

        Evaluates whether the plan aligns with technical indicators,
        chart patterns, support/resistance levels, and momentum signals.

        Args:
            plan: Trading plan with action, symbol, prices, rationale
            context: Technical context (indicators, patterns, levels)

        Returns:
            ScoringResult with technical alignment score

        Example:
            plan = {
                "action": "BUY",
                "symbol": "AAPL",
                "entry_price": 150.0,
                "stop_loss": 145.0,
                "take_profit": 165.0,
                "rationale": "Bullish RSI divergence with support at $145",
            }
            context = {
                "rsi": 35.2,
                "macd": {"value": -1.2, "signal": -0.8, "histogram": -0.4},
                "price": 150.0,
                "support_levels": [145.0, 142.0],
                "resistance_levels": [165.0, 172.0],
                "patterns": ["bullish_divergence"],
            }
        """
        cache_key = self._get_cache_key("technical_alignment", {"plan": plan, "context": context})
        if self.enable_cache and cache_key in self._cache:
            cached = self._cache[cache_key]
            return ScoringResult.from_score(
                score=cached.score,
                components=cached.components,
                feedback=cached.feedback,
            )

        prompt = build_technical_alignment_prompt(plan, context)
        response = await self._call_llm(prompt)
        score, components, feedback = self._parse_score_response(response)

        if self.enable_cache:
            self._cache[cache_key] = CacheEntry(
                score=score,
                components=components,
                feedback=feedback,
            )

        return ScoringResult.from_score(
            score=score,
            components=components,
            feedback=feedback,
        )

    async def score_memory_consistency(
        self,
        plan: dict[str, Any],
        memory_nodes: list[dict[str, Any]],
    ) -> ScoringResult:
        """
        Score memory consistency of the trading plan.

        Evaluates whether the plan is consistent with historical decisions,
        learned patterns, and past outcomes for similar market conditions.

        Args:
            plan: Trading plan with action, symbol, prices, rationale
            memory_nodes: Historical decisions and outcomes from HelixDB

        Returns:
            ScoringResult with memory consistency score

        Example:
            plan = {
                "action": "BUY",
                "symbol": "AAPL",
                "strategy": "mean_reversion",
                "rationale": "Oversold bounce from support",
            }
            memory_nodes = [
                {
                    "timestamp": "2025-12-01T10:00:00Z",
                    "action": "BUY",
                    "symbol": "AAPL",
                    "strategy": "mean_reversion",
                    "outcome": "WIN",
                    "pnl_pct": 2.3,
                    "context": {"regime": "range_bound"},
                },
                {
                    "timestamp": "2025-12-15T14:00:00Z",
                    "action": "BUY",
                    "symbol": "AAPL",
                    "strategy": "mean_reversion",
                    "outcome": "LOSS",
                    "pnl_pct": -1.5,
                    "context": {"regime": "trending_down"},
                },
            ]
        """
        cache_key = self._get_cache_key(
            "memory_consistency", {"plan": plan, "memory_nodes": memory_nodes}
        )
        if self.enable_cache and cache_key in self._cache:
            cached = self._cache[cache_key]
            return ScoringResult.from_score(
                score=cached.score,
                components=cached.components,
                feedback=cached.feedback,
            )

        prompt = build_memory_consistency_prompt(plan, memory_nodes)
        response = await self._call_llm(prompt)
        score, components, feedback = self._parse_score_response(response)

        if self.enable_cache:
            self._cache[cache_key] = CacheEntry(
                score=score,
                components=components,
                feedback=feedback,
            )

        return ScoringResult.from_score(
            score=score,
            components=components,
            feedback=feedback,
        )

    async def score_context_relevance(
        self,
        plan: dict[str, Any],
        regime: dict[str, Any],
        external_events: list[dict[str, Any]],
    ) -> ScoringResult:
        """
        Score context relevance of the trading plan.

        Evaluates whether the plan accounts for current market regime,
        volatility conditions, and external events (earnings, macro data, news).

        Args:
            plan: Trading plan with action, symbol, prices, rationale
            regime: Current market regime classification
            external_events: Recent external events (earnings, news, macro)

        Returns:
            ScoringResult with context relevance score

        Example:
            plan = {
                "action": "BUY",
                "symbol": "AAPL",
                "rationale": "Strong support level with bullish catalyst",
            }
            regime = {
                "classification": "range_bound",
                "volatility": "normal",
                "trend": "neutral",
                "vix": 18.5,
            }
            external_events = [
                {
                    "type": "earnings",
                    "symbol": "AAPL",
                    "date": "2025-01-05",
                    "sentiment": "positive",
                    "surprise": "beat",
                },
                {
                    "type": "macro",
                    "event": "FOMC_decision",
                    "date": "2025-01-04",
                    "impact": "hawkish",
                },
            ]
        """
        cache_key = self._get_cache_key(
            "context_relevance",
            {"plan": plan, "regime": regime, "external_events": external_events},
        )
        if self.enable_cache and cache_key in self._cache:
            cached = self._cache[cache_key]
            return ScoringResult.from_score(
                score=cached.score,
                components=cached.components,
                feedback=cached.feedback,
            )

        prompt = build_context_relevance_prompt(plan, regime, external_events)
        response = await self._call_llm(prompt)
        score, components, feedback = self._parse_score_response(response)

        if self.enable_cache:
            self._cache[cache_key] = CacheEntry(
                score=score,
                components=components,
                feedback=feedback,
            )

        return ScoringResult.from_score(
            score=score,
            components=components,
            feedback=feedback,
        )

    def clear_cache(self) -> None:
        """Clear the response cache."""
        self._cache.clear()

    def get_cache_size(self) -> int:
        """Get the number of cached responses."""
        return len(self._cache)
