"""Tests for BradleyTerryRewardModel checkpoint save/load functionality."""

from __future__ import annotations

import tempfile
from pathlib import Path

import torch

from research.evaluator.bradley_terry import BradleyTerryRewardModel


class TestBradleyTerryCheckpoints:
    """Test suite for checkpoint save and load functionality."""

    def test_save_and_load_checkpoint(self) -> None:
        """Test saving and loading model checkpoints."""
        torch.manual_seed(42)
        model = BradleyTerryRewardModel(input_dim=64, hidden_dims=[128, 64], dropout=0.15)

        features = torch.randn(20, 64)
        chosen = features[:10]
        rejected = features[10:]
        optimizer = torch.optim.Adam(model.parameters())

        for _ in range(5):
            model.training_step(chosen, rejected, optimizer=optimizer)

        with tempfile.TemporaryDirectory() as tmpdir:
            checkpoint_path = Path(tmpdir) / "model.pt"
            model.save_checkpoint(str(checkpoint_path))
            loaded_model = BradleyTerryRewardModel.load_checkpoint(str(checkpoint_path))

        assert loaded_model.input_dim == model.input_dim
        assert loaded_model.hidden_dims == model.hidden_dims
        assert loaded_model.dropout == model.dropout

        model.eval()
        loaded_model.eval()

        test_features = torch.randn(5, 64)
        with torch.no_grad():
            original_rewards = model.predict_reward(test_features)
            loaded_rewards = loaded_model.predict_reward(test_features)

        assert torch.allclose(original_rewards, loaded_rewards, atol=1e-6)

    def test_checkpoint_preserves_weights_after_training(self) -> None:
        """Test that checkpoint preserves trained weights correctly."""
        torch.manual_seed(42)
        model = BradleyTerryRewardModel(input_dim=32)

        chosen = torch.randn(50, 32) + 1.0
        rejected = torch.randn(50, 32) - 1.0
        optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)

        for _ in range(10):
            model.training_step(chosen, rejected, optimizer=optimizer)

        with tempfile.TemporaryDirectory() as tmpdir:
            checkpoint_path = Path(tmpdir) / "trained_model.pt"
            model.save_checkpoint(str(checkpoint_path))
            loaded_model = BradleyTerryRewardModel.load_checkpoint(str(checkpoint_path))

        model.eval()
        loaded_model.eval()

        test_chosen = torch.randn(10, 32) + 1.0
        test_rejected = torch.randn(10, 32) - 1.0

        with torch.no_grad():
            original_prefs = model.predict_preference(test_chosen, test_rejected)
            loaded_prefs = loaded_model.predict_preference(test_chosen, test_rejected)

        assert torch.allclose(original_prefs, loaded_prefs, atol=1e-6)
