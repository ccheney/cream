"""
Validation Feedback Loop Implementation

Provides structured feedback from validation results to guide hypothesis
refinement. Max 3 iterations per hypothesis before abandonment.

See: docs/plans/20-research-to-production-pipeline.md - Phase 3

Feedback includes:
- Gate violations from Stage 1 and Stage 2
- Regime-specific performance analysis
- Factor correlation to existing Factor Zoo
- Modification suggestions
- Alternative hypothesis suggestions
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal

import numpy as np
import polars as pl

if TYPE_CHECKING:
    from .hypothesis_alignment import Hypothesis
    from .stage_validation.stage1_vectorbt import Stage1Results
    from .stage_validation.stage2_nautilus import Stage2Results
    from .strategies.base import ResearchFactor

logger = logging.getLogger(__name__)

# Type aliases for external service protocols
RegimeServiceProtocol = Any
FactorZooProtocol = Any


@dataclass
class ValidationFeedback:
    """Structured feedback for hypothesis refinement."""

    factor_id: str
    """Factor that was validated."""

    hypothesis_id: str
    """Hypothesis being tested."""

    iteration: int
    """Current iteration (max 3)."""

    # What failed
    stage1_violations: list[str]
    """Gate violations from Stage 1 validation."""

    stage2_violations: list[str]
    """Gate violations from Stage 2 validation."""

    # Diagnostic analysis
    regime_performance: dict[str, float]
    """Sharpe ratio by market regime."""

    parameter_sensitivity: dict[str, float]
    """Sensitivity of results to each parameter."""

    correlation_to_existing: dict[str, float]
    """Correlation to existing Factor Zoo factors."""

    # Suggestions
    suggested_modifications: list[str]
    """Specific suggestions for improving the factor."""

    alternative_hypotheses: list[str]
    """Alternative hypotheses if abandoning."""

    # Decision
    action: Literal["REFINE", "ABANDON", "ACCEPT"]
    """Next action: refine hypothesis, abandon it, or accept factor."""

    def summary(self) -> str:
        """Get a human-readable summary of the feedback."""
        status = {
            "ACCEPT": "Factor passed all gates",
            "ABANDON": "Abandoning after max iterations",
            "REFINE": "Refining hypothesis",
        }[self.action]

        violations = self.stage1_violations + self.stage2_violations
        violation_str = ", ".join(violations) if violations else "None"

        return (
            f"[{self.action}] Iteration {self.iteration}/3 - {status}\n"
            f"Violations: {violation_str}\n"
            f"Suggestions: {len(self.suggested_modifications)}"
        )


@dataclass
class FeedbackConfig:
    """Configuration for feedback generation."""

    max_iterations: int = 3
    """Maximum refinement iterations before abandonment."""

    correlation_threshold: float = 0.7
    """Threshold for high correlation warning."""

    poor_regime_sharpe: float = 0.5
    """Sharpe threshold for poor regime performance."""


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
        # Determine action
        action = self._determine_action(
            stage1_results,
            stage2_results,
            iteration,
        )

        # Analyze regime-specific performance
        regime_perf: dict[str, float] = {}
        if data is not None:
            regime_perf = await self._analyze_regime_performance(factor, stage1_results, data)

        # Compute correlation to existing factors
        correlations: dict[str, float] = {}
        if data is not None and existing_factors:
            correlations = self._compute_factor_correlations(factor, existing_factors, data)

        # Extract parameter sensitivity from Stage 1 results
        param_sensitivity: dict[str, float] = {}
        if hasattr(stage1_results, "parameter_sensitivity"):
            param_sensitivity = stage1_results.parameter_sensitivity

        # Generate suggestions based on failures
        suggestions = self._generate_suggestions(
            stage1_results.gate_violations,
            stage2_results.gate_violations if stage2_results else [],
            regime_perf,
            correlations,
        )

        # Generate alternative hypotheses if abandoning
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
        # Accept if all gates passed
        if stage1_results.passed_gates:
            if stage2_results is None or stage2_results.passed_gates:
                return "ACCEPT"

        # Abandon if max iterations reached
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

        # If regime service available, use it
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

        # Fallback: simple volatility-based regime classification
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

        # Compute rolling volatility (21-day)
        vol_window = 21
        rolling_vol = np.array(
            [np.std(returns[max(0, i - vol_window) : i]) for i in range(vol_window, n)]
        )

        # Classify into high/low vol regimes
        vol_median = np.median(rolling_vol)

        # Compute factor signals
        signals = factor.compute_signal(data).to_numpy()
        price_returns = np.zeros(len(signals))
        price_returns[1:] = returns

        # Strategy returns
        strategy_returns = signals[:-1] * price_returns[1:]
        strategy_returns = np.append(strategy_returns, 0)

        # Split by regime
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

                # Handle NaN values
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

        # Sharpe-related failures
        if any("sharpe" in v.lower() for v in stage1_violations):
            suggestions.append("Consider adding volatility-adjusted position sizing")
            suggestions.append("Review signal timing - ensure signals precede price moves")
            suggestions.append("Try longer lookback periods to capture more persistent signals")

        # Drawdown failures
        if any("drawdown" in v.lower() for v in stage1_violations):
            suggestions.append("Add position size limits based on recent volatility")
            suggestions.append("Consider stop-loss logic to limit drawdown")
            suggestions.append("Reduce position during high-volatility regimes")

        # Win rate failures
        if any("win" in v.lower() for v in stage1_violations):
            suggestions.append("Review entry conditions for better timing")
            suggestions.append("Consider confirmation signals before entry")

        # PBO (overfitting) failures
        if any("pbo" in v.lower() for v in stage2_violations):
            suggestions.append("Reduce number of parameters to minimize overfitting risk")
            suggestions.append("Use simpler, more robust features")
            suggestions.append("Consider using wider parameter ranges to test robustness")

        # DSR p-value failures
        if any("dsr" in v.lower() for v in stage2_violations):
            suggestions.append("Extend backtest period for more statistical significance")
            suggestions.append("The observed Sharpe may not be statistically significant")

        # Walk-forward efficiency failures
        if any("wfe" in v.lower() for v in stage2_violations):
            suggestions.append("Factor may be overfit to in-sample data")
            suggestions.append("Try anchored walk-forward with expanding window")

        # Monte Carlo failures
        if any("mc" in v.lower() or "monte" in v.lower() for v in stage2_violations):
            suggestions.append("Factor is not robust to execution noise")
            suggestions.append("Consider reducing trade frequency")

        # Poor regime coverage
        poor_regimes = [r for r, s in regime_perf.items() if s < self.config.poor_regime_sharpe]
        if poor_regimes:
            regimes_str = ", ".join(poor_regimes)
            suggestions.append(
                f"Factor underperforms in: {regimes_str}. "
                f"Consider regime-specific logic or targeting a different regime."
            )

        # High correlation with existing factors
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

        # Suggest based on regime performance
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

        # General alternatives
        alternatives.extend(
            [
                "Explore behavioral bias rather than structural constraint",
                "Try shorter holding period to reduce decay risk",
                f"Consider inverse signal in regime: {hypothesis.target_regime}",
                "Look for complementary factors that hedge this one",
            ]
        )

        return alternatives


class RefinementOrchestrator:
    """
    Orchestrate hypothesis refinement loop.

    Coordinates between validation and feedback generation,
    running up to MAX_ITERATIONS before abandonment.
    """

    def __init__(
        self,
        feedback_generator: FeedbackGenerator,
        config: FeedbackConfig | None = None,
    ) -> None:
        """
        Initialize the orchestrator.

        Args:
            feedback_generator: Generator for validation feedback
            config: Feedback configuration
        """
        self.feedback_gen = feedback_generator
        self.config = config or FeedbackConfig()

    async def run_refinement_loop(
        self,
        factor: ResearchFactor,
        hypothesis: Hypothesis,
        data: pl.DataFrame,
        params: dict[str, Any],
        existing_factors: list[ResearchFactor] | None = None,
    ) -> tuple[ResearchFactor, ValidationFeedback]:
        """
        Run validation with refinement loop.

        Args:
            factor: Research factor to validate
            hypothesis: Research hypothesis
            data: Historical data
            params: Factor parameters
            existing_factors: Optional existing factors for correlation

        Returns:
            Tuple of (final factor, final feedback)
        """
        from .stage_validation import Stage1Validator, Stage2Validator

        current_factor = factor
        feedback: ValidationFeedback | None = None

        for iteration in range(1, self.config.max_iterations + 1):
            logger.info(f"Refinement iteration {iteration}/{self.config.max_iterations}")

            # Stage 1 validation
            stage1_validator = Stage1Validator(current_factor, data)
            stage1_results = await stage1_validator.validate(params)

            if not stage1_results.passed_gates:
                feedback = await self.feedback_gen.generate_feedback(
                    factor=current_factor,
                    stage1_results=stage1_results,
                    stage2_results=None,
                    hypothesis=hypothesis,
                    iteration=iteration,
                    data=data,
                    existing_factors=existing_factors,
                )

                if feedback.action == "ABANDON":
                    logger.info(f"Abandoning after iteration {iteration}")
                    return current_factor, feedback

                logger.info(f"Stage 1 failed, suggestions: {feedback.suggested_modifications}")
                continue

            # Stage 2 validation
            stage2_validator = Stage2Validator(current_factor, data)
            stage2_results = await stage2_validator.validate(params)

            feedback = await self.feedback_gen.generate_feedback(
                factor=current_factor,
                stage1_results=stage1_results,
                stage2_results=stage2_results,
                hypothesis=hypothesis,
                iteration=iteration,
                data=data,
                existing_factors=existing_factors,
            )

            if feedback.action == "ACCEPT":
                logger.info("Factor accepted!")
                return current_factor, feedback
            if feedback.action == "ABANDON":
                logger.info(f"Abandoning after iteration {iteration}")
                return current_factor, feedback

            logger.info(f"Stage 2 failed, suggestions: {feedback.suggested_modifications}")

        # Max iterations reached without acceptance
        if feedback is None:
            # Create final feedback
            stage1_validator = Stage1Validator(current_factor, data)
            stage1_results = await stage1_validator.validate(params)
            feedback = await self.feedback_gen.generate_feedback(
                factor=current_factor,
                stage1_results=stage1_results,
                stage2_results=None,
                hypothesis=hypothesis,
                iteration=self.config.max_iterations,
                data=data,
                existing_factors=existing_factors,
            )

        return current_factor, feedback
