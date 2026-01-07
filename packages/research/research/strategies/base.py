"""
ResearchFactor Base Class

Abstract base class for all research factors with AlphaAgent-style
regularization constraints including symbolic length, parameter count,
feature parsimony, originality, and hypothesis alignment.

See: docs/plans/20-research-to-production-pipeline.md - Phase 2
Reference: https://arxiv.org/html/2502.16789v2 (AlphaAgent)
"""

from __future__ import annotations

import ast
import inspect
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING, Any

import polars as pl

if TYPE_CHECKING:
    pass


@dataclass
class RegularizationMetrics:
    """
    Metrics for AlphaAgent-style regularization.

    Combined regularization term: R(f, h) = alpha1*SL(f) + alpha2*PC(f) + alpha3*ER(f, h)

    Where:
    - SL(f) = Symbolic Length - AST node count (complexity penalty)
    - PC(f) = Parameter Count - number of tunable parameters
    - ER(f, h) = Exploration Regularization:
        - Originality: AST similarity vs existing factors
        - Hypothesis Alignment: LLM-evaluated consistency
        - Feature Parsimony: Log penalty on features used
    """

    symbolic_length: int
    """AST node count - complexity measure."""

    parameter_count: int
    """Number of tunable parameters."""

    feature_count: int
    """Number of input features used."""

    originality_score: float = 0.0
    """Originality vs Factor Zoo (0-1, 1=completely novel)."""

    hypothesis_alignment: float = 0.0
    """LLM-evaluated consistency with research hypothesis (0-1)."""

    def combined_regularization(
        self,
        alpha1: float = 0.01,
        alpha2: float = 0.1,
        alpha3: float = 0.5,
    ) -> float:
        """
        Compute combined regularization penalty.

        Lower is better. Factors that are too complex, have too many
        parameters, or lack originality receive higher penalties.

        Args:
            alpha1: Weight for symbolic length penalty
            alpha2: Weight for parameter count penalty
            alpha3: Weight for exploration regularization

        Returns:
            Combined regularization penalty (lower = better)
        """
        sl_penalty = alpha1 * self.symbolic_length
        pc_penalty = alpha2 * self.parameter_count

        # Exploration regularization: penalize low originality and low alignment
        originality_penalty = 1.0 - self.originality_score
        alignment_penalty = 1.0 - self.hypothesis_alignment
        er_penalty = alpha3 * (originality_penalty + alignment_penalty)

        return sl_penalty + pc_penalty + er_penalty


@dataclass
class FactorMetadata:
    """Metadata for factor tracking in the Factor Zoo."""

    factor_id: str
    """Unique identifier for this factor."""

    hypothesis_id: str
    """ID of the research hypothesis this factor implements."""

    created_at: str = ""
    """ISO-8601 timestamp when factor was created."""

    author: str = "claude-code"
    """Author: 'claude-code' for LLM-generated, or human name."""

    version: int = 1
    """Factor version for iteration tracking."""

    regularization: RegularizationMetrics = field(
        default_factory=lambda: RegularizationMetrics(
            symbolic_length=0,
            parameter_count=0,
            feature_count=0,
        )
    )
    """Regularization metrics computed for this factor."""

    source_hash: str = ""
    """Hash of compute_signal source for deduplication."""

    notes: str = ""
    """Additional notes or observations."""

    def __post_init__(self) -> None:
        """Set defaults after initialization."""
        if not self.created_at:
            self.created_at = datetime.now().isoformat()


