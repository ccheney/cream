"""Validation-related errors and types for the research layer."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ErrorSeverity(Enum):
    """Severity level for research errors."""

    WARNING = "warning"
    """Minor issue that should be logged but doesn't block execution."""

    ERROR = "error"
    """Significant issue that may affect results quality."""

    CRITICAL = "critical"
    """Severe issue that should block execution."""


@dataclass
class ValidationIssue:
    """A single validation issue found during data quality checks."""

    severity: ErrorSeverity
    """Severity level of the issue."""

    error_type: str
    """Error type identifier."""

    message: str
    """Human-readable description."""

    details: dict[str, Any] = field(default_factory=dict)
    """Additional context."""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "severity": self.severity.value,
            "error_type": self.error_type,
            "message": self.message,
            "details": self.details,
        }
