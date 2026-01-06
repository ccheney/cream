"""
Vectorbt Runner Module

High-performance parameter scanning and backtesting using vectorbt.
Leverages Numba JIT compilation for speed.

See: docs/plans/10-research.md - Rapid Hypothesis Generation
"""

import itertools
import logging
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
import vectorbt as vbt
from numpy.typing import NDArray

from .findings import (
    ParameterScanConfig,
    PerformanceMetrics,
    ResearchFinding,
    ScanResult,
    StrategyCondition,
)

logger = logging.getLogger(__name__)


# ============================================
# Strategy Interface
# ============================================


@dataclass
class StrategySignals:
    """Entry and exit signals from a strategy."""

    entries: pd.Series
    """Boolean series for entry signals."""

    exits: pd.Series
    """Boolean series for exit signals."""

    parameters: dict[str, Any]
    """Parameters used to generate signals."""


class StrategyBase(ABC):
    """Base class for strategy implementations."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Strategy name."""
        ...

    @property
    @abstractmethod
    def parameter_space(self) -> dict[str, list[Any]]:
        """Default parameter space for scanning."""
        ...

    @abstractmethod
    def generate_signals(
        self,
        prices: pd.DataFrame,
        parameters: dict[str, Any],
    ) -> StrategySignals:
        """Generate entry and exit signals."""
        ...

    def get_entry_conditions(self, parameters: dict[str, Any]) -> list[StrategyCondition]:
        """Get entry conditions for given parameters."""
        return []

    def get_exit_conditions(self, parameters: dict[str, Any]) -> list[StrategyCondition]:
        """Get exit conditions for given parameters."""
        return []


# ============================================
# Built-in Strategies
# ============================================


class RSIMeanReversionStrategy(StrategyBase):
    """RSI mean reversion strategy."""

    @property
    def name(self) -> str:
        return "RSI_Mean_Reversion"

    @property
    def parameter_space(self) -> dict[str, list[Any]]:
        return {
            "rsi_period": [7, 14, 21],
            "entry_threshold": [20, 25, 30],
            "exit_threshold": [70, 75, 80],
        }

    def generate_signals(
        self,
        prices: pd.DataFrame,
        parameters: dict[str, Any],
    ) -> StrategySignals:
        close = prices["close"]
        rsi_period = parameters.get("rsi_period", 14)
        entry_threshold = parameters.get("entry_threshold", 30)
        exit_threshold = parameters.get("exit_threshold", 70)

        # Calculate RSI using vectorbt
        rsi = vbt.RSI.run(close, window=rsi_period).rsi

        # Generate signals
        entries = rsi < entry_threshold
        exits = rsi > exit_threshold

        return StrategySignals(entries=entries, exits=exits, parameters=parameters)

    def get_entry_conditions(self, parameters: dict[str, Any]) -> list[StrategyCondition]:
        return [
            StrategyCondition(
                indicator=f"rsi_{parameters.get('rsi_period', 14)}",
                operator="<",
                value=parameters.get("entry_threshold", 30),
                description=f"RSI below {parameters.get('entry_threshold', 30)} (oversold)",
            )
        ]

    def get_exit_conditions(self, parameters: dict[str, Any]) -> list[StrategyCondition]:
        return [
            StrategyCondition(
                indicator=f"rsi_{parameters.get('rsi_period', 14)}",
                operator=">",
                value=parameters.get("exit_threshold", 70),
                description=f"RSI above {parameters.get('exit_threshold', 70)} (overbought)",
            )
        ]


class SMACrossoverStrategy(StrategyBase):
    """Simple Moving Average crossover strategy."""

    @property
    def name(self) -> str:
        return "SMA_Crossover"

    @property
    def parameter_space(self) -> dict[str, list[Any]]:
        return {
            "fast_period": [5, 10, 20],
            "slow_period": [20, 50, 100],
        }

    def generate_signals(
        self,
        prices: pd.DataFrame,
        parameters: dict[str, Any],
    ) -> StrategySignals:
        close = prices["close"]
        fast_period = parameters.get("fast_period", 10)
        slow_period = parameters.get("slow_period", 50)

        # Calculate SMAs using vectorbt
        fast_sma = vbt.MA.run(close, window=fast_period).ma
        slow_sma = vbt.MA.run(close, window=slow_period).ma

        # Generate signals (crossover)
        entries = fast_sma > slow_sma
        exits = fast_sma < slow_sma

        # Convert to actual crossover signals (not continuous)
        entries_shifted = entries.shift(1).fillna(False).infer_objects(copy=False)
        exits_shifted = exits.shift(1).fillna(False).infer_objects(copy=False)
        entries = entries & (~entries_shifted)
        exits = exits & (~exits_shifted)

        return StrategySignals(entries=entries, exits=exits, parameters=parameters)

    def get_entry_conditions(self, parameters: dict[str, Any]) -> list[StrategyCondition]:
        fast = parameters.get("fast_period", 10)
        slow = parameters.get("slow_period", 50)
        return [
            StrategyCondition(
                indicator=f"sma_{fast}",
                operator="crosses_above",
                value=f"sma_{slow}",
                description=f"Fast SMA({fast}) crosses above Slow SMA({slow})",
            )
        ]

    def get_exit_conditions(self, parameters: dict[str, Any]) -> list[StrategyCondition]:
        fast = parameters.get("fast_period", 10)
        slow = parameters.get("slow_period", 50)
        return [
            StrategyCondition(
                indicator=f"sma_{fast}",
                operator="crosses_below",
                value=f"sma_{slow}",
                description=f"Fast SMA({fast}) crosses below Slow SMA({slow})",
            )
        ]


