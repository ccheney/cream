"""Vision Service - Chart Analysis & Computer Vision.

This service handles:
- Chart image analysis
- Pattern recognition
- Support and resistance level detection
- Technical indicator detection from images
"""

__version__ = "0.1.0"

from .analyzer import ChartAnalyzer, ChartAnalyzerConfig, analyze_candles
from .levels import (
    LevelDetectorConfig,
    SupportResistanceDetector,
    find_nearest_level,
    is_near_resistance,
    is_near_support,
)
from .models import (
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
from .patterns import CandlestickPatternDetector, PatternDetectorConfig
from .preprocessor import (
    ChartPreprocessor,
    PreprocessorConfig,
    load_image,
    load_image_from_bytes,
)

__all__ = [
    # Analyzer
    "ChartAnalyzer",
    "ChartAnalyzerConfig",
    "analyze_candles",
    # Levels
    "LevelDetectorConfig",
    "SupportResistanceDetector",
    "find_nearest_level",
    "is_near_resistance",
    "is_near_support",
    # Models
    "BoundingBox",
    "Candle",
    "ChartAnalysisResult",
    "DetectedPattern",
    "ImageMetadata",
    "LevelType",
    "PatternSignal",
    "PatternType",
    "PriceLevel",
    "ProcessedImage",
    # Patterns
    "CandlestickPatternDetector",
    "PatternDetectorConfig",
    # Preprocessor
    "ChartPreprocessor",
    "PreprocessorConfig",
    "load_image",
    "load_image_from_bytes",
]
