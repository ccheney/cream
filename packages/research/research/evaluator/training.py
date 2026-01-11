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
import time
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

import numpy as np
import torch

from research.evaluator.bradley_terry import BradleyTerryRewardModel
from research.evaluator.calibration import ProbabilityCalibrator
from research.evaluator.synthetic_preferences import (
    MarketContext,
    PreferencePair,
    SyntheticPreferenceGenerator,
    generate_random_contexts,
)
from research.evaluator.training_checkpoint import load_checkpoint, save_checkpoint
from research.evaluator.training_config import TrainingConfig, TrainingPhase
from research.evaluator.training_converters import (
    expert_annotations_to_pairs,
    historical_outcomes_to_pairs,
    pairs_to_tensors,
)
from research.evaluator.training_data_types import (
    ExpertAnnotation,
    HistoricalOutcome,
    PhaseProgress,
    TrainingResult,
)

logger = logging.getLogger(__name__)


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
        start_time = time.time()

        result = TrainingResult(
            success=False,
            final_loss=float("inf"),
            timestamp=datetime.now().isoformat(),
        )

        if self.config.save_checkpoints:
            checkpoint_path = Path(self.config.checkpoint_dir)
            checkpoint_path.mkdir(parents=True, exist_ok=True)

        self._optimizer = torch.optim.Adam(
            self.model.parameters(),
            lr=self.config.learning_rate,
        )

        self.model = self.model.to(self.config.device)

        try:
            result = self._run_phase_1_expert(result, expert_annotations)
            result, validation_outcomes = self._run_phase_2_outcomes(
                result, historical_outcomes, validation_outcomes
            )
            result = self._run_phase_3_synthetic(result)
            result = self._run_phase_4_calibration(result, validation_outcomes)

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

    def _run_phase_1_expert(
        self,
        result: TrainingResult,
        expert_annotations: list[ExpertAnnotation] | None,
    ) -> TrainingResult:
        """Run Phase 1: Expert Bootstrap."""
        if not expert_annotations:
            return result

        expert_pairs = expert_annotations_to_pairs(
            expert_annotations, self.config, verbose=self.config.verbose
        )
        if not expert_pairs:
            return result

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
            ckpt_path = save_checkpoint(
                self.model, self.config, "expert_bootstrap", self._optimizer, self.calibrator
            )
            result.checkpoints_saved.append(str(ckpt_path))

        if self.config.verbose:
            logger.info(
                f"Phase 1 complete: {len(expert_pairs)} pairs, final loss={phase_losses[-1]:.4f}"
            )

        return result

    def _run_phase_2_outcomes(
        self,
        result: TrainingResult,
        historical_outcomes: list[HistoricalOutcome] | None,
        validation_outcomes: list[HistoricalOutcome] | None,
    ) -> tuple[TrainingResult, list[HistoricalOutcome] | None]:
        """Run Phase 2: Historical Outcomes."""
        if not historical_outcomes:
            return result, validation_outcomes

        if validation_outcomes is None and len(historical_outcomes) >= 10:
            split_idx = int(len(historical_outcomes) * 0.8)
            train_outcomes = historical_outcomes[:split_idx]
            validation_outcomes = historical_outcomes[split_idx:]
        else:
            train_outcomes = historical_outcomes

        outcome_pairs = historical_outcomes_to_pairs(
            train_outcomes, self.config, verbose=self.config.verbose
        )
        if not outcome_pairs:
            return result, validation_outcomes

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
            ckpt_path = save_checkpoint(
                self.model, self.config, "historical_outcomes", self._optimizer, self.calibrator
            )
            result.checkpoints_saved.append(str(ckpt_path))

        if self.config.verbose:
            logger.info(
                f"Phase 2 complete: {len(outcome_pairs)} pairs, final loss={phase_losses[-1]:.4f}"
            )

        return result, validation_outcomes

    def _run_phase_3_synthetic(self, result: TrainingResult) -> TrainingResult:
        """Run Phase 3: Synthetic Augmentation."""
        if self.generator is None or not self._all_pairs:
            return result

        synthetic_pairs = self._generate_synthetic_pairs()
        if not synthetic_pairs:
            return result

        phase_losses = self._train_phase(
            TrainingPhase.SYNTHETIC_AUGMENTATION,
            synthetic_pairs,
            self.config.synthetic_epochs,
        )
        result.phase_losses["synthetic_augmentation"] = phase_losses
        result.phases_completed.append(TrainingPhase.SYNTHETIC_AUGMENTATION)
        result.total_pairs_trained += len(synthetic_pairs)

        if self.config.save_checkpoints:
            ckpt_path = save_checkpoint(
                self.model, self.config, "synthetic_augmentation", self._optimizer, self.calibrator
            )
            result.checkpoints_saved.append(str(ckpt_path))

        if self.config.verbose:
            logger.info(
                f"Phase 3 complete: {len(synthetic_pairs)} pairs, final loss={phase_losses[-1]:.4f}"
            )

        return result

    def _run_phase_4_calibration(
        self,
        result: TrainingResult,
        validation_outcomes: list[HistoricalOutcome] | None,
    ) -> TrainingResult:
        """Run Phase 4: Calibration."""
        if self.calibrator is None or not validation_outcomes:
            return result

        calibration_metrics = self._calibrate_model(validation_outcomes)
        result.calibration_metrics = calibration_metrics
        result.phases_completed.append(TrainingPhase.CALIBRATION)

        if self.config.save_checkpoints:
            ckpt_path = save_checkpoint(
                self.model, self.config, "calibration", self._optimizer, self.calibrator
            )
            result.checkpoints_saved.append(str(ckpt_path))

        if self.config.verbose:
            logger.info(
                f"Phase 4 complete: calibration "
                f"brier={calibration_metrics.get('brier_score', 0):.4f}"
            )

        return result

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

        target_count = int(len(self._all_pairs) * self.config.synthetic_multiplier)

        if self.config.verbose:
            logger.info(
                f"Generating {target_count} synthetic pairs "
                f"({self.config.synthetic_multiplier}x augmentation)"
            )

        seen_symbols: set[str] = set()
        contexts: list[MarketContext] = []
        for pair in self._all_pairs:
            if pair.context.symbol not in seen_symbols:
                contexts.append(pair.context)
                seen_symbols.add(pair.context.symbol)

        contexts_needed = max(0, target_count - len(contexts))
        if contexts_needed > 0:
            symbols = list(seen_symbols) or ["AAPL", "MSFT", "GOOGL"]
            additional = generate_random_contexts(symbols, contexts_needed)
            contexts.extend(additional)

        pairs: list[PreferencePair] = []
        for i, context in enumerate(contexts):
            if len(pairs) >= target_count:
                break

            try:
                pair = self.generator.generate_preference_pair(
                    context=context,
                    n_candidates=self.config.candidates_per_context,
                )

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
        if not pairs:
            return []

        chosen_features, rejected_features, margins = pairs_to_tensors(pairs)

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

            indices = torch.randperm(num_samples)

            for batch_idx in range(num_batches):
                start_idx = batch_idx * batch_size
                end_idx = min(start_idx + batch_size, num_samples)
                batch_indices = indices[start_idx:end_idx]

                batch_chosen = chosen_features[batch_indices]
                batch_rejected = rejected_features[batch_indices]
                batch_margins = margins[batch_indices]

                self._optimizer.zero_grad()
                loss = self.model.compute_preference_loss(
                    batch_chosen, batch_rejected, batch_margins
                )

                loss.backward()
                self._optimizer.step()

                batch_loss = loss.item()
                epoch_loss += batch_loss

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

        predictions: list[float] = []
        outcomes: list[int] = []

        with torch.no_grad():
            for outcome in validation_outcomes:
                features = outcome.plan.to_feature_vector(outcome.context)
                features_tensor = torch.tensor(
                    features, dtype=torch.float32, device=self.config.device
                ).unsqueeze(0)

                reward = self.model.predict_reward(features_tensor).item()

                prob = 1.0 / (1.0 + np.exp(-reward))

                binary_outcome = 1 if outcome.realized_return > 0 else 0

                predictions.append(prob)
                outcomes.append(binary_outcome)

        self.calibrator.update_batch(predictions, outcomes)

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

    def load_checkpoint(self, filepath: str | Path) -> None:
        """
        Load model from checkpoint.

        Args:
            filepath: Path to checkpoint file
        """
        self.calibrator = load_checkpoint(
            filepath,
            self.model,
            self.config.device,
            self._optimizer,
            self.calibrator,
            self.config.verbose,
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
            TrainingPhase.EXPERT_BOOTSTRAP,
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

        chosen_features, rejected_features, margins = pairs_to_tensors(pairs)
        chosen_features = chosen_features.to(self.config.device)
        rejected_features = rejected_features.to(self.config.device)
        margins = margins.to(self.config.device)

        with torch.no_grad():
            loss = self.model.compute_preference_loss(
                chosen_features, rejected_features, margins
            ).item()

            chosen_rewards = self.model.predict_reward(chosen_features)
            rejected_rewards = self.model.predict_reward(rejected_features)

            correct = (chosen_rewards > rejected_rewards).float().sum().item()
            accuracy = correct / len(pairs)

        return {
            "accuracy": accuracy,
            "loss": loss,
            "count": len(pairs),
        }


__all__ = [
    "EvaluatorTrainingPipeline",
    "ExpertAnnotation",
    "HistoricalOutcome",
    "PhaseProgress",
    "TrainingConfig",
    "TrainingPhase",
    "TrainingResult",
]
