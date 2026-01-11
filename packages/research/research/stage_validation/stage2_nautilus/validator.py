"""
Stage 2 Validator

NautilusTrader-based high-fidelity validation with CPCV, DSR, walk-forward,
and Monte Carlo robustness testing.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import numpy as np
import polars as pl

from .runner import run_nautilus_backtest
from .types import (
    MonteCarloResults,
    Stage2Gates,
    Stage2Results,
    WalkForwardResults,
)

if TYPE_CHECKING:
    from ...strategies.base import ResearchFactor

logger = logging.getLogger(__name__)


class Stage2Validator:
    """
    NautilusTrader-based high-fidelity Stage 2 validation.

    Integrates:
    - CPCV for PBO calculation
    - DSR for multiple testing correction
    - Walk-forward efficiency analysis
    - Monte Carlo robustness testing
    - NautilusTrader event-driven backtesting

    Example:
        validator = Stage2Validator(factor, data)
        results = await validator.validate({"period": 14})
        if results.passed_gates:
            print("Factor passed Stage 2 validation!")
    """

    DEFAULT_N_PERIODS = 5
    DEFAULT_IN_SAMPLE_PCT = 0.7
    DEFAULT_MC_SIMULATIONS = 1000

    def __init__(
        self,
        factor: ResearchFactor,
        data: pl.DataFrame,
        gates: Stage2Gates | None = None,
    ) -> None:
        """
        Initialize the Stage 2 validator.

        Args:
            factor: Research factor to validate
            data: Historical data (must have OHLCV columns)
            gates: Gate thresholds (uses defaults if None)
        """
        self.factor = factor
        self.data = data
        self.gates = gates or Stage2Gates()

    async def validate(
        self,
        params: dict[str, Any],
        n_prior_trials: int = 100,
        n_mc_simulations: int | None = None,
        n_wf_periods: int | None = None,
    ) -> Stage2Results:
        """
        Run full Stage 2 validation.

        Args:
            params: Factor parameters to validate
            n_prior_trials: Number of prior trials for DSR calculation
            n_mc_simulations: Number of Monte Carlo simulations
            n_wf_periods: Number of walk-forward periods

        Returns:
            Stage2Results with all validation metrics
        """
        from ..cpcv import CPCVValidator
        from ..dsr import DSRValidator

        n_mc = n_mc_simulations or self.DEFAULT_MC_SIMULATIONS
        n_periods = n_wf_periods or self.DEFAULT_N_PERIODS

        # Compute signals for the factor
        self.factor.set_parameters(params)
        signals = self.factor.compute_signal(self.data)

        # Compute returns from signals
        returns = self._compute_returns(signals)

        # 1. CPCV for PBO
        cpcv_validator = CPCVValidator(self.factor, self.data)
        cpcv_results = await cpcv_validator.validate(params)

        # 2. DSR for multiple testing correction
        dsr_validator = DSRValidator(n_trials=n_prior_trials)
        dsr_results = await dsr_validator.compute_dsr(
            returns, self.factor.metadata.factor_id, params
        )

        # 3. Walk-forward efficiency
        wf_results = await self._run_walk_forward(params, n_periods)

        # 4. Monte Carlo robustness
        mc_results = await self._run_monte_carlo(returns, n_mc)

        # 5. High-fidelity NautilusTrader backtest
        nautilus_metrics = await run_nautilus_backtest(self.factor, self.data, params)

        # Check gates
        violations = self._check_gates(cpcv_results, dsr_results, wf_results, mc_results)

        return Stage2Results(
            factor_id=self.factor.metadata.factor_id,
            sharpe_realistic=nautilus_metrics["sharpe"],
            sortino_realistic=nautilus_metrics["sortino"],
            max_drawdown_realistic=nautilus_metrics["max_drawdown"],
            avg_slippage_bps=nautilus_metrics["avg_slippage_bps"],
            fill_rate=nautilus_metrics["fill_rate"],
            total_trades=nautilus_metrics["total_trades"],
            pbo=cpcv_results.pbo,
            dsr_pvalue=dsr_results.dsr_pvalue,
            observed_sharpe=dsr_results.observed_sharpe,
            wfe=wf_results.efficiency,
            cpcv_sharpe_dist=cpcv_results.sharpe_distribution,
            mc_sharpe_5th_pct=mc_results.sharpe_5th_percentile,
            mc_drawdown_95th_pct=mc_results.drawdown_95th_percentile,
            passed_gates=len(violations) == 0,
            gate_violations=violations,
            walk_forward_results=wf_results,
            monte_carlo_results=mc_results,
        )

    def _check_gates(
        self,
        cpcv_results: Any,
        dsr_results: Any,
        wf_results: WalkForwardResults,
        mc_results: MonteCarloResults,
    ) -> list[str]:
        """Check all gate thresholds and return violations."""
        violations = []
        if cpcv_results.pbo > self.gates.pbo_max:
            violations.append(f"PBO {cpcv_results.pbo:.3f} > {self.gates.pbo_max}")
        if dsr_results.dsr_pvalue < self.gates.dsr_pvalue_min:
            violations.append(
                f"DSR p-value {dsr_results.dsr_pvalue:.3f} < {self.gates.dsr_pvalue_min}"
            )
        if wf_results.efficiency < self.gates.wfe_min:
            violations.append(f"WFE {wf_results.efficiency:.3f} < {self.gates.wfe_min}")
        if mc_results.sharpe_5th_percentile < self.gates.mc_sharpe_5th_min:
            violations.append(
                f"MC Sharpe 5th pct {mc_results.sharpe_5th_percentile:.3f} < "
                f"{self.gates.mc_sharpe_5th_min}"
            )
        return violations

    def _compute_returns(self, signals: pl.Series) -> pl.Series:
        """
        Compute returns from signal series.

        Args:
            signals: Signal values (-1, 0, 1)

        Returns:
            Strategy returns series
        """
        close = self.data["close"]
        price_returns = close.pct_change()

        shifted_signals = signals.shift(1).fill_null(0.0)
        strategy_returns = shifted_signals * price_returns

        return strategy_returns.fill_null(0.0)

    async def _run_walk_forward(
        self,
        params: dict[str, Any],
        n_periods: int,
    ) -> WalkForwardResults:
        """
        Run walk-forward analysis with efficiency calculation.

        WFE = avg(OOS Sharpe) / avg(IS Sharpe)
        WFE > 50% suggests strategy is not overfit.

        Args:
            params: Factor parameters
            n_periods: Number of walk-forward periods

        Returns:
            WalkForwardResults with efficiency metrics
        """
        period_length = len(self.data) // n_periods
        is_length = int(period_length * self.DEFAULT_IN_SAMPLE_PCT)

        is_sharpes: list[float] = []
        oos_sharpes: list[float] = []

        for i in range(n_periods):
            start = i * period_length
            is_end = start + is_length
            oos_end = min(start + period_length, len(self.data))

            is_data = self.data[start:is_end]
            oos_data = self.data[is_end:oos_end]

            if len(is_data) < 20 or len(oos_data) < 10:
                continue

            is_sharpe = self._compute_period_sharpe(is_data, params)
            oos_sharpe = self._compute_period_sharpe(oos_data, params)

            is_sharpes.append(is_sharpe)
            oos_sharpes.append(oos_sharpe)

        avg_is = float(np.mean(is_sharpes)) if is_sharpes else 0.0
        avg_oos = float(np.mean(oos_sharpes)) if oos_sharpes else 0.0

        efficiency = avg_oos / avg_is if avg_is > 0 else 0.0

        return WalkForwardResults(
            efficiency=efficiency,
            in_sample_sharpes=is_sharpes,
            out_of_sample_sharpes=oos_sharpes,
            n_periods=len(is_sharpes),
            avg_is_sharpe=avg_is,
            avg_oos_sharpe=avg_oos,
        )

    def _compute_period_sharpe(
        self,
        period_data: pl.DataFrame,
        params: dict[str, Any],
    ) -> float:
        """
        Compute Sharpe ratio for a data period.

        Args:
            period_data: Data for the period
            params: Factor parameters

        Returns:
            Annualized Sharpe ratio
        """
        self.factor.set_parameters(params)
        signals = self.factor.compute_signal(period_data)

        close = period_data["close"]
        price_returns = close.pct_change()
        shifted_signals = signals.shift(1).fill_null(0.0)
        strategy_returns = shifted_signals * price_returns

        returns_arr = strategy_returns.fill_null(0.0).to_numpy()
        if np.std(returns_arr) < 1e-10:
            return 0.0

        return float(np.mean(returns_arr) / np.std(returns_arr) * np.sqrt(252))

    async def _run_monte_carlo(
        self,
        returns: pl.Series,
        n_simulations: int,
    ) -> MonteCarloResults:
        """
        Run Monte Carlo robustness testing.

        Includes:
        - Trade shuffling (destroys temporal dependency)
        - Random execution degradation (slippage simulation)

        Args:
            returns: Strategy returns series
            n_simulations: Number of simulations

        Returns:
            MonteCarloResults with distribution statistics
        """
        returns_arr = returns.to_numpy()
        nonzero_returns = returns_arr[returns_arr != 0]

        if len(nonzero_returns) < 10:
            return MonteCarloResults(
                sharpe_5th_percentile=0.0,
                sharpe_median=0.0,
                drawdown_95th_percentile=1.0,
                drawdown_median=0.5,
                n_simulations=0,
                sharpe_distribution=[],
            )

        sharpe_dist: list[float] = []
        drawdown_dist: list[float] = []

        for _ in range(n_simulations):
            shuffled = np.random.permutation(nonzero_returns)

            degradation = np.random.uniform(0, 0.002, len(shuffled))
            degraded = shuffled - np.abs(shuffled) * degradation

            if np.std(degraded) > 1e-10:
                sharpe = float(np.mean(degraded) / np.std(degraded) * np.sqrt(252))
            else:
                sharpe = 0.0
            sharpe_dist.append(sharpe)

            equity = np.cumsum(degraded)
            running_max = np.maximum.accumulate(equity)
            with np.errstate(divide="ignore", invalid="ignore"):
                drawdowns = np.where(running_max > 0, (running_max - equity) / running_max, 0.0)
            max_dd = float(np.nanmax(drawdowns)) if len(drawdowns) > 0 else 0.0
            drawdown_dist.append(max_dd)

        return MonteCarloResults(
            sharpe_5th_percentile=float(np.percentile(sharpe_dist, 5)),
            sharpe_median=float(np.median(sharpe_dist)),
            drawdown_95th_percentile=float(np.percentile(drawdown_dist, 95)),
            drawdown_median=float(np.median(drawdown_dist)),
            n_simulations=n_simulations,
            sharpe_distribution=sharpe_dist,
        )


async def run_full_stage2_validation(
    factor: ResearchFactor,
    data: pl.DataFrame,
    params: dict[str, Any],
    n_prior_trials: int = 100,
    gates: Stage2Gates | None = None,
) -> Stage2Results:
    """
    Convenience function to run full Stage 2 validation.

    Args:
        factor: Research factor to validate
        data: Historical data
        params: Factor parameters
        n_prior_trials: Number of prior trials for DSR
        gates: Optional custom gates

    Returns:
        Stage2Results with all validation metrics
    """
    validator = Stage2Validator(factor, data, gates)
    return await validator.validate(params, n_prior_trials)
