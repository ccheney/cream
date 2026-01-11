"""Shared pytest fixtures for research package tests."""

from __future__ import annotations

import pytest
import torch


@pytest.fixture
def seed_random() -> None:
    """Set random seed for reproducibility."""
    torch.manual_seed(42)


@pytest.fixture
def sample_features_32() -> torch.Tensor:
    """Generate sample feature tensor with 32 dimensions."""
    torch.manual_seed(42)
    return torch.randn(16, 32)


@pytest.fixture
def sample_features_64() -> torch.Tensor:
    """Generate sample feature tensor with 64 dimensions."""
    torch.manual_seed(42)
    return torch.randn(16, 64)


@pytest.fixture
def sample_features_128() -> torch.Tensor:
    """Generate sample feature tensor with 128 dimensions."""
    torch.manual_seed(42)
    return torch.randn(16, 128)


@pytest.fixture
def preference_pair_32() -> tuple[torch.Tensor, torch.Tensor]:
    """Generate chosen/rejected feature pairs with 32 dimensions."""
    torch.manual_seed(42)
    chosen = torch.randn(100, 32) + 1.0
    rejected = torch.randn(100, 32) - 1.0
    return chosen, rejected


@pytest.fixture
def clear_preference_pair_16() -> tuple[torch.Tensor, torch.Tensor]:
    """Generate chosen/rejected pairs with very clear preferences (16 dims)."""
    torch.manual_seed(42)
    chosen = torch.abs(torch.randn(200, 16))
    rejected = -torch.abs(torch.randn(200, 16))
    return chosen, rejected


@pytest.fixture
def good_bad_plans_32() -> tuple[torch.Tensor, torch.Tensor]:
    """Generate good and bad plan feature tensors with 32 dimensions."""
    torch.manual_seed(42)
    good_plans = torch.cat([torch.randn(50, 16) + 2.0, torch.randn(50, 16)], dim=1)
    bad_plans = torch.cat([torch.randn(50, 16) - 2.0, torch.randn(50, 16)], dim=1)
    return good_plans, bad_plans