class BollingerBandStrategy(StrategyBase):
    """Bollinger Band mean reversion strategy."""

    @property
    def name(self) -> str:
        return "Bollinger_Band_Reversion"

    @property
    def parameter_space(self) -> dict[str, list[Any]]:
        return {
            "bb_period": [10, 20, 30],
            "bb_std": [1.5, 2.0, 2.5],
        }

    def generate_signals(
        self,
        prices: pd.DataFrame,
        parameters: dict[str, Any],
    ) -> StrategySignals:
        close = prices["close"]
        bb_period = parameters.get("bb_period", 20)
        bb_std = parameters.get("bb_std", 2.0)

        # Calculate Bollinger Bands using vectorbt
        bb = vbt.BBANDS.run(close, window=bb_period, alpha=bb_std)

        # Generate signals (mean reversion)
        entries = close < bb.lower
        exits = close > bb.upper

        return StrategySignals(entries=entries, exits=exits, parameters=parameters)

    def get_entry_conditions(self, parameters: dict[str, Any]) -> list[StrategyCondition]:
        period = parameters.get("bb_period", 20)
        std = parameters.get("bb_std", 2.0)
        return [
            StrategyCondition(
                indicator="close",
                operator="<",
                value=f"bb_lower_{period}_{std}",
                description=f"Price below lower Bollinger Band({period}, {std})",
            )
        ]

    def get_exit_conditions(self, parameters: dict[str, Any]) -> list[StrategyCondition]:
        period = parameters.get("bb_period", 20)
        std = parameters.get("bb_std", 2.0)
        return [
            StrategyCondition(
                indicator="close",
                operator=">",
                value=f"bb_upper_{period}_{std}",
                description=f"Price above upper Bollinger Band({period}, {std})",
            )
        ]


# Strategy registry
BUILTIN_STRATEGIES: dict[str, type[StrategyBase]] = {
    "RSI_Mean_Reversion": RSIMeanReversionStrategy,
    "SMA_Crossover": SMACrossoverStrategy,
    "Bollinger_Band_Reversion": BollingerBandStrategy,
}


# ============================================
# Metrics Extraction
# ============================================


def extract_metrics(portfolio: vbt.Portfolio) -> PerformanceMetrics:
    """Extract performance metrics from a vectorbt portfolio."""
    stats = portfolio.stats()

    # Handle potential NaN values
    def safe_get(key: str, default: float = 0.0) -> float:
        val = stats.get(key, default)
        return float(val) if pd.notna(val) else default

    # Extract trades info
    trades = portfolio.trades.records_readable if len(portfolio.trades.records) > 0 else None
    num_trades = int(safe_get("Total Trades", 0))

    win_rate = 0.0
    avg_return = 0.0
    avg_win = 0.0
    avg_loss = 0.0
    max_cons_wins = 0
    max_cons_losses = 0

    if trades is not None and len(trades) > 0:
        # Calculate win rate
        returns = trades["Return"].values
        wins = returns > 0
        win_rate = float(np.sum(wins)) / len(returns) if len(returns) > 0 else 0.0
        avg_return = float(np.mean(returns)) if len(returns) > 0 else 0.0

        # Calculate avg win and avg loss
        winning_returns = returns[wins]
        losing_returns = returns[~wins]
        avg_win = float(np.mean(winning_returns)) if len(winning_returns) > 0 else 0.0
        avg_loss = float(np.mean(losing_returns)) if len(losing_returns) > 0 else 0.0

        # Max consecutive wins/losses
        max_cons_wins, max_cons_losses = _calculate_consecutive(wins)

    # Calculate profit factor
    profit_factor = 0.0
    if avg_loss != 0:
        gross_profit = avg_win * (win_rate * num_trades)
        gross_loss = abs(avg_loss) * ((1 - win_rate) * num_trades)
        if gross_loss > 0:
            profit_factor = gross_profit / gross_loss

    # Sharpe and Sortino
    sharpe = safe_get("Sharpe Ratio", 0.0)
    sortino = safe_get("Sortino Ratio", 0.0)

    # Drawdown
    max_dd = safe_get("Max Drawdown [%]", 0.0) / 100.0

    # Total return
    total_return = safe_get("Total Return [%]", 0.0) / 100.0

    # Calmar ratio
    calmar = 0.0
    annual_return = safe_get("Annualized Return [%]", 0.0) / 100.0
    if max_dd > 0:
        calmar = annual_return / max_dd

    return PerformanceMetrics(
        sharpe=sharpe,
        sortino=sortino,
        max_drawdown=max_dd,
        win_rate=win_rate,
        avg_return=avg_return,
        total_return=total_return,
        num_trades=num_trades,
        profit_factor=profit_factor,
        avg_win=avg_win,
        avg_loss=avg_loss,
        max_consecutive_wins=max_cons_wins,
        max_consecutive_losses=max_cons_losses,
        calmar_ratio=calmar,
    )


