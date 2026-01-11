"""Tests for BradleyTerryRewardModel training and loss computation."""

from __future__ import annotations

import pytest
import torch

from research.evaluator.bradley_terry import (
    BradleyTerryRewardModel,
    train_bradley_terry_model,
)


class TestBradleyTerryLossComputation:
    """Test suite for preference loss computation."""

    def test_compute_preference_loss_no_margins(self) -> None:
        """Test loss computation without margins."""
        model = BradleyTerryRewardModel(input_dim=128)
        chosen = torch.randn(16, 128)
        rejected = torch.randn(16, 128)

        loss = model.compute_preference_loss(chosen, rejected)

        assert loss.shape == ()
        assert loss.item() >= 0

    def test_compute_preference_loss_with_margins(self) -> None:
        """Test loss computation with preference margins."""
        model = BradleyTerryRewardModel(input_dim=128)
        chosen = torch.randn(16, 128)
        rejected = torch.randn(16, 128)
        margins = torch.ones(16) * 0.5

        loss = model.compute_preference_loss(chosen, rejected, margins)

        assert loss.shape == ()
        assert loss.item() >= 0

    def test_compute_preference_loss_shape_mismatch(self) -> None:
        """Test that mismatched shapes raise ValueError."""
        model = BradleyTerryRewardModel(input_dim=128)
        chosen = torch.randn(16, 128)
        rejected = torch.randn(8, 128)

        with pytest.raises(ValueError, match="Shape mismatch"):
            model.compute_preference_loss(chosen, rejected)

    def test_compute_preference_loss_margins_mismatch(self) -> None:
        """Test that margins with wrong batch size raises ValueError."""
        model = BradleyTerryRewardModel(input_dim=128)
        chosen = torch.randn(16, 128)
        rejected = torch.randn(16, 128)
        margins = torch.ones(8)

        with pytest.raises(ValueError, match="batch size"):
            model.compute_preference_loss(chosen, rejected, margins)


class TestBradleyTerryTrainingStep:
    """Test suite for training step functionality."""

    def test_training_step_requires_optimizer(self) -> None:
        """Test that training_step requires an optimizer."""
        model = BradleyTerryRewardModel(input_dim=128)
        chosen = torch.randn(16, 128)
        rejected = torch.randn(16, 128)

        with pytest.raises(ValueError, match="optimizer must be provided"):
            model.training_step(chosen, rejected, optimizer=None)

    def test_training_step_returns_loss(self) -> None:
        """Test that training_step returns a valid loss value."""
        model = BradleyTerryRewardModel(input_dim=128)
        chosen = torch.randn(16, 128)
        rejected = torch.randn(16, 128)
        optimizer = torch.optim.Adam(model.parameters())

        loss = model.training_step(chosen, rejected, optimizer=optimizer)

        assert isinstance(loss, float)
        assert loss >= 0

    def test_loss_decreases_with_training(
        self, preference_pair_32: tuple[torch.Tensor, torch.Tensor]
    ) -> None:
        """Test that loss decreases when training on consistent preferences."""
        torch.manual_seed(42)
        model = BradleyTerryRewardModel(input_dim=32)
        chosen, rejected = preference_pair_32

        optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
        initial_loss = model.compute_preference_loss(chosen, rejected).item()

        for _ in range(10):
            model.training_step(chosen, rejected, optimizer=optimizer)

        final_loss = model.compute_preference_loss(chosen, rejected).item()

        assert final_loss < initial_loss * 0.8


class TestTrainBradleyTerryModel:
    """Test suite for train_bradley_terry_model function."""

    def test_train_basic(self, preference_pair_32: tuple[torch.Tensor, torch.Tensor]) -> None:
        """Test basic training loop."""
        torch.manual_seed(42)
        model = BradleyTerryRewardModel(input_dim=32)
        chosen, rejected = preference_pair_32

        losses = train_bradley_terry_model(
            model=model,
            chosen_features=chosen,
            rejected_features=rejected,
            learning_rate=1e-3,
            num_epochs=5,
            batch_size=20,
            device="cpu",
            verbose=False,
        )

        assert len(losses) == 5
        assert all(isinstance(loss, float) for loss in losses)
        assert losses[-1] < losses[0]

    def test_train_with_margins(self) -> None:
        """Test training with preference margins."""
        torch.manual_seed(42)
        model = BradleyTerryRewardModel(input_dim=32)

        chosen = torch.randn(100, 32)
        rejected = torch.randn(100, 32)
        margins = torch.rand(100) * 0.5

        losses = train_bradley_terry_model(
            model=model,
            chosen_features=chosen,
            rejected_features=rejected,
            margins=margins,
            num_epochs=3,
            batch_size=20,
            verbose=False,
        )

        assert len(losses) == 3

    def test_train_shape_mismatch(self) -> None:
        """Test that shape mismatches raise ValueError."""
        model = BradleyTerryRewardModel(input_dim=32)

        chosen = torch.randn(100, 32)
        rejected = torch.randn(50, 32)

        with pytest.raises(ValueError, match="same length"):
            train_bradley_terry_model(
                model=model,
                chosen_features=chosen,
                rejected_features=rejected,
                num_epochs=1,
                verbose=False,
            )

    def test_train_margins_mismatch(self) -> None:
        """Test that margins size mismatch raises ValueError."""
        model = BradleyTerryRewardModel(input_dim=32)

        chosen = torch.randn(100, 32)
        rejected = torch.randn(100, 32)
        margins = torch.rand(50)

        with pytest.raises(ValueError, match="same length"):
            train_bradley_terry_model(
                model=model,
                chosen_features=chosen,
                rejected_features=rejected,
                margins=margins,
                num_epochs=1,
                verbose=False,
            )

    def test_train_convergence(
        self, clear_preference_pair_16: tuple[torch.Tensor, torch.Tensor]
    ) -> None:
        """Test that training converges on simple synthetic data."""
        torch.manual_seed(42)
        model = BradleyTerryRewardModel(input_dim=16)
        chosen, rejected = clear_preference_pair_16

        losses = train_bradley_terry_model(
            model=model,
            chosen_features=chosen,
            rejected_features=rejected,
            learning_rate=1e-3,
            num_epochs=20,
            batch_size=32,
            verbose=False,
        )

        assert losses[-1] < 0.1

        model.eval()
        test_chosen = torch.abs(torch.randn(10, 16))
        test_rejected = -torch.abs(torch.randn(10, 16))

        with torch.no_grad():
            probs = model.predict_preference(test_chosen, test_rejected)

        assert torch.all(probs > 0.9)
