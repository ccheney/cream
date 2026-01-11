"""
VectorBT Runner - High-performance parameter scanning.

Main runner class for executing parameter scans and backtests using vectorbt.
"""

import itertools
import logging
import time
import uuid
from typing import Any

import numpy as np
import pandas as pd
import vectorbt as vbt

from ..findings import (
    ParameterScanConfig,
    PerformanceMetrics,
    ResearchFinding,
    ScanResult,
)
from .helpers import extract_metrics
from .strategies import BUILTIN_STRATEGIES
from .types import StrategyBase, StrategySignals

logger = logging.getLogger(__name__)


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

        for name, cls in BUILTIN_STRATEGIES.items():
            self.strategies[name] = cls()

        if strategies:
            self.strategies.update(strategies)

        self.n_jobs = n_jobs if n_jobs > 0 else None

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

        param_names = list(config.parameter_space.keys())
        param_values = list(config.parameter_space.values())

        if config.search_method == "grid":
            combinations = list(itertools.product(*param_values))
        else:
            combinations = []
            for _ in range(config.random_samples):
                combo = tuple(np.random.choice(vals) for vals in param_values)
                combinations.append(combo)

        total_combinations = len(combinations)
        logger.info(f"Running {total_combinations} parameter combinations for {strategy.name}")

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

        filtered = [(p, m) for p, m in results if m.sharpe >= config.min_sharpe]
        filtered.sort(key=lambda x: x[1].sharpe, reverse=True)
        top_results = filtered[: config.top_k]

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

        if metrics.win_rate > 0.55:
            regimes.append("RANGE")

        if metrics.sharpe > 1.0 and metrics.max_drawdown < 0.15:
            regimes.append("BULL_TREND")

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
