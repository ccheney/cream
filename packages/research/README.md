# @cream/research

Python research and backtesting utilities for the Cream trading system.

## Requirements

- Python 3.15+
- [uv](https://github.com/astral-sh/uv) package manager

## Setup

```bash
# Install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Navigate to the research package
cd packages/research

# Create virtual environment and install dependencies
uv venv
source .venv/bin/activate  # On Unix/macOS
# or: .venv\Scripts\activate  # On Windows

# Install package with dependencies
uv pip install -e ".[dev]"
```

## Dependencies

### Core Libraries

| Package | Purpose | Min Version |
|---------|---------|-------------|
| pandas | DataFrames | 2.2+ |
| numpy | Numerical arrays | 2.0+ |
| polars | Fast DataFrames (zero-copy) | 1.3+ |

### Backtesting Frameworks

| Package | Purpose | Min Version |
|---------|---------|-------------|
| vectorbt | Vectorized backtesting | 0.28+ |
| nautilus_trader | Event-driven backtesting | 1.200+ |

### Data Transport

| Package | Purpose | Min Version |
|---------|---------|-------------|
| pyarrow | Arrow Flight IPC | 15.0+ |

### Machine Learning

| Package | Purpose | Min Version |
|---------|---------|-------------|
| torch | Neural network training | 2.0+ |
| scikit-learn | Calibration (Platt, isotonic) | 1.5+ |

## Usage

### Backtesting with VectorBT

```python
import vectorbt as vbt
import pandas as pd

# Load candle data
df = pd.read_parquet("data/candles.parquet")

# Run backtest
pf = vbt.Portfolio.from_signals(
    close=df["close"],
    entries=df["signal"] > 0,
    exits=df["signal"] < 0,
    init_cash=100000,
)

# Analyze results
print(pf.stats())
```

### Event-Driven Backtesting with NautilusTrader

```python
from nautilus_trader.backtest.engine import BacktestEngine
from nautilus_trader.config import BacktestEngineConfig

# Configure engine
config = BacktestEngineConfig(
    trader_id="TRADER-001",
    log_level="INFO",
)
engine = BacktestEngine(config)

# Add data and strategies...
engine.run()
```

### Model Calibration

```python
from sklearn.calibration import CalibratedClassifierCV
from sklearn.isotonic import IsotonicRegression
import torch

# Platt scaling for probability calibration
calibrated_model = CalibratedClassifierCV(base_model, method="sigmoid")
calibrated_model.fit(X_cal, y_cal)

# Isotonic regression for monotonic calibration
ir = IsotonicRegression(out_of_bounds="clip")
ir.fit(raw_probs, actual_outcomes)
```

## Development

```bash
# Run tests
pytest

# Run tests with coverage
pytest --cov

# Lint code
ruff check .

# Format code
ruff format .

# Type check
mypy research/
```

## Testing

Tests are located in the `tests/` directory and use pytest.

```bash
# Run all tests
pytest

# Run specific test file
pytest tests/test_backtest.py

# Run with verbose output
pytest -v

# Skip slow tests
pytest -m "not slow"
```

## Coverage Requirements

- **Minimum coverage**: 70% (Standard tier)
- Coverage reports: HTML and XML formats
- See `pyproject.toml` for full configuration

## Integration with Cream

This package integrates with the Cream trading system via:

1. **Arrow Flight**: Receives historical data from the Rust execution engine
2. **Shared schemas**: Uses `@cream/schema-gen` Protobuf definitions
3. **Turbo tasks**: Build and test commands in monorepo `turbo.json`

## License

AGPL-3.0-only
