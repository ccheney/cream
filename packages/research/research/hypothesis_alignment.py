"""
Hypothesis Alignment LLM Evaluation

LLM-based evaluation of whether a factor implementation actually implements
its stated research hypothesis. Part of AlphaAgent regularization framework.

See: docs/plans/20-research-to-production-pipeline.md - Phase 2: Regularization
Reference: https://arxiv.org/html/2502.16789v2 (AlphaAgent)

A factor passes alignment check if score >= 0.7 (MIN_HYPOTHESIS_ALIGNMENT).
"""

from __future__ import annotations

import inspect
import json
import logging
import textwrap
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .strategies.base import ResearchFactor

logger = logging.getLogger(__name__)


@dataclass
class Hypothesis:
    """
    Research hypothesis that a factor implements.

    Captures the economic rationale, market mechanism, and expected
    behavior of a trading factor.
    """

    hypothesis_id: str
    """Unique identifier for this hypothesis."""

    title: str
    """Short descriptive title."""

    economic_rationale: str
    """Explanation of WHY this should generate alpha."""

    market_mechanism: str
    """HOW the market inefficiency manifests."""

    required_features: list[str] = field(default_factory=list)
    """Expected input features (e.g., ['close', 'volume'])."""

    target_regime: str = "ALL"
    """Market regime where hypothesis applies (e.g., 'BULL_TREND', 'HIGH_VOL')."""

    expected_horizon: str = "short"
    """Expected holding period: 'short' (days), 'medium' (weeks), 'long' (months)."""

    failure_conditions: list[str] = field(default_factory=list)
    """Conditions where the hypothesis should NOT work."""

    def to_prompt_context(self) -> str:
        """Format hypothesis for LLM prompt."""
        return f"""**Title**: {self.title}

**Economic Rationale**: {self.economic_rationale}

**Market Mechanism**: {self.market_mechanism}

**Expected Features**: {", ".join(self.required_features) if self.required_features else "Not specified"}

**Target Regime**: {self.target_regime}

**Expected Horizon**: {self.expected_horizon}

**Failure Conditions**: {", ".join(self.failure_conditions) if self.failure_conditions else "Not specified"}"""


@dataclass
class AlignmentResult:
    """Result of hypothesis alignment evaluation."""

    alignment_score: float
    """Alignment score from 0 to 1 (higher = better alignment)."""

    reasoning: str
    """LLM explanation of the evaluation."""

    gaps: list[str]
    """Aspects of the hypothesis NOT captured in the code."""

    extras: list[str]
    """Implementation behavior NOT specified in the hypothesis."""

    passed: bool
    """Whether alignment_score >= threshold."""

    threshold: float
    """Threshold used for pass/fail determination."""

    model_used: str = ""
    """LLM model used for evaluation."""

    raw_response: str = ""
    """Raw LLM response (for debugging)."""


