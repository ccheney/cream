"""
Tests for Originality Checking Module

Tests AST-based originality enforcement for research factors.
"""

from __future__ import annotations

import ast
from typing import Any

import polars as pl

from research.originality import (
    check_originality,
    check_originality_batch,
    compute_factor_hash,
    get_subtrees,
    normalize_ast,
    structural_similarity,
    subtree_similarity,
)
from research.strategies.base import FactorMetadata, ResearchFactor

# ============================================
# Concrete Test Implementations
# ============================================


class RSIFactor(ResearchFactor):
    """RSI-based factor for testing."""

    def compute_signal(self, data: pl.DataFrame) -> pl.Series:
        """Compute RSI signal."""
        close = data["close"]
        period = self.get_parameter("period", 14)
        threshold = self.get_parameter("threshold", 30)
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


class RSIFactorRenamed(ResearchFactor):
    """RSI factor with renamed variables (should be similar)."""

    def compute_signal(self, data: pl.DataFrame) -> pl.Series:
        """Compute RSI signal."""
        price = data["close"]
        lookback = self.get_parameter("period", 14)
        level = self.get_parameter("threshold", 30)
        change = price.diff()
        up = change.clip(lower_bound=0).rolling_mean(window_size=lookback)
        down = (-change.clip(upper_bound=0)).rolling_mean(window_size=lookback)
        ratio = up / down
        indicator = 100 - (100 / (1 + ratio))
        return (indicator < level).cast(pl.Float64)

    def get_parameters(self) -> dict[str, Any]:
        return {"period": 14, "threshold": 30}

    def get_required_features(self) -> list[str]:
        return ["close"]


class MAFactor(ResearchFactor):
    """Moving average factor (different from RSI)."""

    def compute_signal(self, data: pl.DataFrame) -> pl.Series:
        """Compute MA crossover signal."""
        close = data["close"]
        fast = self.get_parameter("fast_period", 10)
        slow = self.get_parameter("slow_period", 50)
        fast_ma = close.rolling_mean(window_size=fast)
        slow_ma = close.rolling_mean(window_size=slow)
        return (fast_ma > slow_ma).cast(pl.Float64)

    def get_parameters(self) -> dict[str, Any]:
        return {"fast_period": 10, "slow_period": 50}

    def get_required_features(self) -> list[str]:
        return ["close"]


class BollingerFactor(ResearchFactor):
    """Bollinger band factor (different from both)."""

    def compute_signal(self, data: pl.DataFrame) -> pl.Series:
        """Compute Bollinger band signal."""
        close = data["close"]
        period = self.get_parameter("period", 20)
        std_mult = self.get_parameter("std_mult", 2.0)
        ma = close.rolling_mean(window_size=period)
        std = close.rolling_std(window_size=period)
        lower = ma - std_mult * std
        return (close < lower).cast(pl.Float64)

    def get_parameters(self) -> dict[str, Any]:
        return {"period": 20, "std_mult": 2.0}

    def get_required_features(self) -> list[str]:
        return ["close"]


# ============================================
# Tests
# ============================================


class TestGetSubtrees:
    """Tests for get_subtrees function."""

    def test_simple_expression(self) -> None:
        """Test extracting subtrees from simple expression."""
        tree = ast.parse("x = 1 + 2")
        subtrees = list(get_subtrees(tree))
        assert len(subtrees) > 3  # Module, Assign, BinOp, constants

    def test_complex_expression(self) -> None:
        """Test extracting subtrees from complex expression."""
        tree = ast.parse("def f(x):\n    return x * 2 + 1")
        subtrees = list(get_subtrees(tree))
        # Should have many subtrees
        assert len(subtrees) > 10


