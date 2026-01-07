"""
Originality Checking Module

AST-based originality enforcement for research factors.
Prevents duplicate or near-duplicate factors from entering the Factor Zoo.

Based on AlphaAgent's AST-based originality enforcement mechanism.

See: docs/plans/20-research-to-production-pipeline.md - Phase 2
Reference: https://arxiv.org/html/2502.16789v2 (AlphaAgent)
Reference: https://arxiv.org/html/2404.08817v1 (AST Code Similarity)
"""

from __future__ import annotations

import ast
import inspect
from collections.abc import Generator, Sequence
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from research.strategies.base import ResearchFactor


def get_subtrees(node: ast.AST) -> Generator[ast.AST]:
    """
    Extract all subtrees from an AST node.

    Yields the node itself and all its descendants recursively.

    Args:
        node: Root AST node

    Yields:
        All AST nodes in the tree
    """
    yield node
    for child in ast.iter_child_nodes(node):
        yield from get_subtrees(child)


def normalize_ast(tree: ast.AST) -> ast.AST:
    """
    Normalize an AST by removing location info and standardizing names.

    This helps identify semantically similar code even if variable names
    or formatting differ.

    Args:
        tree: AST to normalize

    Returns:
        Normalized AST (copy)
    """

    class Normalizer(ast.NodeTransformer):
        """AST transformer that normalizes variable names and removes location info."""

        def __init__(self) -> None:
            self._name_map: dict[str, str] = {}
            self._counter = 0

        def _get_normalized_name(self, name: str) -> str:
            """Get normalized name for a variable."""
            # Keep built-in names and common identifiers
            builtins = {
                "self",
                "cls",
                "True",
                "False",
                "None",
                "pl",
                "np",
                "pd",
            }
            if name in builtins:
                return name

            if name not in self._name_map:
                self._name_map[name] = f"var_{self._counter}"
                self._counter += 1
            return self._name_map[name]

        def visit_Name(self, node: ast.Name) -> ast.Name:
            """Normalize variable names."""
            new_node = ast.Name(id=self._get_normalized_name(node.id), ctx=node.ctx)
            return ast.copy_location(new_node, node)

        def visit_FunctionDef(self, node: ast.FunctionDef) -> ast.FunctionDef:
            """Visit function definitions, normalize and recurse."""
            # Keep function name for method identification
            new_node = ast.FunctionDef(
                name=node.name,  # Keep method names
                args=self.visit(node.args),
                body=[self.visit(stmt) for stmt in node.body],
                decorator_list=[self.visit(d) for d in node.decorator_list],
                returns=self.visit(node.returns) if node.returns else None,
                type_comment=None,
                type_params=[],
            )
            return ast.fix_missing_locations(new_node)

        def generic_visit(self, node: ast.AST) -> ast.AST:
            """Remove location information from all nodes."""
            result = super().generic_visit(node)
            # Clear location info
            for attr in ("lineno", "col_offset", "end_lineno", "end_col_offset"):
                if hasattr(result, attr):
                    setattr(result, attr, None)
            return result

    from typing import cast

    return cast(ast.AST, Normalizer().visit(tree))


def subtree_similarity(tree1: ast.AST, tree2: ast.AST, normalize: bool = True) -> float:
    """
    Compute subtree similarity using Jaccard similarity of AST subtrees.

    Based on AlphaAgent's AST-based originality enforcement.

    Args:
        tree1: First AST
        tree2: Second AST
        normalize: Whether to normalize ASTs before comparison

    Returns:
        Similarity score between 0.0 and 1.0 (1.0 = identical)
    """
    if normalize:
        tree1 = normalize_ast(tree1)
        tree2 = normalize_ast(tree2)

    # Extract all subtree representations
    subtrees1 = {ast.dump(s) for s in get_subtrees(tree1)}
    subtrees2 = {ast.dump(s) for s in get_subtrees(tree2)}

    # Jaccard similarity
    common = subtrees1 & subtrees2
    total = subtrees1 | subtrees2

    return len(common) / len(total) if total else 0.0


