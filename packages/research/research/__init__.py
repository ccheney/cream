"""Research Package - Analytics & Backtesting for Cream.

This package provides research and backtesting utilities including:
- NautilusTrader integration for strategy backtesting
- VectorBT for portfolio analytics
- Arrow Flight client for bulk data retrieval
- Statistical analysis tools
"""

__version__ = "0.1.0"

# Arrow Flight client
from research.flight_client import (
    ArrowFlightClient,
    FlightClientConfig,
    FlightError,
    create_flight_client,
)

__all__ = [
    "ArrowFlightClient",
    "FlightClientConfig",
    "FlightError",
    "create_flight_client",
]
