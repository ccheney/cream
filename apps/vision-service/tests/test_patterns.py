"""Tests for candlestick pattern detection."""

from vision_service.models import Candle, PatternSignal, PatternType
from vision_service.patterns import CandlestickPatternDetector, PatternDetectorConfig


def make_candle(o: float, h: float, low: float, c: float, vol: float = 1000.0) -> Candle:
    """Helper to create candles quickly."""
    return Candle(open=o, high=h, low=low, close=c, volume=vol)


class TestDojiDetection:
    """Tests for doji pattern detection."""

    def test_detects_doji(self) -> None:
        """Test detection of doji candle."""
        detector = CandlestickPatternDetector()
        candles = [
            make_candle(100, 105, 95, 100),  # Perfect doji
        ]
        patterns = detector.detect(candles)
        dojis = [p for p in patterns if p.pattern_type == PatternType.DOJI]
        assert len(dojis) == 1
        assert dojis[0].signal == PatternSignal.NEUTRAL

    def test_detects_near_doji(self) -> None:
        """Test detection of near-doji (very small body)."""
        detector = CandlestickPatternDetector()
        candles = [
            make_candle(100, 108, 92, 100.5),  # Small body, big range
        ]
        patterns = detector.detect(candles)
        dojis = [p for p in patterns if p.pattern_type == PatternType.DOJI]
        assert len(dojis) == 1

    def test_no_doji_for_large_body(self) -> None:
        """Test that large body candles are not dojis."""
        detector = CandlestickPatternDetector()
        candles = [
            make_candle(100, 110, 95, 108),  # Large bullish body
        ]
        patterns = detector.detect(candles)
        dojis = [p for p in patterns if p.pattern_type == PatternType.DOJI]
        assert len(dojis) == 0


class TestHammerDetection:
    """Tests for hammer and related patterns."""

    def test_detects_hammer_in_downtrend(self) -> None:
        """Test hammer detection in downtrend."""
        detector = CandlestickPatternDetector()
        # Create downtrend followed by hammer
        # Hammer requires: long lower shadow (>= 2x body), small upper shadow (< 0.5x body)
        # Also body/range must be >= 0.1 to avoid doji classification
        candles = [
            make_candle(110, 112, 108, 107),  # Bearish
            make_candle(107, 108, 104, 103),  # Bearish
            make_candle(103, 104, 100, 99),  # Bearish
            make_candle(99, 100, 96, 95),  # Bearish
            make_candle(95, 96, 92, 91),  # Bearish
            # Hammer: body=2, lower shadow=6 (>=2*body), upper shadow=0.5 (<0.5*body=1)
            # body/range = 2/8.5 = 0.24 (>0.1, not a doji)
            make_candle(90, 92.5, 84, 92),
        ]
        patterns = detector.detect(candles)
        hammers = [p for p in patterns if p.pattern_type == PatternType.HAMMER]
        assert len(hammers) == 1
        assert hammers[0].signal == PatternSignal.BULLISH

    def test_detects_hanging_man_in_uptrend(self) -> None:
        """Test hanging man detection in uptrend."""
        detector = CandlestickPatternDetector()
        # Create uptrend followed by hanging man
        # Hanging man is same shape as hammer but in uptrend (long lower shadow, small body)
        # body/range must be >= 0.1 to avoid doji classification
        candles = [
            make_candle(90, 92, 89, 91),  # Bullish
            make_candle(91, 94, 90, 93),  # Bullish
            make_candle(93, 96, 92, 95),  # Bullish
            make_candle(95, 98, 94, 97),  # Bullish
            make_candle(97, 100, 96, 99),  # Bullish
            # Hanging man: body=2, lower shadow=6 (>=2*body), upper shadow=0.5 (<0.5*body=1)
            # body/range = 2/8.5 = 0.24 (>0.1, not a doji)
            make_candle(99, 101.5, 93, 101),
        ]
        patterns = detector.detect(candles)
        hanging_men = [p for p in patterns if p.pattern_type == PatternType.HANGING_MAN]
        assert len(hanging_men) == 1
        assert hanging_men[0].signal == PatternSignal.BEARISH

    def test_detects_shooting_star(self) -> None:
        """Test shooting star detection in uptrend."""
        detector = CandlestickPatternDetector()
        # Shooting star requires: long upper shadow (>= 2x body), small lower shadow (< 0.5x body)
        # body/range must be >= 0.1 to avoid doji classification
        candles = [
            make_candle(90, 92, 89, 91),  # Bullish
            make_candle(91, 94, 90, 93),  # Bullish
            make_candle(93, 96, 92, 95),  # Bullish
            make_candle(95, 98, 94, 97),  # Bullish
            make_candle(97, 100, 96, 99),  # Bullish
            # Shooting star: body=2, upper shadow=6 (>=2*body), lower shadow=0.5 (<0.5*body=1)
            # body/range = 2/8.5 = 0.24 (>0.1, not a doji)
            make_candle(101, 109, 100.5, 103),
        ]
        patterns = detector.detect(candles)
        stars = [p for p in patterns if p.pattern_type == PatternType.SHOOTING_STAR]
        assert len(stars) == 1
        assert stars[0].signal == PatternSignal.BEARISH


