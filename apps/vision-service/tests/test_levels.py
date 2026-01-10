"""Tests for support and resistance level detection."""

from vision_service.levels import (
    LevelDetectorConfig,
    SupportResistanceDetector,
    find_nearest_level,
    is_near_resistance,
    is_near_support,
)
from vision_service.models import Candle, LevelType


def make_candle(o: float, h: float, low: float, c: float) -> Candle:
    """Helper to create candles quickly."""
    return Candle(open=o, high=h, low=low, close=c)


def make_trending_candles(
    start: float, trend: float, count: int, volatility: float = 1.0
) -> list[Candle]:
    """Create trending candle data with pivot points.

    Args:
        start: Starting price.
        trend: Price change per candle (positive = up, negative = down).
        count: Number of candles.
        volatility: Range multiplier.

    Returns:
        List of candles.
    """
    candles = []
    price = start
    for i in range(count):
        # Add some oscillation to create pivot points
        offset = 2 * volatility if i % 3 == 0 else -volatility
        o = price
        c = price + trend
        h = max(o, c) + abs(offset)
        low = min(o, c) - abs(offset)
        candles.append(make_candle(o, h, low, c))
        price = c
    return candles


class TestSupportResistanceDetector:
    """Tests for SupportResistanceDetector class."""

    def test_detects_support_levels(self) -> None:
        """Test detection of support levels."""
        # Create data with clear support at ~95
        # Each bounce from support needs a unique low for pivot detection
        # The detector requires pivots to be strict local minima
        config = LevelDetectorConfig(min_touches=1, min_strength=0.0, pivot_lookback=2)
        detector = SupportResistanceDetector(config)

        # Build candles with clear pivot lows around 95
        candles = [
            make_candle(100, 101, 99, 99),  # Index 0
            make_candle(99, 100, 97, 97),  # Index 1
            make_candle(97, 98, 94.5, 96),  # Index 2: Pivot low
            make_candle(96, 99, 95, 98),  # Index 3
            make_candle(98, 100, 97, 99),  # Index 4
            make_candle(99, 100, 96, 97),  # Index 5
            make_candle(97, 98, 94.8, 96),  # Index 6: Another pivot low
            make_candle(96, 99, 95, 98),  # Index 7
            make_candle(98, 101, 97, 100),  # Index 8
        ]

        support, resistance = detector.detect(candles)

        # Should find support around 94-95
        assert len(support) > 0
        near_95 = [s for s in support if 93 <= s.price <= 97]
        assert len(near_95) > 0

    def test_detects_resistance_levels(self) -> None:
        """Test detection of resistance levels."""
        # Create data with clear resistance at ~105
        # The detector requires pivots to be strict local maxima
        config = LevelDetectorConfig(min_touches=1, min_strength=0.0, pivot_lookback=2)
        detector = SupportResistanceDetector(config)

        # Build candles with clear pivot highs around 105
        candles = [
            make_candle(100, 101, 99, 101),  # Index 0
            make_candle(101, 103, 100, 102),  # Index 1
            make_candle(102, 105.5, 101, 103),  # Index 2: Pivot high
            make_candle(103, 104, 101, 102),  # Index 3
            make_candle(102, 103, 100, 101),  # Index 4
            make_candle(101, 103, 100, 102),  # Index 5
            make_candle(102, 105.2, 101, 103),  # Index 6: Another pivot high
            make_candle(103, 104, 101, 102),  # Index 7
            make_candle(102, 103, 100, 101),  # Index 8
        ]

        support, resistance = detector.detect(candles)

        # Should find resistance around 105
        assert len(resistance) > 0
        near_105 = [r for r in resistance if 103 <= r.price <= 107]
        assert len(near_105) > 0

    def test_level_strength(self) -> None:
        """Test that level strength reflects touch count."""
        # More touches = higher strength
        config = LevelDetectorConfig(min_touches=2, min_strength=0.0)
        detector = SupportResistanceDetector(config)

        candles = make_trending_candles(100, 0.1, 50)
        support, resistance = detector.detect(candles)

        all_levels = support + resistance
        for level in all_levels:
            # Strength should be based on touches
            assert level.strength > 0
            assert level.strength <= 1.0

    def test_respects_min_touches(self) -> None:
        """Test that min_touches config is respected."""
        config = LevelDetectorConfig(min_touches=5)
        detector = SupportResistanceDetector(config)

        # Create simple data with few touches per level
        candles = make_trending_candles(100, 0.5, 20)
        support, resistance = detector.detect(candles)

        for level in support + resistance:
            assert level.touches >= 5

    def test_respects_max_levels(self) -> None:
        """Test that max_levels config is respected."""
        config = LevelDetectorConfig(max_levels=3, min_touches=1, min_strength=0.0)
        detector = SupportResistanceDetector(config)

        candles = make_trending_candles(100, 0.2, 100)
        support, resistance = detector.detect(candles)

        assert len(support) <= 3
        assert len(resistance) <= 3

    def test_detect_all_combined(self) -> None:
        """Test detect_all returns combined levels."""
        detector = SupportResistanceDetector()
        candles = make_trending_candles(100, 0.1, 50)
        all_levels = detector.detect_all(candles)

        support, resistance = detector.detect(candles)
        assert len(all_levels) == len(support) + len(resistance)

    def test_insufficient_data(self) -> None:
        """Test handling of insufficient data."""
        detector = SupportResistanceDetector()
        candles = [make_candle(100, 101, 99, 100)]  # Only 1 candle
        support, resistance = detector.detect(candles)

        assert support == []
        assert resistance == []


