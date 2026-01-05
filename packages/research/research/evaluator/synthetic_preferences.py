"""
Synthetic Preference Generator for Evaluator Training

Implements West-of-N approach and counterfactual analysis to generate
synthetic preference pairs for training the Bradley-Terry reward model.

See: docs/plans/10-research.md - Training Data for Evaluator (Synthetic Preference Pairs)

Example:
    from research.evaluator.synthetic_preferences import SyntheticPreferenceGenerator

    generator = SyntheticPreferenceGenerator()

    # West-of-N: Generate preference pair from context
    context = MarketContext(symbol="AAPL", regime="BULL_TREND", vix=18.5, ...)
    pair = generator.generate_preference_pair(context, n_candidates=8)
    print(f"Chosen score: {pair.chosen_score}, Rejected score: {pair.rejected_score}")

    # Counterfactual: Generate from actual trade outcome
    actual_plan = TradingPlan(action="BUY", entry=150.0, stop=145.0, target=165.0, ...)
    actual_outcome = TradeOutcome(pnl=0.05, slippage=0.001, filled=True, ...)
    pairs = generator.generate_from_counterfactuals(actual_plan, actual_outcome)
"""

from __future__ import annotations

import random
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import numpy as np
from numpy.random import Generator, PCG64


class Action(Enum):
    """Trading action types."""

    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"
    CLOSE = "CLOSE"


class Direction(Enum):
    """Position direction."""

    LONG = "LONG"
    SHORT = "SHORT"
    FLAT = "FLAT"


class SizeUnit(Enum):
    """Position size units."""

    SHARES = "SHARES"
    CONTRACTS = "CONTRACTS"
    DOLLARS = "DOLLARS"
    PCT_EQUITY = "PCT_EQUITY"


@dataclass
class MarketContext:
    """Market context for plan generation."""

    symbol: str
    """Ticker symbol."""

    current_price: float
    """Current market price."""

    regime: str = "UNKNOWN"
    """Market regime (BULL_TREND, BEAR_TREND, RANGE, HIGH_VOL)."""

    vix: float = 20.0
    """VIX volatility index."""

    atr_pct: float = 0.02
    """ATR as percentage of price."""

    rsi: float = 50.0
    """RSI indicator value (0-100)."""

    trend_strength: float = 0.0
    """Trend strength (-1 to 1, negative=bearish, positive=bullish)."""

    volume_ratio: float = 1.0
    """Volume relative to average (1.0 = average)."""

    sector: str = "UNKNOWN"
    """Sector classification."""

    account_equity: float = 100000.0
    """Account equity for sizing calculations."""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "symbol": self.symbol,
            "current_price": self.current_price,
            "regime": self.regime,
            "vix": self.vix,
            "atr_pct": self.atr_pct,
            "rsi": self.rsi,
            "trend_strength": self.trend_strength,
            "volume_ratio": self.volume_ratio,
            "sector": self.sector,
            "account_equity": self.account_equity,
        }