class HypothesisAlignmentEvaluator:
    """
    LLM-based evaluation of hypothesis-factor alignment.

    Ensures the implemented factor actually captures the stated
    economic rationale and market mechanism.

    Uses Google Gemini API (via google-generativeai package).

    Example:
        evaluator = HypothesisAlignmentEvaluator()
        hypothesis = Hypothesis(
            hypothesis_id="hypo-001",
            title="RSI Mean Reversion",
            economic_rationale="Oversold conditions lead to price rebounds",
            market_mechanism="RSI < 30 indicates selling exhaustion",
        )
        result = await evaluator.evaluate_alignment(hypothesis, factor)
        if result.passed:
            print("Factor aligns with hypothesis")
    """

    DEFAULT_THRESHOLD = 0.7
    DEFAULT_MODEL = "gemini-2.0-flash"

    def __init__(
        self,
        model: str | None = None,
        threshold: float | None = None,
    ) -> None:
        """
        Initialize the evaluator.

        Args:
            model: Gemini model to use (default: gemini-2.0-flash)
            threshold: Alignment threshold (default: 0.7)
        """
        self.model = model or self.DEFAULT_MODEL
        self.threshold = threshold or self.DEFAULT_THRESHOLD
        self._client: Any = None

    def _get_client(self) -> Any:
        """Lazily initialize the Gemini client."""
        if self._client is None:
            from google import genai

            self._client = genai.Client()
        return self._client

    def _build_evaluation_prompt(
        self,
        hypothesis: Hypothesis,
        factor_source: str,
    ) -> str:
        """Build the evaluation prompt for the LLM."""
        return f"""You are evaluating whether a trading factor implementation
aligns with its stated research hypothesis.

## Hypothesis

{hypothesis.to_prompt_context()}

## Factor Implementation

```python
{factor_source}
```

## Evaluation Task

Assess how well the implementation captures the hypothesis:

1. **Alignment Score (0-1)**: How well does the code implement the stated economic rationale?
   - 1.0 = Perfect alignment, all aspects of hypothesis captured
   - 0.7 = Good alignment, core mechanism captured
   - 0.5 = Partial alignment, some mismatch
   - 0.3 = Poor alignment, significant gaps
   - 0.0 = No alignment, completely different logic

2. **Gaps**: What aspects of the hypothesis are NOT captured in the code?

3. **Extras**: What does the code do that WASN'T specified in the hypothesis?

4. **Reasoning**: Explain your evaluation in 2-3 sentences.

## Response Format

Respond with ONLY a JSON object (no markdown, no explanation outside JSON):

{{"alignment_score": <float 0-1>, "reasoning": "<2-3 sentence explanation>", "gaps": ["<aspect not captured>"], "extras": ["<unspecified behavior>"]}}"""

    def _parse_response(self, response_text: str) -> dict[str, Any]:
        """
        Parse the LLM response into structured data.

        Args:
            response_text: Raw response from LLM

        Returns:
            Parsed JSON data
        """
        # Try to extract JSON from response
        text = response_text.strip()

        # Remove markdown code blocks if present
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        # Find JSON object
        start = text.find("{")
        end = text.rfind("}") + 1

        if start == -1 or end == 0:
            raise ValueError(f"No JSON object found in response: {response_text[:200]}")

        json_str = text[start:end]
        return json.loads(json_str)

    async def evaluate_alignment(
        self,
        hypothesis: Hypothesis,
        factor: ResearchFactor,
    ) -> AlignmentResult:
        """
        Evaluate alignment between hypothesis and factor implementation.

        Args:
            hypothesis: The research hypothesis with economic rationale
            factor: The research factor to evaluate

        Returns:
            AlignmentResult with score, reasoning, and gaps
        """
        # Get factor source code
        source = inspect.getsource(factor.compute_signal)
        source = textwrap.dedent(source)

        prompt = self._build_evaluation_prompt(hypothesis, source)

        try:
            client = self._get_client()
            response = client.models.generate_content(model=self.model, contents=prompt)
            response_text = response.text

            data = self._parse_response(response_text)

            alignment_score = float(data.get("alignment_score", 0.0))
            alignment_score = max(0.0, min(1.0, alignment_score))  # Clamp to [0, 1]

            return AlignmentResult(
                alignment_score=alignment_score,
                reasoning=data.get("reasoning", ""),
                gaps=data.get("gaps", []),
                extras=data.get("extras", []),
                passed=alignment_score >= self.threshold,
                threshold=self.threshold,
                model_used=self.model,
                raw_response=response_text,
            )

        except Exception as e:
            logger.error(f"Hypothesis alignment evaluation failed: {e}")
            return AlignmentResult(
                alignment_score=0.0,
                reasoning=f"Evaluation failed: {e!s}",
                gaps=["Evaluation failed"],
                extras=[],
                passed=False,
                threshold=self.threshold,
                model_used=self.model,
                raw_response="",
            )

    async def evaluate_alignment_from_source(
        self,
        hypothesis: Hypothesis,
        factor_source: str,
    ) -> AlignmentResult:
        """
        Evaluate alignment using source code directly.

        Useful when factor class is not available but source is.

        Args:
            hypothesis: The research hypothesis
            factor_source: Python source code of compute_signal method

        Returns:
            AlignmentResult with score, reasoning, and gaps
        """
        prompt = self._build_evaluation_prompt(hypothesis, factor_source)

        try:
            client = self._get_client()
            response = client.models.generate_content(model=self.model, contents=prompt)
            response_text = response.text

            data = self._parse_response(response_text)

            alignment_score = float(data.get("alignment_score", 0.0))
            alignment_score = max(0.0, min(1.0, alignment_score))

            return AlignmentResult(
                alignment_score=alignment_score,
                reasoning=data.get("reasoning", ""),
                gaps=data.get("gaps", []),
                extras=data.get("extras", []),
                passed=alignment_score >= self.threshold,
                threshold=self.threshold,
                model_used=self.model,
                raw_response=response_text,
            )

        except Exception as e:
            logger.error(f"Hypothesis alignment evaluation failed: {e}")
            return AlignmentResult(
                alignment_score=0.0,
                reasoning=f"Evaluation failed: {e!s}",
                gaps=["Evaluation failed"],
                extras=[],
                passed=False,
                threshold=self.threshold,
                model_used=self.model,
                raw_response="",
            )


