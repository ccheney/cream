"""Tests for BradleyTerryRewardModel prediction methods."""

from __future__ import annotations

import pytest
import torch

from research.evaluator.bradley_terry import BradleyTerryRewardModel


class TestBradleyTerryRewardPrediction:
    """Test suite for reward prediction methods."""

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
        features = torch.randn(128)

        reward = model.predict_reward(features)

        assert reward.shape == ()
        assert reward.dtype == torch.float32


class TestBradleyTerryPreferencePrediction:
    """Test suite for preference prediction methods."""

    def test_predict_preference(self) -> None:
        """Test preference probability prediction."""
        model = BradleyTerryRewardModel(input_dim=128)
        features_a = torch.randn(10, 128)
        features_b = torch.randn(10, 128)

        probs = model.predict_preference(features_a, features_b)

        assert probs.shape == (10,)
        assert torch.all((probs >= 0) & (probs <= 1))

    def test_predict_preference_shape_mismatch(self) -> None:
        """Test that mismatched shapes raise ValueError."""
        model = BradleyTerryRewardModel(input_dim=128)
        features_a = torch.randn(10, 128)
        features_b = torch.randn(5, 128)

        with pytest.raises(ValueError, match="Shape mismatch"):
            model.predict_preference(features_a, features_b)


class TestBradleyTerryLearnedPreferences:
    """Test suite for learned preference behavior."""

    def test_learned_preferences(
        self, good_bad_plans_32: tuple[torch.Tensor, torch.Tensor]
    ) -> None:
        """Test that model learns to prefer better plans."""
        torch.manual_seed(42)
        model = BradleyTerryRewardModel(input_dim=32)
        good_plans, bad_plans = good_bad_plans_32

        optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
        for _ in range(20):
            model.training_step(good_plans, bad_plans, optimizer=optimizer)

        model.eval()
        new_good = torch.cat([torch.randn(10, 16) + 2.0, torch.randn(10, 16)], dim=1)
        new_bad = torch.cat([torch.randn(10, 16) - 2.0, torch.randn(10, 16)], dim=1)

        with torch.no_grad():
            probs = model.predict_preference(new_good, new_bad)

        assert torch.mean(probs) > 0.7