class TestNormalizeAst:
    """Tests for normalize_ast function."""

    def test_variable_renaming(self) -> None:
        """Test that variable names are normalized."""
        tree1 = ast.parse("x = 1\ny = x + 1")
        norm1 = normalize_ast(tree1)

        # Variable names should be normalized to var_N pattern
        dump1 = ast.dump(norm1)
        assert "var_0" in dump1 or "var_1" in dump1

    def test_preserves_builtins(self) -> None:
        """Test that builtin names are preserved."""
        tree = ast.parse("result = True and False")
        norm = normalize_ast(tree)
        dump = ast.dump(norm)

        assert "True" in dump
        assert "False" in dump


class TestSubtreeSimilarity:
    """Tests for subtree_similarity function."""

    def test_identical_trees(self) -> None:
        """Test similarity of identical trees."""
        tree1 = ast.parse("x = 1 + 2")
        tree2 = ast.parse("x = 1 + 2")

        similarity = subtree_similarity(tree1, tree2)
        assert similarity == 1.0

    def test_different_trees(self) -> None:
        """Test similarity of different trees."""
        tree1 = ast.parse("x = 1 + 2")
        tree2 = ast.parse("def f():\n    pass")

        similarity = subtree_similarity(tree1, tree2)
        assert similarity < 0.5  # Should be low

    def test_similar_trees_with_renamed_vars(self) -> None:
        """Test similarity of semantically identical code with different names."""
        tree1 = ast.parse("x = 1\ny = x + 1")
        tree2 = ast.parse("a = 1\nb = a + 1")

        # With normalization, should be very similar
        similarity = subtree_similarity(tree1, tree2, normalize=True)
        assert similarity > 0.8

    def test_without_normalization(self) -> None:
        """Test that without normalization, renamed vars differ."""
        tree1 = ast.parse("x = 1\ny = x + 1")
        tree2 = ast.parse("a = 1\nb = a + 1")

        # Without normalization, should be less similar
        similarity = subtree_similarity(tree1, tree2, normalize=False)
        # Still structurally similar, but variable names differ
        assert similarity < 1.0


class TestStructuralSimilarity:
    """Tests for structural_similarity function."""

    def test_identical_structure(self) -> None:
        """Test similarity of identically structured trees."""
        tree1 = ast.parse("x = 1 + 2")
        tree2 = ast.parse("y = 3 + 4")

        similarity = structural_similarity(tree1, tree2)
        assert similarity == 1.0  # Same node types

    def test_different_structure(self) -> None:
        """Test similarity of differently structured trees."""
        tree1 = ast.parse("x = 1 + 2")
        tree2 = ast.parse("def f():\n    pass")

        similarity = structural_similarity(tree1, tree2)
        assert similarity < 0.8  # Different structures


class TestCheckOriginality:
    """Tests for check_originality function."""

    def test_empty_zoo(self) -> None:
        """Test originality check against empty Factor Zoo."""
        metadata = FactorMetadata(factor_id="rsi-001", hypothesis_id="test")
        new_factor = RSIFactor(metadata)

        originality, most_similar = check_originality(new_factor, [])
        assert originality == 1.0
        assert most_similar is None

    def test_novel_factor(self) -> None:
        """Test that different factor has high originality."""
        metadata1 = FactorMetadata(factor_id="rsi-001", hypothesis_id="test")
        metadata2 = FactorMetadata(factor_id="ma-001", hypothesis_id="test")

        rsi_factor = RSIFactor(metadata1)
        ma_factor = MAFactor(metadata2)

        originality, most_similar = check_originality(ma_factor, [rsi_factor])
        assert originality > 0.3  # Should be reasonably original
        assert most_similar is None or most_similar == rsi_factor

    def test_duplicate_factor(self) -> None:
        """Test that same factor has low originality."""
        metadata1 = FactorMetadata(factor_id="rsi-001", hypothesis_id="test")
        metadata2 = FactorMetadata(factor_id="rsi-002", hypothesis_id="test")

        factor1 = RSIFactor(metadata1)
        factor2 = RSIFactor(metadata2)

        originality, most_similar = check_originality(factor2, [factor1])
        assert originality < 0.3  # Should be very unoriginal (duplicate)
        assert most_similar == factor1

    def test_similar_factor_renamed(self) -> None:
        """Test that factor with renamed variables is detected as similar."""
        metadata1 = FactorMetadata(factor_id="rsi-001", hypothesis_id="test")
        metadata2 = FactorMetadata(factor_id="rsi-renamed", hypothesis_id="test")

        original = RSIFactor(metadata1)
        renamed = RSIFactorRenamed(metadata2)

        originality, most_similar = check_originality(renamed, [original])
        # AST normalization should detect similarity
        assert originality < 0.7
        assert most_similar == original


