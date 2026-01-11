"""
Python to TypeScript Translation System.

Orchestrates the translation of validated Python factors to production
TypeScript, maintaining exact numerical equivalence through golden file testing.

See: docs/plans/20-research-to-production-pipeline.md - Phase 4

The translation process:
1. Generate golden files from Python implementation
2. Provide translation context (source, params, features)
3. Validate TypeScript implementation against golden files
4. Report equivalence results
"""

from .converters import _generate_param_schema, generate_typescript_template
from .translator import TranslationOrchestrator
from .types import TranslationConfig, TranslationContext, TranslationResult

__all__ = [
    "TranslationConfig",
    "TranslationContext",
    "TranslationOrchestrator",
    "TranslationResult",
    "_generate_param_schema",
    "generate_typescript_template",
]
