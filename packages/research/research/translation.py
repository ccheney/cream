"""
Python → TypeScript Translation System

Orchestrates the translation of validated Python factors to production
TypeScript, maintaining exact numerical equivalence through golden file testing.

See: docs/plans/20-research-to-production-pipeline.md - Phase 4

The translation process:
1. Generate golden files from Python implementation
2. Provide translation context (source, params, features)
3. Validate TypeScript implementation against golden files
4. Report equivalence results
"""

from __future__ import annotations

import asyncio
import inspect
import json
import logging
import textwrap
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .hypothesis_alignment import Hypothesis
    from .strategies.base import ResearchFactor

logger = logging.getLogger(__name__)


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


class TranslationOrchestrator:
    """
    Orchestrate Python to TypeScript translation.

    Coordinates:
    1. Golden file generation from Python
    2. Context preparation for translation
    3. Equivalence testing of translated code

    Example:
        orchestrator = TranslationOrchestrator()
        result = await orchestrator.translate(factor, hypothesis)
        if result.equivalence_passed:
            print("Translation successful!")
    """

    def __init__(self, config: TranslationConfig | None = None) -> None:
        """
        Initialize the orchestrator.

        Args:
            config: Translation configuration
        """
        self.config = config or TranslationConfig()

    async def prepare_translation_context(
        self,
        factor: ResearchFactor,
        hypothesis: Hypothesis,
    ) -> TranslationContext:
        """
        Prepare context for translating a factor.

        Generates golden files and builds translation context.

        Args:
            factor: Python factor to translate
            hypothesis: Associated hypothesis

        Returns:
            TranslationContext with all necessary information
        """
        from .equivalence import EquivalenceValidator

        # Generate golden files
        validator = EquivalenceValidator(
            factor.metadata.factor_id,
            tolerance=self.config.tolerance,
        )

        params = factor.get_parameters()
        golden_dir = await validator.generate_golden_files(
            factor,
            params,
            n_samples=self.config.golden_samples,
        )

        # Extract source code
        python_source = self._get_factor_source(factor)
        param_source = self._get_parameter_source(factor)

        # Get module path
        module_path = self._get_module_path(factor)

        return TranslationContext(
            factor_id=factor.metadata.factor_id,
            hypothesis_id=hypothesis.hypothesis_id,
            python_source=python_source,
            parameter_dataclass=param_source,
            required_features=factor.get_required_features(),
            golden_input_path=str(golden_dir / "input_sample.json"),
            golden_output_path=str(golden_dir / "expected_output.json"),
            golden_params_path=str(golden_dir / "params.json"),
            python_module_path=module_path,
            parameter_defaults=params,
        )

    def _get_factor_source(self, factor: ResearchFactor) -> str:
        """Extract source code of compute_signal method."""
        try:
            source = inspect.getsource(factor.compute_signal)
            return textwrap.dedent(source)
        except (OSError, TypeError) as e:
            logger.warning(f"Could not get source for compute_signal: {e}")
            return "# Source not available"

    def _get_parameter_source(self, factor: ResearchFactor) -> str:
        """Extract parameter-related source code."""
        try:
            # Try to get get_parameters source
            source = inspect.getsource(factor.get_parameters)
            return textwrap.dedent(source)
        except (OSError, TypeError):
            # Fall back to string representation of parameters
            return f"# Default parameters: {factor.get_parameters()}"

    def _get_module_path(self, factor: ResearchFactor) -> str:
        """Get the module path for the factor."""
        try:
            module = inspect.getmodule(factor.__class__)
            if module and module.__file__:
                return module.__file__
        except Exception:
            pass
        return f"packages/research/research/strategies/{factor.metadata.factor_id}/factor.py"

    async def validate_translation(
        self,
        factor_id: str,
        typescript_output: list[float] | None = None,
    ) -> TranslationResult:
        """
        Validate TypeScript translation against golden files.

        Can validate either:
        1. TypeScript output provided directly
        2. By running TypeScript tests (if typescript_output is None)

        Args:
            factor_id: Factor ID to validate
            typescript_output: Optional TypeScript output to validate

        Returns:
            TranslationResult with equivalence status
        """
        from .equivalence import EquivalenceValidator

        validator = EquivalenceValidator(
            factor_id,
            tolerance=self.config.tolerance,
        )

        # If output provided, validate directly
        if typescript_output is not None:
            result = await validator.validate_output(typescript_output)

            return TranslationResult(
                factor_id=factor_id,
                typescript_path=self.config.typescript_output_dir / factor_id,
                equivalence_passed=result.passed,
                max_divergence=result.max_divergence,
                mean_divergence=result.mean_divergence,
                failed_indices=result.failed_indices,
            )

        # Otherwise, try to run TypeScript tests
        return await self._run_typescript_tests(factor_id)

    async def _run_typescript_tests(self, factor_id: str) -> TranslationResult:
        """
        Run TypeScript equivalence tests.

        Args:
            factor_id: Factor ID to test

        Returns:
            TranslationResult from test run
        """
        ts_path = self.config.typescript_output_dir / factor_id

        # Check if TypeScript implementation exists
        if not ts_path.exists():
            return TranslationResult(
                factor_id=factor_id,
                typescript_path=None,
                equivalence_passed=False,
                max_divergence=float("inf"),
                mean_divergence=float("inf"),
                failed_indices=[],
                error_message=f"TypeScript implementation not found at {ts_path}",
            )

        # Run bun test
        try:
            result = await asyncio.wait_for(
                asyncio.create_subprocess_exec(
                    "bun",
                    "test",
                    str(ts_path / "equivalence.test.ts"),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                ),
                timeout=self.config.run_tests_timeout,
            )

            stdout, stderr = await result.communicate()

            if result.returncode == 0:
                return TranslationResult(
                    factor_id=factor_id,
                    typescript_path=ts_path,
                    equivalence_passed=True,
                    max_divergence=0.0,
                    mean_divergence=0.0,
                    failed_indices=[],
                )
            else:
                return TranslationResult(
                    factor_id=factor_id,
                    typescript_path=ts_path,
                    equivalence_passed=False,
                    max_divergence=float("inf"),
                    mean_divergence=float("inf"),
                    failed_indices=[],
                    error_message=stderr.decode() if stderr else stdout.decode(),
                )

        except TimeoutError:
            return TranslationResult(
                factor_id=factor_id,
                typescript_path=ts_path,
                equivalence_passed=False,
                max_divergence=float("inf"),
                mean_divergence=float("inf"),
                failed_indices=[],
                error_message=f"Test timed out after {self.config.run_tests_timeout}s",
            )
        except FileNotFoundError:
            return TranslationResult(
                factor_id=factor_id,
                typescript_path=ts_path,
                equivalence_passed=False,
                max_divergence=float("inf"),
                mean_divergence=float("inf"),
                failed_indices=[],
                error_message="bun not found - cannot run TypeScript tests",
            )

    async def translate(
        self,
        factor: ResearchFactor,
        hypothesis: Hypothesis,
    ) -> tuple[TranslationContext, TranslationResult | None]:
        """
        Prepare translation and optionally validate if TypeScript exists.

        This method:
        1. Generates golden files from Python
        2. Prepares translation context
        3. If TypeScript already exists, validates it

        The actual code translation is done externally (e.g., by Claude Code).

        Args:
            factor: Python factor to translate
            hypothesis: Associated hypothesis

        Returns:
            Tuple of (TranslationContext, TranslationResult or None)
        """
        # Prepare context
        context = await self.prepare_translation_context(factor, hypothesis)

        # Check if TypeScript implementation already exists
        ts_path = self.config.typescript_output_dir / factor.metadata.factor_id
        if ts_path.exists():
            result = await self.validate_translation(factor.metadata.factor_id)
            return context, result

        return context, None