class TestCheckOriginalityBatch:
    """Tests for check_originality_batch function."""

    def test_batch_originality(self) -> None:
        """Test batch originality checking."""
        metadata_rsi = FactorMetadata(factor_id="rsi-001", hypothesis_id="test")
        metadata_ma = FactorMetadata(factor_id="ma-001", hypothesis_id="test")
        metadata_bb = FactorMetadata(factor_id="bb-001", hypothesis_id="test")

        rsi_factor = RSIFactor(metadata_rsi)
        ma_factor = MAFactor(metadata_ma)
        bb_factor = BollingerFactor(metadata_bb)

        # Check originality of all three against each other
        zoo = [rsi_factor]
        new_factors = [ma_factor, bb_factor]

        results = check_originality_batch(new_factors, zoo)
        assert len(results) == 2

        # Both should be original (different from RSI)
        for _factor, originality, _ in results:
            assert originality > 0.3

    def test_batch_empty_zoo(self) -> None:
        """Test batch with empty zoo."""
        metadata = FactorMetadata(factor_id="rsi-001", hypothesis_id="test")
        factor = RSIFactor(metadata)

        results = check_originality_batch([factor], [])
        assert len(results) == 1
        assert results[0][1] == 1.0  # Fully original


class TestComputeFactorHash:
    """Tests for compute_factor_hash function."""

    def test_same_factor_same_hash(self) -> None:
        """Test that same factor produces same hash."""
        metadata1 = FactorMetadata(factor_id="rsi-001", hypothesis_id="test")
        metadata2 = FactorMetadata(factor_id="rsi-002", hypothesis_id="test")

        factor1 = RSIFactor(metadata1)
        factor2 = RSIFactor(metadata2)

        hash1 = compute_factor_hash(factor1)
        hash2 = compute_factor_hash(factor2)
        assert hash1 == hash2

    def test_different_factor_different_hash(self) -> None:
        """Test that different factors produce different hashes."""
        metadata1 = FactorMetadata(factor_id="rsi-001", hypothesis_id="test")
        metadata2 = FactorMetadata(factor_id="ma-001", hypothesis_id="test")

        rsi_factor = RSIFactor(metadata1)
        ma_factor = MAFactor(metadata2)

        hash1 = compute_factor_hash(rsi_factor)
        hash2 = compute_factor_hash(ma_factor)
        assert hash1 != hash2

    def test_hash_length(self) -> None:
        """Test that hash has expected length."""
        metadata = FactorMetadata(factor_id="rsi-001", hypothesis_id="test")
        factor = RSIFactor(metadata)

        hash_val = compute_factor_hash(factor)
        assert len(hash_val) == 16

    def test_renamed_factor_same_hash(self) -> None:
        """Test that normalized hash is same for renamed variables."""
        metadata1 = FactorMetadata(factor_id="rsi-001", hypothesis_id="test")
        metadata2 = FactorMetadata(factor_id="rsi-renamed", hypothesis_id="test")

        original = RSIFactor(metadata1)
        renamed = RSIFactorRenamed(metadata2)

        # Note: compute_factor_hash uses normalized AST
        hash1 = compute_factor_hash(original)
        hash2 = compute_factor_hash(renamed)

        # These should be identical since code is semantically the same
        # (variable names normalized away)
        assert hash1 == hash2
