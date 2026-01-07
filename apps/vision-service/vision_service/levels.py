"""Support and resistance level detection.

Identifies key price levels from OHLC data using pivot points and clustering.
"""

from dataclasses import dataclass

from .models import Candle, LevelType, PriceLevel


@dataclass
class LevelDetectorConfig:
    """Configuration for support/resistance detection."""

    # Tolerance for level matching (as percentage of price)
    level_tolerance: float = 0.005  # 0.5%

    # Minimum touches to consider a level significant
    min_touches: int = 2

    # Maximum number of levels to return
    max_levels: int = 10

    # Lookback for pivot detection
    pivot_lookback: int = 5

    # Minimum strength to include level
    min_strength: float = 0.3


class SupportResistanceDetector:
    """Detector for support and resistance levels."""

    def __init__(self, config: LevelDetectorConfig | None = None) -> None:
        """Initialize level detector.

        Args:
            config: Detection configuration. Uses defaults if None.
        """
        self.config = config or LevelDetectorConfig()

    def detect(self, candles: list[Candle]) -> tuple[list[PriceLevel], list[PriceLevel]]:
        """Detect support and resistance levels.

        Args:
            candles: List of candles to analyze.

        Returns:
            Tuple of (support_levels, resistance_levels) sorted by strength.
        """
        if len(candles) < self.config.pivot_lookback * 2 + 1:
            return [], []

        # Find pivot highs and lows
        pivot_highs = self._find_pivot_highs(candles)
        pivot_lows = self._find_pivot_lows(candles)

        # Cluster similar price levels
        resistance_levels = self._cluster_levels(pivot_highs, LevelType.RESISTANCE)
        support_levels = self._cluster_levels(pivot_lows, LevelType.SUPPORT)

        # Filter by strength and limit count
        resistance_levels = self._filter_and_rank(resistance_levels)
        support_levels = self._filter_and_rank(support_levels)

        return support_levels, resistance_levels

    def detect_all(self, candles: list[Candle]) -> list[PriceLevel]:
        """Detect all support and resistance levels combined.

        Args:
            candles: List of candles to analyze.

        Returns:
            Combined list of all levels sorted by strength.
        """
        support, resistance = self.detect(candles)
        combined = support + resistance
        return sorted(combined, key=lambda x: x.strength, reverse=True)

    def _find_pivot_highs(self, candles: list[Candle]) -> list[tuple[int, float]]:
        """Find pivot high points.

        A pivot high is a local maximum where the high is greater than
        surrounding highs within the lookback window.

        Args:
            candles: List of candles.

        Returns:
            List of (index, price) tuples for pivot highs.
        """
        pivots: list[tuple[int, float]] = []
        lookback = self.config.pivot_lookback

        for i in range(lookback, len(candles) - lookback):
            is_pivot = True
            current_high = candles[i].high

            # Check if this is a local maximum
            for j in range(i - lookback, i + lookback + 1):
                if j != i and candles[j].high >= current_high:
                    is_pivot = False
                    break

            if is_pivot:
                pivots.append((i, current_high))

        return pivots

    def _find_pivot_lows(self, candles: list[Candle]) -> list[tuple[int, float]]:
        """Find pivot low points.

        A pivot low is a local minimum where the low is less than
        surrounding lows within the lookback window.

        Args:
            candles: List of candles.

        Returns:
            List of (index, price) tuples for pivot lows.
        """
        pivots: list[tuple[int, float]] = []
        lookback = self.config.pivot_lookback

        for i in range(lookback, len(candles) - lookback):
            is_pivot = True
            current_low = candles[i].low

            # Check if this is a local minimum
            for j in range(i - lookback, i + lookback + 1):
                if j != i and candles[j].low <= current_low:
                    is_pivot = False
                    break

            if is_pivot:
                pivots.append((i, current_low))

        return pivots

    def _cluster_levels(
        self, pivots: list[tuple[int, float]], level_type: LevelType
    ) -> list[PriceLevel]:
        """Cluster nearby pivot points into price levels.

        Args:
            pivots: List of (index, price) pivot points.
            level_type: Type of level (support or resistance).

        Returns:
            List of clustered price levels.
        """
        if not pivots:
            return []

        # Sort by price
        sorted_pivots = sorted(pivots, key=lambda x: x[1])

        clusters: list[list[tuple[int, float]]] = []
        current_cluster: list[tuple[int, float]] = [sorted_pivots[0]]

        for pivot in sorted_pivots[1:]:
            # Check if pivot is close to current cluster
            cluster_avg = sum(p[1] for p in current_cluster) / len(current_cluster)
            tolerance = cluster_avg * self.config.level_tolerance

            if abs(pivot[1] - cluster_avg) <= tolerance:
                current_cluster.append(pivot)
            else:
                # Start new cluster
                clusters.append(current_cluster)
                current_cluster = [pivot]

        clusters.append(current_cluster)

        # Convert clusters to PriceLevels
        levels: list[PriceLevel] = []
        for cluster in clusters:
            if len(cluster) >= self.config.min_touches:
                avg_price = sum(p[1] for p in cluster) / len(cluster)
                touches = len(cluster)
                indices = [p[0] for p in cluster]

                # Strength based on number of touches (normalized)
                strength = min(1.0, touches / 5)

                levels.append(
                    PriceLevel(
                        level_type=level_type,
                        price=avg_price,
                        strength=strength,
                        touches=touches,
                        first_touch_index=min(indices),
                        last_touch_index=max(indices),
                    )
                )

        return levels

    def _filter_and_rank(self, levels: list[PriceLevel]) -> list[PriceLevel]:
        """Filter and rank levels by strength.

        Args:
            levels: List of price levels.

        Returns:
            Filtered and sorted list of levels.
        """
        # Filter by minimum strength
        filtered = [lvl for lvl in levels if lvl.strength >= self.config.min_strength]

        # Sort by strength (descending)
        filtered.sort(key=lambda x: x.strength, reverse=True)

        # Limit count
        return filtered[: self.config.max_levels]


def find_nearest_level(
    price: float, levels: list[PriceLevel], tolerance_pct: float = 0.02
) -> PriceLevel | None:
    """Find the nearest price level to a given price.

    Args:
        price: Current price to check.
        levels: List of price levels.
        tolerance_pct: Maximum distance as percentage of price.

    Returns:
        Nearest PriceLevel within tolerance, or None.
    """
    tolerance = price * tolerance_pct
    nearest: PriceLevel | None = None
    min_distance = float("inf")

    for level in levels:
        distance = abs(level.price - price)
        if distance < min_distance and distance <= tolerance:
            min_distance = distance
            nearest = level

    return nearest


def is_near_support(
    price: float, support_levels: list[PriceLevel], tolerance_pct: float = 0.02
) -> bool:
    """Check if price is near a support level.

    Args:
        price: Current price.
        support_levels: List of support levels.
        tolerance_pct: Tolerance as percentage.

    Returns:
        True if price is near support.
    """
    return find_nearest_level(price, support_levels, tolerance_pct) is not None


def is_near_resistance(
    price: float, resistance_levels: list[PriceLevel], tolerance_pct: float = 0.02
) -> bool:
    """Check if price is near a resistance level.

    Args:
        price: Current price.
        resistance_levels: List of resistance levels.
        tolerance_pct: Tolerance as percentage.

    Returns:
        True if price is near resistance.
    """
    return find_nearest_level(price, resistance_levels, tolerance_pct) is not None