def _calculate_consecutive(wins: NDArray[np.bool_]) -> tuple[int, int]:
    """Calculate max consecutive wins and losses."""
    if len(wins) == 0:
        return 0, 0

    max_wins = 0
    max_losses = 0
    current_wins = 0
    current_losses = 0

    for win in wins:
        if win:
            current_wins += 1
            current_losses = 0
            max_wins = max(max_wins, current_wins)
        else:
            current_losses += 1
            current_wins = 0
            max_losses = max(max_losses, current_losses)

    return max_wins, max_losses


# ============================================
# VectorbtRunner
# ============================================


class VectorbtRunner:
    """
    High-performance parameter scanner using vectorbt.

    Leverages Numba JIT compilation and vectorized operations
    for rapid backtesting across large parameter spaces.
    """

    def __init__(
        self,
        strategies: dict[str, StrategyBase] | None = None,
        n_jobs: int = -1,
    ):
        """
        Initialize the runner.

        Args:
            strategies: Custom strategies (default: built-in strategies)
            n_jobs: Number of parallel jobs (-1 for all CPUs)
        """
        self.strategies: dict[str, StrategyBase] = {}

        # Register built-in strategies
        for name, cls in BUILTIN_STRATEGIES.items():
            self.strategies[name] = cls()

        # Register custom strategies
        if strategies:
            self.strategies.update(strategies)

        self.n_jobs = n_jobs if n_jobs > 0 else None  # None = use all CPUs

    def get_strategy(self, name: str) -> StrategyBase:
        """Get a strategy by name."""
        if name not in self.strategies:
            raise ValueError(f"Unknown strategy: {name}. Available: {list(self.strategies.keys())}")
        return self.strategies[name]

    def register_strategy(self, strategy: StrategyBase) -> None:
        """Register a custom strategy."""
        self.strategies[strategy.name] = strategy

    def run_parameter_scan(
        self,
        prices: pd.DataFrame,
        config: ParameterScanConfig,
    ) -> ScanResult:
        """
        Run a parameter scan for the specified strategy.

        Args:
            prices: OHLCV DataFrame with columns: open, high, low, close, volume
            config: Scan configuration

        Returns:
            ScanResult with top findings
        """
        start_time = time.time()

        strategy = self.get_strategy(config.strategy_name)

        # Generate parameter combinations
        param_names = list(config.parameter_space.keys())
        param_values = list(config.parameter_space.values())

        if config.search_method == "grid":
            combinations = list(itertools.product(*param_values))
        else:
            # Random search
            combinations = []
            for _ in range(config.random_samples):
                combo = tuple(np.random.choice(vals) for vals in param_values)
                combinations.append(combo)

        total_combinations = len(combinations)
        logger.info(f"Running {total_combinations} parameter combinations for {strategy.name}")

        # Run backtests
        results: list[tuple[dict[str, Any], PerformanceMetrics]] = []

        for combo in combinations:
            params = dict(zip(param_names, combo, strict=False))

            try:
                signals = strategy.generate_signals(prices, params)
                metrics = self._run_single_backtest(prices, signals, config)

                if metrics.num_trades >= config.min_trades:
                    results.append((params, metrics))
            except Exception as e:
                logger.warning(f"Backtest failed for params {params}: {e}")
                continue

        valid_combinations = len(results)
        logger.info(f"Valid combinations: {valid_combinations}/{total_combinations}")

        # Filter and sort by Sharpe ratio
        filtered = [(p, m) for p, m in results if m.sharpe >= config.min_sharpe]
        filtered.sort(key=lambda x: x[1].sharpe, reverse=True)
        top_results = filtered[: config.top_k]

        # Convert to ResearchFinding objects
        findings: list[ResearchFinding] = []
        for params, metrics in top_results:
            finding = ResearchFinding(
                finding_id=str(uuid.uuid4()),
                setup_name=f"{strategy.name}_{self._params_to_suffix(params)}",
                description=f"{strategy.name} strategy with optimized parameters",
                entry_conditions=strategy.get_entry_conditions(params),
                exit_conditions=strategy.get_exit_conditions(params),
                parameters=params,
                metrics=metrics,
                regime_compatibility=self._infer_regimes(metrics),
                failure_modes=self._infer_failure_modes(metrics),
                data_range=(config.start_date, config.end_date),
                symbols_tested=config.symbols,
            )
            findings.append(finding)

        scan_duration = time.time() - start_time

        return ScanResult(
            config=config,
            findings=findings,
            total_combinations=total_combinations,
            valid_combinations=valid_combinations,
            scan_duration_seconds=scan_duration,
        )

    def _run_single_backtest(
        self,
        prices: pd.DataFrame,
        signals: StrategySignals,
        config: ParameterScanConfig,
    ) -> PerformanceMetrics:
        """Run a single backtest and extract metrics."""
        portfolio = vbt.Portfolio.from_signals(
            close=prices["close"],
            entries=signals.entries,
            exits=signals.exits,
            init_cash=config.initial_capital,
            size=config.position_size_pct,
            size_type="percent",
            fees=config.commission_pct,
            slippage=config.slippage_pct,
            freq=config.timeframe,
        )

        return extract_metrics(portfolio)

    def _params_to_suffix(self, params: dict[str, Any]) -> str:
        """Convert parameters to a string suffix."""
        parts = [f"{k}_{v}" for k, v in sorted(params.items())]
        return "_".join(parts)

    def _infer_regimes(self, metrics: PerformanceMetrics) -> list[str]:
        """Infer compatible regimes based on metrics."""
        regimes = []

        # Mean reversion works in ranging markets
        if metrics.win_rate > 0.55:
            regimes.append("RANGE")

        # High Sharpe with moderate drawdown suggests trending
        if metrics.sharpe > 1.0 and metrics.max_drawdown < 0.15:
            regimes.append("BULL_TREND")

        # Strategies that survive drawdowns might work in bear markets
        if metrics.max_drawdown < 0.20 and metrics.sortino > 0.5:
            regimes.append("BEAR_TREND")

        return regimes if regimes else ["UNKNOWN"]

    def _infer_failure_modes(self, metrics: PerformanceMetrics) -> list[str]:
        """Infer failure modes based on metrics."""
        failures = []

        if metrics.max_drawdown > 0.25:
            failures.append("large_drawdowns")

        if metrics.max_consecutive_losses > 5:
            failures.append("losing_streaks")

        if metrics.win_rate < 0.40:
            failures.append("low_win_rate")

        if metrics.profit_factor < 1.0:
            failures.append("negative_expectancy")

        return failures

    def quick_scan(
        self,
        prices: pd.DataFrame,
        strategy_name: str,
        symbols: list[str],
        start_date: str,
        end_date: str,
    ) -> ScanResult:
        """
        Run a quick scan with default parameters.

        Convenience method for rapid exploration.
        """
        strategy = self.get_strategy(strategy_name)

        config = ParameterScanConfig(
            strategy_name=strategy_name,
            parameter_space=strategy.parameter_space,
            symbols=symbols,
            start_date=start_date,
            end_date=end_date,
        )

        return self.run_parameter_scan(prices, config)


# ============================================
# Utility Functions
# ============================================


def create_price_dataframe(
    close: pd.Series,
    open_: pd.Series | None = None,
    high: pd.Series | None = None,
    low: pd.Series | None = None,
    volume: pd.Series | None = None,
) -> pd.DataFrame:
    """
    Create a price DataFrame from individual series.

    If only close is provided, generates synthetic OHLV data.
    """
    df = pd.DataFrame({"close": close})

    if open_ is not None:
        df["open"] = open_
    else:
        df["open"] = close.shift(1).fillna(close.iloc[0])

    if high is not None:
        df["high"] = high
    else:
        df["high"] = df[["open", "close"]].max(axis=1) * 1.001

    if low is not None:
        df["low"] = low
    else:
        df["low"] = df[["open", "close"]].min(axis=1) * 0.999

    if volume is not None:
        df["volume"] = volume
    else:
        df["volume"] = 1000000  # Default volume

    return df[["open", "high", "low", "close", "volume"]]
