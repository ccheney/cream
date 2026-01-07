"""
Stage 1: VectorBT Fast Scan Validation

Vectorized backtesting validation using VectorBT for fast parameter scanning
and initial performance gates. This is the first validation stage that filters
candidates before expensive event-driven testing.

See: docs/plans/20-research-to-production-pipeline.md - Phase 3

Gate Thresholds:
| Metric | Threshold | Purpose |
|--------|-----------|---------|
| Sharpe Ratio | > 1.0 | Risk-adjusted returns |
| Sortino Ratio | > 1.2 | Downside risk |
| Win Rate | > 45% | Trade success rate |
| Max Drawdown | < 25% | Capital preservation |
| IC (Information Coefficient) | > 0.03 | Predictive power |
| ICIR | > 0.5 | IC consistency |
"""

from __future__ import annotations

import itertools
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import numpy as np
import polars as pl
import vectorbt as vbt
from scipy import stats

if TYPE_CHECKING:
    from ..strategies.base import ResearchFactor

logger = logging.getLogger(__name__)


@dataclass
class Stage1Results:
    """Results from VectorBT Stage 1 validation."""

    factor_id: str
    """Unique identifier for the factor."""

    best_params: dict[str, Any]
    """Best performing parameter combination."""

    parameter_sensitivity: dict[str, float]
    """Sensitivity scores per parameter (lower = more stable)."""

    # Performance metrics
    sharpe: float
    """Sharpe ratio (annualized)."""

    sortino: float
    """Sortino ratio (downside deviation)."""

    calmar: float
    """Calmar ratio (return / max drawdown)."""

    max_drawdown: float
    """Maximum drawdown as decimal (0.25 = 25%)."""

    win_rate: float
    """Win rate as decimal (0.55 = 55%)."""

    profit_factor: float
    """Gross profits / gross losses."""

    # Information metrics
    ic_mean: float
    """Mean Information Coefficient (Pearson correlation with forward returns)."""

    icir: float
    """IC Information Ratio (IC mean / IC std)."""

    rank_ic: float
    """Rank IC (Spearman correlation with forward returns)."""

    # Gate results
    passed_gates: bool
    """Whether all gates passed."""

    gate_violations: list[str] = field(default_factory=list)
    """List of gate violation descriptions."""

    # Metadata
    num_combinations_tested: int = 0
    """Total parameter combinations evaluated."""

    scan_duration_seconds: float = 0.0
    """Time taken for validation."""


@dataclass
class Stage1Gates:
    """
    Gate thresholds for Stage 1 validation.

    Factors must pass all gates to proceed to Stage 2.
    """

    sharpe_min: float = 1.0
    """Minimum Sharpe ratio."""

    sortino_min: float = 1.2
    """Minimum Sortino ratio."""

    win_rate_min: float = 0.45
    """Minimum win rate (45%)."""

    max_drawdown_max: float = 0.25
    """Maximum allowed drawdown (25%)."""

    ic_min: float = 0.03
    """Minimum IC."""

    icir_min: float = 0.5
    """Minimum ICIR."""


