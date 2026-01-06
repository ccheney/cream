"""
Arrow Flight Client for Python

Provides bulk data retrieval from the Rust execution engine
using Apache Arrow Flight RPC.

Flight paths:
- /candles/{symbol}/{timeframe}: Historical OHLCV data
- /ticks/{symbol}: Tick-level market data
- /chains/{underlying}/{date}: Historical option chains
- /portfolio/history: Portfolio value time series

Example:
    from research.flight_client import ArrowFlightClient

    client = ArrowFlightClient("grpc://localhost:50052")

    # Get historical candles as Polars DataFrame
    candles = client.get_candles("AAPL", "1h")
    print(candles.head())

    # Get option chain as PyArrow Table
    chain = client.get_option_chain_arrow("AAPL", "2026-01-17")
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Literal

import polars as pl

if TYPE_CHECKING:
    import pyarrow as pa
    import pyarrow.flight as flight


@dataclass
class FlightClientConfig:
    """Arrow Flight client configuration."""

    endpoint: str
    """Flight server endpoint (e.g., 'grpc://localhost:50052')"""

    timeout_ms: int = 30000
    """Request timeout in milliseconds"""

    use_tls: bool = False
    """Whether to use TLS encryption"""

    tls_cert_path: str | None = None
    """Path to TLS certificate (required if use_tls=True)"""


class FlightError(Exception):
    """Arrow Flight error."""

    def __init__(self, message: str, code: str, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class ArrowFlightClient:
    """
    Arrow Flight client for bulk data retrieval from Rust execution engine.

    Supports both PyArrow Table and Polars DataFrame outputs for flexibility.
    """

    def __init__(self, endpoint: str, config: FlightClientConfig | None = None) -> None:
        """
        Initialize the Arrow Flight client.

        Args:
            endpoint: Flight server endpoint (e.g., 'grpc://localhost:50052')
            config: Optional client configuration
        """
        self._config = config or FlightClientConfig(endpoint=endpoint)
        self._client: flight.FlightClient | None = None
        self._connected = False

    def connect(self) -> None:
        """Connect to the Flight server."""
        import pyarrow.flight as flight

        try:
            location = flight.Location.for_grpc_tcp(
                self._parse_host(self._config.endpoint),
                self._parse_port(self._config.endpoint),
            )
            self._client = flight.FlightClient(location)
            self._connected = True
        except Exception as e:
            raise FlightError(str(e), "CONNECTION_FAILED", retryable=True) from e

    def disconnect(self) -> None:
        """Disconnect from the Flight server."""
        if self._client is not None:
            self._client.close()
            self._client = None
        self._connected = False

    def is_connected(self) -> bool:
        """Check if connected to the server."""
        return self._connected

    def get_candles(
        self,
        symbol: str,
        timeframe: str,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        limit: int | None = None,
    ) -> pl.DataFrame:
        """
        Get historical OHLCV candle data as a Polars DataFrame.

        Args:
            symbol: Instrument symbol (e.g., 'AAPL')
            timeframe: Bar timeframe (e.g., '1m', '5m', '1h', '1d')
            from_date: Start date (inclusive)
            to_date: End date (inclusive)
            limit: Maximum number of rows to return

        Returns:
            Polars DataFrame with columns:
            - symbol: str
            - timestamp: datetime
            - timeframe_minutes: int
            - open: float
            - high: float
            - low: float
            - close: float
            - volume: int
            - vwap: float (optional)
        """
        table = self.get_candles_arrow(symbol, timeframe, from_date, to_date, limit)
        return pl.from_arrow(table)

    def get_candles_arrow(
        self,
        symbol: str,
        timeframe: str,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        limit: int | None = None,
    ) -> pa.Table:
        """
        Get historical OHLCV candle data as a PyArrow Table.

        Args:
            symbol: Instrument symbol (e.g., 'AAPL')
            timeframe: Bar timeframe (e.g., '1m', '5m', '1h', '1d')
            from_date: Start date (inclusive)
            to_date: End date (inclusive)
            limit: Maximum number of rows to return

        Returns:
            PyArrow Table with candle data
        """
        self._ensure_connected()

        # Build command with parameters
        command = {
            "path": ["candles", symbol, timeframe],
            "from": from_date.isoformat() if from_date else None,
            "to": to_date.isoformat() if to_date else None,
            "limit": limit,
        }

        return self._do_get(command)

    def get_ticks(
        self,
        symbol: str,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        limit: int | None = None,
    ) -> pl.DataFrame:
        """
        Get tick-level market data as a Polars DataFrame.

        Args:
            symbol: Instrument symbol
            from_date: Start date (inclusive)
            to_date: End date (inclusive)
            limit: Maximum number of rows to return

        Returns:
            Polars DataFrame with tick data
        """
        table = self.get_ticks_arrow(symbol, from_date, to_date, limit)
        return pl.from_arrow(table)

    def get_ticks_arrow(
        self,
        symbol: str,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        limit: int | None = None,
    ) -> pa.Table:
        """Get tick-level market data as a PyArrow Table."""
        self._ensure_connected()

        command = {
            "path": ["ticks", symbol],
            "from": from_date.isoformat() if from_date else None,
            "to": to_date.isoformat() if to_date else None,
            "limit": limit,
        }

        return self._do_get(command)

    def get_option_chain(
        self,
        underlying: str,
        date: str,
        min_strike: float | None = None,
        max_strike: float | None = None,
        expirations: list[str] | None = None,
    ) -> pl.DataFrame:
        """
        Get historical option chain as a Polars DataFrame.

        Args:
            underlying: Underlying symbol (e.g., 'AAPL')
            date: Date in YYYY-MM-DD format
            min_strike: Minimum strike price filter
            max_strike: Maximum strike price filter
            expirations: List of expiration dates to include

        Returns:
            Polars DataFrame with option chain data
        """
        table = self.get_option_chain_arrow(underlying, date, min_strike, max_strike, expirations)
        return pl.from_arrow(table)

    def get_option_chain_arrow(
        self,
        underlying: str,
        date: str,
        min_strike: float | None = None,
        max_strike: float | None = None,
        expirations: list[str] | None = None,
    ) -> pa.Table:
        """Get historical option chain as a PyArrow Table."""
        self._ensure_connected()

        command = {
            "path": ["chains", underlying, date],
            "min_strike": min_strike,
            "max_strike": max_strike,
            "expirations": expirations,
        }

        return self._do_get(command)

    def get_portfolio_history(
        self,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        resolution: Literal["minute", "hour", "day"] = "day",
    ) -> pl.DataFrame:
        """
        Get portfolio value history as a Polars DataFrame.

        Args:
            from_date: Start date (inclusive)
            to_date: End date (inclusive)
            resolution: Time resolution ('minute', 'hour', 'day')

        Returns:
            Polars DataFrame with portfolio history
        """
        table = self.get_portfolio_history_arrow(from_date, to_date, resolution)
        return pl.from_arrow(table)

    def get_portfolio_history_arrow(
        self,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        resolution: Literal["minute", "hour", "day"] = "day",
    ) -> pa.Table:
        """Get portfolio value history as a PyArrow Table."""
        self._ensure_connected()

        command = {
            "path": ["portfolio", "history"],
            "from": from_date.isoformat() if from_date else None,
            "to": to_date.isoformat() if to_date else None,
            "resolution": resolution,
        }

        return self._do_get(command)

    def list_flights(self) -> list[list[str]]:
        """
        List available Flight paths.

        Returns:
            List of path components for each available flight
        """
        self._ensure_connected()

        try:
            assert self._client is not None
            flights = list(self._client.list_flights())
            return [list(f.descriptor.path) if f.descriptor.path else [] for f in flights]
        except Exception as e:
            raise FlightError(str(e), "LIST_FLIGHTS_FAILED", retryable=True) from e

    def _do_get(self, command: dict) -> pa.Table:
        """Execute a DoGet request."""
        import json

        import pyarrow.flight as flight

        try:
            assert self._client is not None

            # Encode command as JSON in ticket
            ticket = flight.Ticket(json.dumps(command).encode("utf-8"))
            reader = self._client.do_get(ticket)

            # Collect all batches into a table
            return reader.read_all()
        except Exception as e:
            raise FlightError(str(e), "DO_GET_FAILED", retryable=True) from e

    def _ensure_connected(self) -> None:
        """Ensure the client is connected."""
        if not self._connected or self._client is None:
            raise FlightError(
                "Not connected to Flight server. Call connect() first.",
                "NOT_CONNECTED",
                retryable=False,
            )

    @staticmethod
    def _parse_host(endpoint: str) -> str:
        """Parse host from endpoint string."""
        # Remove protocol prefix
        if "://" in endpoint:
            endpoint = endpoint.split("://", 1)[1]
        # Remove port
        if ":" in endpoint:
            return endpoint.split(":")[0]
        return endpoint

    @staticmethod
    def _parse_port(endpoint: str) -> int:
        """Parse port from endpoint string."""
        # Remove protocol prefix
        if "://" in endpoint:
            endpoint = endpoint.split("://", 1)[1]
        # Extract port
        if ":" in endpoint:
            return int(endpoint.split(":")[1])
        return 50052  # Default Flight port


def create_flight_client(
    endpoint: str = "grpc://localhost:50052",
    auto_connect: bool = True,
) -> ArrowFlightClient:
    """
    Create an Arrow Flight client.

    Args:
        endpoint: Flight server endpoint
        auto_connect: Whether to connect automatically

    Returns:
        ArrowFlightClient instance
    """
    client = ArrowFlightClient(endpoint)
    if auto_connect:
        client.connect()
    return client
