"""
Post-Execution Evaluator

Evaluates trade outcomes after execution for learning and performance attribution:
- Execution quality scoring (slippage, fill rate, timing)
- Brinson-style return attribution (market, alpha, timing)
- Outcome scoring for preference learning

See: docs/plans/10-research.md - Post-Execution Integration

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

from dataclasses import dataclass, field
from typing import Any


@dataclass
class MarketData:
    """Market data for attribution analysis."""

    entry_price: float
    """Actual entry price achieved."""

    exit_price: float
    """Actual exit price achieved."""

    entry_vwap: float
    """VWAP at entry time."""

    exit_vwap: float
    """VWAP at exit time."""

    benchmark_return_during_trade: float
    """Benchmark return (e.g., SPY) during trade period."""

    sector_return_during_trade: float = 0.0
    """Sector ETF return during trade period."""

    high_during_trade: float = 0.0
    """High price reached during trade."""

    low_during_trade: float = 0.0
    """Low price reached during trade."""

    avg_volume: float = 0.0
    """Average volume during trade period."""


@dataclass
class TradeOutcome:
    """Outcome of an executed trade."""

    decision_id: str
    """Identifier linking back to the decision."""

    realized_return: float
    """Realized P&L as decimal (0.05 = 5%)."""

    holding_duration_hours: float
    """Duration of position in hours."""

    total_slippage_bps: float
    """Total slippage in basis points."""

    fill_rate: float
    """Percentage of order filled (0.0-1.0)."""

    entry_slippage_bps: float = 0.0
    """Entry slippage in basis points."""

    exit_slippage_bps: float = 0.0
    """Exit slippage in basis points."""

    hit_stop: bool = False
    """Whether stop loss was hit."""

    hit_target: bool = False
    """Whether take profit was hit."""

    beta_exposure: float = 1.0
    """Beta exposure of the position to benchmark."""


@dataclass
class Attribution:
    """Return attribution breakdown."""

    market_contribution: float
    """Return attributable to market/beta exposure."""

    alpha_contribution: float
    """Return attributable to stock selection (alpha)."""

    timing_contribution: float
    """Return attributable to entry/exit timing."""

    sector_contribution: float = 0.0
    """Return attributable to sector allocation."""

    total: float = 0.0
    """Sum of all contributions."""

    residual: float = 0.0
    """Unexplained portion (interaction effects)."""

    def to_dict(self) -> dict[str, float]:
        """Convert to dictionary."""
        return {
            "market_contribution": self.market_contribution,
            "alpha_contribution": self.alpha_contribution,
            "timing_contribution": self.timing_contribution,
            "sector_contribution": self.sector_contribution,
            "total": self.total,
            "residual": self.residual,
        }


@dataclass
class OutcomeScore:
    """Result of post-execution evaluation."""

    decision_id: str
    """Identifier linking back to the decision."""

    plan_score: Any
    """Original pre-execution PlanScore."""

    realized_return: float
    """Realized return from the trade."""

    holding_duration: float
    """Duration of position in hours."""

    execution_quality: float
    """Execution quality score (0-100)."""

    outcome_score: float
    """Overall outcome score (0-100)."""

    attribution: Attribution
    """Return attribution breakdown."""

    execution_details: dict[str, Any] = field(default_factory=dict)
    """Detailed execution metrics."""

    notes: list[str] = field(default_factory=list)
    """Feedback notes."""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "decision_id": self.decision_id,
            "plan_score": self.plan_score.to_dict() if hasattr(self.plan_score, "to_dict") else {},
            "realized_return": self.realized_return,
            "holding_duration": self.holding_duration,
            "execution_quality": self.execution_quality,
            "outcome_score": self.outcome_score,
            "attribution": self.attribution.to_dict(),
            "execution_details": self.execution_details,
            "notes": self.notes,
        }


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

    # Expected slippage baseline (basis points)
    EXPECTED_SLIPPAGE_BPS = 5.0

    # Execution quality weights
    SLIPPAGE_WEIGHT = 0.60
    FILL_WEIGHT = 0.40

    # Outcome score weights
    RETURN_WEIGHT = 0.50
    EXECUTION_WEIGHT = 0.30
    RISK_MGMT_WEIGHT = 0.20

    # Return scaling factor (maps returns to 0-100 score)
    RETURN_SCALE_FACTOR = 20.0  # 5% return = 100 points

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
        # Compute execution quality
        execution_quality = self._compute_execution_quality(outcome)

        # Attribute returns using Brinson-style analysis
        attribution = self._attribute_returns(outcome, market_data)

        # Compute overall outcome score
        outcome_score_value = self._compute_outcome_score(outcome, execution_quality, attribution)

        # Generate execution details
        execution_details = self._compute_execution_details(outcome, market_data)

        # Generate notes
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
        """
        Compute execution quality score (0-100).

        Based on slippage vs. expected and fill rate.
        """
        # Slippage score
        slippage_ratio = outcome.total_slippage_bps / self.expected_slippage_bps

        if slippage_ratio <= 0.5:
            slippage_score = 100.0  # Better than expected
        elif slippage_ratio <= 1.0:
            # Linear interpolation from 100 to 80
            slippage_score = 100.0 - (slippage_ratio - 0.5) * 40.0
        elif slippage_ratio <= 2.0:
            # Linear interpolation from 80 to 50
            slippage_score = 80.0 - (slippage_ratio - 1.0) * 30.0
        else:
            # Beyond 2x expected - poor execution
            slippage_score = max(0.0, 50.0 - (slippage_ratio - 2.0) * 25.0)

        # Fill rate score
        fill_score = outcome.fill_rate * 100.0

        # Weighted combination
        return slippage_score * self.SLIPPAGE_WEIGHT + fill_score * self.FILL_WEIGHT

    def _attribute_returns(
        self,
        outcome: TradeOutcome,
        market_data: MarketData,
    ) -> Attribution:
        """
        Attribute realized returns to market, alpha, and timing.

        Uses Brinson-style attribution adapted for single trades:
        - Market: What would passive beta exposure have returned?
        - Timing: How much did entry/exit timing add or subtract?
        - Alpha: Residual return after market and timing

        Returns:
            Attribution with market, alpha, timing contributions
        """
        # Market contribution: beta-adjusted benchmark return
        market_contribution = market_data.benchmark_return_during_trade * outcome.beta_exposure

        # Sector contribution: excess sector return over benchmark
        sector_excess = (
            market_data.sector_return_during_trade - market_data.benchmark_return_during_trade
        )
        sector_contribution = sector_excess * outcome.beta_exposure

        # Timing contribution: entry/exit timing vs VWAP
        if market_data.entry_vwap > 0 and market_data.entry_price > 0:
            # Positive means we got worse price (for long)
            entry_timing_pct = (
                market_data.entry_price - market_data.entry_vwap
            ) / market_data.entry_vwap
        else:
            entry_timing_pct = 0.0

        if market_data.exit_vwap > 0 and market_data.exit_price > 0:
            # Positive means we got better price (for long exit)
            exit_timing_pct = (
                market_data.exit_price - market_data.exit_vwap
            ) / market_data.exit_vwap
        else:
            exit_timing_pct = 0.0

        # Net timing effect (for long: negative entry timing is good, positive exit timing is good)
        # This is simplified - actual direction should be considered
        timing_contribution = exit_timing_pct - entry_timing_pct

        # Total explained contribution
        explained = market_contribution + sector_contribution + timing_contribution

        # Alpha is the residual
        alpha_contribution = outcome.realized_return - explained

        # Residual (interaction effects, unexplained)
        total = market_contribution + sector_contribution + timing_contribution + alpha_contribution
        residual = outcome.realized_return - total  # Should be ~0

        return Attribution(
            market_contribution=round(market_contribution, 6),
            alpha_contribution=round(alpha_contribution, 6),
            timing_contribution=round(timing_contribution, 6),
            sector_contribution=round(sector_contribution, 6),
            total=round(total, 6),
            residual=round(residual, 6),
        )

    def _compute_outcome_score(
        self,
        outcome: TradeOutcome,
        execution_quality: float,
        attribution: Attribution,
    ) -> float:
        """
        Compute overall outcome score (0-100).

        Components:
        - Return component (50%): Scaled realized return
        - Execution quality (30%): Slippage and fill rate
        - Risk management (20%): Stop/target discipline, duration
        """
        # Return component
        # Scale so that 5% return = 100 points, -5% = 0 points
        return_score = 50.0 + outcome.realized_return * self.RETURN_SCALE_FACTOR * 100.0
        return_score = max(0.0, min(100.0, return_score))

        # Execution quality already computed

        # Risk management score
        risk_mgmt_score = self._compute_risk_management_score(outcome)

        # Weighted combination
        return (
            return_score * self.RETURN_WEIGHT
            + execution_quality * self.EXECUTION_WEIGHT
            + risk_mgmt_score * self.RISK_MGMT_WEIGHT
        )

    def _compute_risk_management_score(self, outcome: TradeOutcome) -> float:
        """Compute risk management score based on stop/target discipline."""
        score = 50.0  # Base score

        # Bonus for hitting target (disciplined exit)
        if outcome.hit_target:
            score += 25.0

        # Neutral for stop hit (risk managed as planned)
        if outcome.hit_stop:
            score += 10.0  # Small bonus for honoring stop

        # Penalty for neither (might indicate undisciplined exit)
        if not outcome.hit_target and not outcome.hit_stop:
            if outcome.realized_return > 0:
                # Profitable exit without target - acceptable
                score += 10.0
            else:
                # Loss without hitting stop - concerning
                score -= 10.0

        # Duration appropriateness (very rough heuristic)
        if outcome.holding_duration_hours < 1:
            # Very short - might indicate panic exit
            score -= 5.0
        elif outcome.holding_duration_hours > 24 * 7:
            # Very long - might indicate conviction but also hanging on
            pass  # Neutral

        return max(0.0, min(100.0, score))

    def _compute_execution_details(
        self,
        outcome: TradeOutcome,
        market_data: MarketData,
    ) -> dict[str, Any]:
        """Compute detailed execution metrics."""
        return {
            "entry_slippage_bps": outcome.entry_slippage_bps,
            "exit_slippage_bps": outcome.exit_slippage_bps,
            "total_slippage_bps": outcome.total_slippage_bps,
            "fill_rate": outcome.fill_rate,
            "entry_vs_vwap_pct": (
                (market_data.entry_price - market_data.entry_vwap) / market_data.entry_vwap
                if market_data.entry_vwap > 0
                else 0.0
            ),
            "exit_vs_vwap_pct": (
                (market_data.exit_price - market_data.exit_vwap) / market_data.exit_vwap
                if market_data.exit_vwap > 0
                else 0.0
            ),
            "benchmark_return": market_data.benchmark_return_during_trade,
            "beta_exposure": outcome.beta_exposure,
            "hit_stop": outcome.hit_stop,
            "hit_target": outcome.hit_target,
        }

    def _generate_notes(
        self,
        outcome: TradeOutcome,
        execution_quality: float,
        attribution: Attribution,
        plan_score: Any,
    ) -> list[str]:
        """Generate feedback notes for the outcome."""
        notes = []

        # Return notes
        if outcome.realized_return > 0.05:
            notes.append(f"Strong positive return ({outcome.realized_return:.2%})")
        elif outcome.realized_return < -0.05:
            notes.append(f"Significant loss ({outcome.realized_return:.2%})")

        # Execution quality notes
        if execution_quality < 50:
            notes.append(f"Poor execution quality ({execution_quality:.0f}/100)")
        elif execution_quality > 90:
            notes.append("Excellent execution quality")

        # Slippage notes
        if outcome.total_slippage_bps > self.expected_slippage_bps * 2:
            notes.append(
                f"High slippage ({outcome.total_slippage_bps:.1f} bps vs {self.expected_slippage_bps:.1f} expected)"
            )

        # Attribution notes
        if attribution.alpha_contribution > 0.02:
            notes.append(f"Positive alpha contribution ({attribution.alpha_contribution:.2%})")
        elif attribution.alpha_contribution < -0.02:
            notes.append(
                f"Negative alpha ({attribution.alpha_contribution:.2%}) - review selection"
            )

        if abs(attribution.timing_contribution) > 0.01:
            direction = "positive" if attribution.timing_contribution > 0 else "negative"
            notes.append(
                f"Significant {direction} timing contribution ({attribution.timing_contribution:.2%})"
            )

        # Risk management notes
        if outcome.hit_target:
            notes.append("Target hit - disciplined exit")
        elif outcome.hit_stop:
            notes.append("Stop hit - risk managed as planned")
        elif outcome.realized_return < 0:
            notes.append("Loss without stop hit - review exit discipline")

        # Compare to pre-execution expectation
        if plan_score is not None:
            pre_score = getattr(plan_score, "overall_score", 50)
            if pre_score > 70 and outcome.realized_return < 0:
                notes.append("High pre-score but negative outcome - review scoring model")
            elif pre_score < 30 and outcome.realized_return > 0.03:
                notes.append(
                    "Low pre-score but positive outcome - potential model improvement opportunity"
                )

        return notes

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
        if not outcome_scores:
            return {}

        returns = [s.realized_return for s in outcome_scores]
        execution_qualities = [s.execution_quality for s in outcome_scores]
        outcome_scores_values = [s.outcome_score for s in outcome_scores]

        alphas = [s.attribution.alpha_contribution for s in outcome_scores]
        timings = [s.attribution.timing_contribution for s in outcome_scores]

        import numpy as np

        return {
            "count": len(outcome_scores),
            "avg_return": float(np.mean(returns)),
            "total_return": float(np.sum(returns)),
            "std_return": float(np.std(returns)),
            "win_rate": float(np.mean([1 if r > 0 else 0 for r in returns])),
            "avg_execution_quality": float(np.mean(execution_qualities)),
            "avg_outcome_score": float(np.mean(outcome_scores_values)),
            "total_alpha": float(np.sum(alphas)),
            "avg_alpha": float(np.mean(alphas)),
            "total_timing": float(np.sum(timings)),
            "avg_timing": float(np.mean(timings)),
            "sharpe_ratio": float(np.mean(returns) / np.std(returns))
            if np.std(returns) > 0
            else 0.0,
        }
