"""
Validation Protocol Definitions

Provides protocol interfaces for external data providers used in validation.
"""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    pass


class UniverseProvider(Protocol):
    """Protocol for providing historical universe constituents."""

    def get_constituents(self, as_of_date: date) -> set[str]:
        """Get universe constituents as of a specific date."""
        ...


class CorporateActionProvider(Protocol):
    """Protocol for providing corporate action data."""

    def get_actions(
        self,
        symbol: str,
        start_date: date,
        end_date: date,
    ) -> list[dict[str, Any]]:
        """Get corporate actions for a symbol in date range."""
        ...


__all__ = ["CorporateActionProvider", "UniverseProvider"]
