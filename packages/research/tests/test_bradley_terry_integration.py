"""Integration tests for Bradley-Terry reward model."""

from __future__ import annotations

import tempfile
from pathlib import Path

import torch

from research.evaluator.bradley_terry import (
    BradleyTerryRewardModel,
    train_bradley_terry_model,
)


class TestBradleyTerryIntegration:
    """Integration tests for Bradley-Terry model usage."""

    def test_end_to_end_workflow(self) -> None:
        """Test complete workflow: create, train, save, load, predict."""
        torch.manual_seed(42)

        model = BradleyTerryRewardModel(input_dim=32, hidden_dims=[64, 32])

        chosen = torch.randn(100, 32) + 0.5
        rejected = torch.randn(100, 32) - 0.5

        losses = train_bradley_terry_model(
            model=model,
            chosen_features=chosen,
            rejected_features=rejected,
            num_epochs=10,
            batch_size=20,
            verbose=False,
        )

        assert len(losses) == 10

        with tempfile.TemporaryDirectory() as tmpdir:
            checkpoint_path = Path(tmpdir) / "reward_model.pt"
            model.save_checkpoint(str(checkpoint_path))
            loaded_model = BradleyTerryRewardModel.load_checkpoint(str(checkpoint_path))

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

        test_features = torch.randn(10, 16)

        with torch.no_grad():
            rewards1 = model1.predict_reward(test_features)
            rewards2 = model2.predict_reward(test_features)

        correlation = torch.corrcoef(torch.stack([rewards1, rewards2]))[0, 1]
        assert correlation > 0.5
