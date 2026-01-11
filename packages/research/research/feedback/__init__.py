"""
Validation Feedback Loop Implementation

Provides structured feedback from validation results to guide hypothesis
refinement. Max 3 iterations per hypothesis before abandonment.

See: docs/plans/20-research-to-production-pipeline.md - Phase 3

Feedback includes:
- Gate violations from Stage 1 and Stage 2
- Regime-specific performance analysis
- Factor correlation to existing Factor Zoo
- Modification suggestions
- Alternative hypothesis suggestions
"""

from .generator import FeedbackGenerator
from .orchestrator import RefinementOrchestrator
from .types import (
    FactorZooProtocol,
    FeedbackConfig,
    RegimeServiceProtocol,
    ValidationFeedback,
)

__all__ = [
    "FeedbackConfig",
    "FeedbackGenerator",
    "FactorZooProtocol",
    "RegimeServiceProtocol",
    "RefinementOrchestrator",
    "ValidationFeedback",
]
