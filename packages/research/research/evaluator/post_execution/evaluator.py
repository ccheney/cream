"""
Post-Execution Evaluator

Main evaluator class for post-execution analysis:
- Execution quality scoring (slippage, fill rate, timing)
- Brinson-style return attribution (market, alpha, timing)
- Outcome scoring for preference learning

Example:
    from research.evaluator import PostExecutionEvaluator, TradeOutcome, MarketData

    evaluator = PostExecutionEvaluator()

    outcome_score = evaluator.evaluate(
        plan_score=pre_execution_score,
        outcome=trade_outcome,
        market_data=market_data,
    )
    print(f"Outcome Score: {outcome_score.outcome_score}")
    print(f"Alpha: {outcome_score.attribution['alpha_contribution']}")
"""

from __future__ import annotations

from typing import Any

from .metrics import (
    attribute_returns,
    compute_aggregate_metrics,
    compute_execution_details,
    compute_execution_quality,
    compute_outcome_score,
    generate_notes,
)
from .types import MarketData, OutcomeScore, TradeOutcome


class PostExecutionEvaluator:
    """
    Evaluate trade outcomes after execution.

    Provides:
    - Execution quality scoring (slippage, fill rate, timing)
    - Brinson-style return attribution (market, alpha, timing)
    - Overall outcome scoring for preference learning

    Execution Quality Components (100 total):
    - Slippage score: 60% (actual vs expected slippage)
    - Fill rate score: 40%

    Outcome Score Components (100 total):
    - Return component: 50% (scaled by expected risk)
    - Execution quality: 30%
    - Risk management: 20% (stop/target hit, duration)
    """

    EXPECTED_SLIPPAGE_BPS = 5.0

    SLIPPAGE_WEIGHT = 0.60
    FILL_WEIGHT = 0.40

    RETURN_WEIGHT = 0.50
    EXECUTION_WEIGHT = 0.30
    RISK_MGMT_WEIGHT = 0.20

    RETURN_SCALE_FACTOR = 20.0

    def __init__(self, expected_slippage_bps: float = 5.0) -> None:
        """
        Initialize the post-execution evaluator.

        Args:
            expected_slippage_bps: Expected baseline slippage in basis points
        """
        self.expected_slippage_bps = expected_slippage_bps

    def evaluate(
        self,
        plan_score: Any,
        outcome: TradeOutcome,
        market_data: MarketData,
    ) -> OutcomeScore:
        """
        Evaluate realized outcome and attribute performance.

        Args:
            plan_score: PlanScore from pre-execution evaluation
            outcome: TradeOutcome with realized metrics
            market_data: Market data for attribution analysis

        Returns:
            OutcomeScore with execution quality, attribution, overall score
        """
        execution_quality = self._compute_execution_quality(outcome)
        attribution = self._attribute_returns(outcome, market_data)
        outcome_score_value = self._compute_outcome_score(outcome, execution_quality, attribution)
        execution_details = self._compute_execution_details(outcome, market_data)
        notes = self._generate_notes(outcome, execution_quality, attribution, plan_score)

        return OutcomeScore(
            decision_id=outcome.decision_id,
            plan_score=plan_score,
            realized_return=outcome.realized_return,
            holding_duration=outcome.holding_duration_hours,
            execution_quality=round(execution_quality, 2),
            outcome_score=round(outcome_score_value, 2),
            attribution=attribution,
            execution_details=execution_details,
            notes=notes,
        )

    def _compute_execution_quality(self, outcome: TradeOutcome) -> float:
        """Compute execution quality score (0-100)."""
        return compute_execution_quality(
            outcome,
            self.expected_slippage_bps,
            self.SLIPPAGE_WEIGHT,
            self.FILL_WEIGHT,
        )

    def _attribute_returns(self, outcome: TradeOutcome, market_data: MarketData):
        """Attribute realized returns to market, alpha, and timing."""
        return attribute_returns(outcome, market_data)

    def _compute_outcome_score(
        self,
        outcome: TradeOutcome,
        execution_quality: float,
        attribution: Any,
    ) -> float:
        """Compute overall outcome score (0-100)."""
        return compute_outcome_score(
            outcome,
            execution_quality,
            self.RETURN_WEIGHT,
            self.EXECUTION_WEIGHT,
            self.RISK_MGMT_WEIGHT,
            self.RETURN_SCALE_FACTOR,
        )

    def _compute_risk_management_score(self, outcome: TradeOutcome) -> float:
        """Compute risk management score based on stop/target discipline."""
        from .metrics import compute_risk_management_score

        return compute_risk_management_score(outcome)

    def _compute_execution_details(
        self,
        outcome: TradeOutcome,
        market_data: MarketData,
    ) -> dict[str, Any]:
        """Compute detailed execution metrics."""
        return compute_execution_details(outcome, market_data)

    def _generate_notes(
        self,
        outcome: TradeOutcome,
        execution_quality: float,
        attribution: Any,
        plan_score: Any,
    ) -> list[str]:
        """Generate feedback notes for the outcome."""
        return generate_notes(
            outcome,
            execution_quality,
            attribution,
            plan_score,
            self.expected_slippage_bps,
        )

    def evaluate_batch(
        self,
        plan_scores: list[Any],
        outcomes: list[TradeOutcome],
        market_data_list: list[MarketData],
    ) -> list[OutcomeScore]:
        """
        Evaluate multiple outcomes in batch.

        Args:
            plan_scores: List of PlanScore objects
            outcomes: List of TradeOutcome objects
            market_data_list: List of MarketData objects

        Returns:
            List of OutcomeScore objects
        """
        return [
            self.evaluate(plan_score, outcome, market_data)
            for plan_score, outcome, market_data in zip(
                plan_scores, outcomes, market_data_list, strict=False
            )
        ]

    def compute_aggregate_metrics(
        self,
        outcome_scores: list[OutcomeScore],
    ) -> dict[str, Any]:
        """
        Compute aggregate metrics across multiple outcomes.

        Args:
            outcome_scores: List of OutcomeScore objects

        Returns:
            Dictionary with aggregate metrics
        """
        return compute_aggregate_metrics(outcome_scores)
