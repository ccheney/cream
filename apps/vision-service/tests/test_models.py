"""Tests for vision service data models."""

from datetime import datetime

from vision_service.models import (
    BoundingBox,
    Candle,
    ChartAnalysisResult,
    DetectedPattern,
    ImageMetadata,
    LevelType,
    PatternSignal,
    PatternType,
    PriceLevel,
    ProcessedImage,
)


class TestBoundingBox:
    """Tests for BoundingBox dataclass."""

    def test_bounding_box_properties(self) -> None:
        """Test bounding box coordinate properties."""
        box = BoundingBox(x=10, y=20, width=100, height=50)
        assert box.x2 == 110
        assert box.y2 == 70
        assert box.center == (60, 45)

    def test_bounding_box_zero_size(self) -> None:
        """Test bounding box with zero dimensions."""
        box = BoundingBox(x=0, y=0, width=0, height=0)
        assert box.x2 == 0
        assert box.y2 == 0
        assert box.center == (0, 0)


class TestCandle:
    """Tests for Candle dataclass."""

    def test_bullish_candle(self) -> None:
        """Test bullish candle properties."""
        candle = Candle(open=100.0, high=110.0, low=95.0, close=108.0)
        assert candle.is_bullish is True
        assert candle.is_bearish is False
        assert candle.body == 8.0
        assert candle.range == 15.0

    def test_bearish_candle(self) -> None:
        """Test bearish candle properties."""
        candle = Candle(open=108.0, high=110.0, low=95.0, close=100.0)
        assert candle.is_bullish is False
        assert candle.is_bearish is True
        assert candle.body == 8.0

    def test_doji_candle(self) -> None:
        """Test doji candle (open == close)."""
        candle = Candle(open=100.0, high=105.0, low=95.0, close=100.0)
        assert candle.body == 0.0
        assert candle.is_bullish is False
        assert candle.is_bearish is False

    def test_candle_shadows(self) -> None:
        """Test shadow calculations."""
        candle = Candle(open=100.0, high=110.0, low=90.0, close=105.0)
        assert candle.upper_shadow == 5.0  # 110 - 105
        assert candle.lower_shadow == 10.0  # 100 - 90

    def test_candle_with_volume(self) -> None:
        """Test candle with volume."""
        candle = Candle(open=100.0, high=105.0, low=95.0, close=102.0, volume=1000000.0)
        assert candle.volume == 1000000.0

    def test_candle_with_timestamp(self) -> None:
        """Test candle with timestamp."""
        ts = datetime(2024, 1, 15, 14, 30)
        candle = Candle(open=100.0, high=105.0, low=95.0, close=102.0, timestamp=ts)
        assert candle.timestamp == ts


class TestDetectedPattern:
    """Tests for DetectedPattern dataclass."""

    def test_detected_pattern_required_fields(self) -> None:
        """Test pattern with required fields only."""
        pattern = DetectedPattern(
            pattern_type=PatternType.DOJI,
            signal=PatternSignal.NEUTRAL,
            confidence=0.8,
        )
        assert pattern.pattern_type == PatternType.DOJI
        assert pattern.signal == PatternSignal.NEUTRAL
        assert pattern.confidence == 0.8
        assert pattern.bounding_box is None

    def test_detected_pattern_all_fields(self) -> None:
        """Test pattern with all fields."""
        bbox = BoundingBox(x=10, y=20, width=100, height=50)
        pattern = DetectedPattern(
            pattern_type=PatternType.HAMMER,
            signal=PatternSignal.BULLISH,
            confidence=0.9,
            bounding_box=bbox,
            start_index=5,
            end_index=5,
            price_target=110.0,
            description="Bullish hammer pattern",
        )
        assert pattern.bounding_box == bbox
        assert pattern.price_target == 110.0


