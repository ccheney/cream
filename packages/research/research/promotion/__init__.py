"""
Promotion Module

Handles promotion of validated factors to production via PR automation.

See: docs/plans/20-research-to-production-pipeline.md - Phase 8
"""

from __future__ import annotations

from .pr_creator import (
    PRCreator,
    PRCreatorConfig,
    PromotionPR,
)

__all__ = [
    "PRCreator",
    "PRCreatorConfig",
    "PromotionPR",
]
