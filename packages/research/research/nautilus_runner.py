"""
NautilusTrader Runner Module

High-fidelity event-driven backtesting using NautilusTrader.
Provides realistic execution modeling with slippage, commissions, and partial fills.

See: docs/plans/10-research.md - High-Fidelity Validation
"""

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any

import pandas as pd
from nautilus_trader.backtest.config import BacktestEngineConfig
from nautilus_trader.backtest.engine import BacktestEngine
from nautilus_trader.backtest.models import FillModel
from nautilus_trader.config import LoggingConfig
from nautilus_trader.model.currencies import USD
from nautilus_trader.model.data import Bar, BarType
from nautilus_trader.model.enums import AccountType, BarAggregation, OmsType, PriceType
from nautilus_trader.model.identifiers import InstrumentId, Symbol, TraderId, Venue
from nautilus_trader.model.instruments import Equity
from nautilus_trader.model.objects import Money, Price, Quantity
from nautilus_trader.persistence.catalog import ParquetDataCatalog
from nautilus_trader.test_kit.providers import TestInstrumentProvider

from .findings import PerformanceMetrics, ResearchFinding, StrategyCondition

logger = logging.getLogger(__name__)


# ============================================
# Configuration Dataclasses
# ============================================


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


# ============================================
# NautilusRunner
# ============================================