class TestEngulfingDetection:
    """Tests for engulfing pattern detection."""

    def test_detects_bullish_engulfing(self) -> None:
        """Test bullish engulfing pattern detection."""
        detector = CandlestickPatternDetector()
        candles = [
            make_candle(102, 103, 99, 100),  # Bearish
            make_candle(99, 106, 98, 105),  # Bullish engulfing
        ]
        patterns = detector.detect(candles)
        engulfing = [p for p in patterns if p.pattern_type == PatternType.BULLISH_ENGULFING]
        assert len(engulfing) == 1
        assert engulfing[0].signal == PatternSignal.BULLISH

    def test_detects_bearish_engulfing(self) -> None:
        """Test bearish engulfing pattern detection."""
        detector = CandlestickPatternDetector()
        candles = [
            make_candle(98, 101, 97, 100),  # Bullish
            make_candle(101, 102, 94, 95),  # Bearish engulfing
        ]
        patterns = detector.detect(candles)
        engulfing = [p for p in patterns if p.pattern_type == PatternType.BEARISH_ENGULFING]
        assert len(engulfing) == 1
        assert engulfing[0].signal == PatternSignal.BEARISH


class TestThreeCandlePatterns:
    """Tests for three-candle patterns."""

    def test_detects_morning_star(self) -> None:
        """Test morning star pattern detection."""
        detector = CandlestickPatternDetector()
        candles = [
            make_candle(110, 112, 100, 102),  # Large bearish
            make_candle(102, 103, 99, 101),  # Small star
            make_candle(101, 112, 100, 110),  # Large bullish
        ]
        patterns = detector.detect(candles)
        stars = [p for p in patterns if p.pattern_type == PatternType.MORNING_STAR]
        assert len(stars) == 1
        assert stars[0].signal == PatternSignal.BULLISH

    def test_detects_evening_star(self) -> None:
        """Test evening star pattern detection."""
        detector = CandlestickPatternDetector()
        candles = [
            make_candle(90, 100, 88, 98),  # Large bullish
            make_candle(98, 100, 97, 99),  # Small star
            make_candle(99, 100, 88, 90),  # Large bearish
        ]
        patterns = detector.detect(candles)
        stars = [p for p in patterns if p.pattern_type == PatternType.EVENING_STAR]
        assert len(stars) == 1
        assert stars[0].signal == PatternSignal.BEARISH

    def test_detects_three_white_soldiers(self) -> None:
        """Test three white soldiers pattern detection."""
        detector = CandlestickPatternDetector()
        candles = [
            make_candle(100, 104, 99, 103),  # Bullish 1
            make_candle(102, 107, 101, 106),  # Bullish 2
            make_candle(105, 111, 104, 110),  # Bullish 3
        ]
        patterns = detector.detect(candles)
        soldiers = [p for p in patterns if p.pattern_type == PatternType.THREE_WHITE_SOLDIERS]
        assert len(soldiers) == 1
        assert soldiers[0].signal == PatternSignal.BULLISH

    def test_detects_three_black_crows(self) -> None:
        """Test three black crows pattern detection."""
        detector = CandlestickPatternDetector()
        candles = [
            make_candle(110, 111, 105, 106),  # Bearish 1
            make_candle(107, 108, 102, 103),  # Bearish 2
            make_candle(104, 105, 98, 99),  # Bearish 3
        ]
        patterns = detector.detect(candles)
        crows = [p for p in patterns if p.pattern_type == PatternType.THREE_BLACK_CROWS]
        assert len(crows) == 1
        assert crows[0].signal == PatternSignal.BEARISH


class TestConfidenceFiltering:
    """Tests for confidence filtering."""

    def test_filters_low_confidence(self) -> None:
        """Test that low confidence patterns are filtered."""
        config = PatternDetectorConfig(min_confidence=0.9)
        detector = CandlestickPatternDetector(config)
        candles = [
            make_candle(100, 101, 99, 100),  # Weak doji
        ]
        patterns = detector.detect(candles)
        # Weak doji might not meet 0.9 threshold
        for pattern in patterns:
            assert pattern.confidence >= 0.9

    def test_includes_high_confidence(self) -> None:
        """Test that high confidence patterns are included."""
        config = PatternDetectorConfig(min_confidence=0.5)
        detector = CandlestickPatternDetector(config)
        candles = [
            make_candle(100, 110, 90, 100),  # Strong doji
        ]
        patterns = detector.detect(candles)
        dojis = [p for p in patterns if p.pattern_type == PatternType.DOJI]
        assert len(dojis) == 1


class TestPatternIndices:
    """Tests for pattern index tracking."""

    def test_single_candle_indices(self) -> None:
        """Test indices for single candle patterns."""
        detector = CandlestickPatternDetector()
        candles = [
            make_candle(100, 101, 99, 100.5),
            make_candle(100, 105, 95, 100),  # Doji at index 1
            make_candle(100, 102, 98, 101),
        ]
        patterns = detector.detect(candles)
        dojis = [p for p in patterns if p.pattern_type == PatternType.DOJI]
        if dojis:
            assert dojis[0].start_index == dojis[0].end_index

    def test_two_candle_indices(self) -> None:
        """Test indices for two candle patterns."""
        detector = CandlestickPatternDetector()
        candles = [
            make_candle(102, 103, 99, 100),  # Bearish
            make_candle(99, 106, 98, 105),  # Bullish engulfing
        ]
        patterns = detector.detect(candles)
        engulfing = [p for p in patterns if p.pattern_type == PatternType.BULLISH_ENGULFING]
        if engulfing:
            assert engulfing[0].start_index == 0
            assert engulfing[0].end_index == 1

    def test_three_candle_indices(self) -> None:
        """Test indices for three candle patterns."""
        detector = CandlestickPatternDetector()
        candles = [
            make_candle(110, 112, 100, 102),
            make_candle(102, 103, 99, 101),
            make_candle(101, 112, 100, 110),
        ]
        patterns = detector.detect(candles)
        stars = [p for p in patterns if p.pattern_type == PatternType.MORNING_STAR]
        if stars:
            assert stars[0].start_index == 0
            assert stars[0].end_index == 2
