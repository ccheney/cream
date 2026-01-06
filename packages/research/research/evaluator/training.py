"""
Evaluator Training Pipeline

End-to-end training pipeline for the evaluator model with four phases:
1. Expert bootstrap (10 epochs) - train on expert annotations
2. Historical outcomes (20 epochs) - train on actual trade results
3. Synthetic augmentation (10 epochs) - augment with synthetic pairs
4. Calibration fitting - fit probability calibrator

See: docs/plans/10-research.md - Evaluator Model Training Pipeline

Example:
    from research.evaluator import (
        BradleyTerryRewardModel,
        SyntheticPreferenceGenerator,
        ProbabilityCalibrator,
        EvaluatorTrainingPipeline,
    )

    model = BradleyTerryRewardModel()
    generator = SyntheticPreferenceGenerator()
    calibrator = ProbabilityCalibrator()

    pipeline = EvaluatorTrainingPipeline(
        model=model,
        generator=generator,
        calibrator=calibrator,
    )

    # Train on all data
    result = pipeline.train(
        expert_annotations=expert_data,
        historical_outcomes=trade_data,
    )
    print(f"Final loss: {result.final_loss}")
"""

from __future__ import annotations

import logging
import pickle
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Any

import numpy as np
import torch
from numpy.typing import NDArray

from research.evaluator.bradley_terry import BradleyTerryRewardModel
from research.evaluator.calibration import ProbabilityCalibrator
from research.evaluator.synthetic_preferences import (
    MarketContext,
    PreferencePair,
    SyntheticPreferenceGenerator,
    TradingPlan,
    generate_random_contexts,
)

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


# ============================================
# Enums and Configuration
# ============================================


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


# ============================================
# Training Pipeline
# ============================================