class MockHypothesisAlignmentEvaluator(HypothesisAlignmentEvaluator):
    """
    Mock evaluator for testing without LLM calls.

    Returns configurable alignment scores for testing.
    """

    def __init__(
        self,
        mock_score: float = 0.8,
        mock_reasoning: str = "Mock evaluation",
        mock_gaps: list[str] | None = None,
        mock_extras: list[str] | None = None,
        threshold: float | None = None,
    ) -> None:
        """
        Initialize mock evaluator.

        Args:
            mock_score: Alignment score to return
            mock_reasoning: Reasoning to return
            mock_gaps: Gaps to return
            mock_extras: Extras to return
            threshold: Alignment threshold
        """
        super().__init__(threshold=threshold)
        self.mock_score = mock_score
        self.mock_reasoning = mock_reasoning
        self.mock_gaps = mock_gaps or []
        self.mock_extras = mock_extras or []

    async def evaluate_alignment(
        self,
        hypothesis: Hypothesis,
        factor: ResearchFactor,
    ) -> AlignmentResult:
        """Return mock result without LLM call."""
        return AlignmentResult(
            alignment_score=self.mock_score,
            reasoning=self.mock_reasoning,
            gaps=self.mock_gaps,
            extras=self.mock_extras,
            passed=self.mock_score >= self.threshold,
            threshold=self.threshold,
            model_used="mock",
            raw_response="",
        )

    async def evaluate_alignment_from_source(
        self,
        hypothesis: Hypothesis,
        factor_source: str,
    ) -> AlignmentResult:
        """Return mock result without LLM call."""
        return AlignmentResult(
            alignment_score=self.mock_score,
            reasoning=self.mock_reasoning,
            gaps=self.mock_gaps,
            extras=self.mock_extras,
            passed=self.mock_score >= self.threshold,
            threshold=self.threshold,
            model_used="mock",
            raw_response="",
        )


async def compute_full_regularization(
    factor: ResearchFactor,
    hypothesis: Hypothesis,
    factor_zoo: list[ResearchFactor],
    evaluator: HypothesisAlignmentEvaluator | None = None,
) -> dict[str, Any]:
    """
    Compute all regularization metrics including LLM alignment.

    Combines:
    1. AST-based metrics (symbolic length, parameter count, feature count)
    2. Originality checking vs Factor Zoo
    3. Hypothesis alignment via LLM

    Args:
        factor: Research factor to evaluate
        hypothesis: Research hypothesis the factor implements
        factor_zoo: Existing factors for originality checking
        evaluator: Alignment evaluator (creates default if None)

    Returns:
        Dictionary with all regularization metrics and validation status
    """
    from .originality import check_originality

    # Basic metrics from AST
    basic_metrics = factor.compute_regularization_metrics()

    # Originality vs Factor Zoo
    originality = check_originality(factor, factor_zoo)

    # Hypothesis alignment (LLM)
    if evaluator is None:
        evaluator = HypothesisAlignmentEvaluator()
    alignment = await evaluator.evaluate_alignment(hypothesis, factor)

    # Update factor metadata with computed scores
    factor.metadata.regularization.originality_score = originality
    factor.metadata.regularization.hypothesis_alignment = alignment.alignment_score

    # Validate all constraints
    is_valid, violations = factor.validate_regularization()

    return {
        "symbolic_length": basic_metrics.symbolic_length,
        "parameter_count": basic_metrics.parameter_count,
        "feature_count": basic_metrics.feature_count,
        "originality_score": originality,
        "hypothesis_alignment": alignment.alignment_score,
        "alignment_reasoning": alignment.reasoning,
        "alignment_gaps": alignment.gaps,
        "alignment_extras": alignment.extras,
        "combined_penalty": factor.metadata.regularization.combined_regularization(),
        "is_valid": is_valid,
        "violations": violations,
    }
