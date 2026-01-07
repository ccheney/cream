"""
Tests for ResearchFactor Base Class

Tests the abstract base class for research factors including
AlphaAgent-style regularization constraints.
"""

from __future__ import annotations

from typing import Any

import polars as pl

from research.strategies.base import (
    FactorMetadata,
    RegularizationMetrics,
    ResearchFactor,
)

# ============================================
# Concrete Test Implementations
# ============================================


class SimpleRSIFactor(ResearchFactor):
    """Simple RSI-based factor for testing."""

    def compute_signal(self, data: pl.DataFrame) -> pl.Series:
        """Compute RSI signal."""
        close = data["close"]
        period = self.get_parameter("period", 14)
        threshold = self.get_parameter("threshold", 30)

        # Simple RSI approximation
        delta = close.diff()
        gain = delta.clip(lower_bound=0).rolling_mean(window_size=period)
        loss = (-delta.clip(upper_bound=0)).rolling_mean(window_size=period)
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))

        return (rsi < threshold).cast(pl.Float64)

    def get_parameters(self) -> dict[str, Any]:
        return {"period": 14, "threshold": 30}

    def get_required_features(self) -> list[str]:
        return ["close"]


class ComplexFactor(ResearchFactor):
    """Complex factor that should fail regularization."""

    def compute_signal(self, data: pl.DataFrame) -> pl.Series:
        """Overly complex signal computation."""
        # Deliberately complex to exceed symbolic length
        close = data["close"]
        high = data["high"]
        low = data["low"]
        volume = data["volume"]
        open_ = data["open"]

        period1 = self.get_parameter("period1", 5)
        period2 = self.get_parameter("period2", 10)
        period3 = self.get_parameter("period3", 20)
        period4 = self.get_parameter("period4", 50)
        period5 = self.get_parameter("period5", 100)
        threshold1 = self.get_parameter("threshold1", 0.5)
        threshold2 = self.get_parameter("threshold2", 0.3)
        threshold3 = self.get_parameter("threshold3", 0.7)
        threshold4 = self.get_parameter("threshold4", 0.2)
        threshold5 = self.get_parameter("threshold5", 0.8)
        threshold6 = self.get_parameter("threshold6", 0.4)
        weight1 = self.get_parameter("weight1", 0.2)

        # Complex calculation with many operations
        ma1 = close.rolling_mean(window_size=period1)
        ma2 = close.rolling_mean(window_size=period2)
        ma3 = close.rolling_mean(window_size=period3)
        ma4 = close.rolling_mean(window_size=period4)
        ma5 = close.rolling_mean(window_size=period5)

        std1 = close.rolling_std(window_size=period1)
        std2 = close.rolling_std(window_size=period2)

        vol_ma = volume.rolling_mean(window_size=period1)
        range_ = high - low
        body = (close - open_).abs()

        signal = (
            ((close - ma1) / std1) * weight1
            + ((ma1 - ma2) / std2) * (1 - weight1)
            + ((close > ma3) & (close > ma4) & (close > ma5)).cast(pl.Float64) * threshold1
            + ((volume > vol_ma) & (range_ > body)).cast(pl.Float64) * threshold2
            + ((close - ma5) / close).clip(-threshold3, threshold3) * threshold4
            + ((ma1 > ma2) & (ma2 > ma3) & (ma3 > ma4)).cast(pl.Float64) * threshold5
            + ((high - close) / range_).fill_nan(0).clip(0, 1) * threshold6
        )

        return signal

    def get_parameters(self) -> dict[str, Any]:
        return {
            "period1": 5,
            "period2": 10,
            "period3": 20,
            "period4": 50,
            "period5": 100,
            "threshold1": 0.5,
            "threshold2": 0.3,
            "threshold3": 0.7,
            "threshold4": 0.2,
            "threshold5": 0.8,
            "threshold6": 0.4,
            "weight1": 0.2,
        }

    def get_required_features(self) -> list[str]:
        return ["open", "high", "low", "close", "volume", "vwap", "atr", "adx", "macd"]


# ============================================
# Tests
# ============================================


