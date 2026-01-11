"""
DSR: Deflated Sharpe Ratio

Implements the Deflated Sharpe Ratio (DSR) calculation that corrects for
multiple testing bias, non-normal returns, and sample size.

Based on:
- Bailey & Lopez de Prado: The Deflated Sharpe Ratio
- Bailey et al.: Probability of Backtest Overfitting

See: docs/plans/20-research-to-production-pipeline.md - Phase 3

Key insight: After testing only 7 strategy configurations, a researcher
is expected to find at least one 2-year backtest with Sharpe > 1.0 even
when the true expected Sharpe is 0 (Bailey et al.).

DSR addresses this by:
1. Estimating expected maximum Sharpe under null hypothesis
2. Correcting for non-normal returns (skewness, kurtosis)
3. Computing probability the observed Sharpe is statistically significant
"""

from .helpers import compute_strategy_returns
from .types import CombinedStatisticalResults, DSRConfig, DSRResults
from .validator import DSRValidator, compute_full_statistical_validation

# Backward compatibility alias
_compute_strategy_returns = compute_strategy_returns

__all__ = [
    # Types
    "CombinedStatisticalResults",
    "DSRConfig",
    "DSRResults",
    # Validator
    "DSRValidator",
    # Functions
    "compute_full_statistical_validation",
    "compute_strategy_returns",
    # Backward compatibility
    "_compute_strategy_returns",
]
