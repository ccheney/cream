"""Tests for BradleyTerryRewardModel initialization and forward pass."""

from __future__ import annotations

import pytest
import torch

from research.evaluator.bradley_terry import BradleyTerryRewardModel


class TestBradleyTerryModelInitialization:
    """Test suite for BradleyTerryRewardModel initialization."""

    def test_initialization_default(self) -> None:
        """Test model initialization with default parameters."""
        model = BradleyTerryRewardModel()

        assert model.input_dim == 128
        assert model.hidden_dims == [256, 128]
        assert model.dropout == 0.1
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


class TestBradleyTerryModelForwardPass:
    """Test suite for BradleyTerryRewardModel forward pass."""

    def test_forward_pass(self) -> None:
        """Test forward pass produces correct output shape."""
        model = BradleyTerryRewardModel(input_dim=128)
        features = torch.randn(16, 128)

        rewards = model(features)

        assert rewards.shape == (16, 1)
        assert rewards.dtype == torch.float32

    def test_forward_pass_wrong_dimensions(self) -> None:
        """Test forward pass with wrong number of dimensions raises error."""
        model = BradleyTerryRewardModel(input_dim=128)

        with pytest.raises(ValueError, match="Expected 2D input tensor"):
            model(torch.randn(128))

        with pytest.raises(ValueError, match="Expected 2D input tensor"):
            model(torch.randn(16, 128, 1))

    def test_forward_pass_wrong_feature_dimension(self) -> None:
        """Test forward pass with wrong feature dimension raises error."""
        model = BradleyTerryRewardModel(input_dim=128)

        with pytest.raises(ValueError, match="Expected input_dim=128"):
            model(torch.randn(16, 64))

    def test_gradient_flow(self) -> None:
        """Test that gradients flow through the model properly."""
        model = BradleyTerryRewardModel(input_dim=32)
        chosen = torch.randn(8, 32, requires_grad=False)
        rejected = torch.randn(8, 32, requires_grad=False)

        loss = model.compute_preference_loss(chosen, rejected)
        loss.backward()

        has_nonzero_grad = False
        for name, param in model.named_parameters():
            assert param.grad is not None, f"No gradient for {name}"
            if not torch.all(param.grad == 0):
                has_nonzero_grad = True

        assert has_nonzero_grad, "All gradients are zero"