def generate_typescript_template(
    context: TranslationContext,
    output_dir: Path | None = None,
) -> Path:
    """
    Generate TypeScript factor template files.

    Creates the directory structure and template files for a new factor.
    The actual implementation must be filled in by Claude Code.

    Args:
        context: Translation context with factor details
        output_dir: Output directory (default: packages/indicators/src/factors)

    Returns:
        Path to generated factor directory
    """
    base_dir = output_dir or Path("packages/indicators/src/factors")
    factor_dir = base_dir / context.factor_id

    factor_dir.mkdir(parents=True, exist_ok=True)

    # Generate schema.ts
    schema_content = f"""import {{ z }} from "zod";

// Zod schema for {context.factor_id} parameters
// MUST match Python parameter dataclass exactly
export const FactorParamsSchema = z.object({{
  // TODO: Add parameter schemas matching Python
  // Example: period: z.number().int().min(1).default(14),
{_generate_param_schema(context.parameter_defaults)}
}});

export type FactorParams = z.infer<typeof FactorParamsSchema>;

export const DEFAULT_PARAMS: FactorParams = {json.dumps(context.parameter_defaults, indent=2)};
"""

    (factor_dir / "schema.ts").write_text(schema_content)

    # Generate index.ts
    index_content = f'''import type {{ Candle }} from "../../types";
import {{ FactorParamsSchema, DEFAULT_PARAMS, type FactorParams }} from "./schema";

// Factor metadata
export const metadata = {{
  factorId: "{context.factor_id}",
  hypothesisId: "{context.hypothesis_id}",
  version: 1,
  author: "claude-code",
  createdAt: new Date().toISOString(),
  pythonModule: "{context.python_module_path}",
}} as const;

export {{ FactorParamsSchema, DEFAULT_PARAMS, type FactorParams }} from "./schema";

/**
 * Compute factor signal from candle data.
 *
 * MUST produce identical output to Python implementation
 * within tolerance of 0.0001.
 *
 * Required features: {", ".join(context.required_features)}
 */
export function computeSignal(
  candles: Candle[],
  params: FactorParams = DEFAULT_PARAMS
): number[] {{
  // TODO: Implement matching Python exactly
  // See: {context.python_module_path}
  throw new Error("Not implemented - translate from Python");
}}

/**
 * Get number of candles required for warmup.
 */
export function requiredPeriods(params: FactorParams = DEFAULT_PARAMS): number {{
  // TODO: Return warmup period
  return 0;
}}

// Calculator interface for pipeline integration
export const factorCalculator = {{
  name: metadata.factorId,
  compute: computeSignal,
  requiredPeriods,
  defaultParams: DEFAULT_PARAMS,
}};
'''

    (factor_dir / "index.ts").write_text(index_content)

    # Generate equivalence.test.ts
    test_content = f"""import {{ describe, test, expect }} from "bun:test";
import {{ computeSignal, FactorParamsSchema, metadata }} from "./index";

const GOLDEN_DIR = "packages/research/golden/{context.factor_id}";
const TOLERANCE = 0.0001;

/**
 * Candle data structure for testing.
 */
interface TestCandle {{
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}}

describe(`${{metadata.factorId}} equivalence`, () => {{
  test("TypeScript output matches Python golden file", async () => {{
    // Load golden files (JSON format for cross-language compatibility)
    const inputFile = Bun.file(`${{GOLDEN_DIR}}/input_sample.json`);
    const outputFile = Bun.file(`${{GOLDEN_DIR}}/expected_output.json`);
    const paramsFile = Bun.file(`${{GOLDEN_DIR}}/params.json`);

    const candles = (await inputFile.json()) as TestCandle[];
    const expectedOutput = (await outputFile.json()) as {{ signal: number }}[];
    const params = await paramsFile.json();

    // Validate params against schema
    const validatedParams = FactorParamsSchema.parse(params);

    // Compute TypeScript output
    const output = computeSignal(candles, validatedParams);

    // Compare with tolerance
    expect(output.length).toBe(expectedOutput.length);
    for (let i = 0; i < output.length; i++) {{
      const diff = Math.abs(output[i] - expectedOutput[i].signal);
      expect(diff).toBeLessThan(TOLERANCE);
    }}
  }});
}});
"""

    (factor_dir / "equivalence.test.ts").write_text(test_content)

    # Generate README.md
    readme_content = f"""# {context.factor_id}

## Overview

Translated from Python factor for production use.

- **Factor ID**: {context.factor_id}
- **Hypothesis ID**: {context.hypothesis_id}
- **Python Module**: `{context.python_module_path}`

## Parameters

```json
{json.dumps(context.parameter_defaults, indent=2)}
```

## Required Features

{chr(10).join(f"- `{f}`" for f in context.required_features)}

## Golden Files

- Input: `{context.golden_input_path}`
- Expected Output: `{context.golden_output_path}`
- Parameters: `{context.golden_params_path}`

## Equivalence Testing

Run equivalence tests:

```bash
bun test {factor_dir}/equivalence.test.ts
```

The TypeScript implementation must produce output within tolerance (0.0001) of the Python golden file.
"""

    (factor_dir / "README.md").write_text(readme_content)

    logger.info(f"Generated TypeScript template at {factor_dir}")
    return factor_dir


def _generate_param_schema(params: dict[str, Any]) -> str:
    """Generate Zod schema entries from parameter dictionary."""
    lines = []
    for key, value in params.items():
        if isinstance(value, bool):
            lines.append(f"  {key}: z.boolean().default({str(value).lower()}),")
        elif isinstance(value, int):
            lines.append(f"  {key}: z.number().int().default({value}),")
        elif isinstance(value, float):
            lines.append(f"  {key}: z.number().default({value}),")
        elif isinstance(value, str):
            lines.append(f'  {key}: z.string().default("{value}"),')
        else:
            lines.append(f"  // {key}: unknown type - {type(value).__name__}")
    return "\n".join(lines) if lines else "  // No parameters"
