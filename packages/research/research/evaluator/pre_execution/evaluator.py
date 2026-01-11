"""
Pre-Execution Evaluator

Main evaluator class that combines multiple scoring components.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import torch

from .checks import compute_context_score, compute_memory_score, compute_technical_score
from .types import DimensionScores, PlanScore


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
        dimension_scores = self._compute_dimension_scores(plan, context, memory_context)
        weighted_score = self._compute_weighted_score(dimension_scores)

        bt_reward = 0.0
        if self.bt_model is not None and features is not None:
            bt_reward = self._get_bt_reward(features)

        if self.bt_model is not None and features is not None:
            bt_normalized = self._normalize_bt_reward(bt_reward)
            overall_score = (
                1 - self.BT_BLEND_RATIO
            ) * weighted_score + self.BT_BLEND_RATIO * bt_normalized
        else:
            overall_score = weighted_score

        raw_confidence = self._estimate_confidence(dimension_scores, plan, context)
        if self.calibrator is not None:
            calibrated_confidence = self.calibrator.calibrate(raw_confidence)
        else:
            calibrated_confidence = raw_confidence

        notes = self._generate_notes(dimension_scores, plan, context)
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
        rr_score = 50.0
        sizing_score = 50.0

        if self.rule_scorer is not None:
            rr_score = self._compute_risk_reward_score(plan)
            sizing_score = self._compute_sizing_score(plan, context)

        technical_score = compute_technical_score(plan, context)
        memory_score = compute_memory_score(plan, context, memory_context)
        context_score = compute_context_score(plan, context)

        return DimensionScores(
            technical_alignment=round(technical_score, 2),
            risk_reward_ratio=round(rr_score, 2),
            memory_consistency=round(memory_score, 2),
            context_relevance=round(context_score, 2),
            sizing_appropriate=round(sizing_score, 2),
        )

    def _compute_risk_reward_score(self, plan: Any) -> float:
        """Compute risk-reward score using rule scorer."""
        try:
            entry_price = getattr(plan, "entry_price", 100.0)
            stop_loss = getattr(plan, "stop_loss", 97.0)
            take_profit = getattr(plan, "take_profit", 106.0)

            rr_result = self.rule_scorer.score_risk_reward(
                entry_price=entry_price,
                stop_loss=stop_loss,
                take_profit=take_profit,
            )
            return rr_result.score
        except (ValueError, AttributeError):
            return 50.0

    def _compute_sizing_score(self, plan: Any, context: Any) -> float:
        """Compute sizing score using rule scorer."""
        try:
            position_notional = getattr(plan, "size", 100) * getattr(plan, "entry_price", 100.0)
            account_equity = getattr(context, "account_equity", 100000.0)
            stop_loss_pct = abs(
                getattr(plan, "entry_price", 100.0) - getattr(plan, "stop_loss", 97.0)
            ) / getattr(plan, "entry_price", 100.0)
            conviction = getattr(plan, "conviction", 0.5)
            vix = getattr(context, "vix", 20.0)

            if vix > 25:
                vol_regime = "high"
            elif vix > 15:
                vol_regime = "normal"
            else:
                vol_regime = "low"

            sizing_result = self.rule_scorer.score_sizing(
                position_notional=position_notional,
                account_equity=account_equity,
                stop_loss_pct=max(0.001, stop_loss_pct),
                conviction_level=conviction,
                volatility_regime=vol_regime,
            )
            return sizing_result.score
        except (ValueError, AttributeError):
            return 50.0

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

        if isinstance(features, np.ndarray):
            features_tensor = torch.tensor(features, dtype=torch.float32)
        else:
            features_tensor = features

        if features_tensor.dim() == 1:
            features_tensor = features_tensor.unsqueeze(0)

        with torch.no_grad():
            reward = self.bt_model.predict_reward(features_tensor)

        return float(reward.item())

    def _normalize_bt_reward(self, reward: float) -> float:
        """Normalize BT reward to 0-100 scale."""
        normalized = 1 / (1 + np.exp(-reward))
        return normalized * 100

    def _estimate_confidence(
        self,
        scores: DimensionScores,
        plan: Any,
        context: Any,
    ) -> float:
        """Estimate raw confidence in the score."""
        score_values = [
            scores.technical_alignment,
            scores.risk_reward_ratio,
            scores.memory_consistency,
            scores.context_relevance,
            scores.sizing_appropriate,
        ]

        std = np.std(score_values)
        mean = np.mean(score_values)

        confidence = 0.5

        if std < 10:
            confidence += 0.2
        elif std < 20:
            confidence += 0.1
        elif std > 30:
            confidence -= 0.1

        if mean > 80 or mean < 20:
            confidence += 0.1
        elif mean > 70 or mean < 30:
            confidence += 0.05

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

        for i, (plan, context) in enumerate(zip(plans, contexts, strict=False)):
            memory = memory_contexts[i] if i < len(memory_contexts) else None
            features = features_batch[i] if features_batch is not None else None

            score = self.evaluate(plan, context, memory, features)
            results.append(score)

        return results
