"""
Preference Types

Domain types for synthetic preference generation and trading plan evaluation.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any

import numpy as np

if TYPE_CHECKING:
    pass


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
        features = self._build_plan_features(context)
        features.extend(self._build_context_features(context))
        return np.array(features[:128], dtype=np.float32)

    def _build_plan_features(self, context: MarketContext) -> list[float]:
        """Build the plan portion of the feature vector (64 dims)."""
        features = [
            float(self.action == Action.BUY),
            float(self.action == Action.SELL),
            float(self.action == Action.HOLD),
            float(self.action == Action.CLOSE),
            float(self.direction == Direction.LONG),
            float(self.direction == Direction.SHORT),
            float(self.direction == Direction.FLAT),
            self.risk_reward_ratio / 5.0,
            self.risk_percent * 10.0,
            self.conviction,
            float(self.time_horizon == "SCALP"),
            float(self.time_horizon == "DAY"),
            float(self.time_horizon == "SWING"),
            float(self.time_horizon == "POSITION"),
        ]

        price_entry_ratio = (
            self.entry_price / context.current_price if context.current_price > 0 else 1.0
        )
        price_stop_ratio = (
            self.stop_loss / context.current_price if context.current_price > 0 else 1.0
        )
        price_target_ratio = (
            self.take_profit / context.current_price if context.current_price > 0 else 1.0
        )

        features.extend(
            [
                price_entry_ratio - 1.0,
                price_stop_ratio - 1.0,
                price_target_ratio - 1.0,
            ]
        )

        while len(features) < 64:
            features.append(0.0)

        return features

    def _build_context_features(self, context: MarketContext) -> list[float]:
        """Build the context portion of the feature vector (64 dims)."""
        features = [
            context.vix / 50.0,
            context.atr_pct * 10.0,
            context.rsi / 100.0,
            context.trend_strength,
            context.volume_ratio / 5.0,
            float(context.regime == "BULL_TREND"),
            float(context.regime == "BEAR_TREND"),
            float(context.regime == "RANGE"),
            float(context.regime == "HIGH_VOL"),
        ]

        while len(features) < 64:
            features.append(0.0)

        return features

    @staticmethod
    def create(
        action: Action,
        direction: Direction,
        symbol: str,
        entry_price: float,
        stop_loss: float,
        take_profit: float,
        size: float,
        size_unit: SizeUnit = SizeUnit.SHARES,
        conviction: float = 0.5,
        time_horizon: str = "SWING",
        rationale: str = "",
    ) -> TradingPlan:
        """Factory method to create a TradingPlan with auto-generated ID."""
        return TradingPlan(
            plan_id=str(uuid.uuid4()),
            action=action,
            direction=direction,
            symbol=symbol,
            entry_price=round(entry_price, 2),
            stop_loss=round(stop_loss, 2),
            take_profit=round(take_profit, 2),
            size=round(size, 2),
            size_unit=size_unit,
            conviction=round(conviction, 2),
            time_horizon=time_horizon,
            rationale=rationale,
        )


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

    @staticmethod
    def create(
        chosen: TradingPlan,
        rejected: TradingPlan,
        chosen_score: float,
        rejected_score: float,
        context: MarketContext,
        source: str = "west_of_n",
        metadata: dict[str, Any] | None = None,
    ) -> PreferencePair:
        """Factory method to create a PreferencePair with computed margin."""
        raw_margin = chosen_score - rejected_score
        margin = min(1.0, max(0.0, raw_margin / 100.0))

        return PreferencePair(
            pair_id=str(uuid.uuid4()),
            chosen=chosen,
            rejected=rejected,
            chosen_score=chosen_score,
            rejected_score=rejected_score,
            margin=margin,
            context=context,
            source=source,
            metadata=metadata or {},
        )


__all__ = [
    "Action",
    "Direction",
    "MarketContext",
    "PreferencePair",
    "SizeUnit",
    "TradeOutcome",
    "TradingPlan",
]
