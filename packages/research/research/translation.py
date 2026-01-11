"""
Python to TypeScript Translation System.

This module re-exports from the translation package for backward compatibility.
All functionality has been refactored into:
- translation/types.py: Dataclasses and configuration
- translation/translator.py: TranslationOrchestrator
- translation/converters.py: Template generation utilities

See: docs/plans/20-research-to-production-pipeline.md - Phase 4
"""

from research.translation import (
    TranslationConfig,
    TranslationContext,
    TranslationOrchestrator,
    TranslationResult,
    _generate_param_schema,
    generate_typescript_template,
)

__all__ = [
    "TranslationConfig",
    "TranslationContext",
    "TranslationOrchestrator",
    "TranslationResult",
    "_generate_param_schema",
    "generate_typescript_template",
]
