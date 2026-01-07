"""
CPCV: Combinatorial Purged Cross-Validation

Implements Combinatorial Purged Cross-Validation (CPCV) for statistically
rigorous backtesting that prevents data leakage and computes the Probability
of Backtest Overfitting (PBO).

Based on:
- Lopez de Prado (2018): Advances in Financial Machine Learning
- Bailey et al. (2014): The Probability of Backtest Overfitting

See: docs/plans/20-research-to-production-pipeline.md - Phase 3

Key concepts:
- **Purging**: Remove training observations temporally close to test
- **Embargoing**: Add gap period between train/test splits
- **PBO**: Probability that best in-sample strategy underperforms OOS median
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import numpy as np
import polars as pl
import vectorbt as vbt
from skfolio.model_selection import CombinatorialPurgedCV

if TYPE_CHECKING:
    from collections.abc import Iterator

    from ..strategies.base import ResearchFactor

logger = logging.getLogger(__name__)


@dataclass
class CPCVResults:
    """Results from CPCV analysis."""

    factor_id: str
    """Unique identifier for the factor."""

    pbo: float
    """Probability of Backtest Overfitting (0-1, lower is better)."""

    sharpe_distribution: list[float]
    """Out-of-sample Sharpe ratios across all backtest paths."""

    sharpe_mean: float
    """Mean out-of-sample Sharpe ratio."""

    sharpe_std: float
    """Standard deviation of out-of-sample Sharpe ratios."""

    is_vs_oos_degradation: float
    """Performance decay ratio (OOS mean / IS mean)."""

    n_paths: int
    """Number of backtest paths tested."""

    passed_pbo_threshold: bool
    """Whether PBO is below acceptable threshold."""

    params: dict[str, Any]
    """Parameters used for validation."""


@dataclass
class CPCVConfig:
    """Configuration for CPCV validation."""

    n_folds: int = 10
    """Number of folds for cross-validation."""

    n_test_folds: int = 2
    """Number of test folds per split."""

    purge_size: int = 5
    """Number of observations to purge around test boundaries."""

    embargo_size: int = 2
    """Number of observations to embargo after test periods."""

    pbo_threshold: float = 0.5
    """Maximum acceptable PBO (strategies with higher PBO are likely overfit)."""

    min_sharpe_oos: float = 0.5
    """Minimum acceptable mean OOS Sharpe ratio."""

    max_degradation: float = 0.5
    """Maximum acceptable IS→OOS degradation (0.5 = 50% decline)."""


class CPCVValidator:
    """
    Combinatorial Purged Cross-Validation validator.

    Performs:
    1. CPCV splits with purging and embargo to prevent data leakage
    2. Sharpe ratio computation on each train/test path
    3. PBO calculation using logit method from Bailey et al.
    4. Threshold checking for overfitting detection

    Example:
        validator = CPCVValidator(factor, data)
        results = await validator.validate(params)
        if results.passed_pbo_threshold:
            print("Strategy passes overfitting check")
    """

    def __init__(
        self,
        factor: ResearchFactor,
        data: pl.DataFrame,
        config: CPCVConfig | None = None,
    ) -> None:
        """
        Initialize the CPCV validator.

        Args:
            factor: Research factor to validate
            data: Polars DataFrame with OHLCV columns
            config: CPCV configuration (uses defaults if None)
        """
        self.factor = factor
        self.data = data
        self.config = config or CPCVConfig()
        self._pd_data = self._to_pandas(data)

    def _to_pandas(self, data: pl.DataFrame) -> Any:
        """Convert Polars DataFrame to pandas for skfolio compatibility."""
        import pandas as pd

        return pd.DataFrame({col: data[col].to_list() for col in data.columns})

    def get_cv_splitter(self) -> CombinatorialPurgedCV:
        """Create the CPCV splitter with configured parameters."""
        return CombinatorialPurgedCV(
            n_folds=self.config.n_folds,
            n_test_folds=self.config.n_test_folds,
            purged_size=self.config.purge_size,
            embargo_size=self.config.embargo_size,
        )

    def split(self) -> Iterator[tuple[np.ndarray, list[np.ndarray]]]:
        """
        Generate CPCV train/test splits with purging and embargo.

        Yields:
            Tuple of (train_indices, list_of_test_indices)
        """
        cv = self.get_cv_splitter()
        yield from cv.split(self._pd_data)

    def _backtest_sharpe(
        self,
        data_subset: pl.DataFrame,
        params: dict[str, Any],
    ) -> float:
        """
        Compute Sharpe ratio for factor on data subset.

        Args:
            data_subset: Subset of data to backtest on
            params: Factor parameters to use

        Returns:
            Sharpe ratio (annualized)
        """
        self.factor.set_parameters(params)

        try:
            signals = self.factor.compute_signal(data_subset)
            signals_np = signals.to_numpy()

            entries = signals_np > 0
            exits = signals_np < 0

            # Need at least some signals
            if not np.any(entries) or not np.any(exits):
                return 0.0

            pf = vbt.Portfolio.from_signals(
                close=data_subset["close"].to_numpy(),
                entries=entries,
                exits=exits,
                fees=0.001,
                freq="1D",
            )

            stats = pf.stats()
            sharpe = stats.get("Sharpe Ratio", 0.0)
            return float(sharpe) if not np.isnan(sharpe) else 0.0

        except Exception as e:
            logger.warning(f"Backtest failed: {e}")
            return 0.0

    def _compute_pbo_logit(
        self,
        is_perfs: list[float],
        oos_perfs: list[float],
    ) -> float:
        """
        Compute PBO using logit distribution method from Bailey et al.

        PBO = probability that the best in-sample strategy
        underperforms the median out-of-sample.

        The method works by:
        1. Ranking strategies by IS performance
        2. Comparing IS rank to OOS rank for each strategy
        3. Using logit transformation to compute probability

        Args:
            is_perfs: In-sample performances
            oos_perfs: Out-of-sample performances

        Returns:
            PBO value between 0 and 1 (lower is better)
        """
        n = len(is_perfs)
        if n < 2:
            return 1.0  # Insufficient data

        is_arr = np.array(is_perfs)
        oos_arr = np.array(oos_perfs)

        # Get ranks (higher performance = higher rank)
        is_ranks = np.argsort(np.argsort(is_arr))
        oos_ranks = np.argsort(np.argsort(oos_arr))

        # Compute rank correlation using logit
        # PBO is estimated as the fraction of cases where
        # a strategy's IS rank exceeds its OOS rank
        logit_diffs = []

        for i in range(n):
            is_rank = is_ranks[i]
            oos_rank = oos_ranks[i]

            # Logit transformation: log(rank / (n - rank))
            # Avoid division by zero
            if is_rank > 0 and is_rank < n - 1:
                is_logit = np.log(is_rank / (n - is_rank - 1))
            else:
                is_logit = 0.0

            if oos_rank > 0 and oos_rank < n - 1:
                oos_logit = np.log(oos_rank / (n - oos_rank - 1))
            else:
                oos_logit = 0.0

            logit_diffs.append(is_logit - oos_logit)

        # PBO = fraction where IS rank > OOS rank (logit diff > 0)
        # This indicates overfitting: good IS, bad OOS
        pbo = float(np.mean([1.0 if d > 0 else 0.0 for d in logit_diffs]))

        return pbo

    async def validate(
        self,
        params: dict[str, Any],
    ) -> CPCVResults:
        """
        Run full CPCV validation.

        1. Generate all CPCV train/test splits
        2. Compute Sharpe ratio on each split
        3. Calculate PBO
        4. Check against thresholds

        Args:
            params: Factor parameters to validate

        Returns:
            CPCVResults with PBO and distribution statistics
        """
        is_performances: list[float] = []
        oos_performances: list[float] = []

        for train_idx, test_idx_list in self.split():
            # Get train subset
            train_data = self.data[train_idx.tolist()]
            train_sharpe = self._backtest_sharpe(train_data, params)
            is_performances.append(train_sharpe)

            # Average Sharpe across all test folds for this split
            test_sharpes = []
            for test_idx in test_idx_list:
                test_data = self.data[test_idx.tolist()]
                test_sharpe = self._backtest_sharpe(test_data, params)
                test_sharpes.append(test_sharpe)

            # Use mean of test fold Sharpes as OOS performance for this path
            oos_performances.append(float(np.mean(test_sharpes)) if test_sharpes else 0.0)

        # Handle edge cases
        if not is_performances or not oos_performances:
            return CPCVResults(
                factor_id=self.factor.metadata.factor_id,
                pbo=1.0,
                sharpe_distribution=[],
                sharpe_mean=0.0,
                sharpe_std=0.0,
                is_vs_oos_degradation=0.0,
                n_paths=0,
                passed_pbo_threshold=False,
                params=params,
            )

        # Compute PBO
        pbo = self._compute_pbo_logit(is_performances, oos_performances)

        # Compute statistics
        sharpe_mean = float(np.mean(oos_performances))
        sharpe_std = float(np.std(oos_performances))

        is_mean = float(np.mean(is_performances))
        degradation = sharpe_mean / is_mean if is_mean > 0 else 0.0

        # Check thresholds
        passed = (
            pbo <= self.config.pbo_threshold
            and sharpe_mean >= self.config.min_sharpe_oos
            and degradation >= (1.0 - self.config.max_degradation)
        )

        return CPCVResults(
            factor_id=self.factor.metadata.factor_id,
            pbo=pbo,
            sharpe_distribution=oos_performances,
            sharpe_mean=sharpe_mean,
            sharpe_std=sharpe_std,
            is_vs_oos_degradation=degradation,
            n_paths=len(oos_performances),
            passed_pbo_threshold=passed,
            params=params,
        )


def compute_optimal_folds(
    n_observations: int,
    target_n_test_paths: int = 100,
    target_train_size: int = 252,
) -> tuple[int, int]:
    """
    Compute optimal number of folds for CPCV.

    Uses skfolio's optimal_folds_number to determine the best
    n_folds and n_test_folds for the given data size.

    Args:
        n_observations: Number of observations in the dataset
        target_n_test_paths: Target number of backtest paths
        target_train_size: Target training set size (default 252 = 1 year)

    Returns:
        Tuple of (n_folds, n_test_folds)
    """
    from skfolio.model_selection import optimal_folds_number

    n_folds, n_test_folds = optimal_folds_number(
        n_observations=n_observations,
        target_n_test_paths=target_n_test_paths,
        target_train_size=target_train_size,
    )

    return int(n_folds), int(n_test_folds)
