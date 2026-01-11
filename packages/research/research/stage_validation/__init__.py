"""
Stage Validation Module

Multi-stage validation framework for research factors.

Stages:
1. VectorBT Fast Scan - Vectorized parameter sweep with performance gates
2. NautilusTrader Event-Driven - Full simulation with market impact
3. Walk-Forward Validation - Out-of-sample stability testing

Additional validation:
- CPCV - Combinatorial Purged Cross-Validation for PBO calculation
- DSR - Deflated Sharpe Ratio for multiple testing correction
"""

from .cpcv import CPCVConfig, CPCVResults, CPCVValidator, compute_optimal_folds
from .dsr import (
    CombinedStatisticalResults,
    DSRConfig,
    DSRResults,
    DSRValidator,
    _compute_strategy_returns,
    compute_full_statistical_validation,
)
from .stage1_vectorbt import Stage1Gates, Stage1Results, Stage1Validator
from .stage2_nautilus import (
    MonteCarloResults,
    Stage2Gates,
    Stage2Results,
    Stage2Validator,
    WalkForwardResults,
    run_full_stage2_validation,
)

# Re-export from subpackage for backward compatibility
# The original stage2_nautilus.py has been refactored into stage2_nautilus/

__all__ = [
    # CPCV validation
    "CPCVConfig",
    "CPCVResults",
    "CPCVValidator",
    "compute_optimal_folds",
    # DSR validation
    "CombinedStatisticalResults",
    "DSRConfig",
    "DSRResults",
    "DSRValidator",
    "_compute_strategy_returns",
    "compute_full_statistical_validation",
    # Stage 1 validation
    "Stage1Gates",
    "Stage1Results",
    "Stage1Validator",
    # Stage 2 validation
    "MonteCarloResults",
    "Stage2Gates",
    "Stage2Results",
    "Stage2Validator",
    "WalkForwardResults",
    "run_full_stage2_validation",
]
