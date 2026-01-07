"""
Research Strategies Module

Base classes and infrastructure for research factor implementation.
Enforces AlphaAgent-style regularization constraints.

See: docs/plans/20-research-to-production-pipeline.md - Phase 2
"""

from __future__ import annotations

from research.strategies.base import (
    FactorMetadata,
    RegularizationMetrics,
    ResearchFactor,
)

__all__ = [
    "FactorMetadata",
    "RegularizationMetrics",
    "ResearchFactor",
]
