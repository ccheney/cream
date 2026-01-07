"""
Paper Validation Module

Runs Python and TypeScript factor implementations in parallel on live market data
for 14-30 days to verify production-readiness before promotion.

See: docs/plans/20-research-to-production-pipeline.md - Phase 6
"""

from __future__ import annotations

from .service import (
    DailyComparison,
    PaperValidationConfig,
    PaperValidationResult,
    PaperValidationService,
)
from .worker import (
    ComparisonLogger,
    FactorProvider,
    MarketDataProvider,
    PaperValidationState,
    PaperValidationWorker,
)

__all__ = [
    # Service
    "PaperValidationConfig",
    "DailyComparison",
    "PaperValidationResult",
    "PaperValidationService",
    # Worker
    "PaperValidationWorker",
    "PaperValidationState",
    # Protocols
    "FactorProvider",
    "MarketDataProvider",
    "ComparisonLogger",
]
