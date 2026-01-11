"""
Training Data Types

Data classes for training pipeline inputs and outputs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from research.evaluator.synthetic_preferences import MarketContext, TradingPlan
    from research.evaluator.training_config import TrainingPhase


@dataclass
class ExpertAnnotation:
    """Expert annotation for a trading plan."""

    annotation_id: str
    """Unique identifier."""

    plan: TradingPlan
    """The trading plan being annotated."""

    context: MarketContext
    """Market context at time of annotation."""

    rating: float
    """Expert rating (0.0 to 1.0)."""

    annotator_id: str = "expert"
    """ID of the annotator."""

    notes: str = ""
    """Annotator notes."""

    timestamp: str = ""
    """ISO-8601 timestamp."""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "annotation_id": self.annotation_id,
            "rating": self.rating,
            "annotator_id": self.annotator_id,
            "notes": self.notes,
            "timestamp": self.timestamp,
        }


@dataclass
class HistoricalOutcome:
    """Historical trade outcome for preference learning."""

    outcome_id: str
    """Unique identifier."""

    plan: TradingPlan
    """The executed trading plan."""

    context: MarketContext
    """Market context at entry."""

    realized_return: float
    """Realized P&L as decimal (0.05 = 5%)."""

    risk_adjusted_return: float = 0.0
    """Sharpe or risk-adjusted return."""

    holding_duration_hours: float = 0.0
    """Duration of position in hours."""

    hit_stop: bool = False
    """Whether stop loss was hit."""

    hit_target: bool = False
    """Whether take profit was hit."""

    execution_quality: float = 1.0
    """Execution quality score (0.0 to 1.0)."""

    timestamp: str = ""
    """ISO-8601 timestamp of trade."""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "outcome_id": self.outcome_id,
            "realized_return": self.realized_return,
            "risk_adjusted_return": self.risk_adjusted_return,
            "holding_duration_hours": self.holding_duration_hours,
            "hit_stop": self.hit_stop,
            "hit_target": self.hit_target,
            "execution_quality": self.execution_quality,
            "timestamp": self.timestamp,
        }


@dataclass
class PhaseProgress:
    """Progress tracking for a training phase."""

    phase: TrainingPhase
    """Current phase."""

    epoch: int = 0
    """Current epoch."""

    total_epochs: int = 0
    """Total epochs for this phase."""

    batch: int = 0
    """Current batch."""

    total_batches: int = 0
    """Total batches per epoch."""

    loss: float = 0.0
    """Current batch loss."""

    epoch_loss: float = 0.0
    """Average loss for current epoch."""

    pairs_processed: int = 0
    """Total pairs processed in this phase."""

    start_time: str = ""
    """ISO-8601 start timestamp."""

    elapsed_seconds: float = 0.0
    """Elapsed time in seconds."""


@dataclass
class TrainingResult:
    """Result of training pipeline."""

    success: bool
    """Whether training completed successfully."""

    final_loss: float
    """Final training loss."""

    phases_completed: list[TrainingPhase] = field(default_factory=list)
    """List of completed phases."""

    phase_losses: dict[str, list[float]] = field(default_factory=dict)
    """Loss history per phase."""

    total_pairs_trained: int = 0
    """Total preference pairs used in training."""

    calibration_metrics: dict[str, float] = field(default_factory=dict)
    """Calibration metrics after fitting."""

    checkpoints_saved: list[str] = field(default_factory=list)
    """Paths to saved checkpoints."""

    training_time_seconds: float = 0.0
    """Total training time."""

    timestamp: str = ""
    """ISO-8601 completion timestamp."""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "success": self.success,
            "final_loss": self.final_loss,
            "phases_completed": [p.value for p in self.phases_completed],
            "phase_losses": self.phase_losses,
            "total_pairs_trained": self.total_pairs_trained,
            "calibration_metrics": self.calibration_metrics,
            "checkpoints_saved": self.checkpoints_saved,
            "training_time_seconds": self.training_time_seconds,
            "timestamp": self.timestamp,
        }


__all__ = [
    "ExpertAnnotation",
    "HistoricalOutcome",
    "PhaseProgress",
    "TrainingResult",
]
