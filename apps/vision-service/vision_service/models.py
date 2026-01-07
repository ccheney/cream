"""Data models for vision service.

Defines dataclasses for chart analysis results, pattern detection, and support/resistance levels.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class PatternType(str, Enum):
    """Types of chart patterns."""

    # Candlestick Patterns
    DOJI = "doji"
    HAMMER = "hammer"
    INVERTED_HAMMER = "inverted_hammer"
    HANGING_MAN = "hanging_man"
    SHOOTING_STAR = "shooting_star"
    BULLISH_ENGULFING = "bullish_engulfing"
    BEARISH_ENGULFING = "bearish_engulfing"
    MORNING_STAR = "morning_star"
    EVENING_STAR = "evening_star"
    THREE_WHITE_SOLDIERS = "three_white_soldiers"
    THREE_BLACK_CROWS = "three_black_crows"

    # Chart Patterns
    HEAD_AND_SHOULDERS = "head_and_shoulders"
    INVERSE_HEAD_AND_SHOULDERS = "inverse_head_and_shoulders"
    DOUBLE_TOP = "double_top"
    DOUBLE_BOTTOM = "double_bottom"
    TRIPLE_TOP = "triple_top"
    TRIPLE_BOTTOM = "triple_bottom"
    ASCENDING_TRIANGLE = "ascending_triangle"
    DESCENDING_TRIANGLE = "descending_triangle"
    SYMMETRICAL_TRIANGLE = "symmetrical_triangle"
    RISING_WEDGE = "rising_wedge"
    FALLING_WEDGE = "falling_wedge"
    CHANNEL_UP = "channel_up"
    CHANNEL_DOWN = "channel_down"
    FLAG = "flag"
    PENNANT = "pennant"


class PatternSignal(str, Enum):
    """Signal direction of a pattern."""

    BULLISH = "bullish"
    BEARISH = "bearish"
    NEUTRAL = "neutral"


class LevelType(str, Enum):
    """Type of price level."""

    SUPPORT = "support"
    RESISTANCE = "resistance"


@dataclass
class BoundingBox:
    """Bounding box for detected pattern in image coordinates."""

    x: int
    y: int
    width: int
    height: int

    @property
    def x2(self) -> int:
        """Right edge x coordinate."""
        return self.x + self.width

    @property
    def y2(self) -> int:
        """Bottom edge y coordinate."""
        return self.y + self.height

    @property
    def center(self) -> tuple[int, int]:
        """Center point of bounding box."""
        return (self.x + self.width // 2, self.y + self.height // 2)


@dataclass
class DetectedPattern:
    """A detected chart pattern."""

    pattern_type: PatternType
    signal: PatternSignal
    confidence: float  # 0.0 to 1.0
    bounding_box: BoundingBox | None = None
    start_index: int | None = None  # Candle index where pattern starts
    end_index: int | None = None  # Candle index where pattern ends
    price_target: float | None = None  # Projected price target
    description: str = ""


@dataclass
class PriceLevel:
    """A detected support or resistance level."""

    level_type: LevelType
    price: float
    strength: float  # 0.0 to 1.0, based on number of touches
    touches: int  # Number of times price touched this level
    first_touch_index: int | None = None
    last_touch_index: int | None = None


@dataclass
class Candle:
    """Candlestick data point."""

    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    timestamp: datetime | None = None

    @property
    def is_bullish(self) -> bool:
        """True if close > open."""
        return self.close > self.open

    @property
    def is_bearish(self) -> bool:
        """True if close < open."""
        return self.close < self.open

    @property
    def body(self) -> float:
        """Size of the candle body (absolute)."""
        return abs(self.close - self.open)

    @property
    def upper_shadow(self) -> float:
        """Size of upper shadow."""
        return self.high - max(self.open, self.close)

    @property
    def lower_shadow(self) -> float:
        """Size of lower shadow."""
        return min(self.open, self.close) - self.low

    @property
    def range(self) -> float:
        """Total range from high to low."""
        return self.high - self.low


@dataclass
class ChartAnalysisResult:
    """Complete result of chart analysis."""

    symbol: str
    timeframe: str  # e.g., "1h", "1d", "4h"
    patterns: list[DetectedPattern] = field(default_factory=list)
    support_levels: list[PriceLevel] = field(default_factory=list)
    resistance_levels: list[PriceLevel] = field(default_factory=list)
    overall_signal: PatternSignal = PatternSignal.NEUTRAL
    signal_confidence: float = 0.0
    analyzed_at: datetime = field(default_factory=datetime.utcnow)
    num_candles_analyzed: int = 0
    notes: str = ""

    @property
    def bullish_patterns(self) -> list[DetectedPattern]:
        """Get all bullish patterns."""
        return [p for p in self.patterns if p.signal == PatternSignal.BULLISH]

    @property
    def bearish_patterns(self) -> list[DetectedPattern]:
        """Get all bearish patterns."""
        return [p for p in self.patterns if p.signal == PatternSignal.BEARISH]


@dataclass
class ImageMetadata:
    """Metadata about a processed chart image."""

    width: int
    height: int
    channels: int
    chart_region: BoundingBox | None = None  # Region containing the actual chart
    price_axis_region: BoundingBox | None = None
    time_axis_region: BoundingBox | None = None


@dataclass
class ProcessedImage:
    """A preprocessed chart image ready for analysis."""

    original_width: int
    original_height: int
    processed_width: int
    processed_height: int
    metadata: ImageMetadata
    # Note: actual image data is passed separately as numpy array
