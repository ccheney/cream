"""
Market Context Generator

Generates random market contexts for testing and synthetic preference
pair generation. Contexts include correlated regime-specific values.
"""

from __future__ import annotations

import random

from research.evaluator.preference_types import MarketContext

REGIMES = ["BULL_TREND", "BEAR_TREND", "RANGE", "HIGH_VOL"]
SECTORS = ["TECH", "HEALTHCARE", "FINANCE", "CONSUMER", "ENERGY", "INDUSTRIAL"]


def generate_random_contexts(
    symbols: list[str],
    n_contexts: int,
    random_seed: int | None = None,
) -> list[MarketContext]:
    """
    Generate random market contexts for testing.

    Contexts are generated with regime-correlated values for
    trend_strength, RSI, and VIX to ensure realistic combinations.

    Args:
        symbols: List of symbols to choose from
        n_contexts: Number of contexts to generate
        random_seed: Optional random seed for reproducibility

    Returns:
        List of MarketContext objects
    """
    rng = random.Random(random_seed)

    contexts = []
    for _ in range(n_contexts):
        symbol = rng.choice(symbols)
        regime = rng.choice(REGIMES)

        trend_strength, rsi, vix = _generate_regime_values(regime, rng)

        current_price = rng.uniform(20, 500)
        atr_pct = rng.uniform(0.01, 0.04) * (1 + (vix - 20) / 50)

        contexts.append(
            MarketContext(
                symbol=symbol,
                current_price=round(current_price, 2),
                regime=regime,
                vix=round(vix, 1),
                atr_pct=round(atr_pct, 4),
                rsi=round(rsi, 1),
                trend_strength=round(trend_strength, 2),
                volume_ratio=round(rng.uniform(0.5, 2.5), 2),
                sector=rng.choice(SECTORS),
                account_equity=rng.uniform(50000, 500000),
            )
        )

    return contexts


def _generate_regime_values(
    regime: str,
    rng: random.Random,
) -> tuple[float, float, float]:
    """
    Generate correlated trend_strength, RSI, and VIX for a regime.

    Args:
        regime: Market regime (BULL_TREND, BEAR_TREND, RANGE, HIGH_VOL)
        rng: Random number generator

    Returns:
        Tuple of (trend_strength, rsi, vix)
    """
    if regime == "BULL_TREND":
        return (
            rng.uniform(0.3, 1.0),
            rng.uniform(40, 80),
            rng.uniform(12, 22),
        )
    if regime == "BEAR_TREND":
        return (
            rng.uniform(-1.0, -0.3),
            rng.uniform(20, 60),
            rng.uniform(18, 35),
        )
    if regime == "HIGH_VOL":
        return (
            rng.uniform(-0.5, 0.5),
            rng.uniform(30, 70),
            rng.uniform(25, 50),
        )
    # RANGE
    return (
        rng.uniform(-0.3, 0.3),
        rng.uniform(35, 65),
        rng.uniform(15, 25),
    )


__all__ = [
    "REGIMES",
    "SECTORS",
    "generate_random_contexts",
]
