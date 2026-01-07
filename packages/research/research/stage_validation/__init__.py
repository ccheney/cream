"""
Stage Validation Module

Multi-stage validation framework for research factors.

Stages:
1. VectorBT Fast Scan - Vectorized parameter sweep with performance gates
2. NautilusTrader Event-Driven - Full simulation with market impact
3. Walk-Forward Validation - Out-of-sample stability testing

Additional validation:
- CPCV - Combinatorial Purged Cross-Validation for PBO calculation
"""

from .cpcv import CPCVConfig, CPCVResults, CPCVValidator, compute_optimal_folds
from .stage1_vectorbt import Stage1Gates, Stage1Results, Stage1Validator

__all__ = [
    # CPCV validation
    "CPCVConfig",
    "CPCVResults",
    "CPCVValidator",
    "compute_optimal_folds",
    # Stage 1 validation
    "Stage1Gates",
    "Stage1Results",
    "Stage1Validator",
]