class EvaluatorTrainingPipeline:
    """
    End-to-end training pipeline for evaluator model.

    Implements four-phase curriculum training:
    1. Expert bootstrap: Initialize model with expert preferences
    2. Historical outcomes: Learn from actual trade results
    3. Synthetic augmentation: Augment with generated pairs
    4. Calibration: Fit probability calibrator

    Attributes:
        model: Bradley-Terry reward model to train
        generator: Synthetic preference generator (optional)
        calibrator: Probability calibrator (optional)
        config: Training configuration
    """

    def __init__(
        self,
        model: BradleyTerryRewardModel,
        generator: SyntheticPreferenceGenerator | None = None,
        calibrator: ProbabilityCalibrator | None = None,
        config: TrainingConfig | None = None,
    ) -> None:
        """
        Initialize the training pipeline.

        Args:
            model: Bradley-Terry reward model to train
            generator: Synthetic preference generator (for phase 3)
            calibrator: Probability calibrator (for phase 4)
            config: Training configuration

        Raises:
            ValueError: If model is None
        """
        if model is None:
            raise ValueError("model is required")

        self.model = model
        self.generator = generator
        self.calibrator = calibrator
        self.config = config or TrainingConfig()

        # Training state
        self._optimizer: torch.optim.Adam | None = None
        self._progress_callback: Callable[[PhaseProgress], None] | None = None
        self._all_pairs: list[PreferencePair] = []

    def set_progress_callback(self, callback: Callable[[PhaseProgress], None]) -> None:
        """
        Set callback for progress updates.

        Args:
            callback: Function called with PhaseProgress on each batch
        """
        self._progress_callback = callback

    def train(
        self,
        expert_annotations: list[ExpertAnnotation] | None = None,
        historical_outcomes: list[HistoricalOutcome] | None = None,
        validation_outcomes: list[HistoricalOutcome] | None = None,
    ) -> TrainingResult:
        """
        Run full four-phase training pipeline.

        Args:
            expert_annotations: Expert-annotated plans for phase 1
            historical_outcomes: Historical trade outcomes for phase 2
            validation_outcomes: Validation set for calibration (defaults to 20% of outcomes)

        Returns:
            TrainingResult with training metrics
        """
        import time

        start_time = time.time()

        result = TrainingResult(
            success=False,
            final_loss=float("inf"),
            timestamp=datetime.now().isoformat(),
        )

        # Ensure checkpoint directory exists
        if self.config.save_checkpoints:
            checkpoint_path = Path(self.config.checkpoint_dir)
            checkpoint_path.mkdir(parents=True, exist_ok=True)

        # Initialize optimizer
        self._optimizer = torch.optim.Adam(
            self.model.parameters(),
            lr=self.config.learning_rate,
        )

        # Move model to device
        self.model = self.model.to(self.config.device)

        try:
            # Phase 1: Expert Bootstrap
            if expert_annotations:
                expert_pairs = self._expert_to_pairs(expert_annotations)
                if expert_pairs:
                    phase_losses = self._train_phase(
                        TrainingPhase.EXPERT_BOOTSTRAP,
                        expert_pairs,
                        self.config.expert_epochs,
                    )
                    result.phase_losses["expert_bootstrap"] = phase_losses
                    result.phases_completed.append(TrainingPhase.EXPERT_BOOTSTRAP)
                    result.total_pairs_trained += len(expert_pairs)
                    self._all_pairs.extend(expert_pairs)

                    if self.config.save_checkpoints:
                        ckpt_path = self._save_checkpoint("expert_bootstrap")
                        result.checkpoints_saved.append(str(ckpt_path))

                    if self.config.verbose:
                        logger.info(
                            f"Phase 1 complete: {len(expert_pairs)} pairs, "
                            f"final loss={phase_losses[-1]:.4f}"
                        )

            # Phase 2: Historical Outcomes
            if historical_outcomes:
                # Split validation if not provided
                if validation_outcomes is None and len(historical_outcomes) >= 10:
                    split_idx = int(len(historical_outcomes) * 0.8)
                    train_outcomes = historical_outcomes[:split_idx]
                    validation_outcomes = historical_outcomes[split_idx:]
                else:
                    train_outcomes = historical_outcomes

                outcome_pairs = self._outcomes_to_pairs(train_outcomes)
                if outcome_pairs:
                    phase_losses = self._train_phase(
                        TrainingPhase.HISTORICAL_OUTCOMES,
                        outcome_pairs,
                        self.config.outcome_epochs,
                    )
                    result.phase_losses["historical_outcomes"] = phase_losses
                    result.phases_completed.append(TrainingPhase.HISTORICAL_OUTCOMES)
                    result.total_pairs_trained += len(outcome_pairs)
                    self._all_pairs.extend(outcome_pairs)

                    if self.config.save_checkpoints:
                        ckpt_path = self._save_checkpoint("historical_outcomes")
                        result.checkpoints_saved.append(str(ckpt_path))

                    if self.config.verbose:
                        logger.info(
                            f"Phase 2 complete: {len(outcome_pairs)} pairs, "
                            f"final loss={phase_losses[-1]:.4f}"
                        )

            # Phase 3: Synthetic Augmentation
            if self.generator is not None and self._all_pairs:
                synthetic_pairs = self._generate_synthetic_pairs()
                if synthetic_pairs:
                    phase_losses = self._train_phase(
                        TrainingPhase.SYNTHETIC_AUGMENTATION,
                        synthetic_pairs,
                        self.config.synthetic_epochs,
                    )
                    result.phase_losses["synthetic_augmentation"] = phase_losses
                    result.phases_completed.append(TrainingPhase.SYNTHETIC_AUGMENTATION)
                    result.total_pairs_trained += len(synthetic_pairs)

                    if self.config.save_checkpoints:
                        ckpt_path = self._save_checkpoint("synthetic_augmentation")
                        result.checkpoints_saved.append(str(ckpt_path))

                    if self.config.verbose:
                        logger.info(
                            f"Phase 3 complete: {len(synthetic_pairs)} pairs, "
                            f"final loss={phase_losses[-1]:.4f}"
                        )

            # Phase 4: Calibration
            if self.calibrator is not None and validation_outcomes:
                calibration_metrics = self._calibrate_model(validation_outcomes)
                result.calibration_metrics = calibration_metrics
                result.phases_completed.append(TrainingPhase.CALIBRATION)

                if self.config.save_checkpoints:
                    ckpt_path = self._save_checkpoint("calibration")
                    result.checkpoints_saved.append(str(ckpt_path))

                if self.config.verbose:
                    logger.info(
                        f"Phase 4 complete: calibration "
                        f"brier={calibration_metrics.get('brier_score', 0):.4f}"
                    )

            # Calculate final loss
            if result.phase_losses:
                last_phase = list(result.phase_losses.keys())[-1]
                result.final_loss = result.phase_losses[last_phase][-1]

            result.success = True

        except Exception as e:
            logger.error(f"Training failed: {e}")
            result.success = False
            raise

        finally:
            result.training_time_seconds = time.time() - start_time
            result.timestamp = datetime.now().isoformat()

        return result

    def _expert_to_pairs(self, annotations: list[ExpertAnnotation]) -> list[PreferencePair]:
        """
        Convert expert annotations to preference pairs.

        Creates pairs from annotations by comparing ratings:
        - Higher-rated plans are "chosen"
        - Lower-rated plans are "rejected"

        Args:
            annotations: List of expert annotations

        Returns:
            List of preference pairs
        """
        if len(annotations) < 2:
            return []

        pairs: list[PreferencePair] = []

        # Sort by rating for pairing
        sorted_annotations = sorted(annotations, key=lambda a: a.rating, reverse=True)

        # Create pairs: top half vs bottom half
        n = len(sorted_annotations)
        mid = n // 2

        for i in range(mid):
            chosen_ann = sorted_annotations[i]
            rejected_ann = sorted_annotations[n - 1 - i]

            # Skip if ratings are too close
            margin = chosen_ann.rating - rejected_ann.rating
            if margin < self.config.min_margin:
                continue

            # Skip if scores too low
            if chosen_ann.rating < self.config.min_score:
                continue

            pair = PreferencePair(
                pair_id=f"expert_{chosen_ann.annotation_id}_{rejected_ann.annotation_id}",
                chosen=chosen_ann.plan,
                rejected=rejected_ann.plan,
                chosen_score=chosen_ann.rating,
                rejected_score=rejected_ann.rating,
                margin=margin,
                context=chosen_ann.context,
                source="expert",
                metadata={
                    "chosen_annotator": chosen_ann.annotator_id,
                    "rejected_annotator": rejected_ann.annotator_id,
                },
            )
            pairs.append(pair)

        if self.config.verbose:
            logger.info(
                f"Created {len(pairs)} expert preference pairs from {len(annotations)} annotations"
            )

        return pairs

    def _outcomes_to_pairs(self, outcomes: list[HistoricalOutcome]) -> list[PreferencePair]:
        """
        Convert historical outcomes to preference pairs using stratified sampling.

        Pairs winners (top percentile by return) with losers (bottom percentile)
        to create clear preference signals.

        Args:
            outcomes: List of historical outcomes

        Returns:
            List of preference pairs
        """
        if len(outcomes) < 2:
            return []

        # Sort by realized return
        sorted_outcomes = sorted(outcomes, key=lambda o: o.realized_return, reverse=True)

        n = len(sorted_outcomes)
        top_count = max(1, int(n * self.config.top_percentile))
        bottom_count = max(1, int(n * self.config.bottom_percentile))

        # Select top and bottom tiers
        top_outcomes = sorted_outcomes[:top_count]
        bottom_outcomes = sorted_outcomes[-bottom_count:]

        pairs: list[PreferencePair] = []

        # Create pairs: each top with each bottom
        for top in top_outcomes:
            for bottom in bottom_outcomes:
                # Calculate margin based on return difference
                return_diff = top.realized_return - bottom.realized_return
                margin = min(1.0, max(0.0, return_diff * 5))  # Scale and clamp

                if margin < self.config.min_margin:
                    continue

                # Calculate composite score
                chosen_score = self._outcome_to_score(top)
                rejected_score = self._outcome_to_score(bottom)

                pair = PreferencePair(
                    pair_id=f"outcome_{top.outcome_id}_{bottom.outcome_id}",
                    chosen=top.plan,
                    rejected=bottom.plan,
                    chosen_score=chosen_score,
                    rejected_score=rejected_score,
                    margin=margin,
                    context=top.context,
                    source="historical_outcome",
                    metadata={
                        "chosen_return": top.realized_return,
                        "rejected_return": bottom.realized_return,
                        "return_diff": return_diff,
                    },
                )
                pairs.append(pair)

        if self.config.verbose:
            logger.info(
                f"Created {len(pairs)} outcome preference pairs "
                f"from {len(outcomes)} outcomes (stratified: top {top_count}, "
                f"bottom {bottom_count})"
            )

        return pairs

    def _outcome_to_score(self, outcome: HistoricalOutcome) -> float:
        """
        Convert outcome to composite score.

        Args:
            outcome: Historical outcome

        Returns:
            Score between 0 and 1
        """
        # Base score from return (-0.2 to 0.2 → 0 to 1)
        return_score = max(0.0, min(1.0, (outcome.realized_return + 0.2) / 0.4))

        # Execution quality factor
        exec_factor = outcome.execution_quality

        # Target/stop factor
        target_bonus = 0.1 if outcome.hit_target else 0.0
        stop_penalty = -0.1 if outcome.hit_stop else 0.0

        score = return_score * exec_factor + target_bonus + stop_penalty
        return max(0.0, min(1.0, score))

    def _generate_synthetic_pairs(self) -> list[PreferencePair]:
        """
        Generate synthetic preference pairs for augmentation.

        Creates new pairs using the SyntheticPreferenceGenerator
        based on contexts from existing pairs.

        Returns:
            List of synthetic preference pairs
        """
        if self.generator is None:
            return []

        # Calculate target count
        target_count = int(len(self._all_pairs) * self.config.synthetic_multiplier)

        if self.config.verbose:
            logger.info(
                f"Generating {target_count} synthetic pairs "
                f"({self.config.synthetic_multiplier}x augmentation)"
            )

        # Extract contexts (using list since dataclasses aren't hashable)
        # Take unique by symbol to avoid duplicates
        seen_symbols: set[str] = set()
        contexts: list[MarketContext] = []
        for pair in self._all_pairs:
            if pair.context.symbol not in seen_symbols:
                contexts.append(pair.context)
                seen_symbols.add(pair.context.symbol)

        # Generate additional random contexts if needed
        contexts_needed = max(0, target_count - len(contexts))
        if contexts_needed > 0:
            # Use symbols from existing contexts
            symbols = list(seen_symbols) or ["AAPL", "MSFT", "GOOGL"]
            additional = generate_random_contexts(symbols, contexts_needed)
            contexts.extend(additional)

        # Generate pairs
        pairs: list[PreferencePair] = []
        for i, context in enumerate(contexts):
            if len(pairs) >= target_count:
                break

            try:
                pair = self.generator.generate_preference_pair(
                    context=context,
                    n_candidates=self.config.candidates_per_context,
                )

                # Apply quality filter
                if pair.margin >= self.config.min_margin:
                    pairs.append(pair)

            except Exception as e:
                logger.warning(f"Failed to generate pair for context {i}: {e}")
                continue

        if self.config.verbose:
            logger.info(f"Generated {len(pairs)} synthetic pairs")

        return pairs

    def _train_phase(
        self,
        phase: TrainingPhase,
        pairs: list[PreferencePair],
        epochs: int,
    ) -> list[float]:
        """
        Train model on preference pairs for one phase.

        Args:
            phase: Current training phase
            pairs: Preference pairs to train on
            epochs: Number of epochs

        Returns:
            List of average loss per epoch
        """
        import time

        if not pairs:
            return []

        # Convert pairs to tensors
        chosen_features, rejected_features, margins = self._pairs_to_tensors(pairs)

        # Move to device
        chosen_features = chosen_features.to(self.config.device)
        rejected_features = rejected_features.to(self.config.device)
        margins = margins.to(self.config.device)

        num_samples = chosen_features.size(0)
        batch_size = self.config.batch_size
        num_batches = (num_samples + batch_size - 1) // batch_size

        epoch_losses: list[float] = []
        start_time = time.time()

        for epoch in range(epochs):
            self.model.train()
            epoch_loss = 0.0

            # Random permutation for this epoch
            indices = torch.randperm(num_samples)

            for batch_idx in range(num_batches):
                start_idx = batch_idx * batch_size
                end_idx = min(start_idx + batch_size, num_samples)
                batch_indices = indices[start_idx:end_idx]

                # Get batch data
                batch_chosen = chosen_features[batch_indices]
                batch_rejected = rejected_features[batch_indices]
                batch_margins = margins[batch_indices]

                # Forward pass and loss
                self._optimizer.zero_grad()
                loss = self.model.compute_preference_loss(
                    batch_chosen, batch_rejected, batch_margins
                )

                # Backward pass
                loss.backward()
                self._optimizer.step()

                batch_loss = loss.item()
                epoch_loss += batch_loss

                # Progress callback
                if self._progress_callback is not None:
                    progress = PhaseProgress(
                        phase=phase,
                        epoch=epoch + 1,
                        total_epochs=epochs,
                        batch=batch_idx + 1,
                        total_batches=num_batches,
                        loss=batch_loss,
                        pairs_processed=(epoch * num_samples + end_idx),
                        elapsed_seconds=time.time() - start_time,
                    )
                    self._progress_callback(progress)

                # Log progress
                if (
                    self.config.verbose
                    and self.config.log_interval > 0
                    and (batch_idx + 1) % self.config.log_interval == 0
                ):
                    logger.info(
                        f"{phase.value} epoch {epoch + 1}/{epochs} "
                        f"batch {batch_idx + 1}/{num_batches} loss={batch_loss:.4f}"
                    )

            avg_epoch_loss = epoch_loss / num_batches
            epoch_losses.append(avg_epoch_loss)

            if self.config.verbose:
                logger.info(
                    f"{phase.value} epoch {epoch + 1}/{epochs} avg_loss={avg_epoch_loss:.4f}"
                )

        return epoch_losses

    def _pairs_to_tensors(
        self, pairs: list[PreferencePair]
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Convert preference pairs to training tensors.

        Args:
            pairs: List of preference pairs

        Returns:
            Tuple of (chosen_features, rejected_features, margins)
        """
        chosen_list: list[NDArray[np.float32]] = []
        rejected_list: list[NDArray[np.float32]] = []
        margins_list: list[float] = []

        for pair in pairs:
            chosen_feat = pair.chosen.to_feature_vector(pair.context)
            rejected_feat = pair.rejected.to_feature_vector(pair.context)

            chosen_list.append(chosen_feat)
            rejected_list.append(rejected_feat)
            margins_list.append(pair.margin)

        chosen_features = torch.tensor(np.stack(chosen_list), dtype=torch.float32)
        rejected_features = torch.tensor(np.stack(rejected_list), dtype=torch.float32)
        margins = torch.tensor(margins_list, dtype=torch.float32)

        return chosen_features, rejected_features, margins

    def _calibrate_model(self, validation_outcomes: list[HistoricalOutcome]) -> dict[str, float]:
        """
        Fit probability calibrator on validation data.

        Uses model predictions on validation outcomes to fit
        the calibrator.

        Args:
            validation_outcomes: Validation outcomes for calibration

        Returns:
            Calibration metrics
        """
        if self.calibrator is None or not validation_outcomes:
            return {}

        self.model.eval()

        # Get predictions for validation outcomes
        predictions: list[float] = []
        outcomes: list[int] = []

        with torch.no_grad():
            for outcome in validation_outcomes:
                # Get feature vector
                features = outcome.plan.to_feature_vector(outcome.context)
                features_tensor = torch.tensor(
                    features, dtype=torch.float32, device=self.config.device
                ).unsqueeze(0)

                # Get reward prediction
                reward = self.model.predict_reward(features_tensor).item()

                # Convert reward to probability (sigmoid)
                prob = 1.0 / (1.0 + np.exp(-reward))

                # Binary outcome: positive return = 1, negative = 0
                binary_outcome = 1 if outcome.realized_return > 0 else 0

                predictions.append(prob)
                outcomes.append(binary_outcome)

        # Update calibrator
        self.calibrator.update_batch(predictions, outcomes)

        # Get metrics
        try:
            metrics = self.calibrator.get_metrics()
            return {
                "brier_score": metrics.brier_score,
                "ece": metrics.ece,
                "sample_count": metrics.sample_count,
                "method": metrics.method,
                "is_fitted": metrics.is_fitted,
            }
        except Exception as e:
            logger.warning(f"Failed to get calibration metrics: {e}")
            return {"sample_count": len(predictions)}

    def _save_checkpoint(self, phase_name: str) -> Path:
        """
        Save model checkpoint.

        Args:
            phase_name: Name of the current phase

        Returns:
            Path to saved checkpoint
        """
        checkpoint_dir = Path(self.config.checkpoint_dir)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"evaluator_{phase_name}_{timestamp}.pt"
        filepath = checkpoint_dir / filename

        checkpoint = {
            "model_state_dict": self.model.state_dict(),
            "optimizer_state_dict": (self._optimizer.state_dict() if self._optimizer else None),
            "phase": phase_name,
            "timestamp": datetime.now().isoformat(),
            "config": {
                "input_dim": self.model.input_dim,
                "hidden_dims": self.model.hidden_dims,
                "dropout": self.model.dropout,
            },
        }

        torch.save(checkpoint, filepath)

        # Also save calibrator if fitted
        if self.calibrator is not None and self.calibrator.is_fitted:
            calibrator_path = filepath.with_suffix(".calibrator.pkl")
            with open(calibrator_path, "wb") as f:
                pickle.dump(self.calibrator, f)

        if self.config.verbose:
            logger.info(f"Saved checkpoint: {filepath}")

        return filepath

    def load_checkpoint(self, filepath: str | Path) -> None:
        """
        Load model from checkpoint.

        Args:
            filepath: Path to checkpoint file
        """
        checkpoint = torch.load(filepath, map_location=self.config.device)

        self.model.load_state_dict(checkpoint["model_state_dict"])

        if self._optimizer and checkpoint.get("optimizer_state_dict"):
            self._optimizer.load_state_dict(checkpoint["optimizer_state_dict"])

        # Load calibrator if exists
        calibrator_path = Path(filepath).with_suffix(".calibrator.pkl")
        if calibrator_path.exists() and self.calibrator is not None:
            with open(calibrator_path, "rb") as f:
                self.calibrator = pickle.load(f)

        if self.config.verbose:
            logger.info(
                f"Loaded checkpoint from {filepath} (phase: {checkpoint.get('phase', 'unknown')})"
            )

    def train_on_pairs(
        self,
        pairs: list[PreferencePair],
        epochs: int = 10,
    ) -> list[float]:
        """
        Train model directly on preference pairs.

        Convenience method for training on pre-constructed pairs
        without full pipeline.

        Args:
            pairs: Preference pairs to train on
            epochs: Number of epochs

        Returns:
            List of average loss per epoch
        """
        if self._optimizer is None:
            self._optimizer = torch.optim.Adam(
                self.model.parameters(),
                lr=self.config.learning_rate,
            )

        self.model = self.model.to(self.config.device)

        return self._train_phase(
            TrainingPhase.EXPERT_BOOTSTRAP,  # Generic phase
            pairs,
            epochs,
        )

    def evaluate_pairs(self, pairs: list[PreferencePair]) -> dict[str, float]:
        """
        Evaluate model performance on preference pairs.

        Computes accuracy and average loss on a set of pairs.

        Args:
            pairs: Preference pairs to evaluate

        Returns:
            Dictionary with evaluation metrics
        """
        if not pairs:
            return {"accuracy": 0.0, "loss": 0.0, "count": 0}

        self.model.eval()

        # Convert to tensors
        chosen_features, rejected_features, margins = self._pairs_to_tensors(pairs)
        chosen_features = chosen_features.to(self.config.device)
        rejected_features = rejected_features.to(self.config.device)
        margins = margins.to(self.config.device)

        with torch.no_grad():
            # Compute loss
            loss = self.model.compute_preference_loss(
                chosen_features, rejected_features, margins
            ).item()

            # Compute accuracy (model prefers chosen over rejected)
            chosen_rewards = self.model.predict_reward(chosen_features)
            rejected_rewards = self.model.predict_reward(rejected_features)

            correct = (chosen_rewards > rejected_rewards).float().sum().item()
            accuracy = correct / len(pairs)

        return {
            "accuracy": accuracy,
            "loss": loss,
            "count": len(pairs),
        }