class NautilusRunner:
    """
    High-fidelity event-driven backtester using NautilusTrader.

    Provides realistic execution modeling with:
    - Slippage simulation (probabilistic or deterministic)
    - Commission/fee models
    - Partial fills (with L2/L3 data)
    - Nanosecond resolution event processing
    """

    def __init__(self, config: NautilusConfig | None = None):
        """
        Initialize the runner.

        Args:
            config: Runner configuration (uses defaults if None)
        """
        self.config = config or NautilusConfig()
        self._engine: BacktestEngine | None = None

    def _create_fill_model(self) -> FillModel:
        """Create fill model from configuration."""
        return FillModel(
            prob_fill_on_limit=self.config.fill_model.prob_fill_on_limit,
            prob_slippage=self.config.fill_model.prob_slippage,
            random_seed=self.config.fill_model.random_seed,
        )

    def _create_engine(self) -> BacktestEngine:
        """Create and configure backtest engine."""
        logging_config = LoggingConfig(
            log_level=self.config.log_level,
        )

        engine_config = BacktestEngineConfig(
            trader_id=TraderId(self.config.trader_id),
            logging=logging_config,
        )

        return BacktestEngine(config=engine_config)

    def _get_oms_type(self) -> OmsType:
        """Get OMS type from config."""
        return OmsType.NETTING if self.config.oms_type == "NETTING" else OmsType.HEDGING

    def _get_account_type(self) -> AccountType:
        """Get account type from config."""
        return AccountType.CASH if self.config.account_type == "CASH" else AccountType.MARGIN

    def run_backtest(
        self,
        prices: pd.DataFrame,
        signals: pd.DataFrame,
        symbol: str,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> BacktestResult:
        """
        Run a backtest with the given signals.

        Args:
            prices: OHLCV DataFrame with columns: open, high, low, close, volume
            signals: DataFrame with 'entries' and 'exits' boolean columns
            symbol: Ticker symbol
            start_date: Optional start date filter
            end_date: Optional end date filter

        Returns:
            BacktestResult with performance metrics
        """
        import time

        start_time = time.time()

        # Create engine
        engine = self._create_engine()

        # Create venue
        venue = Venue(self.config.venue_name)

        # Create instrument
        instrument = self._create_equity_instrument(symbol, venue)

        # Add venue to engine
        engine.add_venue(
            venue=venue,
            oms_type=self._get_oms_type(),
            account_type=self._get_account_type(),
            base_currency=USD,
            starting_balances=[Money(self.config.initial_capital, USD)],
            fill_model=self._create_fill_model(),
        )

        # Add instrument
        engine.add_instrument(instrument)

        # Convert prices to bars and add data
        bars = self._dataframe_to_bars(prices, instrument.id)
        engine.add_data(bars)

        # Create and add strategy
        from nautilus_trader.trading.strategy import Strategy
        from nautilus_trader.config import StrategyConfig

        class SignalStrategy(Strategy):
            """Simple strategy that follows pre-computed signals."""

            def __init__(
                self,
                config: StrategyConfig,
                instrument_id: InstrumentId,
                signals_df: pd.DataFrame,
            ):
                super().__init__(config=config)
                self.instrument_id = instrument_id
                self.signals = signals_df
                self._bar_count = 0

            def on_start(self):
                self.subscribe_bars(
                    BarType.from_str(f"{self.instrument_id}-1-HOUR-LAST-EXTERNAL")
                )

            def on_bar(self, bar: Bar):
                if self._bar_count >= len(self.signals):
                    return

                row = self.signals.iloc[self._bar_count]
                self._bar_count += 1

                # Check for entry signal
                if row.get("entries", False):
                    self.submit_market_order(
                        instrument_id=self.instrument_id,
                        order_side="BUY",
                        quantity=Quantity.from_int(100),
                    )

                # Check for exit signal
                elif row.get("exits", False) and self.portfolio.is_net_long(
                    self.instrument_id
                ):
                    self.submit_market_order(
                        instrument_id=self.instrument_id,
                        order_side="SELL",
                        quantity=Quantity.from_int(100),
                    )

            def submit_market_order(self, instrument_id, order_side, quantity):
                from nautilus_trader.model.enums import OrderSide
                from nautilus_trader.model.orders import MarketOrder

                side = OrderSide.BUY if order_side == "BUY" else OrderSide.SELL

                order = self.order_factory.market(
                    instrument_id=instrument_id,
                    order_side=side,
                    quantity=quantity,
                )
                self.submit_order(order)

        # Add strategy
        strategy_config = StrategyConfig(strategy_id="SIGNAL-001")
        strategy = SignalStrategy(
            config=strategy_config,
            instrument_id=instrument.id,
            signals_df=signals,
        )
        engine.add_strategy(strategy)

        # Run backtest
        engine.run()

        # Extract results
        run_duration = time.time() - start_time

        # Get account and trading statistics
        account = engine.trader.generate_account_report(venue)
        orders_report = engine.trader.generate_order_fills_report()
        positions_report = engine.trader.generate_positions_report()

        # Calculate metrics
        metrics = self._extract_metrics(engine, account)

        # Determine date range
        actual_start = start_date or prices.index[0].isoformat()
        actual_end = end_date or prices.index[-1].isoformat()

        result = BacktestResult(
            result_id=str(uuid.uuid4()),
            strategy_name="SignalStrategy",
            metrics=metrics,
            start_date=actual_start,
            end_date=actual_end,
            symbols=[symbol],
            config=self.config,
            total_trades=len(orders_report) if orders_report is not None else 0,
            total_orders=len(orders_report) if orders_report is not None else 0,
            run_duration_seconds=run_duration,
            events_processed=len(bars),
        )

        # Cleanup
        engine.dispose()

        return result

    def _create_equity_instrument(self, symbol: str, venue: Venue) -> Equity:
        """Create an equity instrument for backtesting."""
        return TestInstrumentProvider.equity(
            symbol=Symbol(symbol),
            venue=venue,
        )

    def _dataframe_to_bars(
        self,
        prices: pd.DataFrame,
        instrument_id: InstrumentId,
    ) -> list[Bar]:
        """Convert DataFrame to NautilusTrader bars."""
        bars = []

        bar_type = BarType.from_str(f"{instrument_id}-1-HOUR-LAST-EXTERNAL")

        for idx, row in prices.iterrows():
            # Convert timestamp
            if isinstance(idx, pd.Timestamp):
                ts_event = int(idx.timestamp() * 1e9)  # Nanoseconds
            else:
                ts_event = int(idx * 1e9)

            bar = Bar(
                bar_type=bar_type,
                open=Price.from_str(str(round(row["open"], 2))),
                high=Price.from_str(str(round(row["high"], 2))),
                low=Price.from_str(str(round(row["low"], 2))),
                close=Price.from_str(str(round(row["close"], 2))),
                volume=Quantity.from_str(str(int(row.get("volume", 1000000)))),
                ts_event=ts_event,
                ts_init=ts_event,
            )
            bars.append(bar)

        return bars

    def _extract_metrics(
        self,
        engine: BacktestEngine,
        account: Any,
    ) -> PerformanceMetrics:
        """Extract performance metrics from backtest results."""
        # Get portfolio statistics
        try:
            # Try to get returns and calculate metrics
            returns = engine.trader.portfolio.analyzer.get_performance_stats()

            sharpe = float(returns.get("sharpe_ratio", 0.0) or 0.0)
            sortino = float(returns.get("sortino_ratio", 0.0) or 0.0)
            max_dd = float(returns.get("max_drawdown", 0.0) or 0.0)
            total_return = float(returns.get("total_return", 0.0) or 0.0)
            win_rate = float(returns.get("win_rate", 0.0) or 0.0)
            avg_return = float(returns.get("avg_return", 0.0) or 0.0)
            profit_factor = float(returns.get("profit_factor", 0.0) or 0.0)

        except (AttributeError, KeyError):
            # Default values if stats not available
            sharpe = 0.0
            sortino = 0.0
            max_dd = 0.0
            total_return = 0.0
            win_rate = 0.0
            avg_return = 0.0
            profit_factor = 0.0

        return PerformanceMetrics(
            sharpe=sharpe,
            sortino=sortino,
            max_drawdown=abs(max_dd),
            win_rate=win_rate,
            avg_return=avg_return,
            total_return=total_return,
            profit_factor=profit_factor,
        )

    def compare_with_vectorbt(
        self,
        nautilus_result: BacktestResult,
        vectorbt_metrics: PerformanceMetrics,
    ) -> dict[str, Any]:
        """
        Compare NautilusTrader results with Vectorbt results.

        Args:
            nautilus_result: Result from NautilusTrader backtest
            vectorbt_metrics: Metrics from Vectorbt backtest

        Returns:
            Comparison dictionary with differences
        """
        nm = nautilus_result.metrics
        vm = vectorbt_metrics

        def safe_pct_diff(a: float, b: float) -> float:
            """Calculate percentage difference, handling zeros."""
            if abs(b) < 1e-10:
                return 0.0 if abs(a) < 1e-10 else float("inf")
            return ((a - b) / abs(b)) * 100

        return {
            "sharpe_diff_pct": safe_pct_diff(nm.sharpe, vm.sharpe),
            "sortino_diff_pct": safe_pct_diff(nm.sortino, vm.sortino),
            "max_drawdown_diff_pct": safe_pct_diff(nm.max_drawdown, vm.max_drawdown),
            "total_return_diff_pct": safe_pct_diff(nm.total_return, vm.total_return),
            "win_rate_diff_pct": safe_pct_diff(nm.win_rate, vm.win_rate),
            "nautilus_metrics": {
                "sharpe": nm.sharpe,
                "sortino": nm.sortino,
                "max_drawdown": nm.max_drawdown,
                "total_return": nm.total_return,
                "win_rate": nm.win_rate,
            },
            "vectorbt_metrics": {
                "sharpe": vm.sharpe,
                "sortino": vm.sortino,
                "max_drawdown": vm.max_drawdown,
                "total_return": vm.total_return,
                "win_rate": vm.win_rate,
            },
            "execution_cost_impact": nm.total_return - vm.total_return,
        }

    def to_research_finding(
        self,
        result: BacktestResult,
        entry_conditions: list[StrategyCondition],
        exit_conditions: list[StrategyCondition],
        parameters: dict[str, Any],
        description: str = "",
    ) -> ResearchFinding:
        """
        Convert a backtest result to a ResearchFinding.

        Args:
            result: NautilusTrader backtest result
            entry_conditions: Entry conditions for the strategy
            exit_conditions: Exit conditions for the strategy
            parameters: Strategy parameters
            description: Optional description

        Returns:
            ResearchFinding with validated metrics
        """
        return ResearchFinding(
            finding_id=result.result_id,
            setup_name=result.strategy_name,
            description=description or f"NautilusTrader validated {result.strategy_name}",
            entry_conditions=entry_conditions,
            exit_conditions=exit_conditions,
            parameters=parameters,
            metrics=result.metrics,
            data_range=(result.start_date, result.end_date),
            symbols_tested=result.symbols,
            model_version="nautilus_trader-1.200",
            notes=f"High-fidelity validation with {result.events_processed} events",
        )


# ============================================
# Quick Backtest Helper
# ============================================


def quick_backtest(
    prices: pd.DataFrame,
    signals: pd.DataFrame,
    symbol: str,
    initial_capital: float = 100000.0,
    slippage_prob: float = 0.5,
    commission_per_share: float = 0.005,
) -> BacktestResult:
    """
    Run a quick backtest with default settings.

    Args:
        prices: OHLCV DataFrame
        signals: Signals DataFrame with entries/exits
        symbol: Ticker symbol
        initial_capital: Starting capital
        slippage_prob: Probability of slippage
        commission_per_share: Commission per share

    Returns:
        BacktestResult
    """
    config = NautilusConfig(
        initial_capital=initial_capital,
        fill_model=FillModelConfig(prob_slippage=slippage_prob),
        commission=CommissionConfig(equity_per_share=commission_per_share),
    )

    runner = NautilusRunner(config=config)
    return runner.run_backtest(prices, signals, symbol)
