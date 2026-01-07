"""Main chart analyzer.

Combines pattern detection, support/resistance detection, and image preprocessing
to provide comprehensive chart analysis.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from .levels import LevelDetectorConfig, SupportResistanceDetector
from .models import (
    Candle,
    ChartAnalysisResult,
    DetectedPattern,
    PatternSignal,
    PriceLevel,
)
from .patterns import CandlestickPatternDetector, PatternDetectorConfig


@dataclass
class ChartAnalyzerConfig:
    """Configuration for chart analyzer."""

    # Pattern detection config
    pattern_config: PatternDetectorConfig | None = None

    # Level detection config
    level_config: LevelDetectorConfig | None = None

    # Minimum patterns for overall signal
    min_patterns_for_signal: int = 1

    # Weight for pattern signals vs level proximity
    pattern_weight: float = 0.7
    level_weight: float = 0.3


class ChartAnalyzer:
    """Main chart analyzer combining all analysis components."""

    def __init__(self, config: ChartAnalyzerConfig | None = None) -> None:
        """Initialize chart analyzer.

        Args:
            config: Analyzer configuration. Uses defaults if None.
        """
        self.config = config or ChartAnalyzerConfig()
        self.pattern_detector = CandlestickPatternDetector(self.config.pattern_config)
        self.level_detector = SupportResistanceDetector(self.config.level_config)

    def analyze(
        self,
        candles: list[Candle],
        symbol: str = "UNKNOWN",
        timeframe: str = "1h",
    ) -> ChartAnalysisResult:
        """Perform complete chart analysis.

        Args:
            candles: List of candles to analyze.
            symbol: Symbol being analyzed.
            timeframe: Timeframe of the candles.

        Returns:
            Complete analysis result.
        """
        # Detect patterns
        patterns = self.pattern_detector.detect(candles)

        # Detect support/resistance levels
        support_levels, resistance_levels = self.level_detector.detect(candles)

        # Calculate overall signal
        overall_signal, signal_confidence = self._calculate_overall_signal(
            patterns, support_levels, resistance_levels, candles
        )

        return ChartAnalysisResult(
            symbol=symbol,
            timeframe=timeframe,
            patterns=patterns,
            support_levels=support_levels,
            resistance_levels=resistance_levels,
            overall_signal=overall_signal,
            signal_confidence=signal_confidence,
            analyzed_at=datetime.utcnow(),
            num_candles_analyzed=len(candles),
        )

    def analyze_for_entry(
        self,
        candles: list[Candle],
        symbol: str = "UNKNOWN",
        timeframe: str = "1h",
    ) -> dict[str, Any]:
        """Analyze chart for entry opportunities.

        Returns a structured dict with entry recommendations.

        Args:
            candles: List of candles to analyze.
            symbol: Symbol being analyzed.
            timeframe: Timeframe of the candles.

        Returns:
            Dict with entry analysis including:
            - signal: overall signal direction
            - confidence: signal confidence
            - entry_type: suggested entry type
            - reasons: list of reasons for signal
            - risk_levels: nearby support/resistance for stops
        """
        result = self.analyze(candles, symbol, timeframe)
        current_price = candles[-1].close if candles else 0

        # Gather reasons for the signal
        reasons: list[str] = []
        for pattern in result.patterns:
            reasons.append(f"{pattern.pattern_type.value}: {pattern.description}")

        # Find nearest support/resistance for risk management
        nearest_support = self._find_nearest_level(current_price, result.support_levels)
        nearest_resistance = self._find_nearest_level(current_price, result.resistance_levels)

        # Determine entry type based on patterns and levels
        entry_type = self._determine_entry_type(result, current_price)

        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "current_price": current_price,
            "signal": result.overall_signal.value,
            "confidence": result.signal_confidence,
            "entry_type": entry_type,
            "reasons": reasons,
            "pattern_count": len(result.patterns),
            "bullish_patterns": len(result.bullish_patterns),
            "bearish_patterns": len(result.bearish_patterns),
            "nearest_support": nearest_support.price if nearest_support else None,
            "nearest_resistance": nearest_resistance.price if nearest_resistance else None,
            "analyzed_at": result.analyzed_at.isoformat(),
        }

    def _calculate_overall_signal(
        self,
        patterns: list[DetectedPattern],
        support_levels: list[PriceLevel],
        resistance_levels: list[PriceLevel],
        candles: list[Candle],
    ) -> tuple[PatternSignal, float]:
        """Calculate overall signal from all analysis components.

        Args:
            patterns: Detected patterns.
            support_levels: Support levels.
            resistance_levels: Resistance levels.
            candles: Original candles.

        Returns:
            Tuple of (signal, confidence).
        """
        if not patterns:
            return PatternSignal.NEUTRAL, 0.0

        # Calculate pattern-based signal
        bullish_score = sum(p.confidence for p in patterns if p.signal == PatternSignal.BULLISH)
        bearish_score = sum(p.confidence for p in patterns if p.signal == PatternSignal.BEARISH)

        # Adjust for level proximity
        if candles:
            current_price = candles[-1].close
            level_adjustment = self._calculate_level_adjustment(
                current_price, support_levels, resistance_levels
            )
            bullish_score += level_adjustment * self.config.level_weight
            bearish_score -= level_adjustment * self.config.level_weight

        # Determine signal
        total_score = bullish_score + bearish_score
        if total_score == 0:
            return PatternSignal.NEUTRAL, 0.0

        # Calculate confidence (normalized difference)
        score_diff = abs(bullish_score - bearish_score)
        confidence = min(1.0, score_diff / max(bullish_score, bearish_score, 1))

        if bullish_score > bearish_score:
            return PatternSignal.BULLISH, confidence
        elif bearish_score > bullish_score:
            return PatternSignal.BEARISH, confidence
        else:
            return PatternSignal.NEUTRAL, 0.0

    def _calculate_level_adjustment(
        self,
        price: float,
        support_levels: list[PriceLevel],
        resistance_levels: list[PriceLevel],
        tolerance: float = 0.02,
    ) -> float:
        """Calculate signal adjustment based on level proximity.

        Returns positive value if near support (bullish), negative if near resistance.

        Args:
            price: Current price.
            support_levels: Support levels.
            resistance_levels: Resistance levels.
            tolerance: Price tolerance for proximity check.

        Returns:
            Adjustment value (-1 to 1).
        """
        nearest_support = self._find_nearest_level(price, support_levels)
        nearest_resistance = self._find_nearest_level(price, resistance_levels)

        support_distance = float("inf")
        resistance_distance = float("inf")

        if nearest_support:
            support_distance = abs(price - nearest_support.price) / price
        if nearest_resistance:
            resistance_distance = abs(price - nearest_resistance.price) / price

        # Near support = bullish bias, near resistance = bearish bias
        if support_distance < tolerance and support_distance < resistance_distance:
            return nearest_support.strength if nearest_support else 0
        elif resistance_distance < tolerance and resistance_distance < support_distance:
            return -(nearest_resistance.strength if nearest_resistance else 0)

        return 0.0

    def _find_nearest_level(self, price: float, levels: list[PriceLevel]) -> PriceLevel | None:
        """Find nearest price level.

        Args:
            price: Current price.
            levels: List of price levels.

        Returns:
            Nearest level or None.
        """
        if not levels:
            return None

        return min(levels, key=lambda level: abs(level.price - price))

    def _determine_entry_type(self, result: ChartAnalysisResult, current_price: float) -> str:
        """Determine suggested entry type based on analysis.

        Args:
            result: Analysis result.
            current_price: Current price.

        Returns:
            Entry type string.
        """
        if result.signal_confidence < 0.3:
            return "wait"

        # Check if near support or resistance
        nearest_support = self._find_nearest_level(current_price, result.support_levels)
        nearest_resistance = self._find_nearest_level(current_price, result.resistance_levels)

        if result.overall_signal == PatternSignal.BULLISH:
            if (
                nearest_support
                and abs(current_price - nearest_support.price) / current_price < 0.02
            ):
                return "buy_at_support"
            return "buy_breakout" if result.signal_confidence > 0.6 else "buy_pullback"

        elif result.overall_signal == PatternSignal.BEARISH:
            if (
                nearest_resistance
                and abs(current_price - nearest_resistance.price) / current_price < 0.02
            ):
                return "sell_at_resistance"
            return "sell_breakdown" if result.signal_confidence > 0.6 else "sell_rally"

        return "wait"


def analyze_candles(
    candles: list[Candle],
    symbol: str = "UNKNOWN",
    timeframe: str = "1h",
) -> ChartAnalysisResult:
    """Convenience function to analyze candles with default config.

    Args:
        candles: List of candles to analyze.
        symbol: Symbol being analyzed.
        timeframe: Timeframe of the candles.

    Returns:
        Complete analysis result.
    """
    analyzer = ChartAnalyzer()
    return analyzer.analyze(candles, symbol, timeframe)
