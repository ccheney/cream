"""
Plan Scorer for Synthetic Preference Generation

Rule-based and outcome-based scoring for trading plans used in
preference pair generation. Scores are on a 0-100 scale.

Scoring dimensions:
- Risk-reward ratio
- Trend alignment
- RSI timing
- Volatility fit
- Conviction-size match
- Outcome-based (for counterfactual analysis)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from research.evaluator.preference_types import Action, Direction, TradingPlan

if TYPE_CHECKING:
    from research.evaluator.preference_types import MarketContext, TradeOutcome


class PlanScorer:
    """
    Scores trading plans using rule-based and outcome-based metrics.

    All scores are on a 0-100 scale.

    Attributes:
        WEIGHT_RISK_REWARD: Weight for risk-reward component (0.30)
        WEIGHT_TREND_ALIGNMENT: Weight for trend alignment (0.25)
        WEIGHT_RSI_TIMING: Weight for RSI timing (0.15)
        WEIGHT_VOLATILITY_FIT: Weight for volatility appropriateness (0.15)
        WEIGHT_CONVICTION_SIZE: Weight for conviction-size match (0.15)
    """

    WEIGHT_RISK_REWARD = 0.30
    WEIGHT_TREND_ALIGNMENT = 0.25
    WEIGHT_RSI_TIMING = 0.15
    WEIGHT_VOLATILITY_FIT = 0.15
    WEIGHT_CONVICTION_SIZE = 0.15

    def rule_based_score(self, plan: TradingPlan, context: MarketContext) -> float:
        """
        Score a plan using rule-based metrics.

        Args:
            plan: Trading plan to score
            context: Market context for evaluation

        Returns:
            Score on 0-100 scale
        """
        rr_score = self._score_risk_reward(plan)
        trend_score = self._score_trend_alignment(plan, context)
        rsi_score = self._score_rsi_timing(plan, context)
        vol_score = self._score_volatility_fit(plan, context)
        size_score = self._score_conviction_size(plan, context)

        total = (
            rr_score * self.WEIGHT_RISK_REWARD
            + trend_score * self.WEIGHT_TREND_ALIGNMENT
            + rsi_score * self.WEIGHT_RSI_TIMING
            + vol_score * self.WEIGHT_VOLATILITY_FIT
            + size_score * self.WEIGHT_CONVICTION_SIZE
        )

        return round(total, 2)

    def outcome_based_score(
        self,
        plan: TradingPlan,
        outcome: TradeOutcome,
        context: MarketContext,
    ) -> float:
        """
        Score a plan based on its actual or estimated outcome.

        Args:
            plan: Trading plan that was executed
            outcome: Trade outcome (actual or estimated)
            context: Market context at execution time

        Returns:
            Score on 0-100 scale
        """
        score = 50.0

        score += outcome.realized_pnl * 200.0

        if plan.risk_percent > 0:
            risk_adjusted_return = outcome.realized_pnl / plan.risk_percent
            if risk_adjusted_return > 2.0:
                score += 10.0
            elif risk_adjusted_return > 1.0:
                score += 5.0
            elif risk_adjusted_return < -1.0:
                score -= 10.0

        if outcome.slippage < 0.001:
            score += 5.0
        elif outcome.slippage > 0.005:
            score -= 5.0

        if outcome.fill_rate >= 0.99:
            score += 3.0
        elif outcome.fill_rate < 0.9:
            score -= 5.0

        if outcome.hit_target:
            score += 10.0
        if outcome.hit_stop:
            score -= 5.0

        return max(0.0, min(100.0, score))

    def _score_risk_reward(self, plan: TradingPlan) -> float:
        """Score risk-reward ratio (0-100)."""
        rr = plan.risk_reward_ratio
        if rr >= 3.0:
            return 100.0
        if rr >= 2.0:
            return 70.0 + (rr - 2.0) * 30.0
        if rr >= 1.0:
            return 40.0 + (rr - 1.0) * 30.0
        return max(0.0, rr * 40.0)

    def _score_trend_alignment(self, plan: TradingPlan, context: MarketContext) -> float:
        """Score alignment with market trend (0-100)."""
        if plan.action == Action.HOLD:
            return 50.0
        if plan.direction == Direction.LONG and context.trend_strength > 0:
            return 50.0 + context.trend_strength * 50.0
        if plan.direction == Direction.SHORT and context.trend_strength < 0:
            return 50.0 - context.trend_strength * 50.0
        if plan.direction == Direction.FLAT:
            return 50.0
        return max(0.0, 50.0 - abs(context.trend_strength) * 50.0)

    def _score_rsi_timing(self, plan: TradingPlan, context: MarketContext) -> float:
        """Score RSI timing (0-100)."""
        if plan.action == Action.BUY:
            if context.rsi < 30:
                return 100.0
            if context.rsi < 50:
                return 70.0
            if context.rsi > 70:
                return 20.0
            return 50.0

        if plan.action == Action.SELL:
            if context.rsi > 70:
                return 100.0
            if context.rsi > 50:
                return 70.0
            if context.rsi < 30:
                return 20.0
            return 50.0

        return 50.0

    def _score_volatility_fit(self, plan: TradingPlan, context: MarketContext) -> float:
        """Score volatility appropriateness (0-100)."""
        stop_distance_atr = plan.risk_percent / context.atr_pct if context.atr_pct > 0 else 1.0

        if context.vix > 25:
            return self._score_high_vol_stop(stop_distance_atr)
        if context.vix < 15:
            return self._score_low_vol_stop(stop_distance_atr)
        return self._score_normal_vol_stop(stop_distance_atr)

    def _score_high_vol_stop(self, stop_atr: float) -> float:
        """Score stop distance for high volatility (0-100)."""
        if 0.5 <= stop_atr <= 1.5:
            return 100.0
        if stop_atr < 0.5:
            return 60.0
        return max(0.0, 80.0 - (stop_atr - 1.5) * 20.0)

    def _score_low_vol_stop(self, stop_atr: float) -> float:
        """Score stop distance for low volatility (0-100)."""
        if 1.5 <= stop_atr <= 3.0:
            return 100.0
        if stop_atr < 1.0:
            return 50.0
        return max(0.0, 80.0 - (stop_atr - 3.0) * 15.0)

    def _score_normal_vol_stop(self, stop_atr: float) -> float:
        """Score stop distance for normal volatility (0-100)."""
        if 1.0 <= stop_atr <= 2.0:
            return 100.0
        deviation = abs(stop_atr - 1.5)
        return max(0.0, 100.0 - deviation * 30.0)

    def _score_conviction_size(self, plan: TradingPlan, context: MarketContext) -> float:
        """Score conviction-size match (0-100)."""
        if plan.entry_price <= 0 or context.account_equity <= 0:
            return 50.0

        position_value = plan.size * plan.entry_price
        risk_at_stop = position_value * plan.risk_percent
        implied_risk_pct = risk_at_stop / context.account_equity

        if plan.conviction >= 0.7:
            expected_risk = 0.02
        elif plan.conviction >= 0.4:
            expected_risk = 0.01
        else:
            expected_risk = 0.005

        if expected_risk == 0:
            return 50.0

        deviation_pct = abs(implied_risk_pct - expected_risk) / expected_risk

        if deviation_pct <= 0.2:
            return 100.0
        if deviation_pct <= 0.5:
            return 80.0 - (deviation_pct - 0.2) * 100.0
        return max(0.0, 50.0 - (deviation_pct - 0.5) * 50.0)


__all__ = [
    "PlanScorer",
]
