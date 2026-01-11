"""
Expected Value Computation Module

Implements expected value computation for trading plans combining probability
estimates (win/loss/scratch) with magnitude estimates and transaction costs.

Example:
    from research.evaluator.expected_value import (
        ExpectedValueEstimate,
        estimate_probabilities,
        REGIME_WIN_RATE_MODIFIERS,
    )

    ev_estimate = ExpectedValueEstimate(
        p_win=0.6,
        p_loss=0.3,
        p_scratch=0.1,
        expected_win=500.0,
        expected_loss=-200.0,
        expected_scratch=-10.0,
        estimated_slippage=5.0,
        estimated_commission=2.0,
    )
    print(f"Expected Value: ${ev_estimate.expected_value:.2f}")
    print(f"Risk-Adjusted EV: ${ev_estimate.risk_adjusted_ev:.2f}")

    p_win, p_loss, p_scratch = estimate_probabilities(
        historical_win_rate=0.55,
        model_prediction=0.65,
        regime="BULL_TRENDING",
        holding_period_days=5,
        stop_distance_pct=0.02,
    )
"""

from research.evaluator.expected_value.calculator import ExpectedValueCalculator
from research.evaluator.expected_value.estimate import ExpectedValueEstimate
from research.evaluator.expected_value.probability import (
    compute_expected_value,
    estimate_probabilities,
    estimate_scratch_probability,
)
from research.evaluator.expected_value.types import (
    REGIME_WIN_RATE_MODIFIERS,
    EVConfig,
    MarketRegime,
)

__all__ = [
    "EVConfig",
    "ExpectedValueCalculator",
    "ExpectedValueEstimate",
    "MarketRegime",
    "REGIME_WIN_RATE_MODIFIERS",
    "compute_expected_value",
    "estimate_probabilities",
    "estimate_scratch_probability",
]
