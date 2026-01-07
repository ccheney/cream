"""Candlestick pattern detection.

Detects common candlestick patterns from OHLC data.
"""

from dataclasses import dataclass

from .models import Candle, DetectedPattern, PatternSignal, PatternType


@dataclass
class PatternDetectorConfig:
    """Configuration for pattern detection."""

    # Doji threshold: body/range ratio below this is considered doji
    doji_threshold: float = 0.1

    # Engulfing: minimum body size ratio for engulfing pattern
    engulfing_min_ratio: float = 1.2

    # Hammer/Shooting star: shadow/body ratio
    hammer_shadow_ratio: float = 2.0

    # Minimum confidence threshold
    min_confidence: float = 0.5


class CandlestickPatternDetector:
    """Detector for candlestick patterns."""

    def __init__(self, config: PatternDetectorConfig | None = None) -> None:
        """Initialize pattern detector.

        Args:
            config: Detection configuration. Uses defaults if None.
        """
        self.config = config or PatternDetectorConfig()

    def detect(self, candles: list[Candle]) -> list[DetectedPattern]:
        """Detect all candlestick patterns in candle data.

        Args:
            candles: List of candles to analyze.

        Returns:
            List of detected patterns.
        """
        patterns: list[DetectedPattern] = []

        for i in range(len(candles)):
            # Single candle patterns
            patterns.extend(self._detect_single_candle_patterns(candles, i))

            # Two candle patterns (need at least 2 candles)
            if i >= 1:
                patterns.extend(self._detect_two_candle_patterns(candles, i))

            # Three candle patterns (need at least 3 candles)
            if i >= 2:
                patterns.extend(self._detect_three_candle_patterns(candles, i))

        # Filter by minimum confidence
        return [p for p in patterns if p.confidence >= self.config.min_confidence]

    def _detect_single_candle_patterns(
        self, candles: list[Candle], index: int
    ) -> list[DetectedPattern]:
        """Detect single-candle patterns.

        Args:
            candles: All candles.
            index: Index of candle to analyze.

        Returns:
            List of detected patterns at this index.
        """
        patterns: list[DetectedPattern] = []
        candle = candles[index]

        # Doji
        if self._is_doji(candle):
            patterns.append(
                DetectedPattern(
                    pattern_type=PatternType.DOJI,
                    signal=PatternSignal.NEUTRAL,
                    confidence=self._doji_confidence(candle),
                    start_index=index,
                    end_index=index,
                    description="Doji - indecision, potential reversal",
                )
            )

        # Hammer (in downtrend)
        if self._is_hammer(candle) and self._in_downtrend(candles, index):
            patterns.append(
                DetectedPattern(
                    pattern_type=PatternType.HAMMER,
                    signal=PatternSignal.BULLISH,
                    confidence=self._hammer_confidence(candle),
                    start_index=index,
                    end_index=index,
                    description="Hammer - bullish reversal signal",
                )
            )

        # Inverted Hammer (in downtrend)
        if self._is_inverted_hammer(candle) and self._in_downtrend(candles, index):
            patterns.append(
                DetectedPattern(
                    pattern_type=PatternType.INVERTED_HAMMER,
                    signal=PatternSignal.BULLISH,
                    confidence=self._inverted_hammer_confidence(candle),
                    start_index=index,
                    end_index=index,
                    description="Inverted Hammer - bullish reversal signal",
                )
            )

        # Hanging Man (in uptrend)
        if self._is_hammer(candle) and self._in_uptrend(candles, index):
            patterns.append(
                DetectedPattern(
                    pattern_type=PatternType.HANGING_MAN,
                    signal=PatternSignal.BEARISH,
                    confidence=self._hammer_confidence(candle),
                    start_index=index,
                    end_index=index,
                    description="Hanging Man - bearish reversal signal",
                )
            )

        # Shooting Star (in uptrend)
        if self._is_inverted_hammer(candle) and self._in_uptrend(candles, index):
            patterns.append(
                DetectedPattern(
                    pattern_type=PatternType.SHOOTING_STAR,
                    signal=PatternSignal.BEARISH,
                    confidence=self._inverted_hammer_confidence(candle),
                    start_index=index,
                    end_index=index,
                    description="Shooting Star - bearish reversal signal",
                )
            )

        return patterns

    def _detect_two_candle_patterns(
        self, candles: list[Candle], index: int
    ) -> list[DetectedPattern]:
        """Detect two-candle patterns.

        Args:
            candles: All candles.
            index: Index of second candle.

        Returns:
            List of detected patterns.
        """
        patterns: list[DetectedPattern] = []
        prev_candle = candles[index - 1]
        curr_candle = candles[index]

        # Bullish Engulfing
        if self._is_bullish_engulfing(prev_candle, curr_candle):
            patterns.append(
                DetectedPattern(
                    pattern_type=PatternType.BULLISH_ENGULFING,
                    signal=PatternSignal.BULLISH,
                    confidence=self._engulfing_confidence(prev_candle, curr_candle),
                    start_index=index - 1,
                    end_index=index,
                    description="Bullish Engulfing - strong bullish reversal",
                )
            )

        # Bearish Engulfing
        if self._is_bearish_engulfing(prev_candle, curr_candle):
            patterns.append(
                DetectedPattern(
                    pattern_type=PatternType.BEARISH_ENGULFING,
                    signal=PatternSignal.BEARISH,
                    confidence=self._engulfing_confidence(prev_candle, curr_candle),
                    start_index=index - 1,
                    end_index=index,
                    description="Bearish Engulfing - strong bearish reversal",
                )
            )

        return patterns

    def _detect_three_candle_patterns(
        self, candles: list[Candle], index: int
    ) -> list[DetectedPattern]:
        """Detect three-candle patterns.

        Args:
            candles: All candles.
            index: Index of third candle.

        Returns:
            List of detected patterns.
        """
        patterns: list[DetectedPattern] = []
        c1 = candles[index - 2]
        c2 = candles[index - 1]
        c3 = candles[index]

        # Morning Star
        if self._is_morning_star(c1, c2, c3):
            patterns.append(
                DetectedPattern(
                    pattern_type=PatternType.MORNING_STAR,
                    signal=PatternSignal.BULLISH,
                    confidence=self._morning_star_confidence(c1, c2, c3),
                    start_index=index - 2,
                    end_index=index,
                    description="Morning Star - bullish reversal pattern",
                )
            )

        # Evening Star
        if self._is_evening_star(c1, c2, c3):
            patterns.append(
                DetectedPattern(
                    pattern_type=PatternType.EVENING_STAR,
                    signal=PatternSignal.BEARISH,
                    confidence=self._evening_star_confidence(c1, c2, c3),
                    start_index=index - 2,
                    end_index=index,
                    description="Evening Star - bearish reversal pattern",
                )
            )

        # Three White Soldiers
        if self._is_three_white_soldiers(c1, c2, c3):
            patterns.append(
                DetectedPattern(
                    pattern_type=PatternType.THREE_WHITE_SOLDIERS,
                    signal=PatternSignal.BULLISH,
                    confidence=self._three_soldiers_confidence(c1, c2, c3),
                    start_index=index - 2,
                    end_index=index,
                    description="Three White Soldiers - strong bullish continuation",
                )
            )

        # Three Black Crows
        if self._is_three_black_crows(c1, c2, c3):
            patterns.append(
                DetectedPattern(
                    pattern_type=PatternType.THREE_BLACK_CROWS,
                    signal=PatternSignal.BEARISH,
                    confidence=self._three_crows_confidence(c1, c2, c3),
                    start_index=index - 2,
                    end_index=index,
                    description="Three Black Crows - strong bearish continuation",
                )
            )

        return patterns

    # Single candle pattern detection helpers

    def _is_doji(self, candle: Candle) -> bool:
        """Check if candle is a doji (tiny body)."""
        if candle.range == 0:
            return True
        return candle.body / candle.range < self.config.doji_threshold

    def _is_hammer(self, candle: Candle) -> bool:
        """Check if candle is a hammer (long lower shadow, small upper shadow)."""
        if candle.body == 0:
            return False
        return (
            candle.lower_shadow >= candle.body * self.config.hammer_shadow_ratio
            and candle.upper_shadow < candle.body * 0.5
        )

    def _is_inverted_hammer(self, candle: Candle) -> bool:
        """Check if candle is an inverted hammer (long upper shadow, small lower shadow)."""
        if candle.body == 0:
            return False
        return (
            candle.upper_shadow >= candle.body * self.config.hammer_shadow_ratio
            and candle.lower_shadow < candle.body * 0.5
        )

    # Two candle pattern helpers

    def _is_bullish_engulfing(self, prev: Candle, curr: Candle) -> bool:
        """Check for bullish engulfing pattern."""
        return (
            prev.is_bearish
            and curr.is_bullish
            and curr.open <= prev.close
            and curr.close >= prev.open
            and curr.body > prev.body * self.config.engulfing_min_ratio
        )

    def _is_bearish_engulfing(self, prev: Candle, curr: Candle) -> bool:
        """Check for bearish engulfing pattern."""
        return (
            prev.is_bullish
            and curr.is_bearish
            and curr.open >= prev.close
            and curr.close <= prev.open
            and curr.body > prev.body * self.config.engulfing_min_ratio
        )

    # Three candle pattern helpers

    def _is_morning_star(self, c1: Candle, c2: Candle, c3: Candle) -> bool:
        """Check for morning star pattern.

        Pattern: Bearish candle, small body (star), bullish candle closing above c1 midpoint.
        """
        c1_midpoint = (c1.open + c1.close) / 2
        return (
            c1.is_bearish
            and c2.body < c1.body * 0.3  # Small star
            and c3.is_bullish
            and c3.close > c1_midpoint
        )

    def _is_evening_star(self, c1: Candle, c2: Candle, c3: Candle) -> bool:
        """Check for evening star pattern.

        Pattern: Bullish candle, small body (star), bearish candle closing below c1 midpoint.
        """
        c1_midpoint = (c1.open + c1.close) / 2
        return (
            c1.is_bullish
            and c2.body < c1.body * 0.3  # Small star
            and c3.is_bearish
            and c3.close < c1_midpoint
        )

    def _is_three_white_soldiers(self, c1: Candle, c2: Candle, c3: Candle) -> bool:
        """Check for three white soldiers pattern."""
        return (
            c1.is_bullish
            and c2.is_bullish
            and c3.is_bullish
            and c2.close > c1.close
            and c3.close > c2.close
            and c2.open > c1.open
            and c3.open > c2.open
        )

    def _is_three_black_crows(self, c1: Candle, c2: Candle, c3: Candle) -> bool:
        """Check for three black crows pattern."""
        return (
            c1.is_bearish
            and c2.is_bearish
            and c3.is_bearish
            and c2.close < c1.close
            and c3.close < c2.close
            and c2.open < c1.open
            and c3.open < c2.open
        )

    # Trend detection helpers

    def _in_downtrend(self, candles: list[Candle], index: int, lookback: int = 5) -> bool:
        """Check if candles are in a downtrend before index."""
        if index < lookback:
            return False
        start_price = candles[index - lookback].close
        end_price = candles[index - 1].close
        return end_price < start_price * 0.98  # 2% decline

    def _in_uptrend(self, candles: list[Candle], index: int, lookback: int = 5) -> bool:
        """Check if candles are in an uptrend before index."""
        if index < lookback:
            return False
        start_price = candles[index - lookback].close
        end_price = candles[index - 1].close
        return end_price > start_price * 1.02  # 2% rise

    # Confidence calculation helpers

    def _doji_confidence(self, candle: Candle) -> float:
        """Calculate confidence for doji pattern."""
        if candle.range == 0:
            return 1.0
        ratio = candle.body / candle.range
        # Smaller body/range ratio = higher confidence
        return max(0.0, min(1.0, 1.0 - (ratio / self.config.doji_threshold)))

    def _hammer_confidence(self, candle: Candle) -> float:
        """Calculate confidence for hammer pattern."""
        if candle.body == 0:
            return 0.0
        ratio = candle.lower_shadow / candle.body
        # Higher ratio = higher confidence
        return min(1.0, ratio / (self.config.hammer_shadow_ratio * 2))

    def _inverted_hammer_confidence(self, candle: Candle) -> float:
        """Calculate confidence for inverted hammer pattern."""
        if candle.body == 0:
            return 0.0
        ratio = candle.upper_shadow / candle.body
        return min(1.0, ratio / (self.config.hammer_shadow_ratio * 2))

    def _engulfing_confidence(self, prev: Candle, curr: Candle) -> float:
        """Calculate confidence for engulfing pattern."""
        if prev.body == 0:
            return 0.5
        ratio = curr.body / prev.body
        return min(1.0, ratio / (self.config.engulfing_min_ratio * 2))

    def _morning_star_confidence(self, c1: Candle, _c2: Candle, c3: Candle) -> float:
        """Calculate confidence for morning star pattern."""
        # Higher confidence if c3 closes higher above c1 midpoint
        c1_midpoint = (c1.open + c1.close) / 2
        if c1.body == 0:
            return 0.5
        recovery = (c3.close - c1_midpoint) / c1.body
        return min(1.0, 0.5 + recovery * 0.25)

    def _evening_star_confidence(self, c1: Candle, _c2: Candle, c3: Candle) -> float:
        """Calculate confidence for evening star pattern."""
        c1_midpoint = (c1.open + c1.close) / 2
        if c1.body == 0:
            return 0.5
        decline = (c1_midpoint - c3.close) / c1.body
        return min(1.0, 0.5 + decline * 0.25)

    def _three_soldiers_confidence(self, c1: Candle, c2: Candle, c3: Candle) -> float:
        """Calculate confidence for three white soldiers."""
        # Higher confidence if bodies are progressively larger
        bodies = [c1.body, c2.body, c3.body]
        if all(b > 0 for b in bodies):
            if bodies[2] > bodies[1] > bodies[0]:
                return 0.9
            if bodies[2] > bodies[0]:
                return 0.7
        return 0.6

    def _three_crows_confidence(self, c1: Candle, c2: Candle, c3: Candle) -> float:
        """Calculate confidence for three black crows."""
        bodies = [c1.body, c2.body, c3.body]
        if all(b > 0 for b in bodies):
            if bodies[2] > bodies[1] > bodies[0]:
                return 0.9
            if bodies[2] > bodies[0]:
                return 0.7
        return 0.6
