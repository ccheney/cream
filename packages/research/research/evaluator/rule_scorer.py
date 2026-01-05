"""
Rule-Based Evaluator Scorer

Deterministic scoring for quantifiable dimensions of trading plans:
- Risk-reward ratio evaluation
- Position sizing appropriateness

Scoring is on a 0-100 scale where:
- 90-100: Excellent
- 70-89: Good
- 50-69: Acceptable
- 30-49: Poor
- 0-29: Unacceptable

Example:
    from research.evaluator import RuleBasedScorer

    scorer = RuleBasedScorer()

    # Score risk-reward ratio
    rr_score = scorer.score_risk_reward(
        entry_price=150.0,
        stop_loss=145.0,
        take_profit=165.0,
    )
    print(f"Risk-Reward Score: {rr_score.score}")

    # Score position sizing
    sizing_score = scorer.score_sizing(
        position_notional=10000.0,
        account_equity=100000.0,
        stop_loss_pct=0.03,  # 3% stop
        conviction_level=0.7,  # High conviction
        volatility_regime="normal",
    )
    print(f"Sizing Score: {sizing_score.score}")
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal


class ConvictionLevel(Enum):
    """Conviction level categories for position sizing."""

    SPECULATIVE = "speculative"  # 0.0 - 0.4
    STANDARD = "standard"  # 0.4 - 0.7
    HIGH = "high"  # 0.7 - 1.0


class VolatilityRegime(Enum):
    """Market volatility regime."""

    LOW = "low"  # VIX < 15
    NORMAL = "normal"  # VIX 15-25
    HIGH = "high"  # VIX > 25


@dataclass
class ScoringResult:
    """Result of a scoring operation."""

    score: float
    """Score on 0-100 scale"""

    grade: str
    """Letter grade (A, B, C, D, F)"""

    components: dict[str, float]
    """Breakdown of score components"""

    feedback: str
    """Human-readable feedback"""

    @staticmethod
    def from_score(score: float, components: dict[str, float], feedback: str) -> ScoringResult:
        """Create ScoringResult from a score value."""
        grade = ScoringResult._score_to_grade(score)
        return ScoringResult(
            score=round(score, 2),
            grade=grade,
            components=components,
            feedback=feedback,
        )

    @staticmethod
    def _score_to_grade(score: float) -> str:
        """Convert numeric score to letter grade."""
        if score >= 90:
            return "A"
        if score >= 80:
            return "B"
        if score >= 70:
            return "C"
        if score >= 60:
            return "D"
        return "F"


class RuleBasedScorer:
    """
    Rule-based scorer for trading plan evaluation.

    Provides deterministic scoring for quantifiable dimensions:
    - Risk-reward ratio
    - Position sizing appropriateness

    All scores are on a 0-100 scale.
    """

    # Risk-reward scoring thresholds
    RR_EXCELLENT = 3.0  # 100 points
    RR_GOOD = 2.5  # 85 points
    RR_ACCEPTABLE = 2.0  # 70 points
    RR_POOR = 1.5  # 50 points
    RR_MINIMUM = 1.0  # 30 points

    # Position sizing risk percentages by conviction
    IDEAL_RISK_SPECULATIVE = 0.005  # 0.5% of account
    IDEAL_RISK_STANDARD = 0.01  # 1.0% of account
    IDEAL_RISK_HIGH = 0.02  # 2.0% of account

    # Volatility adjustment
    HIGH_VOL_REDUCTION = 0.5  # Reduce ideal risk by 50% in high vol

    def __init__(self) -> None:
        """Initialize the rule-based scorer."""
        pass

    def score_risk_reward(
        self,
        entry_price: float,
        stop_loss: float,
        take_profit: float,
    ) -> ScoringResult:
        """
        Score the risk-reward ratio of a trade.

        Scoring curve:
        - RR >= 3.0: 100 points
        - RR 2.5-3.0: 85-100 points (linear interpolation)
        - RR 2.0-2.5: 70-85 points
        - RR 1.5-2.0: 50-70 points
        - RR 1.0-1.5: 30-50 points
        - RR < 1.0: 0-30 points (linear from 0 at RR=0)

        Args:
            entry_price: Trade entry price
            stop_loss: Stop loss price
            take_profit: Take profit price

        Returns:
            ScoringResult with risk-reward score

        Raises:
            ValueError: If prices are invalid
        """
        # Validate inputs
        if entry_price <= 0 or stop_loss <= 0 or take_profit <= 0:
            raise ValueError("All prices must be positive")

        # Calculate risk and reward
        risk = abs(entry_price - stop_loss)
        reward = abs(take_profit - entry_price)

        if risk == 0:
            raise ValueError("Risk cannot be zero (stop_loss equals entry_price)")

        # Calculate risk-reward ratio
        rr_ratio = reward / risk

        # Score based on RR ratio
        score = self._calculate_rr_score(rr_ratio)

        # Generate feedback
        feedback = self._generate_rr_feedback(rr_ratio, score)

        return ScoringResult.from_score(
            score=score,
            components={
                "risk_reward_ratio": round(rr_ratio, 2),
                "risk_amount": round(risk, 2),
                "reward_amount": round(reward, 2),
            },
            feedback=feedback,
        )

    def _calculate_rr_score(self, rr_ratio: float) -> float:
        """Calculate score from risk-reward ratio using calibrated curve."""
        if rr_ratio >= self.RR_EXCELLENT:
            return 100.0
        if rr_ratio >= self.RR_GOOD:
            # Linear interpolation 85-100
            return self._interpolate(rr_ratio, self.RR_GOOD, self.RR_EXCELLENT, 85, 100)
        if rr_ratio >= self.RR_ACCEPTABLE:
            # Linear interpolation 70-85
            return self._interpolate(rr_ratio, self.RR_ACCEPTABLE, self.RR_GOOD, 70, 85)
        if rr_ratio >= self.RR_POOR:
            # Linear interpolation 50-70
            return self._interpolate(rr_ratio, self.RR_POOR, self.RR_ACCEPTABLE, 50, 70)
        if rr_ratio >= self.RR_MINIMUM:
            # Linear interpolation 30-50
            return self._interpolate(rr_ratio, self.RR_MINIMUM, self.RR_POOR, 30, 50)
        # Below minimum: 0-30 linear from 0 at RR=0
        return self._interpolate(rr_ratio, 0, self.RR_MINIMUM, 0, 30)

    def _generate_rr_feedback(self, rr_ratio: float, score: float) -> str:
        """Generate feedback for risk-reward score."""
        if score >= 90:
            return f"Excellent risk-reward ratio of {rr_ratio:.2f}:1. Target offers substantial reward relative to risk."
        if score >= 70:
            return f"Good risk-reward ratio of {rr_ratio:.2f}:1. Acceptable but consider if targets can be improved."
        if score >= 50:
            return f"Marginal risk-reward ratio of {rr_ratio:.2f}:1. Consider tighter stop or wider target."
        if score >= 30:
            return f"Poor risk-reward ratio of {rr_ratio:.2f}:1. Risk may not justify potential reward."
        return f"Unacceptable risk-reward ratio of {rr_ratio:.2f}:1. Reward does not compensate for risk taken."

    def score_sizing(
        self,
        position_notional: float,
        account_equity: float,
        stop_loss_pct: float,
        conviction_level: float,
        volatility_regime: Literal["low", "normal", "high"] = "normal",
    ) -> ScoringResult:
        """
        Score the position sizing appropriateness.

        Scoring considers:
        - Conviction level (speculative: 0.5%, standard: 1%, high: 2% ideal risk)
        - Volatility regime adjustment (high vol reduces ideal by 50%)
        - Deviation from ideal risk percentage

        Args:
            position_notional: Total position value in dollars
            account_equity: Total account equity in dollars
            stop_loss_pct: Stop loss as percentage (e.g., 0.03 for 3%)
            conviction_level: Conviction score 0.0-1.0
            volatility_regime: Current volatility regime

        Returns:
            ScoringResult with sizing score

        Raises:
            ValueError: If inputs are invalid
        """
        # Validate inputs
        if position_notional <= 0:
            raise ValueError("Position notional must be positive")
        if account_equity <= 0:
            raise ValueError("Account equity must be positive")
        if stop_loss_pct <= 0 or stop_loss_pct > 1:
            raise ValueError("Stop loss percentage must be between 0 and 1 (exclusive)")
        if conviction_level < 0 or conviction_level > 1:
            raise ValueError("Conviction level must be between 0 and 1")

        # Calculate actual risk percentage
        position_risk = position_notional * stop_loss_pct
        actual_risk_pct = position_risk / account_equity

        # Determine ideal risk based on conviction
        conviction_category = self._categorize_conviction(conviction_level)
        base_ideal_risk = self._get_ideal_risk(conviction_category)

        # Adjust for volatility regime
        vol_regime = VolatilityRegime(volatility_regime)
        if vol_regime == VolatilityRegime.HIGH:
            ideal_risk = base_ideal_risk * self.HIGH_VOL_REDUCTION
        else:
            ideal_risk = base_ideal_risk

        # Score based on deviation from ideal
        score = self._calculate_sizing_score(actual_risk_pct, ideal_risk)

        # Generate feedback
        feedback = self._generate_sizing_feedback(
            actual_risk_pct, ideal_risk, conviction_category, vol_regime, score
        )

        return ScoringResult.from_score(
            score=score,
            components={
                "actual_risk_pct": round(actual_risk_pct * 100, 2),
                "ideal_risk_pct": round(ideal_risk * 100, 2),
                "position_risk_dollars": round(position_risk, 2),
                "conviction_level": round(conviction_level, 2),
                "conviction_category": conviction_category.value,
                "volatility_regime": vol_regime.value,
            },
            feedback=feedback,
        )

    def _categorize_conviction(self, conviction_level: float) -> ConvictionLevel:
        """Categorize conviction level into buckets."""
        if conviction_level >= 0.7:
            return ConvictionLevel.HIGH
        if conviction_level >= 0.4:
            return ConvictionLevel.STANDARD
        return ConvictionLevel.SPECULATIVE

    def _get_ideal_risk(self, conviction: ConvictionLevel) -> float:
        """Get ideal risk percentage for conviction level."""
        if conviction == ConvictionLevel.HIGH:
            return self.IDEAL_RISK_HIGH
        if conviction == ConvictionLevel.STANDARD:
            return self.IDEAL_RISK_STANDARD
        return self.IDEAL_RISK_SPECULATIVE

    def _calculate_sizing_score(self, actual_risk: float, ideal_risk: float) -> float:
        """
        Calculate sizing score based on deviation from ideal.

        Perfect score (100) at ideal risk.
        Score decreases as you deviate above or below ideal.
        - Within 20% of ideal: 90-100
        - Within 50% of ideal: 70-90
        - Within 100% of ideal: 50-70
        - Beyond 100%: 0-50 (scaled by deviation)
        """
        if ideal_risk == 0:
            return 0.0

        # Calculate percentage deviation from ideal
        deviation_pct = abs(actual_risk - ideal_risk) / ideal_risk

        if deviation_pct <= 0.2:
            # Within 20%: 90-100
            return self._interpolate(deviation_pct, 0, 0.2, 100, 90)
        if deviation_pct <= 0.5:
            # Within 50%: 70-90
            return self._interpolate(deviation_pct, 0.2, 0.5, 90, 70)
        if deviation_pct <= 1.0:
            # Within 100%: 50-70
            return self._interpolate(deviation_pct, 0.5, 1.0, 70, 50)
        # Beyond 100%: score decreases towards 0
        # At 200% deviation, score is 0
        score = self._interpolate(deviation_pct, 1.0, 2.0, 50, 0)
        return max(0, score)

    def _generate_sizing_feedback(
        self,
        actual_risk: float,
        ideal_risk: float,
        conviction: ConvictionLevel,
        vol_regime: VolatilityRegime,
        score: float,
    ) -> str:
        """Generate feedback for sizing score."""
        actual_pct = actual_risk * 100
        ideal_pct = ideal_risk * 100

        vol_note = ""
        if vol_regime == VolatilityRegime.HIGH:
            vol_note = " (reduced for high volatility)"

        if score >= 90:
            return f"Excellent position sizing. Risk {actual_pct:.2f}% is close to ideal {ideal_pct:.2f}% for {conviction.value} conviction{vol_note}."
        if score >= 70:
            direction = "oversized" if actual_risk > ideal_risk else "undersized"
            return f"Good position sizing. Slightly {direction}: {actual_pct:.2f}% vs ideal {ideal_pct:.2f}%{vol_note}."
        if score >= 50:
            direction = "oversized" if actual_risk > ideal_risk else "undersized"
            return f"Position is {direction}: {actual_pct:.2f}% risk vs ideal {ideal_pct:.2f}%. Consider adjusting{vol_note}."
        direction = "excessive" if actual_risk > ideal_risk else "insufficient"
        return f"Position sizing is {direction}: {actual_pct:.2f}% risk vs ideal {ideal_pct:.2f}%. Requires adjustment{vol_note}."

    @staticmethod
    def _interpolate(
        value: float,
        in_min: float,
        in_max: float,
        out_min: float,
        out_max: float,
    ) -> float:
        """Linear interpolation between two ranges."""
        if in_max == in_min:
            return out_min
        ratio = (value - in_min) / (in_max - in_min)
        return out_min + ratio * (out_max - out_min)

    def score_combined(
        self,
        entry_price: float,
        stop_loss: float,
        take_profit: float,
        position_notional: float,
        account_equity: float,
        conviction_level: float,
        volatility_regime: Literal["low", "normal", "high"] = "normal",
    ) -> ScoringResult:
        """
        Calculate combined score from risk-reward and sizing.

        Weights:
        - Risk-reward: 60%
        - Sizing: 40%

        Args:
            entry_price: Trade entry price
            stop_loss: Stop loss price
            take_profit: Take profit price
            position_notional: Total position value in dollars
            account_equity: Total account equity in dollars
            conviction_level: Conviction score 0.0-1.0
            volatility_regime: Current volatility regime

        Returns:
            ScoringResult with combined score
        """
        # Calculate stop loss percentage from prices
        stop_loss_pct = abs(entry_price - stop_loss) / entry_price

        # Get individual scores
        rr_result = self.score_risk_reward(entry_price, stop_loss, take_profit)
        sizing_result = self.score_sizing(
            position_notional, account_equity, stop_loss_pct, conviction_level, volatility_regime
        )

        # Weighted combination
        combined_score = (rr_result.score * 0.6) + (sizing_result.score * 0.4)

        return ScoringResult.from_score(
            score=combined_score,
            components={
                "risk_reward_score": rr_result.score,
                "risk_reward_weight": 0.6,
                "sizing_score": sizing_result.score,
                "sizing_weight": 0.4,
                **rr_result.components,
                **sizing_result.components,
            },
            feedback=f"Combined evaluation: {rr_result.feedback} {sizing_result.feedback}",
        )