class TestRegularizationMetrics:
    """Tests for RegularizationMetrics dataclass."""

    def test_creation(self) -> None:
        """Test creating metrics."""
        metrics = RegularizationMetrics(
            symbolic_length=30,
            parameter_count=3,
            feature_count=2,
            originality_score=0.8,
            hypothesis_alignment=0.9,
        )
        assert metrics.symbolic_length == 30
        assert metrics.parameter_count == 3
        assert metrics.feature_count == 2
        assert metrics.originality_score == 0.8
        assert metrics.hypothesis_alignment == 0.9

    def test_default_values(self) -> None:
        """Test default values for optional fields."""
        metrics = RegularizationMetrics(
            symbolic_length=30,
            parameter_count=3,
            feature_count=2,
        )
        assert metrics.originality_score == 0.0
        assert metrics.hypothesis_alignment == 0.0

    def test_combined_regularization(self) -> None:
        """Test combined regularization calculation."""
        metrics = RegularizationMetrics(
            symbolic_length=30,
            parameter_count=5,
            feature_count=3,
            originality_score=0.8,  # 20% penalty
            hypothesis_alignment=0.9,  # 10% penalty
        )

        # Default weights: alpha1=0.01, alpha2=0.1, alpha3=0.5
        # sl_penalty = 0.01 * 30 = 0.3
        # pc_penalty = 0.1 * 5 = 0.5
        # er_penalty = 0.5 * (0.2 + 0.1) = 0.15
        # total = 0.95
        penalty = metrics.combined_regularization()
        assert abs(penalty - 0.95) < 0.01

    def test_combined_regularization_custom_weights(self) -> None:
        """Test combined regularization with custom weights."""
        metrics = RegularizationMetrics(
            symbolic_length=40,
            parameter_count=4,
            feature_count=2,
            originality_score=0.5,
            hypothesis_alignment=0.5,
        )

        # Custom weights
        penalty = metrics.combined_regularization(alpha1=0.02, alpha2=0.2, alpha3=1.0)
        # sl_penalty = 0.02 * 40 = 0.8
        # pc_penalty = 0.2 * 4 = 0.8
        # er_penalty = 1.0 * (0.5 + 0.5) = 1.0
        # total = 2.6
        assert abs(penalty - 2.6) < 0.01


class TestFactorMetadata:
    """Tests for FactorMetadata dataclass."""

    def test_creation(self) -> None:
        """Test creating metadata."""
        metadata = FactorMetadata(
            factor_id="factor-001",
            hypothesis_id="hypo-001",
            author="test-author",
            version=2,
        )
        assert metadata.factor_id == "factor-001"
        assert metadata.hypothesis_id == "hypo-001"
        assert metadata.author == "test-author"
        assert metadata.version == 2
        assert metadata.created_at != ""  # Auto-set

    def test_default_values(self) -> None:
        """Test default values."""
        metadata = FactorMetadata(
            factor_id="factor-001",
            hypothesis_id="hypo-001",
        )
        assert metadata.author == "claude-code"
        assert metadata.version == 1
        assert metadata.source_hash == ""
        assert metadata.notes == ""


