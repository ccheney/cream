# Vision Service

Chart analysis and computer vision service for the Cream trading system.

## Overview

Performs technical analysis on candlestick data:

- **Candlestick Pattern Detection** - 11+ patterns (hammers, doji, engulfing, etc.)
- **Support/Resistance Levels** - Pivot point clustering with strength scoring
- **Signal Generation** - Bullish/bearish/neutral with confidence
- **Image Preprocessing** - OpenCV for chart image analysis

## Key Components

### ChartAnalyzer (`analyzer.py`)

Main orchestrator combining pattern and level detection:

```python
from vision_service import ChartAnalyzer, Candle

candles = [Candle(open=100, high=101.5, low=99, close=101), ...]
analyzer = ChartAnalyzer()
result = analyzer.analyze(candles, symbol="AAPL", timeframe="1h")

print(result.overall_signal)      # BULLISH/BEARISH/NEUTRAL
print(result.signal_confidence)   # 0.0-1.0
print(result.patterns)            # Detected patterns
```

### CandlestickPatternDetector (`patterns.py`)

Detects 11+ candlestick patterns:
- Single: Doji, Hammer, Inverted Hammer, Hanging Man, Shooting Star
- Two-candle: Bullish/Bearish Engulfing
- Three-candle: Morning Star, Evening Star, Three White Soldiers, Three Black Crows

### SupportResistanceDetector (`levels.py`)

Identifies price levels using pivot clustering:

```python
from vision_service import SupportResistanceDetector

detector = SupportResistanceDetector()
support, resistance = detector.detect(candles)
```

### ChartPreprocessor (`preprocessor.py`)

Image processing for chart analysis:
- Resizing and normalization
- Brightness/contrast enhancement
- Chart region auto-detection

## Installation

```bash
cd apps/vision-service
uv pip install -e ".[dev]"
```

## Usage

```python
from vision_service import ChartAnalyzer

analyzer = ChartAnalyzer()
entry_result = analyzer.analyze_for_entry(candles, symbol="AAPL", timeframe="1h")

print(entry_result)
# {
#   "signal": "bullish",
#   "confidence": 0.75,
#   "entry_type": "buy_at_support",
#   "nearest_support": 99.5,
#   "nearest_resistance": 105.0,
# }
```

## Testing

```bash
uv run --extra dev pytest
```

## Dependencies

- `pillow` (12.1+) - Image processing
- `opencv-python` (4.12+) - Computer vision
- `numpy` (2.x) - Numerical computing
- `pytest` (9.0+) - Testing

## Integration

Used in the OODA loop's **Observe phase** to analyze market conditions and provide technical signals to the 8-agent consensus network.