class Stage1Validator:
    """
    VectorBT-based fast validation with parameter sensitivity.

    Performs:
    1. Vectorized parameter scan across all combinations
    2. IC/ICIR/Rank IC calculation for predictive power
    3. Monte Carlo parameter jitter for sensitivity testing
    4. Gate checking against threshold requirements
    """

    def __init__(
        self,
        factor: ResearchFactor,
        data: pl.DataFrame,
        gates: Stage1Gates | None = None,
    ) -> None:
        """
        Initialize the Stage 1 validator.

        Args:
            factor: Research factor to validate
            data: Polars DataFrame with OHLCV columns
            gates: Gate thresholds (uses defaults if None)
        """
        self.factor = factor
        self.data = data
        self.gates = gates or Stage1Gates()
        self._pd_data = self._to_pandas(data)

    def _to_pandas(self, data: pl.DataFrame) -> Any:
        """Convert Polars DataFrame to pandas for VectorBT compatibility."""
        import pandas as pd

        return pd.DataFrame({col: data[col].to_list() for col in data.columns})

    async def run_parameter_scan(
        self,
        param_grid: dict[str, list[Any]],
    ) -> list[dict[str, Any]]:
        """
        Run vectorized parameter scan across all combinations.

        Args:
            param_grid: Parameter names mapped to lists of values to test

        Returns:
            List of results for each combination
        """
        results: list[dict[str, Any]] = []
        combinations = list(itertools.product(*param_grid.values()))
        param_names = list(param_grid.keys())

        for combo in combinations:
            params = dict(zip(param_names, combo, strict=False))
            self.factor.set_parameters(params)

            try:
                signals = self.factor.compute_signal(self.data)
                metrics = self._run_backtest(signals)
                results.append(
                    {
                        "params": params,
                        **metrics,
                    }
                )
            except Exception as e:
                logger.warning(f"Parameter scan failed for {params}: {e}")
                continue

        return results

    def _run_backtest(self, signals: pl.Series) -> dict[str, float]:
        """Run a single backtest and extract metrics."""
        # Convert signals to numpy
        signals_np = signals.to_numpy()

        # Generate entry/exit signals
        entries = signals_np > 0
        exits = signals_np < 0

        # Run VectorBT backtest
        pf = vbt.Portfolio.from_signals(
            close=self._pd_data["close"],
            entries=entries,
            exits=exits,
            fees=0.001,  # 10 bps
            freq="1D",
        )

        # Extract stats
        stats_dict = pf.stats()

        def safe_get(key: str, default: float = 0.0) -> float:
            import pandas as pd

            val = stats_dict.get(key, default)
            return float(val) if pd.notna(val) else default

        # Calculate profit factor from trades
        profit_factor = 0.0
        if len(pf.trades.records) > 0:
            trades = pf.trades.records_readable
            returns = trades["Return"].values
            wins = returns[returns > 0]
            losses = returns[returns < 0]
            if len(losses) > 0 and np.sum(np.abs(losses)) > 0:
                profit_factor = float(np.sum(wins) / np.sum(np.abs(losses)))

        return {
            "sharpe": safe_get("Sharpe Ratio", 0.0),
            "sortino": safe_get("Sortino Ratio", 0.0),
            "calmar": safe_get("Calmar Ratio", 0.0),
            "max_drawdown": safe_get("Max Drawdown [%]", 0.0) / 100.0,
            "win_rate": safe_get("Win Rate [%]", 0.0) / 100.0,
            "profit_factor": profit_factor,
            "num_trades": int(safe_get("Total Trades", 0)),
        }

    async def run_parameter_sensitivity(
        self,
        best_params: dict[str, Any],
        n_iterations: int = 100,
        jitter_pct: float = 0.1,
    ) -> dict[str, float]:
        """
        Monte Carlo parameter jitter testing.

        Measures sensitivity to parameter changes by jittering each
        parameter and measuring the resulting Sharpe ratio variation.

        Based on StrategyQuant robustness methodology:
        https://strategyquant.com/blog/robustness-tests-and-analysis/

        Args:
            best_params: Best performing parameters
            n_iterations: Number of jitter iterations per parameter
            jitter_pct: Maximum jitter as percentage of value (0.1 = ±10%)

        Returns:
            Dictionary mapping parameter names to sensitivity scores
            (lower = more stable, <0.1 is good)
        """
        self.factor.set_parameters(best_params)
        base_signals = self.factor.compute_signal(self.data)
        base_metrics = self._run_backtest(base_signals)
        base_sharpe = base_metrics["sharpe"]

        sensitivities: dict[str, float] = {}

        for param_name, param_value in best_params.items():
            # Only jitter numeric parameters
            if not isinstance(param_value, (int, float)):
                sensitivities[param_name] = 0.0
                continue

            sharpe_deltas: list[float] = []

            for _ in range(n_iterations):
                # Apply random jitter
                jitter_factor = 1 + np.random.uniform(-jitter_pct, jitter_pct)
                jittered_value = param_value * jitter_factor

                # Ensure integer params stay integers
                if isinstance(param_value, int):
                    jittered_value = int(round(jittered_value))

                jittered_params = {**best_params, param_name: jittered_value}
                self.factor.set_parameters(jittered_params)

                try:
                    jittered_signals = self.factor.compute_signal(self.data)
                    jittered_metrics = self._run_backtest(jittered_signals)
                    jittered_sharpe = jittered_metrics["sharpe"]
                    sharpe_deltas.append(abs(jittered_sharpe - base_sharpe))
                except Exception:
                    continue

            # Sensitivity = mean absolute deviation of Sharpe
            sensitivities[param_name] = (
                float(np.mean(sharpe_deltas)) if sharpe_deltas else float("inf")
            )

        return sensitivities

    def compute_ic(
        self,
        params: dict[str, Any],
        forward_periods: int = 5,
        rolling_window: int = 20,
    ) -> tuple[float, float, float]:
        """
        Compute Information Coefficient metrics.

        IC measures the predictive power of the signal for forward returns:
        - IC = Pearson correlation between signal and forward returns
        - ICIR = Mean IC / Std IC (consistency measure)
        - Rank IC = Spearman correlation (robust to outliers)

        Args:
            params: Parameters to use
            forward_periods: Periods to look forward for returns
            rolling_window: Window size for ICIR calculation

        Returns:
            Tuple of (IC mean, ICIR, Rank IC)
        """
        self.factor.set_parameters(params)
        signals = self.factor.compute_signal(self.data)

        # Compute forward returns
        close = self.data["close"]
        forward_returns = close.shift(-forward_periods) / close - 1

        # Create mask for valid data
        signals_arr = signals.to_numpy()
        returns_arr = forward_returns.to_numpy()

        valid_mask = ~(np.isnan(signals_arr) | np.isnan(returns_arr))
        valid_signals = signals_arr[valid_mask]
        valid_returns = returns_arr[valid_mask]

        if len(valid_signals) < rolling_window:
            return 0.0, 0.0, 0.0

        # IC = Pearson correlation
        ic_mean = float(np.corrcoef(valid_signals, valid_returns)[0, 1])
        if np.isnan(ic_mean):
            ic_mean = 0.0

        # Rank IC = Spearman correlation
        rank_ic_result = stats.spearmanr(valid_signals, valid_returns)
        rank_ic = (
            float(rank_ic_result.correlation) if not np.isnan(rank_ic_result.correlation) else 0.0
        )

        # ICIR = rolling IC mean / std
        ics: list[float] = []
        for i in range(rolling_window, len(valid_signals) - forward_periods):
            window_signals = valid_signals[i - rolling_window : i]
            window_returns = valid_returns[i - rolling_window : i]
            if len(window_signals) > 0 and len(window_returns) > 0:
                window_ic = float(np.corrcoef(window_signals, window_returns)[0, 1])
                if not np.isnan(window_ic):
                    ics.append(window_ic)

        if len(ics) > 1:
            ic_std = float(np.std(ics))
            icir = float(np.mean(ics) / ic_std) if ic_std > 0 else 0.0
        else:
            icir = 0.0

        return ic_mean, icir, rank_ic

    def check_gates(
        self,
        metrics: dict[str, float],
    ) -> tuple[bool, list[str]]:
        """
        Check if metrics pass all gates.

        Args:
            metrics: Dictionary of metric values

        Returns:
            Tuple of (all_passed, list_of_violations)
        """
        violations: list[str] = []

        # Sharpe
        if metrics.get("sharpe", 0) < self.gates.sharpe_min:
            violations.append(f"sharpe {metrics.get('sharpe', 0):.3f} < {self.gates.sharpe_min}")

        # Sortino
        if metrics.get("sortino", 0) < self.gates.sortino_min:
            violations.append(f"sortino {metrics.get('sortino', 0):.3f} < {self.gates.sortino_min}")

        # Win rate
        if metrics.get("win_rate", 0) < self.gates.win_rate_min:
            violations.append(
                f"win_rate {metrics.get('win_rate', 0):.3f} < {self.gates.win_rate_min}"
            )

        # Max drawdown (note: higher is worse)
        if metrics.get("max_drawdown", 1.0) > self.gates.max_drawdown_max:
            violations.append(
                f"max_drawdown {metrics.get('max_drawdown', 1.0):.3f} > {self.gates.max_drawdown_max}"
            )

        # IC
        if metrics.get("ic", 0) < self.gates.ic_min:
            violations.append(f"ic {metrics.get('ic', 0):.4f} < {self.gates.ic_min}")

        # ICIR
        if metrics.get("icir", 0) < self.gates.icir_min:
            violations.append(f"icir {metrics.get('icir', 0):.3f} < {self.gates.icir_min}")

        return len(violations) == 0, violations

    async def validate(
        self,
        param_grid: dict[str, list[Any]],
        n_sensitivity_iterations: int = 100,
    ) -> Stage1Results:
        """
        Run full Stage 1 validation.

        1. Parameter scan to find best combination
        2. IC/ICIR computation for predictive power
        3. Parameter sensitivity via Monte Carlo jitter
        4. Gate checking

        Args:
            param_grid: Parameter search space
            n_sensitivity_iterations: Monte Carlo iterations

        Returns:
            Stage1Results with all metrics and gate status
        """
        import time

        start_time = time.time()

        # 1. Parameter scan
        scan_results = await self.run_parameter_scan(param_grid)

        if not scan_results:
            # No valid results
            return Stage1Results(
                factor_id=self.factor.metadata.factor_id,
                best_params={},
                parameter_sensitivity={},
                sharpe=0.0,
                sortino=0.0,
                calmar=0.0,
                max_drawdown=1.0,
                win_rate=0.0,
                profit_factor=0.0,
                ic_mean=0.0,
                icir=0.0,
                rank_ic=0.0,
                passed_gates=False,
                gate_violations=["No valid parameter combinations found"],
                num_combinations_tested=len(param_grid),
                scan_duration_seconds=time.time() - start_time,
            )

        # Find best by Sharpe ratio
        best = max(scan_results, key=lambda x: x.get("sharpe", 0))
        best_params = best["params"]

        # 2. IC computation
        ic_mean, icir, rank_ic = self.compute_ic(best_params)

        # 3. Parameter sensitivity
        sensitivity = await self.run_parameter_sensitivity(
            best_params,
            n_iterations=n_sensitivity_iterations,
        )

        # 4. Gate checking
        gate_metrics = {
            "sharpe": best.get("sharpe", 0),
            "sortino": best.get("sortino", 0),
            "win_rate": best.get("win_rate", 0),
            "max_drawdown": best.get("max_drawdown", 1.0),
            "ic": ic_mean,
            "icir": icir,
        }
        passed, violations = self.check_gates(gate_metrics)

        return Stage1Results(
            factor_id=self.factor.metadata.factor_id,
            best_params=best_params,
            parameter_sensitivity=sensitivity,
            sharpe=best.get("sharpe", 0.0),
            sortino=best.get("sortino", 0.0),
            calmar=best.get("calmar", 0.0),
            max_drawdown=best.get("max_drawdown", 0.0),
            win_rate=best.get("win_rate", 0.0),
            profit_factor=best.get("profit_factor", 0.0),
            ic_mean=ic_mean,
            icir=icir,
            rank_ic=rank_ic,
            passed_gates=passed,
            gate_violations=violations,
            num_combinations_tested=len(scan_results),
            scan_duration_seconds=time.time() - start_time,
        )
