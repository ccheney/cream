"""
Stage 1: VectorBT Fast Scan Validation

Vectorized backtesting validation using VectorBT for fast parameter scanning
and initial performance gates. This is the first validation stage that filters
candidates before expensive event-driven testing.

See: docs/plans/20-research-to-production-pipeline.md - Phase 3

Gate Thresholds:
| Metric | Threshold | Purpose |
|--------|-----------|---------|
| Sharpe Ratio | > 1.0 | Risk-adjusted returns |
| Sortino Ratio | > 1.2 | Downside risk |
| Win Rate | > 45% | Trade success rate |
| Max Drawdown | < 25% | Capital preservation |
| IC (Information Coefficient) | > 0.03 | Predictive power |
| ICIR | > 0.5 | IC consistency |
"""

from .types import Stage1Gates, Stage1Results
from .validator import Stage1Validator

__all__ = [
    "Stage1Gates",
    "Stage1Results",
    "Stage1Validator",
]
