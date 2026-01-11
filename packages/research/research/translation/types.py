"""
Type definitions for Python to TypeScript translation.

Contains dataclasses and configuration types used throughout
the translation system.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class TranslationContext:
    """Context for translating a Python factor to TypeScript."""

    factor_id: str
    """Unique factor identifier."""

    hypothesis_id: str
    """Associated hypothesis identifier."""

    python_source: str
    """Python source code of compute_signal method."""

    parameter_dataclass: str
    """Python source of parameter dataclass (if any)."""

    required_features: list[str]
    """List of required input features (e.g., ['close', 'volume'])."""

    golden_input_path: str
    """Path to golden input JSON file (for TypeScript)."""

    golden_output_path: str
    """Path to golden expected output JSON file (for TypeScript)."""

    golden_params_path: str
    """Path to golden parameters JSON file."""

    python_module_path: str
    """Path to the Python module containing the factor."""

    parameter_defaults: dict[str, Any] = field(default_factory=dict)
    """Default parameter values."""

    def to_prompt_context(self) -> str:
        """Format context for LLM translation prompt."""
        return f"""## Python Factor to Translate

**Factor ID**: {self.factor_id}
**Hypothesis ID**: {self.hypothesis_id}

### Python Source Code

```python
{self.python_source}
```

### Parameter Defaults

```json
{json.dumps(self.parameter_defaults, indent=2)}
```

### Required Features

{chr(10).join(f"- {f}" for f in self.required_features)}

### Golden File Locations

- Input: `{self.golden_input_path}`
- Expected Output: `{self.golden_output_path}`
- Parameters: `{self.golden_params_path}`

### Python Module

`{self.python_module_path}`
"""


@dataclass
class TranslationResult:
    """Result of Python to TypeScript translation."""

    factor_id: str
    """Factor that was translated."""

    typescript_path: Path | None
    """Path to generated TypeScript code (if successful)."""

    equivalence_passed: bool
    """Whether TypeScript output matches Python golden file."""

    max_divergence: float
    """Maximum numerical divergence found."""

    mean_divergence: float
    """Mean numerical divergence."""

    failed_indices: list[int]
    """Indices where divergence exceeded tolerance."""

    error_message: str | None = None
    """Error message if translation failed."""

    def summary(self) -> str:
        """Get human-readable summary."""
        status = "PASSED" if self.equivalence_passed else "FAILED"
        return (
            f"[{status}] Translation for {self.factor_id}\n"
            f"Max divergence: {self.max_divergence:.6f}\n"
            f"Mean divergence: {self.mean_divergence:.6f}\n"
            f"Failed indices: {len(self.failed_indices)}"
        )


@dataclass
class TranslationConfig:
    """Configuration for translation."""

    tolerance: float = 0.0001
    """Maximum allowed numerical divergence."""

    typescript_output_dir: Path = Path("packages/indicators/src/factors")
    """Directory for generated TypeScript factors."""

    golden_samples: int = 1000
    """Number of samples in golden files."""

    run_tests_timeout: int = 60
    """Timeout for running equivalence tests (seconds)."""
