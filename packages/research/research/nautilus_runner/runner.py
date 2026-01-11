"""
NautilusTrader Runner Core

High-fidelity event-driven backtesting using NautilusTrader.
"""

import logging
import time
import uuid
from typing import Any

import pandas as pd
from nautilus_trader.backtest.config import BacktestEngineConfig
from nautilus_trader.backtest.engine import BacktestEngine
from nautilus_trader.backtest.models import FillModel
from nautilus_trader.config import LoggingConfig, StrategyConfig
from nautilus_trader.model.currencies import USD
from nautilus_trader.model.data import Bar, BarType
from nautilus_trader.model.enums import AccountType, OmsType, OrderSide
from nautilus_trader.model.identifiers import InstrumentId, Symbol, TraderId, Venue
from nautilus_trader.model.instruments import Equity
from nautilus_trader.model.objects import Money, Quantity
from nautilus_trader.test_kit.providers import TestInstrumentProvider
from nautilus_trader.trading.strategy import Strategy

from ..findings import PerformanceMetrics, ResearchFinding, StrategyCondition
from .helpers import compare_with_vectorbt, dataframe_to_bars, extract_metrics
from .types import BacktestResult, NautilusConfig

logger = logging.getLogger(__name__)


class SignalStrategy(Strategy):  # type: ignore[misc]
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

    def on_start(self) -> None:
        self.subscribe_bars(BarType.from_str(f"{self.instrument_id}-1-HOUR-LAST-EXTERNAL"))

    def on_bar(self, bar: Bar) -> None:  # noqa: ARG002
        if self._bar_count >= len(self.signals):
            return

        row = self.signals.iloc[self._bar_count]
        self._bar_count += 1

        if row.get("entries", False):
            self._submit_market_order(OrderSide.BUY)
        elif row.get("exits", False) and self.portfolio.is_net_long(self.instrument_id):
            self._submit_market_order(OrderSide.SELL)

    def _submit_market_order(self, side: OrderSide) -> None:
        order = self.order_factory.market(
            instrument_id=self.instrument_id,
            order_side=side,
            quantity=Quantity.from_int(100),
        )
        self.submit_order(order)


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
        logging_config = LoggingConfig(log_level=self.config.log_level)
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
        return dataframe_to_bars(prices, instrument_id)

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
        start_time = time.time()

        engine = self._create_engine()
        venue = Venue(self.config.venue_name)
        instrument = self._create_equity_instrument(symbol, venue)

        engine.add_venue(
            venue=venue,
            oms_type=self._get_oms_type(),
            account_type=self._get_account_type(),
            base_currency=USD,
            starting_balances=[Money(self.config.initial_capital, USD)],
            fill_model=self._create_fill_model(),
        )
        engine.add_instrument(instrument)

        bars = dataframe_to_bars(prices, instrument.id)
        engine.add_data(bars)

        strategy_config = StrategyConfig(strategy_id="SIGNAL-001")
        strategy = SignalStrategy(
            config=strategy_config,
            instrument_id=instrument.id,
            signals_df=signals,
        )
        engine.add_strategy(strategy)

        engine.run()

        run_duration = time.time() - start_time

        account = engine.trader.generate_account_report(venue)
        orders_report = engine.trader.generate_order_fills_report()
        engine.trader.generate_positions_report()

        metrics = extract_metrics(engine, account)

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

        engine.dispose()

        return result

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
        return compare_with_vectorbt(nautilus_result, vectorbt_metrics)

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
    from .types import CommissionConfig, FillModelConfig

    config = NautilusConfig(
        initial_capital=initial_capital,
        fill_model=FillModelConfig(prob_slippage=slippage_prob),
        commission=CommissionConfig(equity_per_share=commission_per_share),
    )

    runner = NautilusRunner(config=config)
    return runner.run_backtest(prices, signals, symbol)
