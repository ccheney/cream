"""
Training Checkpoint Management

Functions for saving and loading model checkpoints during training.
"""

from __future__ import annotations

import logging
import pickle
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

import torch

if TYPE_CHECKING:
    from research.evaluator.bradley_terry import BradleyTerryRewardModel
    from research.evaluator.calibration import ProbabilityCalibrator
    from research.evaluator.training_config import TrainingConfig


logger = logging.getLogger(__name__)


def save_checkpoint(
    model: BradleyTerryRewardModel,
    config: TrainingConfig,
    phase_name: str,
    optimizer: torch.optim.Adam | None = None,
    calibrator: ProbabilityCalibrator | None = None,
) -> Path:
    """
    Save model checkpoint.

    Args:
        model: The Bradley-Terry model to save
        config: Training configuration
        phase_name: Name of the current phase
        optimizer: Optional optimizer to save state
        calibrator: Optional calibrator to save

    Returns:
        Path to saved checkpoint
    """
    checkpoint_dir = Path(config.checkpoint_dir)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"evaluator_{phase_name}_{timestamp}.pt"
    filepath = checkpoint_dir / filename

    checkpoint = {
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": (optimizer.state_dict() if optimizer else None),
        "phase": phase_name,
        "timestamp": datetime.now().isoformat(),
        "config": {
            "input_dim": model.input_dim,
            "hidden_dims": model.hidden_dims,
            "dropout": model.dropout,
        },
    }

    torch.save(checkpoint, filepath)

    if calibrator is not None and calibrator.is_fitted:
        calibrator_path = filepath.with_suffix(".calibrator.pkl")
        with open(calibrator_path, "wb") as f:
            pickle.dump(calibrator, f)

    if config.verbose:
        logger.info(f"Saved checkpoint: {filepath}")

    return filepath


def load_checkpoint(
    filepath: str | Path,
    model: BradleyTerryRewardModel,
    device: str = "cpu",
    optimizer: torch.optim.Adam | None = None,
    calibrator: ProbabilityCalibrator | None = None,
    verbose: bool = True,
) -> ProbabilityCalibrator | None:
    """
    Load model from checkpoint.

    Args:
        filepath: Path to checkpoint file
        model: Model to load state into
        device: Device to map tensors to
        optimizer: Optional optimizer to load state into
        calibrator: Optional calibrator to replace if checkpoint has one
        verbose: Whether to log progress

    Returns:
        Loaded calibrator if one exists in checkpoint, otherwise the original
    """
    checkpoint = torch.load(filepath, map_location=device)

    model.load_state_dict(checkpoint["model_state_dict"])

    if optimizer and checkpoint.get("optimizer_state_dict"):
        optimizer.load_state_dict(checkpoint["optimizer_state_dict"])

    result_calibrator = calibrator
    calibrator_path = Path(filepath).with_suffix(".calibrator.pkl")
    if calibrator_path.exists() and calibrator is not None:
        with open(calibrator_path, "rb") as f:
            result_calibrator = pickle.load(f)

    if verbose:
        logger.info(
            f"Loaded checkpoint from {filepath} (phase: {checkpoint.get('phase', 'unknown')})"
        )

    return result_calibrator


__all__ = [
    "load_checkpoint",
    "save_checkpoint",
]
