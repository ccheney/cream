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
from dataclasses import dataclass
from typing import Any

import google.generativeai as genai
from tenacity import retry, stop_after_attempt, wait_exponential

from research.evaluator.rule_scorer import ScoringResult


@dataclass
class CacheEntry:
    """Cache entry for LLM responses."""

    score: float
    components: dict[str, float]
    feedback: str


class LLMJudge:
    """
    LLM-as-Judge evaluator using Google Gemini.

    Provides qualitative scoring for trading plan evaluation:
    - Technical alignment with indicators and chart patterns
    - Memory consistency with historical decisions
    - Context relevance to market regime and events

    All scores are on a 0-100 scale.
    """

    DEFAULT_MODEL = "gemini-3-pro-preview"
    FALLBACK_MODEL = "gemini-3-flash-preview"

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
            model: Model to use (defaults to gemini-3-pro-preview)
            enable_cache: Enable response caching (default: True)

        Raises:
            ValueError: If API key is not provided and not in environment
        """
        # Get API key from argument or environment
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY")
        if not self.api_key:
            raise ValueError(
                "API key required: pass api_key argument or set GOOGLE_API_KEY environment variable"
            )

        # Configure Gemini
        genai.configure(api_key=self.api_key)
        self.model_name = model or self.DEFAULT_MODEL
        self.model = genai.GenerativeModel(self.model_name)

        # Cache for responses
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
            response = await self.model.generate_content_async(
                prompt,
                generation_config=genai.GenerationConfig(
                    temperature=self.TEMPERATURE,
                ),
            )
            return response.text
        except Exception as e:
            # Log error and re-raise for retry
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
        # Check cache
        cache_key = self._get_cache_key("technical_alignment", {"plan": plan, "context": context})
        if self.enable_cache and cache_key in self._cache:
            cached = self._cache[cache_key]
            return ScoringResult.from_score(
                score=cached.score,
                components=cached.components,
                feedback=cached.feedback,
            )

        # Build prompt
        prompt = f"""You are an expert trading system evaluator. Score the technical alignment of this trading plan on a 0-100 scale.

TRADING PLAN:
{json.dumps(plan, indent=2)}

TECHNICAL CONTEXT:
{json.dumps(context, indent=2)}

Evaluate whether the plan aligns with technical indicators, chart patterns, support/resistance levels, and momentum signals.

Provide your response in this exact format:
SCORE: <0-100>
COMPONENTS: {{"indicator_alignment": <0-100>, "pattern_alignment": <0-100>, "level_alignment": <0-100>}}
FEEDBACK: <2-3 sentence explanation>

Scoring guidelines:
- 90-100: Excellent alignment, plan strongly supported by technicals
- 70-89: Good alignment, most indicators support the plan
- 50-69: Acceptable alignment, mixed signals
- 30-49: Poor alignment, technicals suggest caution
- 0-29: Unacceptable alignment, technicals contradict plan
"""

        # Call LLM
        response = await self._call_llm(prompt)

        # Parse response
        score, components, feedback = self._parse_score_response(response)

        # Cache result
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
        # Check cache
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

        # Build prompt
        prompt = f"""You are an expert trading system evaluator. Score the memory consistency of this trading plan on a 0-100 scale.

TRADING PLAN:
{json.dumps(plan, indent=2)}

HISTORICAL MEMORY (recent similar decisions):
{json.dumps(memory_nodes, indent=2)}

Evaluate whether the plan is consistent with historical decisions and learned patterns. Consider:
- Similar strategies in similar conditions
- Past outcomes (wins vs losses)
- Lessons learned from previous trades

Provide your response in this exact format:
SCORE: <0-100>
COMPONENTS: {{"strategy_consistency": <0-100>, "outcome_learning": <0-100>, "pattern_recognition": <0-100>}}
FEEDBACK: <2-3 sentence explanation>

Scoring guidelines:
- 90-100: Excellent consistency, plan aligns with successful historical patterns
- 70-89: Good consistency, plan builds on past experience
- 50-69: Acceptable consistency, some alignment with history
- 30-49: Poor consistency, plan contradicts historical lessons
- 0-29: Unacceptable consistency, plan ignores past failures
"""

        # Call LLM
        response = await self._call_llm(prompt)

        # Parse response
        score, components, feedback = self._parse_score_response(response)

        # Cache result
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
        # Check cache
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

        # Build prompt
        prompt = f"""You are an expert trading system evaluator. Score the context relevance of this trading plan on a 0-100 scale.

TRADING PLAN:
{json.dumps(plan, indent=2)}

MARKET REGIME:
{json.dumps(regime, indent=2)}

EXTERNAL EVENTS:
{json.dumps(external_events, indent=2)}

Evaluate whether the plan accounts for current market regime, volatility, and external events. Consider:
- Regime appropriateness (does the strategy fit the current market state?)
- Event awareness (does the plan acknowledge key catalysts/risks?)
- Timing appropriateness (is now the right time given context?)

Provide your response in this exact format:
SCORE: <0-100>
COMPONENTS: {{"regime_fit": <0-100>, "event_awareness": <0-100>, "timing": <0-100>}}
FEEDBACK: <2-3 sentence explanation>

Scoring guidelines:
- 90-100: Excellent context awareness, plan perfectly suited to current environment
- 70-89: Good context awareness, plan accounts for key factors
- 50-69: Acceptable context awareness, some consideration of environment
- 30-49: Poor context awareness, plan misses important context
- 0-29: Unacceptable context awareness, plan ignores critical factors
"""

        # Call LLM
        response = await self._call_llm(prompt)

        # Parse response
        score, components, feedback = self._parse_score_response(response)

        # Cache result
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
