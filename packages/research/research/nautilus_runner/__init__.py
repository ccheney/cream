"""
NautilusTrader Runner Module

High-fidelity event-driven backtesting using NautilusTrader.
Provides realistic execution modeling with slippage, commissions, and partial fills.

Features:
- Single and multi-asset backtesting
- Equity and options support
- Walk-forward optimization
- Arrow Flight data integration

See: docs/plans/10-research.md - High-Fidelity Validation
See: docs/plans/12-backtest.md - Backtest Configuration
"""

from .helpers import combine_metrics, compare_with_vectorbt
from .multi_asset import run_multi_asset_backtest
from .runner import NautilusRunner, quick_backtest
from .types import (
    BacktestResult,
    CommissionConfig,
    FillModelConfig,
    MultiAssetBacktestResult,
    NautilusConfig,
    WalkForwardResult,
    WalkForwardWindow,
)
from .walk_forward import generate_walk_forward_windows, run_walk_forward_optimization

__all__ = [
    # Core runner
    "NautilusRunner",
    "quick_backtest",
    # Configuration types
    "NautilusConfig",
    "FillModelConfig",
    "CommissionConfig",
    # Result types
    "BacktestResult",
    "MultiAssetBacktestResult",
    "WalkForwardWindow",
    "WalkForwardResult",
    # Multi-asset
    "run_multi_asset_backtest",
    # Walk-forward optimization
    "generate_walk_forward_windows",
    "run_walk_forward_optimization",
    # Helpers
    "combine_metrics",
    "compare_with_vectorbt",
]
