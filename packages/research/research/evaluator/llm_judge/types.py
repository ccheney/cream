"""
LLM Judge Types

Dataclasses for LLM judge evaluation responses and caching.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CacheEntry:
    """Cache entry for LLM responses."""

    score: float
    components: dict[str, float]
    feedback: str
