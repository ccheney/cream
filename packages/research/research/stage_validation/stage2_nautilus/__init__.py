"""
Stage 2: NautilusTrader Event-Driven Validation

High-fidelity validation using NautilusTrader for event-driven backtesting
with realistic execution modeling, slippage, and fill simulation.

See: docs/plans/20-research-to-production-pipeline.md - Phase 3

Stage 2 Gates (Stricter):
- PBO < 0.5 (max 50% overfitting probability)
- DSR p-value > 0.95 (95% confidence in Sharpe)
- Walk-Forward Efficiency > 0.5 (OOS/IS ratio > 50%)
- MC Sharpe 5th percentile > 0.5 (robust under randomization)
"""

from .types import (
    MonteCarloResults,
    Stage2Gates,
    Stage2Results,
    WalkForwardResults,
)
from .validator import (
    Stage2Validator,
    run_full_stage2_validation,
)

__all__ = [
    "MonteCarloResults",
    "Stage2Gates",
    "Stage2Results",
    "Stage2Validator",
    "WalkForwardResults",
    "run_full_stage2_validation",
]
