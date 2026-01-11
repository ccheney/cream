"""
DSR Validator: Main Deflated Sharpe Ratio validation logic.

Implements the Deflated Sharpe Ratio (DSR) calculation that corrects for
multiple testing bias, non-normal returns, and sample size.

Based on:
- Bailey & Lopez de Prado: The Deflated Sharpe Ratio
- Bailey et al.: Probability of Backtest Overfitting

See: docs/plans/20-research-to-production-pipeline.md - Phase 3

Key insight: After testing only 7 strategy configurations, a researcher
is expected to find at least one 2-year backtest with Sharpe > 1.0 even
when the true expected Sharpe is 0 (Bailey et al.).

DSR addresses this by:
1. Estimating expected maximum Sharpe under null hypothesis
2. Correcting for non-normal returns (skewness, kurtosis)
3. Computing probability the observed Sharpe is statistically significant
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import numpy as np
import polars as pl
from scipy.stats import norm

from .helpers import compute_kurtosis, compute_skewness, compute_strategy_returns
from .types import CombinedStatisticalResults, DSRConfig, DSRResults

if TYPE_CHECKING:
    from ...strategies.base import ResearchFactor

logger = logging.getLogger(__name__)


class DSRValidator:
    """
    Deflated Sharpe Ratio validator.

    The DSR corrects for:
    1. Multiple testing bias (having tested n strategies before)
    2. Non-normal returns (skewness and kurtosis)
    3. Sample size (shorter backtests are less reliable)

    Example:
        validator = DSRValidator(n_trials=50)  # Tested 50 strategies before
        results = await validator.validate(returns)
        if results.passed:
            print("Strategy passes DSR statistical test")

    Reference: https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf
    """

    EULER_GAMMA = 0.5772156649

    def __init__(
        self,
        n_trials: int,
        config: DSRConfig | None = None,
    ) -> None:
        """
        Initialize the DSR validator.

        Args:
            n_trials: Number of strategies tested before this one.
                     Critical for multiple testing correction.
                     Set to 1 for first strategy tested.
            config: DSR configuration (uses defaults if None)
        """
        self.n_trials = max(1, n_trials)
        self.config = config or DSRConfig()

    def _skewness(self, x: np.ndarray) -> float:
        """Compute sample skewness."""
        return compute_skewness(x)

    def _kurtosis(self, x: np.ndarray) -> float:
        """Compute sample excess kurtosis."""
        return compute_kurtosis(x)

    def _expected_max_sharpe(self, sharpe_std: float, n_trials: int) -> float:
        """
        Expected maximum Sharpe ratio under null hypothesis.

        From Bailey & Lopez de Prado:
        E[max(SR)] ≈ σ_SR * [(1-γ)*Φ^{-1}(1-1/N) + γ*Φ^{-1}(1-1/(N*e))]

        Where:
        - γ = Euler-Mascheroni constant ≈ 0.5772
        - Φ^{-1} = inverse standard normal CDF
        - N = number of trials
        - e = Euler's number

        Args:
            sharpe_std: Standard error of Sharpe estimate
            n_trials: Number of strategies tested

        Returns:
            Expected maximum Sharpe under null (no skill)
        """
        if n_trials <= 1:
            return 0.0

        try:
            term1 = (1 - self.EULER_GAMMA) * norm.ppf(1 - 1 / n_trials)
            term2 = self.EULER_GAMMA * norm.ppf(1 - 1 / (n_trials * np.e))
            return sharpe_std * (term1 + term2)
        except Exception:
            return 0.0

    def _sharpe_std(
        self,
        sharpe: float,
        skew: float,
        kurt: float,
        n: int,
    ) -> float:
        """
        Standard error of Sharpe ratio adjusted for non-normality.

        From Lo (2002) and Bailey & Lopez de Prado:
        σ(SR) = √[(1 + 0.5*SR² - γ₁*SR + (γ₂-3)/4*SR²) / (n-1)]

        Where:
        - γ₁ = skewness
        - γ₂ = kurtosis (not excess)

        Args:
            sharpe: Observed Sharpe ratio
            skew: Sample skewness
            kurt: Sample excess kurtosis
            n: Number of observations

        Returns:
            Standard error of Sharpe estimate
        """
        if n <= 1:
            return float("inf")

        # Convert excess kurtosis to regular kurtosis
        kurt_full = kurt + 3

        variance = (1 + 0.5 * sharpe**2 - skew * sharpe + ((kurt_full - 3) / 4) * sharpe**2) / (
            n - 1
        )

        return np.sqrt(max(0, variance))

    def _minimum_backtest_length(
        self,
        target_sharpe: float,
        n_trials: int,
        annualization: int,
    ) -> int:
        """
        Minimum backtest length required for statistical significance.

        From Bailey et al.: ensures DSR p-value > threshold is achievable.
        Iteratively finds minimum n where observed Sharpe can be significant.

        Args:
            target_sharpe: Target Sharpe ratio
            n_trials: Number of strategies tested
            annualization: Annualization factor

        Returns:
            Minimum number of observations required
        """
        if target_sharpe <= 0:
            return 5000  # Very long backtest needed for negative Sharpe

        # Iteratively find minimum n where DSR > threshold
        for n_days in range(30, 5000, 30):
            # Estimate Sharpe std assuming normal returns
            sharpe_std_est = 1 / np.sqrt(n_days - 1)
            expected_max = self._expected_max_sharpe(sharpe_std_est, n_trials)

            # Target should exceed expected max by ~1.5-2 sigma for significance
            if target_sharpe > expected_max + 1.65 * sharpe_std_est:
                return n_days

        return 5000  # Max if not found

    async def compute_dsr(
        self,
        returns: pl.Series,
        factor_id: str = "unknown",
        params: dict[str, Any] | None = None,
    ) -> DSRResults:
        """
        Compute Deflated Sharpe Ratio p-value.

        Args:
            returns: Daily (or period) returns series
            factor_id: Identifier for the factor being tested
            params: Parameters used to generate returns

        Returns:
            DSRResults with statistical validation
        """
        returns_np = returns.drop_nulls().to_numpy()
        n = len(returns_np)

        # Check minimum observations
        if n < self.config.min_observations:
            logger.warning(f"Insufficient observations: {n} < {self.config.min_observations}")
            return DSRResults(
                factor_id=factor_id,
                observed_sharpe=0.0,
                expected_max_sharpe=0.0,
                dsr_pvalue=0.0,
                sharpe_std=float("inf"),
                skewness=0.0,
                kurtosis=0.0,
                n_observations=n,
                n_trials=self.n_trials,
                min_backtest_length=5000,
                passed=False,
                gate_threshold=self.config.pvalue_threshold,
                params=params or {},
            )

        # Basic statistics
        mean_ret = np.mean(returns_np)
        std_ret = np.std(returns_np, ddof=1)

        if std_ret == 0:
            return DSRResults(
                factor_id=factor_id,
                observed_sharpe=0.0,
                expected_max_sharpe=0.0,
                dsr_pvalue=0.0,
                sharpe_std=float("inf"),
                skewness=0.0,
                kurtosis=0.0,
                n_observations=n,
                n_trials=self.n_trials,
                min_backtest_length=5000,
                passed=False,
                gate_threshold=self.config.pvalue_threshold,
                params=params or {},
            )

        # Annualized Sharpe (assuming zero risk-free rate)
        sharpe = (mean_ret / std_ret) * np.sqrt(self.config.annualization_factor)

        # Higher moments for DSR correction
        skew = self._skewness(returns_np)
        kurt = self._kurtosis(returns_np)

        # Standard error of Sharpe estimate (adjusted for non-normality)
        sharpe_std = self._sharpe_std(sharpe, skew, kurt, n)

        # Expected maximum Sharpe under null hypothesis
        expected_max = self._expected_max_sharpe(sharpe_std, self.n_trials)

        # DSR p-value: probability observed Sharpe exceeds expected max
        if sharpe_std > 0:
            dsr_pvalue = float(norm.cdf((sharpe - expected_max) / sharpe_std))
        else:
            dsr_pvalue = 0.0

        # Minimum backtest length for this Sharpe target
        min_btl = self._minimum_backtest_length(
            sharpe,
            self.n_trials,
            self.config.annualization_factor,
        )

        return DSRResults(
            factor_id=factor_id,
            observed_sharpe=sharpe,
            expected_max_sharpe=expected_max,
            dsr_pvalue=dsr_pvalue,
            sharpe_std=sharpe_std,
            skewness=skew,
            kurtosis=kurt,
            n_observations=n,
            n_trials=self.n_trials,
            min_backtest_length=min_btl,
            passed=dsr_pvalue >= self.config.pvalue_threshold,
            gate_threshold=self.config.pvalue_threshold,
            params=params or {},
        )


async def compute_full_statistical_validation(
    factor: ResearchFactor,
    data: pl.DataFrame,
    params: dict[str, Any],
    n_prior_trials: int,
    pbo_threshold: float = 0.5,
) -> CombinedStatisticalResults:
    """
    Run complete statistical validation: CPCV (PBO) + DSR.

    This combines:
    1. PBO from CPCV - probability best IS strategy underperforms OOS median
    2. DSR - multiple testing correction for observed Sharpe

    Args:
        factor: Research factor to validate
        data: OHLCV data for backtesting
        params: Factor parameters to use
        n_prior_trials: Number of strategies tested before this one
        pbo_threshold: Maximum acceptable PBO (default 0.5)

    Returns:
        CombinedStatisticalResults with both PBO and DSR validation
    """
    from ..cpcv import CPCVValidator

    # Run CPCV for PBO
    cpcv = CPCVValidator(factor, data)
    cpcv_results = await cpcv.validate(params)

    # Compute returns for DSR
    factor.set_parameters(params)
    signals = factor.compute_signal(data)
    returns = compute_strategy_returns(data, signals)

    # Run DSR
    dsr = DSRValidator(n_trials=n_prior_trials)
    dsr_results = await dsr.compute_dsr(
        returns,
        factor_id=factor.metadata.factor_id,
        params=params,
    )

    passed_pbo = cpcv_results.pbo <= pbo_threshold
    passed_dsr = dsr_results.passed

    return CombinedStatisticalResults(
        factor_id=factor.metadata.factor_id,
        pbo=cpcv_results.pbo,
        dsr_pvalue=dsr_results.dsr_pvalue,
        observed_sharpe=dsr_results.observed_sharpe,
        expected_max_sharpe=dsr_results.expected_max_sharpe,
        sharpe_distribution=cpcv_results.sharpe_distribution,
        n_trials_corrected=n_prior_trials,
        min_backtest_length=dsr_results.min_backtest_length,
        passed_pbo=passed_pbo,
        passed_dsr=passed_dsr,
        passed_all=passed_pbo and passed_dsr,
    )
