"""
Fill Models Types

Enums and type definitions for fill models.
"""

from __future__ import annotations

from enum import Enum


class Side(Enum):
    """Trade side enum."""

    BUY = "BUY"
    SELL = "SELL"
    SHORT = "SHORT"
    COVER = "COVER"
