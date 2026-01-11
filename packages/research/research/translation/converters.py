"""
Conversion utilities for TypeScript template generation.

Provides functions to generate TypeScript code templates
and convert Python types to Zod schemas.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from .types import TranslationContext

logger = logging.getLogger(__name__)


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

    _write_schema_file(factor_dir, context)
    _write_index_file(factor_dir, context)
    _write_test_file(factor_dir, context)
    _write_readme_file(factor_dir, context)

    logger.info(f"Generated TypeScript template at {factor_dir}")
    return factor_dir


def _write_schema_file(factor_dir: Path, context: TranslationContext) -> None:
    """Generate schema.ts file with Zod schemas."""
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


def _write_index_file(factor_dir: Path, context: TranslationContext) -> None:
    """Generate index.ts file with factor implementation template."""
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


def _write_test_file(factor_dir: Path, context: TranslationContext) -> None:
    """Generate equivalence.test.ts file."""
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


def _write_readme_file(factor_dir: Path, context: TranslationContext) -> None:
    """Generate README.md file."""
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