@dataclass
class TradingPlan:
    """A trading plan to be evaluated."""

    plan_id: str
    """Unique identifier."""

    action: Action
    """Action to take."""

    direction: Direction
    """Position direction."""

    symbol: str
    """Ticker symbol."""

    entry_price: float
    """Planned entry price."""

    stop_loss: float
    """Stop loss price."""

    take_profit: float
    """Take profit price."""

    size: float
    """Position size."""

    size_unit: SizeUnit
    """Unit of position size."""

    conviction: float = 0.5
    """Conviction level (0.0-1.0)."""

    time_horizon: str = "SWING"
    """Time horizon (SCALP, DAY, SWING, POSITION)."""

    rationale: str = ""
    """Reasoning behind the plan."""

    @property
    def risk_reward_ratio(self) -> float:
        """Calculate risk-reward ratio."""
        if self.action == Action.HOLD or self.entry_price == self.stop_loss:
            return 0.0

        risk = abs(self.entry_price - self.stop_loss)
        reward = abs(self.take_profit - self.entry_price)

        if risk == 0:
            return 0.0
        return reward / risk

    @property
    def risk_percent(self) -> float:
        """Calculate risk as percentage of entry price."""
        if self.entry_price == 0:
            return 0.0
        return abs(self.entry_price - self.stop_loss) / self.entry_price

    def to_feature_vector(self, context: MarketContext) -> np.ndarray:
        """
        Convert plan and context to feature vector for model input.

        Returns 128-dimensional feature vector suitable for BradleyTerryRewardModel.
        """
        features = []

        # Plan features (64 dims)
        features.extend(
            [
                float(self.action == Action.BUY),
                float(self.action == Action.SELL),
                float(self.action == Action.HOLD),
                float(self.action == Action.CLOSE),
                float(self.direction == Direction.LONG),
                float(self.direction == Direction.SHORT),
                float(self.direction == Direction.FLAT),
                self.risk_reward_ratio / 5.0,  # Normalize to ~[0, 1]
                self.risk_percent * 10.0,  # Normalize to ~[0, 1]
                self.conviction,
                float(self.time_horizon == "SCALP"),
                float(self.time_horizon == "DAY"),
                float(self.time_horizon == "SWING"),
                float(self.time_horizon == "POSITION"),
            ]
        )

        # Entry/exit price features relative to current price
        price_entry_ratio = self.entry_price / context.current_price if context.current_price > 0 else 1.0
        price_stop_ratio = self.stop_loss / context.current_price if context.current_price > 0 else 1.0
        price_target_ratio = self.take_profit / context.current_price if context.current_price > 0 else 1.0

        features.extend(
            [
                price_entry_ratio - 1.0,  # Distance from current price
                price_stop_ratio - 1.0,
                price_target_ratio - 1.0,
            ]
        )

        # Pad to 64 plan features
        while len(features) < 64:
            features.append(0.0)

        # Context features (64 dims)
        features.extend(
            [
                context.vix / 50.0,  # Normalize VIX
                context.atr_pct * 10.0,  # Scale ATR
                context.rsi / 100.0,  # Normalize RSI
                context.trend_strength,  # Already in [-1, 1]
                context.volume_ratio / 5.0,  # Normalize volume
                float(context.regime == "BULL_TREND"),
                float(context.regime == "BEAR_TREND"),
                float(context.regime == "RANGE"),
                float(context.regime == "HIGH_VOL"),
            ]
        )

        # Pad to 64 context features (total 128)
        while len(features) < 128:
            features.append(0.0)

        return np.array(features[:128], dtype=np.float32)


@dataclass
class TradeOutcome:
    """Outcome of an executed trade."""

    realized_pnl: float
    """Realized P&L as decimal (0.05 = 5%)."""

    slippage: float
    """Actual slippage as decimal."""

    fill_rate: float = 1.0
    """Percentage of order filled (0.0-1.0)."""

    execution_time_ms: int = 0
    """Time to execute in milliseconds."""

    market_move_during_execution: float = 0.0
    """Market move during execution as decimal."""

    hit_stop: bool = False
    """Whether stop loss was hit."""

    hit_target: bool = False
    """Whether take profit was hit."""

    hold_duration_hours: float = 0.0
    """Duration of position in hours."""


@dataclass
class PreferencePair:
    """A preference pair for training."""

    pair_id: str
    """Unique identifier."""

    chosen: TradingPlan
    """The preferred (winning) plan."""

    rejected: TradingPlan
    """The rejected (losing) plan."""

    chosen_score: float
    """Score of chosen plan."""

    rejected_score: float
    """Score of rejected plan."""

    margin: float
    """Preference margin (chosen_score - rejected_score), normalized."""

    context: MarketContext
    """Market context for this pair."""

    source: str = "west_of_n"
    """Source method (west_of_n, counterfactual)."""

    metadata: dict[str, Any] = field(default_factory=dict)
    """Additional metadata."""


