"""
Tests for Bradley-Terry Reward Model

Tests the neural network-based preference learning model including:
- Model initialization and architecture
- Forward pass and reward prediction
- Preference probability computation
- Loss computation for training
- Training loop functionality
- Checkpoint save/load
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
import torch

from research.evaluator.bradley_terry import (
    BradleyTerryRewardModel,
    train_bradley_terry_model,
)


class TestBradleyTerryRewardModel:
    """Test suite for BradleyTerryRewardModel."""

    def test_initialization_default(self) -> None:
        """Test model initialization with default parameters."""
        model = BradleyTerryRewardModel()

        assert model.input_dim == 128
        assert model.hidden_dims == [256, 128]
        assert model.dropout == 0.1

        # Check network structure
        assert isinstance(model.network, torch.nn.Sequential)

    def test_initialization_custom(self) -> None:
        """Test model initialization with custom parameters."""
        model = BradleyTerryRewardModel(input_dim=64, hidden_dims=[128, 64, 32], dropout=0.2)

        assert model.input_dim == 64
        assert model.hidden_dims == [128, 64, 32]
        assert model.dropout == 0.2

    def test_initialization_invalid_input_dim(self) -> None:
        """Test that invalid input_dim raises ValueError."""
        with pytest.raises(ValueError, match="input_dim must be positive"):
            BradleyTerryRewardModel(input_dim=0)

        with pytest.raises(ValueError, match="input_dim must be positive"):
            BradleyTerryRewardModel(input_dim=-1)

    def test_initialization_invalid_dropout(self) -> None:
        """Test that invalid dropout raises ValueError."""
        with pytest.raises(ValueError, match="dropout must be in"):
            BradleyTerryRewardModel(dropout=-0.1)

        with pytest.raises(ValueError, match="dropout must be in"):
            BradleyTerryRewardModel(dropout=1.0)

    def test_forward_pass(self) -> None:
        """Test forward pass produces correct output shape."""
        model = BradleyTerryRewardModel(input_dim=128)
        features = torch.randn(16, 128)

        rewards = model(features)

        assert rewards.shape == (16, 1)
        assert rewards.dtype == torch.float32

    def test_forward_pass_invalid_shape(self) -> None:
        """Test forward pass with invalid input shape raises error."""
        model = BradleyTerryRewardModel(input_dim=128)

        # Wrong number of dimensions
        with pytest.raises(ValueError, match="Expected 2D input tensor"):
            model(torch.randn(128))

        with pytest.raises(ValueError, match="Expected 2D input tensor"):
            model(torch.randn(16, 128, 1))

        # Wrong feature dimension
        with pytest.raises(ValueError, match="Expected input_dim=128"):
            model(torch.randn(16, 64))

    def test_predict_reward_batch(self) -> None:
        """Test reward prediction for batch of plans."""
        model = BradleyTerryRewardModel(input_dim=128)
        features = torch.randn(10, 128)

        rewards = model.predict_reward(features)

        assert rewards.shape == (10,)
        assert rewards.dtype == torch.float32

    def test_predict_reward_single(self) -> None:
        """Test reward prediction for single plan."""
        model = BradleyTerryRewardModel(input_dim=128)
        features = torch.randn(128)  # Single feature vector

        reward = model.predict_reward(features)

        assert reward.shape == ()  # Scalar
        assert reward.dtype == torch.float32

    def test_predict_preference(self) -> None:
        """Test preference probability prediction."""
        model = BradleyTerryRewardModel(input_dim=128)
        features_a = torch.randn(10, 128)
        features_b = torch.randn(10, 128)

        probs = model.predict_preference(features_a, features_b)

        assert probs.shape == (10,)
        assert torch.all((probs >= 0) & (probs <= 1))  # Valid probabilities

    def test_predict_preference_shape_mismatch(self) -> None:
        """Test that mismatched shapes raise ValueError."""
        model = BradleyTerryRewardModel(input_dim=128)
        features_a = torch.randn(10, 128)
        features_b = torch.randn(5, 128)

        with pytest.raises(ValueError, match="Shape mismatch"):
            model.predict_preference(features_a, features_b)

    def test_compute_preference_loss_no_margins(self) -> None:
        """Test loss computation without margins."""
        model = BradleyTerryRewardModel(input_dim=128)
        chosen = torch.randn(16, 128)
        rejected = torch.randn(16, 128)

        loss = model.compute_preference_loss(chosen, rejected)

        assert loss.shape == ()  # Scalar
        assert loss.item() >= 0  # Loss should be non-negative

    def test_compute_preference_loss_with_margins(self) -> None:
        """Test loss computation with preference margins."""
        model = BradleyTerryRewardModel(input_dim=128)
        chosen = torch.randn(16, 128)
        rejected = torch.randn(16, 128)
        margins = torch.ones(16) * 0.5  # Moderate preference strength

        loss = model.compute_preference_loss(chosen, rejected, margins)

        assert loss.shape == ()  # Scalar
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
        margins = torch.ones(8)  # Wrong batch size

        with pytest.raises(ValueError, match="batch size"):
            model.compute_preference_loss(chosen, rejected, margins)

    def test_loss_decreases_with_training(self) -> None:
        """Test that loss decreases when training on consistent preferences."""
        torch.manual_seed(42)
        model = BradleyTerryRewardModel(input_dim=32)

        # Create synthetic data where chosen plans have higher feature values
        chosen = torch.randn(100, 32) + 1.0  # Shifted positive
        rejected = torch.randn(100, 32) - 1.0  # Shifted negative

        optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

        # Train for a few steps
        initial_loss = model.compute_preference_loss(chosen, rejected).item()

        for _ in range(10):
            model.training_step(chosen, rejected, optimizer=optimizer)

        final_loss = model.compute_preference_loss(chosen, rejected).item()

        # Loss should decrease significantly
        assert final_loss < initial_loss * 0.8

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

    def test_learned_preferences(self) -> None:
        """Test that model learns to prefer better plans."""
        torch.manual_seed(42)
        model = BradleyTerryRewardModel(input_dim=32)

        # Create clear synthetic preference data
        # Good plans: high values in first half of features
        good_plans = torch.cat([torch.randn(50, 16) + 2.0, torch.randn(50, 16)], dim=1)
        # Bad plans: low values in first half of features
        bad_plans = torch.cat([torch.randn(50, 16) - 2.0, torch.randn(50, 16)], dim=1)

        # Train model
        optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
        for _ in range(20):
            model.training_step(good_plans, bad_plans, optimizer=optimizer)

        # Test on new examples
        model.eval()
        new_good = torch.cat([torch.randn(10, 16) + 2.0, torch.randn(10, 16)], dim=1)
        new_bad = torch.cat([torch.randn(10, 16) - 2.0, torch.randn(10, 16)], dim=1)

        with torch.no_grad():
            probs = model.predict_preference(new_good, new_bad)

        # Model should strongly prefer good plans
        assert torch.mean(probs) > 0.7  # At least 70% prefer good over bad

    def test_save_and_load_checkpoint(self) -> None:
        """Test saving and loading model checkpoints."""
        torch.manual_seed(42)
        model = BradleyTerryRewardModel(input_dim=64, hidden_dims=[128, 64], dropout=0.15)

        # Train model briefly to set non-random weights
        features = torch.randn(20, 64)
        chosen = features[:10]
        rejected = features[10:]
        optimizer = torch.optim.Adam(model.parameters())

        for _ in range(5):
            model.training_step(chosen, rejected, optimizer=optimizer)

        # Save checkpoint
        with tempfile.TemporaryDirectory() as tmpdir:
            checkpoint_path = Path(tmpdir) / "model.pt"
            model.save_checkpoint(str(checkpoint_path))

            # Load checkpoint
            loaded_model = BradleyTerryRewardModel.load_checkpoint(str(checkpoint_path))

        # Verify architecture matches
        assert loaded_model.input_dim == model.input_dim
        assert loaded_model.hidden_dims == model.hidden_dims
        assert loaded_model.dropout == model.dropout

        # Verify weights match
        model.eval()
        loaded_model.eval()

        test_features = torch.randn(5, 64)
        with torch.no_grad():
            original_rewards = model.predict_reward(test_features)
            loaded_rewards = loaded_model.predict_reward(test_features)

        assert torch.allclose(original_rewards, loaded_rewards, atol=1e-6)

    def test_gradient_flow(self) -> None:
        """Test that gradients flow through the model properly."""
        model = BradleyTerryRewardModel(input_dim=32)
        chosen = torch.randn(8, 32, requires_grad=False)
        rejected = torch.randn(8, 32, requires_grad=False)

        loss = model.compute_preference_loss(chosen, rejected)
        loss.backward()

        # Check that all parameters have gradients
        # Note: Some biases may have zero gradient, but weights should not
        has_nonzero_grad = False
        for name, param in model.named_parameters():
            assert param.grad is not None, f"No gradient for {name}"
            if not torch.all(param.grad == 0):
                has_nonzero_grad = True

        # At least some parameters should have non-zero gradients
        assert has_nonzero_grad, "All gradients are zero"


class TestTrainBradleyTerryModel:
    """Test suite for train_bradley_terry_model function."""

    def test_train_basic(self) -> None:
        """Test basic training loop."""
        torch.manual_seed(42)
        model = BradleyTerryRewardModel(input_dim=32)

        chosen = torch.randn(100, 32) + 1.0
        rejected = torch.randn(100, 32) - 1.0

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

        # Should return loss per epoch
        assert len(losses) == 5
        assert all(isinstance(loss, float) for loss in losses)

        # Loss should generally decrease
        assert losses[-1] < losses[0]

    def test_train_with_margins(self) -> None:
        """Test training with preference margins."""
        torch.manual_seed(42)
        model = BradleyTerryRewardModel(input_dim=32)

        chosen = torch.randn(100, 32)
        rejected = torch.randn(100, 32)
        margins = torch.rand(100) * 0.5  # Variable preference strengths

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
        rejected = torch.randn(50, 32)  # Wrong size

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
        margins = torch.rand(50)  # Wrong size

        with pytest.raises(ValueError, match="same length"):
            train_bradley_terry_model(
                model=model,
                chosen_features=chosen,
                rejected_features=rejected,
                margins=margins,
                num_epochs=1,
                verbose=False,
            )

    def test_train_convergence(self) -> None:
        """Test that training converges on simple synthetic data."""
        torch.manual_seed(42)
        model = BradleyTerryRewardModel(input_dim=16)

        # Very clear preferences: chosen has all positive, rejected all negative
        chosen = torch.abs(torch.randn(200, 16))
        rejected = -torch.abs(torch.randn(200, 16))

        losses = train_bradley_terry_model(
            model=model,
            chosen_features=chosen,
            rejected_features=rejected,
            learning_rate=1e-3,
            num_epochs=20,
            batch_size=32,
            verbose=False,
        )

        # Should achieve low loss
        assert losses[-1] < 0.1

        # Should predict preferences correctly
        model.eval()
        test_chosen = torch.abs(torch.randn(10, 16))
        test_rejected = -torch.abs(torch.randn(10, 16))

        with torch.no_grad():
            probs = model.predict_preference(test_chosen, test_rejected)

        assert torch.all(probs > 0.9)  # Very confident preferences


class TestBradleyTerryIntegration:
    """Integration tests for Bradley-Terry model usage."""

    def test_end_to_end_workflow(self) -> None:
        """Test complete workflow: create, train, save, load, predict."""
        torch.manual_seed(42)

        # 1. Create model
        model = BradleyTerryRewardModel(input_dim=32, hidden_dims=[64, 32])

        # 2. Generate training data
        chosen = torch.randn(100, 32) + 0.5
        rejected = torch.randn(100, 32) - 0.5

        # 3. Train model
        losses = train_bradley_terry_model(
            model=model,
            chosen_features=chosen,
            rejected_features=rejected,
            num_epochs=10,
            batch_size=20,
            verbose=False,
        )

        assert len(losses) == 10

        # 4. Save checkpoint
        with tempfile.TemporaryDirectory() as tmpdir:
            checkpoint_path = Path(tmpdir) / "reward_model.pt"
            model.save_checkpoint(str(checkpoint_path))

            # 5. Load model
            loaded_model = BradleyTerryRewardModel.load_checkpoint(str(checkpoint_path))

        # 6. Make predictions
        loaded_model.eval()
        test_features = torch.randn(5, 32)

        with torch.no_grad():
            rewards = loaded_model.predict_reward(test_features)
            prefs = loaded_model.predict_preference(test_features[:3], test_features[2:])

        assert rewards.shape == (5,)
        assert prefs.shape == (3,)
        assert torch.all((prefs >= 0) & (prefs <= 1))

    def test_batch_size_handling(self) -> None:
        """Test that different batch sizes produce consistent results."""
        torch.manual_seed(42)

        # Train with small batches
        model1 = BradleyTerryRewardModel(input_dim=16)
        data = torch.randn(60, 16)
        chosen = data[:30]
        rejected = data[30:]

        train_bradley_terry_model(
            model=model1,
            chosen_features=chosen,
            rejected_features=rejected,
            num_epochs=10,
            batch_size=10,
            verbose=False,
        )

        # Train with large batches (same data, same seed)
        torch.manual_seed(42)
        model2 = BradleyTerryRewardModel(input_dim=16)

        train_bradley_terry_model(
            model=model2,
            chosen_features=chosen,
            rejected_features=rejected,
            num_epochs=10,
            batch_size=30,
            verbose=False,
        )

        # Predictions should be similar (not identical due to batch effects)
        test_features = torch.randn(10, 16)

        with torch.no_grad():
            rewards1 = model1.predict_reward(test_features)
            rewards2 = model2.predict_reward(test_features)

        # Should be correlated (similar ranking)
        correlation = torch.corrcoef(torch.stack([rewards1, rewards2]))[0, 1]
        assert correlation > 0.5