class TestResearchFactor:
    """Tests for ResearchFactor abstract base class."""

    def test_simple_factor_creation(self) -> None:
        """Test creating a simple factor."""
        metadata = FactorMetadata(
            factor_id="rsi-001",
            hypothesis_id="mean-reversion-001",
        )
        factor = SimpleRSIFactor(metadata)
        assert factor.metadata.factor_id == "rsi-001"

    def test_compute_signal(self) -> None:
        """Test signal computation."""
        metadata = FactorMetadata(
            factor_id="rsi-001",
            hypothesis_id="mean-reversion-001",
        )
        factor = SimpleRSIFactor(metadata)

        # Create test data
        data = pl.DataFrame(
            {
                "close": [100.0, 102.0, 101.0, 99.0, 98.0, 97.0, 96.0, 95.0]
                + [94.0, 93.0, 92.0, 91.0, 90.0, 89.0, 88.0, 87.0],
            }
        )

        signal = factor.compute_signal(data)
        assert len(signal) == 16
        assert signal.dtype == pl.Float64

    def test_set_parameters(self) -> None:
        """Test setting parameters."""
        metadata = FactorMetadata(
            factor_id="rsi-001",
            hypothesis_id="mean-reversion-001",
        )
        factor = SimpleRSIFactor(metadata)

        factor.set_parameters({"period": 7, "threshold": 25})
        assert factor.get_parameter("period") == 7
        assert factor.get_parameter("threshold") == 25

    def test_get_parameter_default(self) -> None:
        """Test getting parameter with default."""
        metadata = FactorMetadata(
            factor_id="rsi-001",
            hypothesis_id="mean-reversion-001",
        )
        factor = SimpleRSIFactor(metadata)

        # Without setting, should return from get_parameters()
        assert factor.get_parameter("period") == 14

        # Unknown param should return provided default
        assert factor.get_parameter("unknown", "default") == "default"

    def test_compute_regularization_metrics(self) -> None:
        """Test computing regularization metrics."""
        metadata = FactorMetadata(
            factor_id="rsi-001",
            hypothesis_id="mean-reversion-001",
        )
        factor = SimpleRSIFactor(metadata)

        metrics = factor.compute_regularization_metrics()
        assert metrics.symbolic_length > 0
        assert metrics.parameter_count == 2  # period, threshold
        assert metrics.feature_count == 1  # close

    def test_validate_regularization_simple_factor(self) -> None:
        """Test that simple factor passes regularization."""
        metadata = FactorMetadata(
            factor_id="rsi-001",
            hypothesis_id="mean-reversion-001",
        )
        metadata.regularization = RegularizationMetrics(
            symbolic_length=30,
            parameter_count=2,
            feature_count=1,
            originality_score=0.8,
            hypothesis_alignment=0.9,
        )
        factor = SimpleRSIFactor(metadata)

        is_valid, violations = factor.validate_regularization()
        assert is_valid, f"Unexpected violations: {violations}"
        assert len(violations) == 0

    def test_validate_regularization_too_many_params(self) -> None:
        """Test that complex factor with too many params fails."""
        metadata = FactorMetadata(
            factor_id="complex-001",
            hypothesis_id="test-001",
        )
        metadata.regularization = RegularizationMetrics(
            symbolic_length=40,
            parameter_count=12,  # > MAX_PARAMETERS (10)
            feature_count=5,
            originality_score=0.8,
            hypothesis_alignment=0.9,
        )
        factor = ComplexFactor(metadata)

        is_valid, violations = factor.validate_regularization()
        assert not is_valid
        assert any("Parameter count" in v for v in violations)

    def test_validate_regularization_too_many_features(self) -> None:
        """Test that factor with too many features fails."""
        metadata = FactorMetadata(
            factor_id="complex-001",
            hypothesis_id="test-001",
        )
        metadata.regularization = RegularizationMetrics(
            symbolic_length=40,
            parameter_count=5,
            feature_count=9,  # > MAX_FEATURES (8)
            originality_score=0.8,
            hypothesis_alignment=0.9,
        )
        factor = ComplexFactor(metadata)

        is_valid, violations = factor.validate_regularization()
        assert not is_valid
        assert any("Feature count" in v for v in violations)

    def test_validate_regularization_low_originality(self) -> None:
        """Test that factor with low originality fails."""
        metadata = FactorMetadata(
            factor_id="rsi-001",
            hypothesis_id="mean-reversion-001",
        )
        metadata.regularization = RegularizationMetrics(
            symbolic_length=30,
            parameter_count=2,
            feature_count=1,
            originality_score=0.2,  # < MIN_ORIGINALITY (0.3)
            hypothesis_alignment=0.9,
        )
        factor = SimpleRSIFactor(metadata)

        is_valid, violations = factor.validate_regularization()
        assert not is_valid
        assert any("Originality" in v for v in violations)

    def test_validate_regularization_low_alignment(self) -> None:
        """Test that factor with low hypothesis alignment fails."""
        metadata = FactorMetadata(
            factor_id="rsi-001",
            hypothesis_id="mean-reversion-001",
        )
        metadata.regularization = RegularizationMetrics(
            symbolic_length=30,
            parameter_count=2,
            feature_count=1,
            originality_score=0.8,
            hypothesis_alignment=0.5,  # < MIN_HYPOTHESIS_ALIGNMENT (0.7)
        )
        factor = SimpleRSIFactor(metadata)

        is_valid, violations = factor.validate_regularization()
        assert not is_valid
        assert any("Hypothesis alignment" in v for v in violations)

    def test_get_source_hash(self) -> None:
        """Test getting source hash."""
        metadata = FactorMetadata(
            factor_id="rsi-001",
            hypothesis_id="mean-reversion-001",
        )
        factor = SimpleRSIFactor(metadata)

        hash1 = factor.get_source_hash()
        assert len(hash1) == 16  # SHA-256 truncated to 16 chars

        # Same factor should have same hash
        factor2 = SimpleRSIFactor(metadata)
        hash2 = factor2.get_source_hash()
        assert hash1 == hash2

    def test_update_metadata_metrics(self) -> None:
        """Test updating metadata with computed metrics."""
        metadata = FactorMetadata(
            factor_id="rsi-001",
            hypothesis_id="mean-reversion-001",
        )
        factor = SimpleRSIFactor(metadata)

        # Initially should have default metrics
        assert factor.metadata.regularization.symbolic_length == 0

        # Update metrics
        factor.update_metadata_metrics()

        # Should now have computed values
        assert factor.metadata.regularization.symbolic_length > 0
        assert factor.metadata.regularization.parameter_count == 2
        assert factor.metadata.regularization.feature_count == 1

    def test_repr(self) -> None:
        """Test string representation."""
        metadata = FactorMetadata(
            factor_id="rsi-001",
            hypothesis_id="mean-reversion-001",
        )
        factor = SimpleRSIFactor(metadata)

        repr_str = repr(factor)
        assert "SimpleRSIFactor" in repr_str
        assert "rsi-001" in repr_str
        assert "mean-reversion-001" in repr_str


class TestResearchFactorConstants:
    """Tests for ResearchFactor class constants."""

    def test_max_symbolic_length(self) -> None:
        """Test MAX_SYMBOLIC_LENGTH constant."""
        assert ResearchFactor.MAX_SYMBOLIC_LENGTH == 150

    def test_max_parameters(self) -> None:
        """Test MAX_PARAMETERS constant."""
        assert ResearchFactor.MAX_PARAMETERS == 10

    def test_max_features(self) -> None:
        """Test MAX_FEATURES constant."""
        assert ResearchFactor.MAX_FEATURES == 8

    def test_min_originality(self) -> None:
        """Test MIN_ORIGINALITY constant."""
        assert ResearchFactor.MIN_ORIGINALITY == 0.3

    def test_min_hypothesis_alignment(self) -> None:
        """Test MIN_HYPOTHESIS_ALIGNMENT constant."""
        assert ResearchFactor.MIN_HYPOTHESIS_ALIGNMENT == 0.7
