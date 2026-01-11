"""
Post-Execution Metrics

Functions for computing post-execution metrics:
- Execution quality scoring (slippage, fill rate)
- Return attribution (Brinson-style)
- Risk management scoring
- Aggregate metrics computation
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .types import Attribution, MarketData, OutcomeScore, TradeOutcome


def compute_execution_quality(
    outcome: TradeOutcome,
    expected_slippage_bps: float,
    slippage_weight: float = 0.60,
    fill_weight: float = 0.40,
) -> float:
    """
    Compute execution quality score (0-100).

    Based on slippage vs. expected and fill rate.

    Args:
        outcome: Trade outcome with slippage and fill data
        expected_slippage_bps: Expected baseline slippage in basis points
        slippage_weight: Weight for slippage component (default 0.60)
        fill_weight: Weight for fill rate component (default 0.40)

    Returns:
        Execution quality score from 0 to 100
    """
    slippage_ratio = outcome.total_slippage_bps / expected_slippage_bps

    if slippage_ratio <= 0.5:
        slippage_score = 100.0
    elif slippage_ratio <= 1.0:
        slippage_score = 100.0 - (slippage_ratio - 0.5) * 40.0
    elif slippage_ratio <= 2.0:
        slippage_score = 80.0 - (slippage_ratio - 1.0) * 30.0
    else:
        slippage_score = max(0.0, 50.0 - (slippage_ratio - 2.0) * 25.0)

    fill_score = outcome.fill_rate * 100.0

    return slippage_score * slippage_weight + fill_score * fill_weight


def attribute_returns(outcome: TradeOutcome, market_data: MarketData) -> Attribution:
    """
    Attribute realized returns to market, alpha, and timing.

    Uses Brinson-style attribution adapted for single trades:
    - Market: What would passive beta exposure have returned?
    - Timing: How much did entry/exit timing add or subtract?
    - Alpha: Residual return after market and timing

    Args:
        outcome: Trade outcome with realized return and beta
        market_data: Market data with benchmark and VWAP information

    Returns:
        Attribution with market, alpha, timing contributions
    """
    from .types import Attribution

    market_contribution = market_data.benchmark_return_during_trade * outcome.beta_exposure

    sector_excess = (
        market_data.sector_return_during_trade - market_data.benchmark_return_during_trade
    )
    sector_contribution = sector_excess * outcome.beta_exposure

    if market_data.entry_vwap > 0 and market_data.entry_price > 0:
        entry_timing_pct = (
            market_data.entry_price - market_data.entry_vwap
        ) / market_data.entry_vwap
    else:
        entry_timing_pct = 0.0

    if market_data.exit_vwap > 0 and market_data.exit_price > 0:
        exit_timing_pct = (market_data.exit_price - market_data.exit_vwap) / market_data.exit_vwap
    else:
        exit_timing_pct = 0.0

    timing_contribution = exit_timing_pct - entry_timing_pct

    explained = market_contribution + sector_contribution + timing_contribution
    alpha_contribution = outcome.realized_return - explained

    total = market_contribution + sector_contribution + timing_contribution + alpha_contribution
    residual = outcome.realized_return - total

    return Attribution(
        market_contribution=round(market_contribution, 6),
        alpha_contribution=round(alpha_contribution, 6),
        timing_contribution=round(timing_contribution, 6),
        sector_contribution=round(sector_contribution, 6),
        total=round(total, 6),
        residual=round(residual, 6),
    )


def compute_risk_management_score(outcome: TradeOutcome) -> float:
    """
    Compute risk management score based on stop/target discipline.

    Args:
        outcome: Trade outcome with stop/target hit information

    Returns:
        Risk management score from 0 to 100
    """
    score = 50.0

    if outcome.hit_target:
        score += 25.0

    if outcome.hit_stop:
        score += 10.0

    if not outcome.hit_target and not outcome.hit_stop:
        if outcome.realized_return > 0:
            score += 10.0
        else:
            score -= 10.0

    if outcome.holding_duration_hours < 1:
        score -= 5.0

    return max(0.0, min(100.0, score))


def compute_outcome_score(
    outcome: TradeOutcome,
    execution_quality: float,
    return_weight: float = 0.50,
    execution_weight: float = 0.30,
    risk_mgmt_weight: float = 0.20,
    return_scale_factor: float = 20.0,
) -> float:
    """
    Compute overall outcome score (0-100).

    Components:
    - Return component (50%): Scaled realized return
    - Execution quality (30%): Slippage and fill rate
    - Risk management (20%): Stop/target discipline, duration

    Args:
        outcome: Trade outcome with realized return
        execution_quality: Pre-computed execution quality score
        return_weight: Weight for return component
        execution_weight: Weight for execution quality component
        risk_mgmt_weight: Weight for risk management component
        return_scale_factor: Scale factor for returns (5% = 100 points at 20.0)

    Returns:
        Overall outcome score from 0 to 100
    """
    return_score = 50.0 + outcome.realized_return * return_scale_factor * 100.0
    return_score = max(0.0, min(100.0, return_score))

    risk_mgmt_score = compute_risk_management_score(outcome)

    return (
        return_score * return_weight
        + execution_quality * execution_weight
        + risk_mgmt_score * risk_mgmt_weight
    )


def compute_execution_details(outcome: TradeOutcome, market_data: MarketData) -> dict[str, Any]:
    """
    Compute detailed execution metrics.

    Args:
        outcome: Trade outcome with slippage and fill data
        market_data: Market data with prices and benchmark

    Returns:
        Dictionary with detailed execution metrics
    """
    return {
        "entry_slippage_bps": outcome.entry_slippage_bps,
        "exit_slippage_bps": outcome.exit_slippage_bps,
        "total_slippage_bps": outcome.total_slippage_bps,
        "fill_rate": outcome.fill_rate,
        "entry_vs_vwap_pct": (
            (market_data.entry_price - market_data.entry_vwap) / market_data.entry_vwap
            if market_data.entry_vwap > 0
            else 0.0
        ),
        "exit_vs_vwap_pct": (
            (market_data.exit_price - market_data.exit_vwap) / market_data.exit_vwap
            if market_data.exit_vwap > 0
            else 0.0
        ),
        "benchmark_return": market_data.benchmark_return_during_trade,
        "beta_exposure": outcome.beta_exposure,
        "hit_stop": outcome.hit_stop,
        "hit_target": outcome.hit_target,
    }


def generate_notes(
    outcome: TradeOutcome,
    execution_quality: float,
    attribution: Attribution,
    plan_score: Any,
    expected_slippage_bps: float,
) -> list[str]:
    """
    Generate feedback notes for the outcome.

    Args:
        outcome: Trade outcome with realized metrics
        execution_quality: Pre-computed execution quality score
        attribution: Return attribution breakdown
        plan_score: Original pre-execution plan score
        expected_slippage_bps: Expected baseline slippage

    Returns:
        List of feedback notes
    """
    notes = []

    if outcome.realized_return > 0.05:
        notes.append(f"Strong positive return ({outcome.realized_return:.2%})")
    elif outcome.realized_return < -0.05:
        notes.append(f"Significant loss ({outcome.realized_return:.2%})")

    if execution_quality < 50:
        notes.append(f"Poor execution quality ({execution_quality:.0f}/100)")
    elif execution_quality > 90:
        notes.append("Excellent execution quality")

    if outcome.total_slippage_bps > expected_slippage_bps * 2:
        notes.append(
            f"High slippage ({outcome.total_slippage_bps:.1f} bps vs {expected_slippage_bps:.1f} expected)"
        )

    if attribution.alpha_contribution > 0.02:
        notes.append(f"Positive alpha contribution ({attribution.alpha_contribution:.2%})")
    elif attribution.alpha_contribution < -0.02:
        notes.append(f"Negative alpha ({attribution.alpha_contribution:.2%}) - review selection")

    if abs(attribution.timing_contribution) > 0.01:
        direction = "positive" if attribution.timing_contribution > 0 else "negative"
        notes.append(
            f"Significant {direction} timing contribution ({attribution.timing_contribution:.2%})"
        )

    if outcome.hit_target:
        notes.append("Target hit - disciplined exit")
    elif outcome.hit_stop:
        notes.append("Stop hit - risk managed as planned")
    elif outcome.realized_return < 0:
        notes.append("Loss without stop hit - review exit discipline")

    if plan_score is not None:
        pre_score = getattr(plan_score, "overall_score", 50)
        if pre_score > 70 and outcome.realized_return < 0:
            notes.append("High pre-score but negative outcome - review scoring model")
        elif pre_score < 30 and outcome.realized_return > 0.03:
            notes.append(
                "Low pre-score but positive outcome - potential model improvement opportunity"
            )

    return notes


def compute_aggregate_metrics(outcome_scores: list[OutcomeScore]) -> dict[str, Any]:
    """
    Compute aggregate metrics across multiple outcomes.

    Args:
        outcome_scores: List of OutcomeScore objects

    Returns:
        Dictionary with aggregate metrics
    """
    if not outcome_scores:
        return {}

    returns = [s.realized_return for s in outcome_scores]
    execution_qualities = [s.execution_quality for s in outcome_scores]
    outcome_scores_values = [s.outcome_score for s in outcome_scores]

    alphas = [s.attribution.alpha_contribution for s in outcome_scores]
    timings = [s.attribution.timing_contribution for s in outcome_scores]

    import numpy as np

    return {
        "count": len(outcome_scores),
        "avg_return": float(np.mean(returns)),
        "total_return": float(np.sum(returns)),
        "std_return": float(np.std(returns)),
        "win_rate": float(np.mean([1 if r > 0 else 0 for r in returns])),
        "avg_execution_quality": float(np.mean(execution_qualities)),
        "avg_outcome_score": float(np.mean(outcome_scores_values)),
        "total_alpha": float(np.sum(alphas)),
        "avg_alpha": float(np.mean(alphas)),
        "total_timing": float(np.sum(timings)),
        "avg_timing": float(np.mean(timings)),
        "sharpe_ratio": float(np.mean(returns) / np.std(returns)) if np.std(returns) > 0 else 0.0,
    }
