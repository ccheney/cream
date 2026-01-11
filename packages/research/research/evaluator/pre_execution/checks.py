"""
Pre-Execution Check Functions

Individual scoring functions for each evaluation dimension.
"""

from __future__ import annotations

from typing import Any


def compute_technical_score(plan: Any, context: Any) -> float:
    """
    Compute technical alignment score based on plan vs indicators.

    Args:
        plan: TradingPlan object with direction/action
        context: MarketContext with RSI, trend_strength, regime

    Returns:
        Score from 0-100
    """
    score = 50.0  # Base neutral score

    direction = getattr(plan, "direction", None)
    action = getattr(plan, "action", None)

    is_long = str(direction).upper() == "LONG" or str(action).upper() == "BUY"
    is_short = str(direction).upper() == "SHORT" or str(action).upper() == "SELL"

    # Check RSI alignment
    rsi = getattr(context, "rsi", 50.0)
    if is_long:
        if rsi < 30:  # Oversold - good for long
            score += 20
        elif rsi < 50:
            score += 10
        elif rsi > 70:  # Overbought - bad for long
            score -= 15
    elif is_short:
        if rsi > 70:  # Overbought - good for short
            score += 20
        elif rsi > 50:
            score += 10
        elif rsi < 30:  # Oversold - bad for short
            score -= 15

    # Check trend alignment
    trend_strength = getattr(context, "trend_strength", 0.0)
    if is_long and trend_strength > 0:
        score += 15 * trend_strength
    elif is_short and trend_strength < 0:
        score += 15 * abs(trend_strength)
    elif is_long and trend_strength < -0.3 or is_short and trend_strength > 0.3:
        score -= 10

    # Regime alignment
    regime = getattr(context, "regime", "UNKNOWN")
    if regime == "BULL_TREND" and is_long or regime == "BEAR_TREND" and is_short:
        score += 10
    elif regime == "BULL_TREND" and is_short or regime == "BEAR_TREND" and is_long:
        score -= 10

    return max(0, min(100, score))


def compute_memory_score(
    plan: Any,
    context: Any,
    memory_context: dict[str, Any] | None,
) -> float:
    """
    Compute memory consistency score.

    Args:
        plan: TradingPlan object
        context: MarketContext with regime
        memory_context: Optional context from memory retrieval

    Returns:
        Score from 0-100
    """
    if memory_context is None:
        return 50.0  # Neutral if no memory context

    score = 50.0

    # Check for relevant memory nodes
    relevant_nodes = memory_context.get("relevant_nodes", [])
    if len(relevant_nodes) > 0:
        score += 10  # Bonus for having relevant context

    # Check for similar past trades
    similar_trades = memory_context.get("similar_trades", [])
    if len(similar_trades) > 0:
        avg_outcome = memory_context.get("avg_outcome", 0.0)
        if avg_outcome > 0:
            score += 20  # Similar trades were profitable
        elif avg_outcome < -0.02:
            score -= 15  # Similar trades lost money

    # Check for regime-specific performance
    regime_performance = memory_context.get("regime_performance", {})
    current_regime = getattr(context, "regime", "UNKNOWN")
    if current_regime in regime_performance:
        perf = regime_performance[current_regime]
        if perf > 0.5:  # Good performance in this regime
            score += 15
        elif perf < 0.3:  # Poor performance in this regime
            score -= 10

    # Check for known failure modes
    failure_modes = memory_context.get("failure_modes", [])
    if len(failure_modes) > 0:
        score -= 5 * len(failure_modes)

    return max(0, min(100, score))


def compute_context_score(plan: Any, context: Any) -> float:
    """
    Compute context relevance score.

    Args:
        plan: TradingPlan object with action, time_horizon
        context: MarketContext with VIX, volume_ratio

    Returns:
        Score from 0-100
    """
    score = 50.0

    # VIX appropriateness
    vix = getattr(context, "vix", 20.0)
    action = str(getattr(plan, "action", "")).upper()

    if vix > 30:
        # High volatility - favor caution
        if action == "HOLD":
            score += 15
        elif action in ["BUY", "SELL"]:
            score -= 10  # Aggressive in high vol
    elif vix < 15:
        # Low volatility - more opportunity
        if action in ["BUY", "SELL"]:
            score += 10

    # Volume ratio
    volume_ratio = getattr(context, "volume_ratio", 1.0)
    if volume_ratio > 2.0:
        # High volume - potentially significant move
        score += 10
    elif volume_ratio < 0.5:
        # Low volume - less conviction
        score -= 5

    # Time horizon appropriateness
    time_horizon = getattr(plan, "time_horizon", "SWING")
    if time_horizon in ["SCALP", "DAY"] and vix > 25:
        score -= 10  # Short-term in high vol
    elif time_horizon == "POSITION" and vix > 30:
        score += 5  # Long-term positioning in high vol

    return max(0, min(100, score))