class TestFindNearestLevel:
    """Tests for find_nearest_level function."""

    def test_finds_nearest_support(self) -> None:
        """Test finding nearest support level."""
        from vision_service.models import PriceLevel

        levels = [
            PriceLevel(LevelType.SUPPORT, price=90.0, strength=0.8, touches=4),
            PriceLevel(LevelType.SUPPORT, price=95.0, strength=0.6, touches=3),
            PriceLevel(LevelType.SUPPORT, price=100.0, strength=0.7, touches=3),
        ]

        nearest = find_nearest_level(97.0, levels, tolerance_pct=0.05)
        assert nearest is not None
        assert nearest.price == 95.0

    def test_returns_none_outside_tolerance(self) -> None:
        """Test returns None when no level within tolerance."""
        from vision_service.models import PriceLevel

        levels = [
            PriceLevel(LevelType.SUPPORT, price=80.0, strength=0.8, touches=4),
        ]

        nearest = find_nearest_level(100.0, levels, tolerance_pct=0.05)
        assert nearest is None

    def test_empty_levels(self) -> None:
        """Test with empty levels list."""
        nearest = find_nearest_level(100.0, [], tolerance_pct=0.05)
        assert nearest is None


class TestIsNearSupport:
    """Tests for is_near_support function."""

    def test_near_support_true(self) -> None:
        """Test returns True when near support."""
        from vision_service.models import PriceLevel

        levels = [
            PriceLevel(LevelType.SUPPORT, price=100.0, strength=0.8, touches=4),
        ]
        assert is_near_support(101.0, levels, tolerance_pct=0.02) is True

    def test_near_support_false(self) -> None:
        """Test returns False when not near support."""
        from vision_service.models import PriceLevel

        levels = [
            PriceLevel(LevelType.SUPPORT, price=100.0, strength=0.8, touches=4),
        ]
        assert is_near_support(110.0, levels, tolerance_pct=0.02) is False


class TestIsNearResistance:
    """Tests for is_near_resistance function."""

    def test_near_resistance_true(self) -> None:
        """Test returns True when near resistance."""
        from vision_service.models import PriceLevel

        levels = [
            PriceLevel(LevelType.RESISTANCE, price=100.0, strength=0.8, touches=4),
        ]
        assert is_near_resistance(99.0, levels, tolerance_pct=0.02) is True

    def test_near_resistance_false(self) -> None:
        """Test returns False when not near resistance."""
        from vision_service.models import PriceLevel

        levels = [
            PriceLevel(LevelType.RESISTANCE, price=100.0, strength=0.8, touches=4),
        ]
        assert is_near_resistance(90.0, levels, tolerance_pct=0.02) is False


class TestLevelProperties:
    """Tests for PriceLevel properties."""

    def test_level_type(self) -> None:
        """Test level type is correctly assigned."""
        detector = SupportResistanceDetector()
        candles = make_trending_candles(100, 0.1, 50)
        support, resistance = detector.detect(candles)

        for level in support:
            assert level.level_type == LevelType.SUPPORT

        for level in resistance:
            assert level.level_type == LevelType.RESISTANCE

    def test_touch_indices(self) -> None:
        """Test touch indices are tracked."""
        config = LevelDetectorConfig(min_touches=2, min_strength=0.0)
        detector = SupportResistanceDetector(config)

        candles = make_trending_candles(100, 0.1, 50)
        support, resistance = detector.detect(candles)

        for level in support + resistance:
            if level.first_touch_index is not None:
                assert level.first_touch_index <= (level.last_touch_index or 0)
