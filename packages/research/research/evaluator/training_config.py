"""
Training Configuration Types

Configuration and enum types for the evaluator training pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class TrainingPhase(Enum):
    """Training phase identifier."""

    EXPERT_BOOTSTRAP = "expert_bootstrap"
    """Phase 1: Train on expert annotations."""

    HISTORICAL_OUTCOMES = "historical_outcomes"
    """Phase 2: Train on historical trade outcomes."""

    SYNTHETIC_AUGMENTATION = "synthetic_augmentation"
    """Phase 3: Train on synthetic preference pairs."""

    CALIBRATION = "calibration"
    """Phase 4: Fit probability calibrator."""


@dataclass
class TrainingConfig:
    """Configuration for training pipeline."""

    # Phase epochs
    expert_epochs: int = 10
    """Epochs for expert bootstrap phase."""

    outcome_epochs: int = 20
    """Epochs for historical outcomes phase."""

    synthetic_epochs: int = 10
    """Epochs for synthetic augmentation phase."""

    # Training parameters
    batch_size: int = 32
    """Batch size for training."""

    learning_rate: float = 1e-4
    """Learning rate for Adam optimizer."""

    device: str = "cpu"
    """Device for training (cpu or cuda)."""

    # Synthetic augmentation
    synthetic_multiplier: float = 2.0
    """Generate this many times the original pairs for augmentation."""

    candidates_per_context: int = 8
    """Number of candidates for West-of-N pair generation."""

    # Quality filtering
    min_margin: float = 0.1
    """Minimum margin for quality filtering."""

    min_score: float = 0.0
    """Minimum score for quality filtering."""

    # Stratified sampling
    top_percentile: float = 0.33
    """Top percentile for outcome stratification."""

    bottom_percentile: float = 0.33
    """Bottom percentile for outcome stratification."""

    # Checkpointing
    checkpoint_dir: str | Path = "checkpoints"
    """Directory for model checkpoints."""

    save_checkpoints: bool = True
    """Whether to save checkpoints after each phase."""

    # Logging
    verbose: bool = True
    """Whether to log progress."""

    log_interval: int = 10
    """Log every N batches."""


__all__ = [
    "TrainingConfig",
    "TrainingPhase",
]