def structural_similarity(tree1: ast.AST, tree2: ast.AST) -> float:
    """
    Compute structural similarity based on node type sequence.

    This is a faster but less precise similarity measure.

    Args:
        tree1: First AST
        tree2: Second AST

    Returns:
        Similarity score between 0.0 and 1.0
    """
    types1 = [type(node).__name__ for node in ast.walk(tree1)]
    types2 = [type(node).__name__ for node in ast.walk(tree2)]

    # Use multiset intersection
    from collections import Counter

    counter1 = Counter(types1)
    counter2 = Counter(types2)

    common = sum((counter1 & counter2).values())
    total = sum((counter1 | counter2).values())

    return common / total if total else 0.0


def check_originality(
    new_factor: ResearchFactor,
    factor_zoo: Sequence[ResearchFactor],
    threshold: float = 0.7,
) -> tuple[float, ResearchFactor | None]:
    """
    Check originality of new factor against existing Factor Zoo.

    Args:
        new_factor: Factor to check
        factor_zoo: List of existing factors
        threshold: Similarity threshold above which factors are considered duplicates

    Returns:
        Tuple of (originality_score, most_similar_factor_or_none)
        originality_score: 1.0 = completely novel, 0.0 = exact duplicate
        most_similar_factor: The factor with highest similarity, if above threshold
    """
    import textwrap

    if not factor_zoo:
        return 1.0, None

    new_source = textwrap.dedent(inspect.getsource(new_factor.compute_signal))
    new_tree = ast.parse(new_source)

    max_similarity = 0.0
    most_similar: ResearchFactor | None = None

    for existing in factor_zoo:
        try:
            existing_source = textwrap.dedent(inspect.getsource(existing.compute_signal))
            existing_tree = ast.parse(existing_source)
            similarity = subtree_similarity(new_tree, existing_tree)

            if similarity > max_similarity:
                max_similarity = similarity
                if similarity >= threshold:
                    most_similar = existing
        except (OSError, TypeError):
            # Can't get source for some factors (e.g., built-ins)
            continue

    originality = 1.0 - max_similarity
    return originality, most_similar


def check_originality_batch(
    new_factors: Sequence[ResearchFactor],
    factor_zoo: Sequence[ResearchFactor],
    threshold: float = 0.7,
) -> list[tuple[ResearchFactor, float, ResearchFactor | None]]:
    """
    Check originality for multiple factors efficiently.

    Pre-parses Factor Zoo ASTs for efficiency.

    Args:
        new_factors: Factors to check
        factor_zoo: List of existing factors
        threshold: Similarity threshold

    Returns:
        List of (factor, originality_score, most_similar_or_none) tuples
    """
    import textwrap

    # Pre-parse Factor Zoo
    zoo_asts: list[tuple[ResearchFactor, ast.AST]] = []
    for factor in factor_zoo:
        try:
            source = textwrap.dedent(inspect.getsource(factor.compute_signal))
            tree = ast.parse(source)
            zoo_asts.append((factor, tree))
        except (OSError, TypeError):
            continue

    results: list[tuple[ResearchFactor, float, ResearchFactor | None]] = []

    for new_factor in new_factors:
        try:
            new_source = textwrap.dedent(inspect.getsource(new_factor.compute_signal))
            new_tree = ast.parse(new_source)

            max_similarity = 0.0
            most_similar: ResearchFactor | None = None

            for existing, existing_tree in zoo_asts:
                similarity = subtree_similarity(new_tree, existing_tree)
                if similarity > max_similarity:
                    max_similarity = similarity
                    if similarity >= threshold:
                        most_similar = existing

            originality = 1.0 - max_similarity
            results.append((new_factor, originality, most_similar))

        except (OSError, TypeError):
            # Can't analyze this factor
            results.append((new_factor, 0.0, None))

    return results


def compute_factor_hash(factor: ResearchFactor) -> str:
    """
    Compute a hash for factor deduplication.

    Uses normalized AST to identify semantically identical factors
    even with different variable names.

    Args:
        factor: Factor to hash

    Returns:
        Hash string for deduplication
    """
    import hashlib
    import textwrap

    try:
        source = textwrap.dedent(inspect.getsource(factor.compute_signal))
        tree = ast.parse(source)
        normalized = normalize_ast(tree)
        ast_dump = ast.dump(normalized)
        return hashlib.sha256(ast_dump.encode()).hexdigest()[:16]
    except (OSError, TypeError):
        # Fall back to class name and params
        params_str = str(sorted(factor.get_parameters().items()))
        return hashlib.sha256(f"{factor.__class__.__name__}:{params_str}".encode()).hexdigest()[:16]
