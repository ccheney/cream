"""
Pre-Execution Evaluator

Evaluates trading plans before execution using multiple scoring components:
- Rule-based scorer for quantifiable dimensions (risk-reward, sizing)
- LLM judge for qualitative assessment (memory consistency, context relevance)
- Bradley-Terry reward model for learned preferences

See: docs/plans/10-research.md - Pre-Execution Integration

Example:
    from research.evaluator import PreExecutionEvaluator, ProbabilityCalibrator
    from research.evaluator import RuleBasedScorer, BradleyTerryRewardModel

    evaluator = PreExecutionEvaluator(
        rule_scorer=RuleBasedScorer(),
        bt_model=BradleyTerryRewardModel(),
        calibrator=ProbabilityCalibrator(),
    )

    plan_score = evaluator.evaluate(
        plan=trading_plan,
        context=market_context,
        memory_context={"relevant_nodes": [...]},
    )
    print(f"Overall Score: {plan_score.overall_score}")
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import torch


@dataclass
class DimensionScores:
    """Dimension scores for plan evaluation."""

    technical_alignment: float
    """Technical indicators alignment score (0-100)."""

    risk_reward_ratio: float
    """Risk-reward ratio score (0-100)."""

    memory_consistency: float
    """Consistency with memory/history score (0-100)."""

    context_relevance: float
    """Relevance to current context score (0-100)."""

    sizing_appropriate: float
    """Position sizing appropriateness score (0-100)."""

    def to_dict(self) -> dict[str, float]:
        """Convert to dictionary."""
        return {
            "technical_alignment": self.technical_alignment,
            "risk_reward_ratio": self.risk_reward_ratio,
            "memory_consistency": self.memory_consistency,
            "context_relevance": self.context_relevance,
            "sizing_appropriate": self.sizing_appropriate,
        }


@dataclass
class PlanScore:
    """Result of pre-execution plan evaluation."""

    cycle_id: str
    """Identifier for the trading cycle."""

    overall_score: float
    """Overall score (0-100)."""

    dimension_scores: DimensionScores
    """Scores for each evaluation dimension."""

    confidence: float
    """Calibrated confidence in the score (0-1)."""

    notes: list[str]
    """Feedback notes, especially for low-scoring dimensions."""

    bt_reward: float = 0.0
    """Raw Bradley-Terry reward value."""

    weighted_score: float = 0.0
    """Pre-BT-blend weighted score."""

    metadata: dict[str, Any] = field(default_factory=dict)
    """Additional metadata from scoring."""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "cycle_id": self.cycle_id,
            "overall_score": self.overall_score,
            "dimension_scores": self.dimension_scores.to_dict(),
            "confidence": self.confidence,
            "notes": self.notes,
            "bt_reward": self.bt_reward,
            "weighted_score": self.weighted_score,
            "metadata": self.metadata,
        }


class PreExecutionEvaluator:
    """
    Evaluate trading plans before execution.

    Combines multiple scoring components:
    - Rule-based scorer: Quantifiable dimensions (risk-reward, sizing)
    - LLM judge: Qualitative assessment (optional, can be None)
    - Bradley-Terry model: Learned preferences from historical outcomes

    Weights for dimension aggregation:
    - Technical alignment: 25%
    - Risk-reward ratio: 20%
    - Memory consistency: 15%
    - Context relevance: 20%
    - Sizing appropriate: 20%

    Final score blends weighted average (70%) with BT reward (30%).
    """

    # Dimension weights (must sum to 1.0)
    WEIGHT_TECHNICAL = 0.25
    WEIGHT_RISK_REWARD = 0.20
    WEIGHT_MEMORY = 0.15
    WEIGHT_CONTEXT = 0.20
    WEIGHT_SIZING = 0.20

    # BT reward blending ratio
    BT_BLEND_RATIO = 0.30

    # Thresholds for feedback generation
    LOW_SCORE_THRESHOLD = 50.0
    VERY_LOW_SCORE_THRESHOLD = 30.0

    def __init__(
        self,
        rule_scorer: Any | None = None,
        llm_judge: Any | None = None,
        bt_model: Any | None = None,
        calibrator: Any | None = None,
    ) -> None:
        """
        Initialize the pre-execution evaluator.

        Args:
            rule_scorer: Rule-based scorer for quantifiable dimensions
            llm_judge: LLM judge for qualitative assessment (optional)
            bt_model: Bradley-Terry reward model (optional)
            calibrator: Probability calibrator for confidence (optional)
        """
        self.rule_scorer = rule_scorer
        self.llm_judge = llm_judge
        self.bt_model = bt_model
        self.calibrator = calibrator

    def evaluate(
        self,
        plan: Any,
        context: Any,
        memory_context: dict[str, Any] | None = None,
        features: np.ndarray | None = None,
    ) -> PlanScore:
        """
        Evaluate a trading plan and return comprehensive score.

        Args:
            plan: TradingPlan object with entry, stop, target, size, conviction
            context: MarketContext with regime, indicators, account info
            memory_context: Optional context from memory retrieval
            features: Optional pre-computed features for BT model (128-dim)

        Returns:
            PlanScore with overall score, dimension scores, confidence, notes
        """
        # Get dimension scores from various sources
        dimension_scores = self._compute_dimension_scores(plan, context, memory_context)

        # Compute weighted aggregate
        weighted_score = self._compute_weighted_score(dimension_scores)

        # Get BT reward if model available
        bt_reward = 0.0
        if self.bt_model is not None and features is not None:
            bt_reward = self._get_bt_reward(features)

        # Blend weighted score with BT reward
        if self.bt_model is not None and features is not None:
            bt_normalized = self._normalize_bt_reward(bt_reward)
            overall_score = (1 - self.BT_BLEND_RATIO) * weighted_score + self.BT_BLEND_RATIO * bt_normalized
        else:
            overall_score = weighted_score

        # Calibrate confidence
        raw_confidence = self._estimate_confidence(dimension_scores, plan, context)
        if self.calibrator is not None:
            calibrated_confidence = self.calibrator.calibrate(raw_confidence)
        else:
            calibrated_confidence = raw_confidence

        # Generate feedback notes
        notes = self._generate_notes(dimension_scores, plan, context)

        # Extract cycle_id from context if available
        cycle_id = getattr(context, "cycle_id", getattr(context, "symbol", "unknown"))

        return PlanScore(
            cycle_id=cycle_id,
            overall_score=round(overall_score, 2),
            dimension_scores=dimension_scores,
            confidence=round(calibrated_confidence, 4),
            notes=notes,
            bt_reward=round(bt_reward, 4),
            weighted_score=round(weighted_score, 2),
        )

    def _compute_dimension_scores(
        self,
        plan: Any,
        context: Any,
        memory_context: dict[str, Any] | None,
    ) -> DimensionScores:
        """Compute scores for each evaluation dimension."""
        # Default scores
        technical_score = 50.0
        rr_score = 50.0
        memory_score = 50.0
        context_score = 50.0
        sizing_score = 50.0

        # Use rule scorer for quantifiable dimensions
        if self.rule_scorer is not None:
            # Risk-reward score
            try:
                entry_price = getattr(plan, "entry_price", 100.0)
                stop_loss = getattr(plan, "stop_loss", 97.0)
                take_profit = getattr(plan, "take_profit", 106.0)

                rr_result = self.rule_scorer.score_risk_reward(
                    entry_price=entry_price,
                    stop_loss=stop_loss,
                    take_profit=take_profit,
                )
                rr_score = rr_result.score
            except (ValueError, AttributeError):
                rr_score = 50.0

            # Sizing score
            try:
                position_notional = getattr(plan, "size", 100) * getattr(plan, "entry_price", 100.0)
                account_equity = getattr(context, "account_equity", 100000.0)
                stop_loss_pct = abs(getattr(plan, "entry_price", 100.0) - getattr(plan, "stop_loss", 97.0)) / getattr(plan, "entry_price", 100.0)
                conviction = getattr(plan, "conviction", 0.5)
                vix = getattr(context, "vix", 20.0)
                vol_regime = "high" if vix > 25 else "normal" if vix > 15 else "low"

                sizing_result = self.rule_scorer.score_sizing(
                    position_notional=position_notional,
                    account_equity=account_equity,
                    stop_loss_pct=max(0.001, stop_loss_pct),
                    conviction_level=conviction,
                    volatility_regime=vol_regime,
                )
                sizing_score = sizing_result.score
            except (ValueError, AttributeError):
                sizing_score = 50.0

        # Technical alignment based on plan direction vs indicators
        technical_score = self._compute_technical_score(plan, context)

        # Memory consistency
        memory_score = self._compute_memory_score(plan, context, memory_context)

        # Context relevance
        context_score = self._compute_context_score(plan, context)

        return DimensionScores(
            technical_alignment=round(technical_score, 2),
            risk_reward_ratio=round(rr_score, 2),
            memory_consistency=round(memory_score, 2),
            context_relevance=round(context_score, 2),
            sizing_appropriate=round(sizing_score, 2),
        )

    def _compute_technical_score(self, plan: Any, context: Any) -> float:
        """Compute technical alignment score based on plan vs indicators."""
        score = 50.0  # Base neutral score

        # Get plan direction
        direction = getattr(plan, "direction", None)
        action = getattr(plan, "action", None)

        is_long = str(direction).upper() == "LONG" or str(action).upper() == "BUY"
        is_short = str(direction).upper() == "SHORT" or str(action).upper() == "SELL"

        # Check RSI alignment
        rsi = getattr(context, "rsi", 50.0)
        if is_long:
            if rsi < 30:  # Oversold - good for long
                score += 20
            elif rsi < 50:
                score += 10
            elif rsi > 70:  # Overbought - bad for long
                score -= 15
        elif is_short:
            if rsi > 70:  # Overbought - good for short
                score += 20
            elif rsi > 50:
                score += 10
            elif rsi < 30:  # Oversold - bad for short
                score -= 15

        # Check trend alignment
        trend_strength = getattr(context, "trend_strength", 0.0)
        if is_long and trend_strength > 0:
            score += 15 * trend_strength
        elif is_short and trend_strength < 0:
            score += 15 * abs(trend_strength)
        elif is_long and trend_strength < -0.3:
            score -= 10
        elif is_short and trend_strength > 0.3:
            score -= 10

        # Regime alignment
        regime = getattr(context, "regime", "UNKNOWN")
        if regime == "BULL_TREND" and is_long:
            score += 10
        elif regime == "BEAR_TREND" and is_short:
            score += 10
        elif regime == "BULL_TREND" and is_short:
            score -= 10
        elif regime == "BEAR_TREND" and is_long:
            score -= 10

        return max(0, min(100, score))

    def _compute_memory_score(
        self,
        plan: Any,
        context: Any,
        memory_context: dict[str, Any] | None,
    ) -> float:
        """Compute memory consistency score."""
        if memory_context is None:
            return 50.0  # Neutral if no memory context

        score = 50.0

        # Check for relevant memory nodes
        relevant_nodes = memory_context.get("relevant_nodes", [])
        if len(relevant_nodes) > 0:
            score += 10  # Bonus for having relevant context

        # Check for similar past trades
        similar_trades = memory_context.get("similar_trades", [])
        if len(similar_trades) > 0:
            # Average outcome of similar trades
            avg_outcome = memory_context.get("avg_outcome", 0.0)
            if avg_outcome > 0:
                score += 20  # Similar trades were profitable
            elif avg_outcome < -0.02:
                score -= 15  # Similar trades lost money

        # Check for regime-specific performance
        regime_performance = memory_context.get("regime_performance", {})
        current_regime = getattr(context, "regime", "UNKNOWN")
        if current_regime in regime_performance:
            perf = regime_performance[current_regime]
            if perf > 0.5:  # Good performance in this regime
                score += 15
            elif perf < 0.3:  # Poor performance in this regime
                score -= 10

        # Check for known failure modes
        failure_modes = memory_context.get("failure_modes", [])
        if len(failure_modes) > 0:
            score -= 5 * len(failure_modes)

        return max(0, min(100, score))

    def _compute_context_score(self, plan: Any, context: Any) -> float:
        """Compute context relevance score."""
        score = 50.0

        # VIX appropriateness
        vix = getattr(context, "vix", 20.0)
        action = str(getattr(plan, "action", "")).upper()

        if vix > 30:
            # High volatility - favor caution
            if action == "HOLD":
                score += 15
            elif action in ["BUY", "SELL"]:
                score -= 10  # Aggressive in high vol
        elif vix < 15:
            # Low volatility - more opportunity
            if action in ["BUY", "SELL"]:
                score += 10

        # Volume ratio
        volume_ratio = getattr(context, "volume_ratio", 1.0)
        if volume_ratio > 2.0:
            # High volume - potentially significant move
            score += 10
        elif volume_ratio < 0.5:
            # Low volume - less conviction
            score -= 5

        # Time horizon appropriateness
        time_horizon = getattr(plan, "time_horizon", "SWING")
        if time_horizon in ["SCALP", "DAY"] and vix > 25:
            score -= 10  # Short-term in high vol
        elif time_horizon == "POSITION" and vix > 30:
            score += 5  # Long-term positioning in high vol

        return max(0, min(100, score))

    def _compute_weighted_score(self, scores: DimensionScores) -> float:
        """Compute weighted aggregate score."""
        return (
            scores.technical_alignment * self.WEIGHT_TECHNICAL
            + scores.risk_reward_ratio * self.WEIGHT_RISK_REWARD
            + scores.memory_consistency * self.WEIGHT_MEMORY
            + scores.context_relevance * self.WEIGHT_CONTEXT
            + scores.sizing_appropriate * self.WEIGHT_SIZING
        )

    def _get_bt_reward(self, features: np.ndarray) -> float:
        """Get Bradley-Terry reward for features."""
        if self.bt_model is None:
            return 0.0

        # Convert to tensor
        if isinstance(features, np.ndarray):
            features_tensor = torch.tensor(features, dtype=torch.float32)
        else:
            features_tensor = features

        # Ensure 2D
        if features_tensor.dim() == 1:
            features_tensor = features_tensor.unsqueeze(0)

        # Get reward
        with torch.no_grad():
            reward = self.bt_model.predict_reward(features_tensor)

        return float(reward.item())

    def _normalize_bt_reward(self, reward: float) -> float:
        """Normalize BT reward to 0-100 scale."""
        # BT rewards are typically in [-2, 2] range
        # Sigmoid to [0, 1], then scale to [0, 100]
        normalized = 1 / (1 + np.exp(-reward))
        return normalized * 100

    def _estimate_confidence(
        self,
        scores: DimensionScores,
        plan: Any,
        context: Any,
    ) -> float:
        """Estimate raw confidence in the score."""
        # Base confidence on score consistency
        score_values = [
            scores.technical_alignment,
            scores.risk_reward_ratio,
            scores.memory_consistency,
            scores.context_relevance,
            scores.sizing_appropriate,
        ]

        # Higher variance = lower confidence
        std = np.std(score_values)
        mean = np.mean(score_values)

        # Start with base confidence
        confidence = 0.5

        # Adjust based on consistency (low std = high confidence)
        if std < 10:
            confidence += 0.2
        elif std < 20:
            confidence += 0.1
        elif std > 30:
            confidence -= 0.1

        # Adjust based on average score (extreme scores = higher confidence)
        if mean > 80 or mean < 20:
            confidence += 0.1
        elif mean > 70 or mean < 30:
            confidence += 0.05

        # Adjust based on conviction in plan
        conviction = getattr(plan, "conviction", 0.5)
        confidence += (conviction - 0.5) * 0.2

        return max(0.1, min(0.95, confidence))

    def _generate_notes(
        self,
        scores: DimensionScores,
        plan: Any,
        context: Any,
    ) -> list[str]:
        """Generate feedback notes for low-scoring dimensions."""
        notes = []

        score_dict = scores.to_dict()
        dimension_names = {
            "technical_alignment": "Technical alignment",
            "risk_reward_ratio": "Risk-reward ratio",
            "memory_consistency": "Memory consistency",
            "context_relevance": "Context relevance",
            "sizing_appropriate": "Position sizing",
        }

        for dim, name in dimension_names.items():
            score = score_dict[dim]
            if score < self.VERY_LOW_SCORE_THRESHOLD:
                notes.append(f"CRITICAL: {name} score ({score:.0f}) is very low - requires review")
            elif score < self.LOW_SCORE_THRESHOLD:
                notes.append(f"WARNING: {name} score ({score:.0f}) is below threshold")

        # Add context-specific notes
        vix = getattr(context, "vix", 20.0)
        if vix > 30:
            notes.append(f"High volatility environment (VIX: {vix:.1f})")

        action = str(getattr(plan, "action", "")).upper()
        regime = getattr(context, "regime", "UNKNOWN")
        if action == "BUY" and regime == "BEAR_TREND":
            notes.append("Long position in bearish regime - contrarian trade")
        elif action == "SELL" and regime == "BULL_TREND":
            notes.append("Short position in bullish regime - contrarian trade")

        return notes

    def evaluate_batch(
        self,
        plans: list[Any],
        contexts: list[Any],
        memory_contexts: list[dict[str, Any] | None] | None = None,
        features_batch: np.ndarray | None = None,
    ) -> list[PlanScore]:
        """
        Evaluate multiple plans in batch.

        Args:
            plans: List of TradingPlan objects
            contexts: List of MarketContext objects (same length as plans)
            memory_contexts: Optional list of memory contexts
            features_batch: Optional (N, 128) array of pre-computed features

        Returns:
            List of PlanScore objects
        """
        results = []

        if memory_contexts is None:
            memory_contexts = [None] * len(plans)

        for i, (plan, context) in enumerate(zip(plans, contexts)):
            memory = memory_contexts[i] if i < len(memory_contexts) else None
            features = features_batch[i] if features_batch is not None else None

            score = self.evaluate(plan, context, memory, features)
            results.append(score)

        return results
