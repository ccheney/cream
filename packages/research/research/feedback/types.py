"""
Feedback Types and Data Classes

Dataclasses for validation feedback, configuration, and type aliases.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

# Type aliases for external service protocols
RegimeServiceProtocol = Any
FactorZooProtocol = Any


@dataclass
class ValidationFeedback:
    """Structured feedback for hypothesis refinement."""

    factor_id: str
    """Factor that was validated."""

    hypothesis_id: str
    """Hypothesis being tested."""

    iteration: int
    """Current iteration (max 3)."""

    # What failed
    stage1_violations: list[str]
    """Gate violations from Stage 1 validation."""

    stage2_violations: list[str]
    """Gate violations from Stage 2 validation."""

    # Diagnostic analysis
    regime_performance: dict[str, float]
    """Sharpe ratio by market regime."""

    parameter_sensitivity: dict[str, float]
    """Sensitivity of results to each parameter."""

    correlation_to_existing: dict[str, float]
    """Correlation to existing Factor Zoo factors."""

    # Suggestions
    suggested_modifications: list[str]
    """Specific suggestions for improving the factor."""

    alternative_hypotheses: list[str]
    """Alternative hypotheses if abandoning."""

    # Decision
    action: Literal["REFINE", "ABANDON", "ACCEPT"]
    """Next action: refine hypothesis, abandon it, or accept factor."""

    def summary(self) -> str:
        """Get a human-readable summary of the feedback."""
        status = {
            "ACCEPT": "Factor passed all gates",
            "ABANDON": "Abandoning after max iterations",
            "REFINE": "Refining hypothesis",
        }[self.action]

        violations = self.stage1_violations + self.stage2_violations
        violation_str = ", ".join(violations) if violations else "None"

        return (
            f"[{self.action}] Iteration {self.iteration}/3 - {status}\n"
            f"Violations: {violation_str}\n"
            f"Suggestions: {len(self.suggested_modifications)}"
        )


@dataclass
class FeedbackConfig:
    """Configuration for feedback generation."""

    max_iterations: int = 3
    """Maximum refinement iterations before abandonment."""

    correlation_threshold: float = 0.7
    """Threshold for high correlation warning."""

    poor_regime_sharpe: float = 0.5
    """Sharpe threshold for poor regime performance."""
