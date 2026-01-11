"""Base exception classes for the research layer."""

from __future__ import annotations

from typing import Any


class ResearchError(Exception):
    """Base exception for all research layer errors."""

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        """
        Initialize research error.

        Args:
            message: Human-readable error message.
            details: Additional error context.
        """
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "error_type": self.__class__.__name__,
            "message": self.message,
            "details": self.details,
        }