class SyntheticPreferenceGenerator:
    """
    Generator for synthetic preference pairs.

    Implements two approaches:
    1. West-of-N: Generate N candidate plans, rank by rule-based score
    2. Counterfactual: Generate perturbations of actual trades

    Attributes:
        scorer: Rule-based scorer for plan evaluation
        random_seed: Random seed for reproducibility
    """

    # Scoring weights for plan evaluation
    WEIGHT_RISK_REWARD = 0.30
    WEIGHT_TREND_ALIGNMENT = 0.25
    WEIGHT_RSI_TIMING = 0.15
    WEIGHT_VOLATILITY_FIT = 0.15
    WEIGHT_CONVICTION_SIZE = 0.15

    # Perturbation ranges
    ENTRY_PERTURBATION_RANGE = 0.02  # +/- 2% from original entry
    EXIT_PERTURBATION_RANGE = 0.05  # +/- 5% from original targets
    SIZE_PERTURBATION_RANGE = 0.50  # +/- 50% from original size

    def __init__(self, random_seed: int | None = 42) -> None:
        """
        Initialize the preference generator.

        Args:
            random_seed: Random seed for reproducibility. None for random.
        """
        self.random_seed = random_seed
        # Use local RNG instances for reproducibility
        if random_seed is not None:
            self._rng = random.Random(random_seed)
            self._np_rng = Generator(PCG64(random_seed))
        else:
            self._rng = random.Random()
            self._np_rng = Generator(PCG64())

    def generate_preference_pair(
        self,
        context: MarketContext,
        n_candidates: int = 8,
    ) -> PreferencePair:
        """
        Generate a preference pair using West-of-N approach.

        Generates N candidate plans for the given context, scores each
        using rule-based metrics, then selects the best as "chosen"
        and worst as "rejected".

        Args:
            context: Market context for plan generation
            n_candidates: Number of candidate plans to generate (default: 8)

        Returns:
            PreferencePair with chosen, rejected, and margin

        Raises:
            ValueError: If n_candidates < 2
        """
        if n_candidates < 2:
            raise ValueError("n_candidates must be at least 2")

        # Generate N candidate plans
        candidates = self._generate_candidate_plans(context, n_candidates)

        # Score each candidate
        scored_candidates: list[tuple[TradingPlan, float]] = []
        for candidate in candidates:
            score = self._rule_based_score(candidate, context)
            scored_candidates.append((candidate, score))

        # Sort by score (descending)
        scored_candidates.sort(key=lambda x: x[1], reverse=True)

        # Select best and worst
        chosen, chosen_score = scored_candidates[0]
        rejected, rejected_score = scored_candidates[-1]

        # Calculate normalized margin (0 to 1 scale)
        raw_margin = chosen_score - rejected_score
        margin = min(1.0, max(0.0, raw_margin / 100.0))  # Normalize to [0, 1]

        return PreferencePair(
            pair_id=str(uuid.uuid4()),
            chosen=chosen,
            rejected=rejected,
            chosen_score=chosen_score,
            rejected_score=rejected_score,
            margin=margin,
            context=context,
            source="west_of_n",
            metadata={
                "n_candidates": n_candidates,
                "all_scores": [s for _, s in scored_candidates],
            },
        )

    def generate_from_counterfactuals(
        self,
        actual_plan: TradingPlan,
        actual_outcome: TradeOutcome,
        context: MarketContext,
        n_perturbations: int = 4,
    ) -> list[PreferencePair]:
        """
        Generate preference pairs from counterfactual analysis.

        Creates perturbations of the actual plan (entry, exit, sizing)
        and estimates counterfactual outcomes. If actual was successful,
        prefer actual; if failed, prefer perturbations.

        Args:
            actual_plan: The plan that was actually executed
            actual_outcome: The outcome of the actual trade
            context: Market context at execution time
            n_perturbations: Number of perturbations to generate

        Returns:
            List of PreferencePairs based on counterfactual analysis
        """
        pairs: list[PreferencePair] = []

        # Generate perturbations
        perturbations = self._generate_perturbations(actual_plan, context, n_perturbations)

        # Estimate counterfactual outcomes
        for perturbation in perturbations:
            cf_outcome = self._estimate_counterfactual_outcome(
                perturbation, actual_plan, actual_outcome, context
            )

            # Score both plans
            actual_score = self._outcome_based_score(actual_plan, actual_outcome, context)
            cf_score = self._outcome_based_score(perturbation, cf_outcome, context)

            # Determine chosen and rejected based on scores
            if actual_score >= cf_score:
                chosen, rejected = actual_plan, perturbation
                chosen_score, rejected_score = actual_score, cf_score
            else:
                chosen, rejected = perturbation, actual_plan
                chosen_score, rejected_score = cf_score, actual_score

            # Calculate margin
            raw_margin = chosen_score - rejected_score
            margin = min(1.0, max(0.0, raw_margin / 100.0))

            # Skip pairs with very small margins (too close to distinguish)
            if margin < 0.05:
                continue

            pairs.append(
                PreferencePair(
                    pair_id=str(uuid.uuid4()),
                    chosen=chosen,
                    rejected=rejected,
                    chosen_score=chosen_score,
                    rejected_score=rejected_score,
                    margin=margin,
                    context=context,
                    source="counterfactual",
                    metadata={
                        "actual_pnl": actual_outcome.realized_pnl,
                        "cf_pnl": cf_outcome.realized_pnl,
                        "perturbation_type": self._identify_perturbation_type(
                            actual_plan, perturbation
                        ),
                    },
                )
            )

        return pairs

    def generate_batch(
        self,
        contexts: list[MarketContext],
        n_candidates: int = 8,
    ) -> list[PreferencePair]:
        """
        Generate preference pairs for multiple contexts (batch processing).

        Args:
            contexts: List of market contexts
            n_candidates: Number of candidates per context

        Returns:
            List of PreferencePairs
        """
        pairs = []
        for context in contexts:
            pair = self.generate_preference_pair(context, n_candidates)
            pairs.append(pair)
        return pairs

    def _generate_candidate_plans(
        self,
        context: MarketContext,
        n_candidates: int,
    ) -> list[TradingPlan]:
        """Generate N diverse candidate plans for a context."""
        candidates: list[TradingPlan] = []

        # Action distribution based on regime
        if context.regime == "BULL_TREND":
            action_weights = {Action.BUY: 0.6, Action.SELL: 0.1, Action.HOLD: 0.3}
        elif context.regime == "BEAR_TREND":
            action_weights = {Action.BUY: 0.1, Action.SELL: 0.6, Action.HOLD: 0.3}
        elif context.regime == "RANGE":
            action_weights = {Action.BUY: 0.35, Action.SELL: 0.35, Action.HOLD: 0.3}
        else:  # HIGH_VOL or UNKNOWN
            action_weights = {Action.BUY: 0.25, Action.SELL: 0.25, Action.HOLD: 0.5}

        actions = list(action_weights.keys())
        weights = list(action_weights.values())

        for _ in range(n_candidates):
            # Randomly select action based on weights
            action = self._rng.choices(actions, weights=weights, k=1)[0]

            # Determine direction from action
            if action == Action.BUY:
                direction = Direction.LONG
            elif action == Action.SELL:
                direction = Direction.SHORT
            else:
                direction = Direction.FLAT

            # Generate entry, stop, and target with variation
            base_atr = context.atr_pct * context.current_price

            # Entry variation: +/- 0.5 ATR from current
            entry_offset = self._rng.uniform(-0.5, 0.5) * base_atr
            entry_price = context.current_price + entry_offset

            # Stop loss: 1-3 ATR from entry
            stop_distance = self._rng.uniform(1.0, 3.0) * base_atr

            # Target: 2-5 ATR from entry
            target_distance = self._rng.uniform(2.0, 5.0) * base_atr

            # Adjust direction of stops and targets
            if direction == Direction.LONG:
                stop_loss = entry_price - stop_distance
                take_profit = entry_price + target_distance
            elif direction == Direction.SHORT:
                stop_loss = entry_price + stop_distance
                take_profit = entry_price - target_distance
            else:
                # HOLD/FLAT: use current price with minimal range
                stop_loss = context.current_price * 0.98
                take_profit = context.current_price * 1.02

            # Conviction variation
            conviction = self._rng.uniform(0.3, 0.9)

            # Size variation (as percentage of equity risked)
            risk_pct = self._rng.uniform(0.005, 0.025)  # 0.5% to 2.5% risk
            stop_pct = abs(entry_price - stop_loss) / entry_price if entry_price > 0 else 0.02
            if stop_pct > 0:
                position_value = (risk_pct * context.account_equity) / stop_pct
            else:
                position_value = context.account_equity * 0.05

            size = position_value / entry_price if entry_price > 0 else 100

            # Time horizon variation
            time_horizons = ["SCALP", "DAY", "SWING", "POSITION"]
            time_horizon = self._rng.choice(time_horizons)

            candidates.append(
                TradingPlan(
                    plan_id=str(uuid.uuid4()),
                    action=action,
                    direction=direction,
                    symbol=context.symbol,
                    entry_price=round(entry_price, 2),
                    stop_loss=round(stop_loss, 2),
                    take_profit=round(take_profit, 2),
                    size=round(size, 2),
                    size_unit=SizeUnit.SHARES,
                    conviction=round(conviction, 2),
                    time_horizon=time_horizon,
                )
            )

        return candidates

    def _rule_based_score(
        self,
        plan: TradingPlan,
        context: MarketContext,
    ) -> float:
        """
        Score a plan using rule-based metrics.

        Returns score on 0-100 scale.
        """
        scores: dict[str, float] = {}

        # 1. Risk-Reward Score (30%)
        rr = plan.risk_reward_ratio
        if rr >= 3.0:
            scores["risk_reward"] = 100.0
        elif rr >= 2.0:
            scores["risk_reward"] = 70.0 + (rr - 2.0) * 30.0
        elif rr >= 1.0:
            scores["risk_reward"] = 40.0 + (rr - 1.0) * 30.0
        else:
            scores["risk_reward"] = max(0.0, rr * 40.0)

        # 2. Trend Alignment Score (25%)
        if plan.action == Action.HOLD:
            scores["trend_alignment"] = 50.0  # Neutral for HOLD
        elif plan.direction == Direction.LONG and context.trend_strength > 0:
            scores["trend_alignment"] = 50.0 + context.trend_strength * 50.0
        elif plan.direction == Direction.SHORT and context.trend_strength < 0:
            scores["trend_alignment"] = 50.0 - context.trend_strength * 50.0
        elif plan.direction == Direction.FLAT:
            scores["trend_alignment"] = 50.0
        else:
            # Against the trend
            scores["trend_alignment"] = max(0.0, 50.0 - abs(context.trend_strength) * 50.0)

        # 3. RSI Timing Score (15%)
        if plan.action == Action.BUY:
            if context.rsi < 30:
                scores["rsi_timing"] = 100.0  # Oversold - good buy
            elif context.rsi < 50:
                scores["rsi_timing"] = 70.0
            elif context.rsi > 70:
                scores["rsi_timing"] = 20.0  # Overbought - bad buy
            else:
                scores["rsi_timing"] = 50.0
        elif plan.action == Action.SELL:
            if context.rsi > 70:
                scores["rsi_timing"] = 100.0  # Overbought - good sell
            elif context.rsi > 50:
                scores["rsi_timing"] = 70.0
            elif context.rsi < 30:
                scores["rsi_timing"] = 20.0  # Oversold - bad sell
            else:
                scores["rsi_timing"] = 50.0
        else:
            scores["rsi_timing"] = 50.0  # Neutral for HOLD

        # 4. Volatility Fit Score (15%)
        vol_regime = "high" if context.vix > 25 else "normal" if context.vix > 15 else "low"

        # Tighter stops in high vol, wider in low vol
        stop_distance_atr = plan.risk_percent / context.atr_pct if context.atr_pct > 0 else 1.0

        if vol_regime == "high":
            # Prefer tighter stops (0.5-1.5 ATR) in high vol
            if 0.5 <= stop_distance_atr <= 1.5:
                scores["volatility_fit"] = 100.0
            elif stop_distance_atr < 0.5:
                scores["volatility_fit"] = 60.0  # Too tight
            else:
                scores["volatility_fit"] = max(0.0, 80.0 - (stop_distance_atr - 1.5) * 20.0)
        elif vol_regime == "low":
            # Allow wider stops (1.5-3 ATR) in low vol
            if 1.5 <= stop_distance_atr <= 3.0:
                scores["volatility_fit"] = 100.0
            elif stop_distance_atr < 1.0:
                scores["volatility_fit"] = 50.0  # Too tight
            else:
                scores["volatility_fit"] = max(0.0, 80.0 - (stop_distance_atr - 3.0) * 15.0)
        else:
            # Normal vol: 1-2 ATR is ideal
            if 1.0 <= stop_distance_atr <= 2.0:
                scores["volatility_fit"] = 100.0
            else:
                deviation = abs(stop_distance_atr - 1.5)
                scores["volatility_fit"] = max(0.0, 100.0 - deviation * 30.0)

        # 5. Conviction-Size Match Score (15%)
        # Calculate implied risk from size
        if plan.entry_price > 0 and context.account_equity > 0:
            position_value = plan.size * plan.entry_price
            risk_at_stop = position_value * plan.risk_percent
            implied_risk_pct = risk_at_stop / context.account_equity
        else:
            implied_risk_pct = 0.01

        # Expected risk based on conviction
        if plan.conviction >= 0.7:
            expected_risk = 0.02  # 2% for high conviction
        elif plan.conviction >= 0.4:
            expected_risk = 0.01  # 1% for standard conviction
        else:
            expected_risk = 0.005  # 0.5% for speculative

        # Score based on deviation from expected
        if expected_risk > 0:
            deviation_pct = abs(implied_risk_pct - expected_risk) / expected_risk
            if deviation_pct <= 0.2:
                scores["conviction_size"] = 100.0
            elif deviation_pct <= 0.5:
                scores["conviction_size"] = 80.0 - (deviation_pct - 0.2) * 100.0
            else:
                scores["conviction_size"] = max(0.0, 50.0 - (deviation_pct - 0.5) * 50.0)
        else:
            scores["conviction_size"] = 50.0

        # Calculate weighted total
        total_score = (
            scores["risk_reward"] * self.WEIGHT_RISK_REWARD
            + scores["trend_alignment"] * self.WEIGHT_TREND_ALIGNMENT
            + scores["rsi_timing"] * self.WEIGHT_RSI_TIMING
            + scores["volatility_fit"] * self.WEIGHT_VOLATILITY_FIT
            + scores["conviction_size"] * self.WEIGHT_CONVICTION_SIZE
        )

        return round(total_score, 2)

    def _generate_perturbations(
        self,
        plan: TradingPlan,
        context: MarketContext,
        n_perturbations: int,
    ) -> list[TradingPlan]:
        """Generate perturbations of the original plan."""
        perturbations: list[TradingPlan] = []

        perturbation_types = ["entry", "exit", "sizing", "mixed"]

        for i in range(n_perturbations):
            pert_type = perturbation_types[i % len(perturbation_types)]

            # Start with copy of original values
            entry_price = plan.entry_price
            stop_loss = plan.stop_loss
            take_profit = plan.take_profit
            size = plan.size
            conviction = plan.conviction

            if pert_type == "entry" or pert_type == "mixed":
                # Perturb entry timing
                entry_offset = self._rng.uniform(
                    -self.ENTRY_PERTURBATION_RANGE, self.ENTRY_PERTURBATION_RANGE
                )
                entry_price = plan.entry_price * (1 + entry_offset)

            if pert_type == "exit" or pert_type == "mixed":
                # Perturb stop and target
                stop_offset = self._rng.uniform(
                    -self.EXIT_PERTURBATION_RANGE, self.EXIT_PERTURBATION_RANGE
                )
                target_offset = self._rng.uniform(
                    -self.EXIT_PERTURBATION_RANGE, self.EXIT_PERTURBATION_RANGE
                )

                # Maintain direction logic
                if plan.direction == Direction.LONG:
                    stop_loss = plan.stop_loss * (1 + stop_offset)
                    take_profit = plan.take_profit * (1 + target_offset)
                elif plan.direction == Direction.SHORT:
                    stop_loss = plan.stop_loss * (1 - stop_offset)
                    take_profit = plan.take_profit * (1 - target_offset)

            if pert_type == "sizing" or pert_type == "mixed":
                # Perturb size
                size_offset = self._rng.uniform(
                    -self.SIZE_PERTURBATION_RANGE, self.SIZE_PERTURBATION_RANGE
                )
                size = max(1, plan.size * (1 + size_offset))

                # Adjust conviction proportionally
                conviction = min(1.0, max(0.1, plan.conviction * (1 + size_offset * 0.5)))

            perturbations.append(
                TradingPlan(
                    plan_id=str(uuid.uuid4()),
                    action=plan.action,
                    direction=plan.direction,
                    symbol=plan.symbol,
                    entry_price=round(entry_price, 2),
                    stop_loss=round(stop_loss, 2),
                    take_profit=round(take_profit, 2),
                    size=round(size, 2),
                    size_unit=plan.size_unit,
                    conviction=round(conviction, 2),
                    time_horizon=plan.time_horizon,
                    rationale=f"Perturbation ({pert_type}) of {plan.plan_id}",
                )
            )

        return perturbations

    def _estimate_counterfactual_outcome(
        self,
        perturbation: TradingPlan,
        original_plan: TradingPlan,
        actual_outcome: TradeOutcome,
        context: MarketContext,
    ) -> TradeOutcome:
        """
        Estimate counterfactual outcome for a perturbed plan.

        Uses the actual outcome as a baseline and adjusts based on
        how the perturbation differs from the original plan.
        """
        # Start with actual outcome as baseline
        cf_pnl = actual_outcome.realized_pnl

        # Adjust based on entry timing
        if perturbation.entry_price != original_plan.entry_price:
            entry_diff_pct = (perturbation.entry_price - original_plan.entry_price) / original_plan.entry_price

            if original_plan.direction == Direction.LONG:
                # Earlier entry (lower price) would be better for long
                cf_pnl -= entry_diff_pct  # Negative diff = better entry = more profit
            elif original_plan.direction == Direction.SHORT:
                # Earlier entry (higher price) would be better for short
                cf_pnl += entry_diff_pct

        # Adjust based on stop loss placement
        if perturbation.stop_loss != original_plan.stop_loss:
            # Tighter stop may have been hit, wider stop may have saved the trade
            if actual_outcome.hit_stop:
                # Original hit stop. Would perturbation have avoided it?
                if original_plan.direction == Direction.LONG:
                    if perturbation.stop_loss < original_plan.stop_loss:
                        # Tighter stop - still would have been hit
                        cf_pnl = cf_pnl  # No change
                    else:
                        # Wider stop - might have avoided
                        cf_pnl = actual_outcome.realized_pnl + self._rng.uniform(0, 0.02)
                elif original_plan.direction == Direction.SHORT:
                    if perturbation.stop_loss > original_plan.stop_loss:
                        # Tighter stop - still would have been hit
                        cf_pnl = cf_pnl
                    else:
                        # Wider stop - might have avoided
                        cf_pnl = actual_outcome.realized_pnl + self._rng.uniform(0, 0.02)

        # Adjust based on take profit
        if perturbation.take_profit != original_plan.take_profit:
            if actual_outcome.hit_target:
                # Would have hit earlier/later target?
                target_diff_pct = abs(perturbation.take_profit - original_plan.take_profit) / original_plan.entry_price
                if original_plan.direction == Direction.LONG:
                    if perturbation.take_profit < original_plan.take_profit:
                        # Tighter target - would have exited with less profit
                        cf_pnl = actual_outcome.realized_pnl - target_diff_pct
                    else:
                        # Wider target - might not have been hit
                        cf_pnl = actual_outcome.realized_pnl - self._rng.uniform(0, target_diff_pct)

        # Adjust based on size
        if perturbation.size != original_plan.size:
            size_ratio = perturbation.size / original_plan.size if original_plan.size > 0 else 1.0
            # Larger size magnifies gains/losses
            cf_pnl = cf_pnl * size_ratio

        # Add some noise to represent uncertainty
        cf_pnl += self._rng.gauss(0, 0.005)

        return TradeOutcome(
            realized_pnl=round(cf_pnl, 4),
            slippage=actual_outcome.slippage * (1 + self._rng.uniform(-0.1, 0.1)),
            fill_rate=min(1.0, actual_outcome.fill_rate * (1 + self._rng.uniform(-0.05, 0.05))),
            hit_stop=actual_outcome.hit_stop and self._rng.random() > 0.3,
            hit_target=actual_outcome.hit_target and self._rng.random() > 0.3,
            hold_duration_hours=actual_outcome.hold_duration_hours * (1 + self._rng.uniform(-0.2, 0.2)),
        )

    def _outcome_based_score(
        self,
        plan: TradingPlan,
        outcome: TradeOutcome,
        context: MarketContext,
    ) -> float:
        """Score a plan based on its actual or estimated outcome."""
        score = 50.0  # Base score

        # P&L contribution (heavily weighted)
        pnl_contribution = outcome.realized_pnl * 200.0  # Scale: 5% P&L = 10 points
        score += pnl_contribution

        # Risk-adjusted return bonus
        if plan.risk_percent > 0:
            risk_adjusted_return = outcome.realized_pnl / plan.risk_percent
            if risk_adjusted_return > 2.0:
                score += 10.0
            elif risk_adjusted_return > 1.0:
                score += 5.0
            elif risk_adjusted_return < -1.0:
                score -= 10.0

        # Execution quality
        if outcome.slippage < 0.001:
            score += 5.0
        elif outcome.slippage > 0.005:
            score -= 5.0

        if outcome.fill_rate >= 0.99:
            score += 3.0
        elif outcome.fill_rate < 0.9:
            score -= 5.0

        # Target/stop hit bonus/penalty
        if outcome.hit_target:
            score += 10.0
        if outcome.hit_stop:
            score -= 5.0

        return max(0.0, min(100.0, score))

    def _identify_perturbation_type(
        self,
        original: TradingPlan,
        perturbation: TradingPlan,
    ) -> str:
        """Identify what type of perturbation was applied."""
        changes = []

        if abs(original.entry_price - perturbation.entry_price) > 0.001:
            changes.append("entry")
        if abs(original.stop_loss - perturbation.stop_loss) > 0.001:
            changes.append("stop")
        if abs(original.take_profit - perturbation.take_profit) > 0.001:
            changes.append("target")
        if abs(original.size - perturbation.size) > 0.01:
            changes.append("size")

        if len(changes) >= 3:
            return "mixed"
        elif len(changes) == 0:
            return "none"
        else:
            return "_".join(changes)

    def get_feature_vectors(
        self,
        pair: PreferencePair,
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Extract feature vectors from a preference pair.

        Returns tuple of (chosen_features, rejected_features) suitable
        for BradleyTerryRewardModel training.
        """
        chosen_features = pair.chosen.to_feature_vector(pair.context)
        rejected_features = pair.rejected.to_feature_vector(pair.context)

        return chosen_features, rejected_features

    def prepare_training_batch(
        self,
        pairs: list[PreferencePair],
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Prepare a batch of preference pairs for training.

        Args:
            pairs: List of PreferencePairs

        Returns:
            Tuple of (chosen_features, rejected_features, margins)
            Each is a numpy array with shape (batch_size, 128) or (batch_size,)
        """
        chosen_list = []
        rejected_list = []
        margins_list = []

        for pair in pairs:
            chosen_feat, rejected_feat = self.get_feature_vectors(pair)
            chosen_list.append(chosen_feat)
            rejected_list.append(rejected_feat)
            margins_list.append(pair.margin)

        return (
            np.array(chosen_list, dtype=np.float32),
            np.array(rejected_list, dtype=np.float32),
            np.array(margins_list, dtype=np.float32),
        )


def generate_random_contexts(
    symbols: list[str],
    n_contexts: int,
    random_seed: int | None = None,
) -> list[MarketContext]:
    """
    Generate random market contexts for testing.

    Args:
        symbols: List of symbols to choose from
        n_contexts: Number of contexts to generate
        random_seed: Optional random seed

    Returns:
        List of MarketContext objects
    """
    # Use local RNG for reproducibility
    rng = random.Random(random_seed)

    regimes = ["BULL_TREND", "BEAR_TREND", "RANGE", "HIGH_VOL"]
    sectors = ["TECH", "HEALTHCARE", "FINANCE", "CONSUMER", "ENERGY", "INDUSTRIAL"]

    contexts = []
    for _ in range(n_contexts):
        symbol = rng.choice(symbols)
        regime = rng.choice(regimes)

        # Generate correlated values
        if regime == "BULL_TREND":
            trend_strength = rng.uniform(0.3, 1.0)
            rsi = rng.uniform(40, 80)
            vix = rng.uniform(12, 22)
        elif regime == "BEAR_TREND":
            trend_strength = rng.uniform(-1.0, -0.3)
            rsi = rng.uniform(20, 60)
            vix = rng.uniform(18, 35)
        elif regime == "HIGH_VOL":
            trend_strength = rng.uniform(-0.5, 0.5)
            rsi = rng.uniform(30, 70)
            vix = rng.uniform(25, 50)
        else:  # RANGE
            trend_strength = rng.uniform(-0.3, 0.3)
            rsi = rng.uniform(35, 65)
            vix = rng.uniform(15, 25)

        current_price = rng.uniform(20, 500)
        atr_pct = rng.uniform(0.01, 0.04) * (1 + (vix - 20) / 50)

        contexts.append(
            MarketContext(
                symbol=symbol,
                current_price=round(current_price, 2),
                regime=regime,
                vix=round(vix, 1),
                atr_pct=round(atr_pct, 4),
                rsi=round(rsi, 1),
                trend_strength=round(trend_strength, 2),
                volume_ratio=round(rng.uniform(0.5, 2.5), 2),
                sector=rng.choice(sectors),
                account_equity=rng.uniform(50000, 500000),
            )
        )

    return contexts
