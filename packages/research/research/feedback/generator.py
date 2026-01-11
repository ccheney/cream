"""
Feedback Generator

Generates structured feedback from validation results to guide hypothesis refinement.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Literal

import numpy as np
import polars as pl

from .types import FactorZooProtocol, FeedbackConfig, RegimeServiceProtocol, ValidationFeedback

if TYPE_CHECKING:
    from ..hypothesis_alignment import Hypothesis
    from ..stage_validation.stage1_vectorbt import Stage1Results
    from ..stage_validation.stage2_nautilus import Stage2Results
    from ..strategies.base import ResearchFactor

logger = logging.getLogger(__name__)


class FeedbackGenerator:
    """
    Generate structured feedback from validation results.

    Analyzes validation failures to provide actionable suggestions
    for hypothesis refinement or factor improvement.

    Example:
        generator = FeedbackGenerator()
        feedback = await generator.generate_feedback(
            factor, stage1_results, stage2_results, hypothesis, iteration=1
        )
        if feedback.action == "REFINE":
            # Apply suggestions and retry
    """

    def __init__(
        self,
        config: FeedbackConfig | None = None,
        factor_zoo: FactorZooProtocol | None = None,
        regime_service: RegimeServiceProtocol | None = None,
    ) -> None:
        """
        Initialize the feedback generator.

        Args:
            config: Feedback configuration
            factor_zoo: Optional Factor Zoo repository for correlation analysis
            regime_service: Optional regime classification service
        """
        self.config = config or FeedbackConfig()
        self.factor_zoo = factor_zoo
        self.regime_service = regime_service

    async def generate_feedback(
        self,
        factor: ResearchFactor,
        stage1_results: Stage1Results,
        stage2_results: Stage2Results | None,
        hypothesis: Hypothesis,
        iteration: int,
        data: pl.DataFrame | None = None,
        existing_factors: list[ResearchFactor] | None = None,
    ) -> ValidationFeedback:
        """
        Generate structured feedback from validation results.

        Args:
            factor: Research factor that was validated
            stage1_results: Results from Stage 1 (VectorBT) validation
            stage2_results: Results from Stage 2 (NautilusTrader) validation
            hypothesis: Research hypothesis being tested
            iteration: Current iteration number
            data: Optional data for additional analysis
            existing_factors: Optional list of existing factors for correlation

        Returns:
            ValidationFeedback with analysis and suggestions
        """
        action = self._determine_action(
            stage1_results,
            stage2_results,
            iteration,
        )

        regime_perf: dict[str, float] = {}
        if data is not None:
            regime_perf = await self._analyze_regime_performance(factor, stage1_results, data)

        correlations: dict[str, float] = {}
        if data is not None and existing_factors:
            correlations = self._compute_factor_correlations(factor, existing_factors, data)

        param_sensitivity: dict[str, float] = {}
        if hasattr(stage1_results, "parameter_sensitivity"):
            param_sensitivity = stage1_results.parameter_sensitivity

        suggestions = self._generate_suggestions(
            stage1_results.gate_violations,
            stage2_results.gate_violations if stage2_results else [],
            regime_perf,
            correlations,
        )

        alternatives: list[str] = []
        if action == "ABANDON":
            alternatives = self._suggest_alternatives(hypothesis, regime_perf)

        return ValidationFeedback(
            factor_id=factor.metadata.factor_id,
            hypothesis_id=hypothesis.hypothesis_id,
            iteration=iteration,
            stage1_violations=stage1_results.gate_violations,
            stage2_violations=stage2_results.gate_violations if stage2_results else [],
            regime_performance=regime_perf,
            parameter_sensitivity=param_sensitivity,
            correlation_to_existing=correlations,
            suggested_modifications=suggestions,
            alternative_hypotheses=alternatives,
            action=action,
        )

    def _determine_action(
        self,
        stage1_results: Stage1Results,
        stage2_results: Stage2Results | None,
        iteration: int,
    ) -> Literal["REFINE", "ABANDON", "ACCEPT"]:
        """
        Determine the next action based on validation results.

        Args:
            stage1_results: Stage 1 validation results
            stage2_results: Stage 2 validation results (if available)
            iteration: Current iteration number

        Returns:
            Action to take: ACCEPT, REFINE, or ABANDON
        """
        if stage1_results.passed_gates:
            if stage2_results is None or stage2_results.passed_gates:
                return "ACCEPT"

        if iteration >= self.config.max_iterations:
            return "ABANDON"

        return "REFINE"

    async def _analyze_regime_performance(
        self,
        factor: ResearchFactor,
        stage1_results: Stage1Results,
        data: pl.DataFrame,
    ) -> dict[str, float]:
        """
        Analyze factor performance across market regimes.

        Args:
            factor: Research factor
            stage1_results: Stage 1 results with returns
            data: Historical data

        Returns:
            Dictionary mapping regime name to Sharpe ratio
        """
        regime_sharpes: dict[str, float] = {}

        if self.regime_service is not None:
            try:
                if "timestamp" in data.columns:
                    regimes = await self.regime_service.classify_history(
                        data["timestamp"].to_list()
                    )
                    returns = stage1_results.returns if hasattr(stage1_results, "returns") else []

                    if len(regimes) == len(returns):
                        for regime in set(regimes):
                            regime_mask = [r == regime for r in regimes]
                            regime_returns = [
                                r for r, m in zip(returns, regime_mask, strict=True) if m
                            ]
                            if len(regime_returns) > 20 and np.std(regime_returns) > 1e-10:
                                regime_sharpes[regime] = float(
                                    np.mean(regime_returns) / np.std(regime_returns) * np.sqrt(252)
                                )
            except Exception as e:
                logger.warning(f"Regime analysis failed: {e}")

        if not regime_sharpes:
            regime_sharpes = self._simple_regime_analysis(factor, data)

        return regime_sharpes

    def _simple_regime_analysis(
        self,
        factor: ResearchFactor,
        data: pl.DataFrame,
    ) -> dict[str, float]:
        """
        Simple volatility-based regime analysis.

        Args:
            factor: Research factor
            data: Historical data

        Returns:
            Regime-to-Sharpe mapping
        """
        regime_sharpes: dict[str, float] = {}

        if len(data) < 50:
            return regime_sharpes

        close = data["close"].to_numpy()
        returns = np.diff(close) / close[:-1]
        n = len(returns)

        if n < 42:
            return regime_sharpes

        vol_window = 21
        rolling_vol = np.array(
            [np.std(returns[max(0, i - vol_window) : i]) for i in range(vol_window, n)]
        )

        vol_median = np.median(rolling_vol)

        signals = factor.compute_signal(data).to_numpy()
        price_returns = np.zeros(len(signals))
        price_returns[1:] = returns

        strategy_returns = signals[:-1] * price_returns[1:]
        strategy_returns = np.append(strategy_returns, 0)

        high_vol_idx = np.where(rolling_vol > vol_median)[0] + vol_window
        low_vol_idx = np.where(rolling_vol <= vol_median)[0] + vol_window

        high_vol_idx = high_vol_idx[high_vol_idx < len(strategy_returns)]
        low_vol_idx = low_vol_idx[low_vol_idx < len(strategy_returns)]

        if len(high_vol_idx) > 20:
            high_vol_returns = strategy_returns[high_vol_idx]
            if np.std(high_vol_returns) > 1e-10:
                regime_sharpes["HIGH_VOL"] = float(
                    np.mean(high_vol_returns) / np.std(high_vol_returns) * np.sqrt(252)
                )

        if len(low_vol_idx) > 20:
            low_vol_returns = strategy_returns[low_vol_idx]
            if np.std(low_vol_returns) > 1e-10:
                regime_sharpes["LOW_VOL"] = float(
                    np.mean(low_vol_returns) / np.std(low_vol_returns) * np.sqrt(252)
                )

        return regime_sharpes

    def _compute_factor_correlations(
        self,
        factor: ResearchFactor,
        existing_factors: list[ResearchFactor],
        data: pl.DataFrame,
    ) -> dict[str, float]:
        """
        Compute correlation with existing Factor Zoo factors.

        Args:
            factor: New factor
            existing_factors: List of existing factors
            data: Historical data

        Returns:
            Dictionary mapping factor_id to correlation
        """
        correlations: dict[str, float] = {}

        new_signals = factor.compute_signal(data).to_numpy()

        for existing in existing_factors:
            try:
                existing_signals = existing.compute_signal(data).to_numpy()

                mask = ~(np.isnan(new_signals) | np.isnan(existing_signals))
                if np.sum(mask) > 20:
                    corr = float(np.corrcoef(new_signals[mask], existing_signals[mask])[0, 1])
                    if np.isfinite(corr):
                        correlations[existing.metadata.factor_id] = corr
            except Exception as e:
                logger.debug(
                    f"Correlation computation failed for {existing.metadata.factor_id}: {e}"
                )

        return correlations

    def _generate_suggestions(
        self,
        stage1_violations: list[str],
        stage2_violations: list[str],
        regime_perf: dict[str, float],
        correlations: dict[str, float],
    ) -> list[str]:
        """
        Generate modification suggestions based on failure analysis.

        Args:
            stage1_violations: Gate violations from Stage 1
            stage2_violations: Gate violations from Stage 2
            regime_perf: Performance by regime
            correlations: Correlations to existing factors

        Returns:
            List of actionable suggestions
        """
        suggestions: list[str] = []

        if any("sharpe" in v.lower() for v in stage1_violations):
            suggestions.append("Consider adding volatility-adjusted position sizing")
            suggestions.append("Review signal timing - ensure signals precede price moves")
            suggestions.append("Try longer lookback periods to capture more persistent signals")

        if any("drawdown" in v.lower() for v in stage1_violations):
            suggestions.append("Add position size limits based on recent volatility")
            suggestions.append("Consider stop-loss logic to limit drawdown")
            suggestions.append("Reduce position during high-volatility regimes")

        if any("win" in v.lower() for v in stage1_violations):
            suggestions.append("Review entry conditions for better timing")
            suggestions.append("Consider confirmation signals before entry")

        if any("pbo" in v.lower() for v in stage2_violations):
            suggestions.append("Reduce number of parameters to minimize overfitting risk")
            suggestions.append("Use simpler, more robust features")
            suggestions.append("Consider using wider parameter ranges to test robustness")

        if any("dsr" in v.lower() for v in stage2_violations):
            suggestions.append("Extend backtest period for more statistical significance")
            suggestions.append("The observed Sharpe may not be statistically significant")

        if any("wfe" in v.lower() for v in stage2_violations):
            suggestions.append("Factor may be overfit to in-sample data")
            suggestions.append("Try anchored walk-forward with expanding window")

        if any("mc" in v.lower() or "monte" in v.lower() for v in stage2_violations):
            suggestions.append("Factor is not robust to execution noise")
            suggestions.append("Consider reducing trade frequency")

        poor_regimes = [r for r, s in regime_perf.items() if s < self.config.poor_regime_sharpe]
        if poor_regimes:
            regimes_str = ", ".join(poor_regimes)
            suggestions.append(
                f"Factor underperforms in: {regimes_str}. "
                f"Consider regime-specific logic or targeting a different regime."
            )

        high_corr = [
            f for f, c in correlations.items() if abs(c) > self.config.correlation_threshold
        ]
        if high_corr:
            factors_str = ", ".join(high_corr)
            suggestions.append(
                f"High correlation (>{self.config.correlation_threshold:.0%}) with: {factors_str}. "
                f"Differentiate signal generation or target different alpha source."
            )

        return suggestions

    def _suggest_alternatives(
        self,
        hypothesis: Hypothesis,
        regime_perf: dict[str, float],
    ) -> list[str]:
        """
        Suggest alternative hypotheses when abandoning.

        Args:
            hypothesis: Original hypothesis
            regime_perf: Performance by regime

        Returns:
            List of alternative hypothesis suggestions
        """
        alternatives: list[str] = []

        best_regime = None
        best_sharpe = float("-inf")
        for regime, sharpe in regime_perf.items():
            if sharpe > best_sharpe:
                best_sharpe = sharpe
                best_regime = regime

        if best_regime and best_sharpe > 0:
            alternatives.append(
                f"Factor performs best in {best_regime} regime (Sharpe: {best_sharpe:.2f}). "
                f"Consider targeting this regime specifically."
            )

        alternatives.extend(
            [
                "Explore behavioral bias rather than structural constraint",
                "Try shorter holding period to reduce decay risk",
                f"Consider inverse signal in regime: {hypothesis.target_regime}",
                "Look for complementary factors that hedge this one",
            ]
        )

        return alternatives
