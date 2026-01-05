"""Research Package - Analytics & Backtesting for Cream.

This package provides research and backtesting utilities including:
- NautilusTrader integration for strategy backtesting
- VectorBT for portfolio analytics
- Arrow Flight client for bulk data retrieval
- Rule-based evaluator scoring
- Statistical analysis tools
"""

from __future__ import annotations

__version__ = "0.1.0"

# Lazy imports to avoid requiring all dependencies
__all__ = [
    # Flight client (requires polars, pyarrow)
    "ArrowFlightClient",
    "FlightClientConfig",
    "FlightError",
    "create_flight_client",
    # Evaluator (no external dependencies)
    "RuleBasedScorer",
    "ScoringResult",
]


def __getattr__(name: str):
    """Lazy import of optional dependencies."""
    if name in ("ArrowFlightClient", "FlightClientConfig", "FlightError", "create_flight_client"):
        from research.flight_client import (
            ArrowFlightClient,
            FlightClientConfig,
            FlightError,
            create_flight_client,
        )

        return {
            "ArrowFlightClient": ArrowFlightClient,
            "FlightClientConfig": FlightClientConfig,
            "FlightError": FlightError,
            "create_flight_client": create_flight_client,
        }[name]

    if name in ("RuleBasedScorer", "ScoringResult"):
        from research.evaluator.rule_scorer import RuleBasedScorer, ScoringResult

        return {"RuleBasedScorer": RuleBasedScorer, "ScoringResult": ScoringResult}[name]

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