class ResearchFactor(ABC):
    """
    Base class for all research factors.

    Enforces AlphaAgent-style regularization constraints to prevent
    overfitting and ensure factor quality:

    - MAX_SYMBOLIC_LENGTH: Limits AST complexity (prevents over-engineering)
    - MAX_PARAMETERS: Limits tunable params (prevents curve-fitting)
    - MAX_FEATURES: Limits input features (feature parsimony)
    - MIN_ORIGINALITY: Enforces novelty vs Factor Zoo
    - MIN_HYPOTHESIS_ALIGNMENT: Ensures factor matches research hypothesis

    Example:
        ```python
        class RSIMeanReversion(ResearchFactor):
            def compute_signal(self, data: pl.DataFrame) -> pl.Series:
                rsi = compute_rsi(data["close"], self._params.get("period", 14))
                threshold = self._params.get("threshold", 30)
                return (rsi < threshold).cast(pl.Float64)

            def get_parameters(self) -> dict[str, Any]:
                return {"period": 14, "threshold": 30}

            def get_required_features(self) -> list[str]:
                return ["close"]
        ```
    """

    # Regularization constraints from AlphaAgent
    MAX_SYMBOLIC_LENGTH: int = 150
    """Maximum AST node count (complexity limit)."""

    MAX_PARAMETERS: int = 10
    """Maximum tunable parameters (curve-fitting limit)."""

    MAX_FEATURES: int = 8
    """Maximum input features (parsimony constraint)."""

    MIN_ORIGINALITY: float = 0.3
    """Minimum originality score vs Factor Zoo."""

    MIN_HYPOTHESIS_ALIGNMENT: float = 0.7
    """Minimum LLM-evaluated hypothesis alignment."""

    def __init__(self, metadata: FactorMetadata) -> None:
        """
        Initialize the research factor.

        Args:
            metadata: Factor metadata for tracking
        """
        self.metadata = metadata
        self._params: dict[str, Any] = {}

    @abstractmethod
    def compute_signal(self, data: pl.DataFrame) -> pl.Series:
        """
        Compute factor signal from input data.

        This is the core factor logic. Implementations should be
        simple and focused to pass regularization constraints.

        Args:
            data: DataFrame with OHLCV columns and any additional features.
                  Expected columns: open, high, low, close, volume

        Returns:
            Series of signal values, one per row. Typically:
            - Continuous values (e.g., z-scores) for signal strength
            - Boolean-like (0/1) for binary signals
        """
        ...

    @abstractmethod
    def get_parameters(self) -> dict[str, Any]:
        """
        Return all tunable parameters with their default values.

        Used for parameter scanning and regularization checking.

        Returns:
            Dictionary of parameter names to default values
        """
        ...

    @abstractmethod
    def get_required_features(self) -> list[str]:
        """
        Return list of required input feature column names.

        Used for feature parsimony validation and data preparation.

        Returns:
            List of column names required in input DataFrame
        """
        ...

    def set_parameters(self, params: dict[str, Any]) -> None:
        """
        Set tunable parameters for backtesting.

        Args:
            params: Dictionary of parameter names to values
        """
        self._params = params.copy()

    def get_parameter(self, name: str, default: Any = None) -> Any:
        """
        Get a parameter value with fallback to default.

        Args:
            name: Parameter name
            default: Default value if not set

        Returns:
            Parameter value or default
        """
        return self._params.get(name, self.get_parameters().get(name, default))

    def validate_regularization(self) -> tuple[bool, list[str]]:
        """
        Validate factor against regularization constraints.

        Returns:
            Tuple of (is_valid, list_of_violations)
        """
        violations: list[str] = []
        metrics = self.compute_regularization_metrics()

        if metrics.symbolic_length > self.MAX_SYMBOLIC_LENGTH:
            violations.append(
                f"Symbolic length {metrics.symbolic_length} > {self.MAX_SYMBOLIC_LENGTH}"
            )
        if metrics.parameter_count > self.MAX_PARAMETERS:
            violations.append(f"Parameter count {metrics.parameter_count} > {self.MAX_PARAMETERS}")
        if metrics.feature_count > self.MAX_FEATURES:
            violations.append(f"Feature count {metrics.feature_count} > {self.MAX_FEATURES}")
        if metrics.originality_score < self.MIN_ORIGINALITY:
            violations.append(
                f"Originality {metrics.originality_score:.2f} < {self.MIN_ORIGINALITY}"
            )
        if metrics.hypothesis_alignment < self.MIN_HYPOTHESIS_ALIGNMENT:
            violations.append(
                f"Hypothesis alignment {metrics.hypothesis_alignment:.2f} < {self.MIN_HYPOTHESIS_ALIGNMENT}"
            )

        return len(violations) == 0, violations

    def compute_regularization_metrics(self) -> RegularizationMetrics:
        """
        Compute regularization metrics for this factor.

        Note: originality_score and hypothesis_alignment must be set externally
        as they require comparison against Factor Zoo and LLM evaluation.

        Returns:
            RegularizationMetrics with computed values
        """
        import textwrap

        # AST analysis for symbolic length (complexity)
        source = inspect.getsource(self.compute_signal)
        source = textwrap.dedent(source)
        tree = ast.parse(source)
        symbolic_length = sum(1 for _ in ast.walk(tree))

        # Parameter and feature counts
        params = self.get_parameters()
        features = self.get_required_features()

        return RegularizationMetrics(
            symbolic_length=symbolic_length,
            parameter_count=len(params),
            feature_count=len(features),
            # These are computed externally:
            originality_score=self.metadata.regularization.originality_score,
            hypothesis_alignment=self.metadata.regularization.hypothesis_alignment,
        )

    def update_metadata_metrics(self) -> None:
        """Update metadata with current regularization metrics."""
        self.metadata.regularization = self.compute_regularization_metrics()

    def get_source_hash(self) -> str:
        """
        Get hash of compute_signal source for deduplication.

        Returns:
            SHA-256 hash of the source code
        """
        import hashlib
        import textwrap

        source = inspect.getsource(self.compute_signal)
        source = textwrap.dedent(source)
        return hashlib.sha256(source.encode()).hexdigest()[:16]

    def __repr__(self) -> str:
        """String representation."""
        return (
            f"{self.__class__.__name__}("
            f"factor_id={self.metadata.factor_id!r}, "
            f"hypothesis_id={self.metadata.hypothesis_id!r})"
        )
