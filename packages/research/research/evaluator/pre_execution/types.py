"""
Pre-Execution Evaluator Types

Dataclasses and type definitions for pre-execution plan evaluation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class DimensionScores:
    """Dimension scores for plan evaluation."""

    technical_alignment: float
    """Technical indicators alignment score (0-100)."""

    risk_reward_ratio: float
    """Risk-reward ratio score (0-100)."""

    memory_consistency: float
    """Consistency with memory/history score (0-100)."""

    context_relevance: float
    """Relevance to current context score (0-100)."""

    sizing_appropriate: float
    """Position sizing appropriateness score (0-100)."""

    def to_dict(self) -> dict[str, float]:
        """Convert to dictionary."""
        return {
            "technical_alignment": self.technical_alignment,
            "risk_reward_ratio": self.risk_reward_ratio,
            "memory_consistency": self.memory_consistency,
            "context_relevance": self.context_relevance,
            "sizing_appropriate": self.sizing_appropriate,
        }


@dataclass
class PlanScore:
    """Result of pre-execution plan evaluation."""

    cycle_id: str
    """Identifier for the trading cycle."""

    overall_score: float
    """Overall score (0-100)."""

    dimension_scores: DimensionScores
    """Scores for each evaluation dimension."""

    confidence: float
    """Calibrated confidence in the score (0-1)."""

    notes: list[str]
    """Feedback notes, especially for low-scoring dimensions."""

    bt_reward: float = 0.0
    """Raw Bradley-Terry reward value."""

    weighted_score: float = 0.0
    """Pre-BT-blend weighted score."""

    metadata: dict[str, Any] = field(default_factory=dict)
    """Additional metadata from scoring."""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "cycle_id": self.cycle_id,
            "overall_score": self.overall_score,
            "dimension_scores": self.dimension_scores.to_dict(),
            "confidence": self.confidence,
            "notes": self.notes,
            "bt_reward": self.bt_reward,
            "weighted_score": self.weighted_score,
            "metadata": self.metadata,
        }