class TestPriceLevel:
    """Tests for PriceLevel dataclass."""

    def test_support_level(self) -> None:
        """Test support level creation."""
        level = PriceLevel(
            level_type=LevelType.SUPPORT,
            price=150.0,
            strength=0.8,
            touches=4,
            first_touch_index=10,
            last_touch_index=50,
        )
        assert level.level_type == LevelType.SUPPORT
        assert level.price == 150.0
        assert level.touches == 4

    def test_resistance_level(self) -> None:
        """Test resistance level creation."""
        level = PriceLevel(
            level_type=LevelType.RESISTANCE,
            price=175.0,
            strength=0.6,
            touches=3,
        )
        assert level.level_type == LevelType.RESISTANCE
        assert level.first_touch_index is None


class TestChartAnalysisResult:
    """Tests for ChartAnalysisResult dataclass."""

    def test_analysis_result_defaults(self) -> None:
        """Test analysis result with defaults."""
        result = ChartAnalysisResult(symbol="AAPL", timeframe="1h")
        assert result.symbol == "AAPL"
        assert result.timeframe == "1h"
        assert result.patterns == []
        assert result.support_levels == []
        assert result.overall_signal == PatternSignal.NEUTRAL
        assert isinstance(result.analyzed_at, datetime)

    def test_analysis_result_bullish_patterns(self) -> None:
        """Test bullish pattern filtering."""
        patterns = [
            DetectedPattern(PatternType.HAMMER, PatternSignal.BULLISH, 0.8),
            DetectedPattern(PatternType.DOJI, PatternSignal.NEUTRAL, 0.7),
            DetectedPattern(PatternType.SHOOTING_STAR, PatternSignal.BEARISH, 0.9),
            DetectedPattern(PatternType.MORNING_STAR, PatternSignal.BULLISH, 0.85),
        ]
        result = ChartAnalysisResult(
            symbol="AAPL",
            timeframe="1h",
            patterns=patterns,
        )
        assert len(result.bullish_patterns) == 2
        assert len(result.bearish_patterns) == 1


class TestImageMetadata:
    """Tests for ImageMetadata dataclass."""

    def test_image_metadata(self) -> None:
        """Test image metadata creation."""
        chart_region = BoundingBox(x=50, y=50, width=700, height=500)
        metadata = ImageMetadata(
            width=800,
            height=600,
            channels=3,
            chart_region=chart_region,
        )
        assert metadata.width == 800
        assert metadata.channels == 3
        assert metadata.chart_region == chart_region


class TestProcessedImage:
    """Tests for ProcessedImage dataclass."""

    def test_processed_image(self) -> None:
        """Test processed image creation."""
        metadata = ImageMetadata(width=1920, height=1080, channels=3)
        processed = ProcessedImage(
            original_width=1920,
            original_height=1080,
            processed_width=800,
            processed_height=600,
            metadata=metadata,
        )
        assert processed.original_width == 1920
        assert processed.processed_width == 800


class TestPatternTypes:
    """Tests for pattern type enums."""

    def test_candlestick_pattern_values(self) -> None:
        """Test candlestick pattern enum values."""
        assert PatternType.DOJI.value == "doji"
        assert PatternType.HAMMER.value == "hammer"
        assert PatternType.BULLISH_ENGULFING.value == "bullish_engulfing"

    def test_chart_pattern_values(self) -> None:
        """Test chart pattern enum values."""
        assert PatternType.HEAD_AND_SHOULDERS.value == "head_and_shoulders"
        assert PatternType.DOUBLE_TOP.value == "double_top"
        assert PatternType.ASCENDING_TRIANGLE.value == "ascending_triangle"

    def test_pattern_signal_values(self) -> None:
        """Test pattern signal enum values."""
        assert PatternSignal.BULLISH.value == "bullish"
        assert PatternSignal.BEARISH.value == "bearish"
        assert PatternSignal.NEUTRAL.value == "neutral"

    def test_level_type_values(self) -> None:
        """Test level type enum values."""
        assert LevelType.SUPPORT.value == "support"
        assert LevelType.RESISTANCE.value == "resistance"
