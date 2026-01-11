"""
NautilusTrader Runner Types

Configuration and result dataclasses for the NautilusTrader backtest runner.
"""

from dataclasses import dataclass, field
from typing import Any

from ..findings import PerformanceMetrics


@dataclass
class FillModelConfig:
    """Configuration for fill model (slippage simulation)."""

    prob_fill_on_limit: float = 0.2
    """Probability of limit order filling when price matches."""

    prob_slippage: float = 0.5
    """Probability of 1-tick slippage."""

    random_seed: int | None = 42
    """Random seed for reproducibility."""


@dataclass
class CommissionConfig:
    """Configuration for commission/fee model."""

    equity_per_share: float = 0.005
    """Commission per share for equities."""

    option_per_contract: float = 0.65
    """Commission per contract for options."""

    minimum: float = 1.0
    """Minimum commission per order."""


@dataclass
class NautilusConfig:
    """Configuration for NautilusRunner."""

    trader_id: str = "BACKTEST-001"
    """Trader identifier."""

    venue_name: str = "SIM"
    """Venue name for simulation."""

    base_currency: str = "USD"
    """Base currency for the account."""

    initial_capital: float = 100000.0
    """Starting capital."""

    oms_type: str = "NETTING"
    """Order management system type (NETTING or HEDGING)."""

    account_type: str = "CASH"
    """Account type (CASH or MARGIN)."""

    fill_model: FillModelConfig = field(default_factory=FillModelConfig)
    """Fill model configuration."""

    commission: CommissionConfig = field(default_factory=CommissionConfig)
    """Commission configuration."""

    log_level: str = "WARNING"
    """Logging level (DEBUG, INFO, WARNING, ERROR)."""


@dataclass
class BacktestResult:
    """Result of a NautilusTrader backtest."""

    result_id: str
    """Unique identifier for this result."""

    strategy_name: str
    """Name of the strategy tested."""

    metrics: PerformanceMetrics
    """Performance metrics."""

    start_date: str
    """Start date of backtest (ISO-8601)."""

    end_date: str
    """End date of backtest (ISO-8601)."""

    symbols: list[str]
    """Symbols tested."""

    config: NautilusConfig
    """Configuration used."""

    total_trades: int
    """Total number of trades."""

    total_orders: int
    """Total number of orders."""

    run_duration_seconds: float
    """Time taken to run backtest."""

    events_processed: int
    """Total events processed."""

    orders: list[dict[str, Any]] = field(default_factory=list)
    """Order history (optional)."""

    fills: list[dict[str, Any]] = field(default_factory=list)
    """Fill history (optional)."""


@dataclass
class MultiAssetBacktestResult:
    """Result of a multi-asset NautilusTrader backtest."""

    result_id: str
    """Unique identifier for this result."""

    strategy_name: str
    """Name of the strategy tested."""

    metrics: PerformanceMetrics
    """Combined performance metrics."""

    start_date: str
    """Start date of backtest (ISO-8601)."""

    end_date: str
    """End date of backtest (ISO-8601)."""

    symbols: list[str]
    """Symbols tested."""

    config: NautilusConfig
    """Configuration used."""

    per_symbol_results: dict[str, BacktestResult]
    """Individual results per symbol."""

    total_trades: int
    """Total number of trades across all symbols."""

    run_duration_seconds: float
    """Time taken to run backtest."""


@dataclass
class WalkForwardWindow:
    """A single window in walk-forward optimization."""

    train_start: str
    train_end: str
    test_start: str
    test_end: str
    in_sample_result: BacktestResult | None = None
    out_of_sample_result: BacktestResult | None = None
    optimized_params: dict[str, Any] = field(default_factory=dict)


@dataclass
class WalkForwardResult:
    """Result of walk-forward optimization."""

    result_id: str
    strategy_name: str
    windows: list[WalkForwardWindow]
    combined_oos_metrics: PerformanceMetrics
    """Combined out-of-sample metrics (the "true" performance)."""
    combined_is_metrics: PerformanceMetrics
    """Combined in-sample metrics (for comparison)."""
    overfitting_ratio: float
    """Ratio of OOS to IS performance. < 1.0 indicates overfitting."""
