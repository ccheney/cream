"""
Translation orchestrator for Python to TypeScript translation.

Coordinates the translation workflow including golden file generation,
context preparation, and equivalence validation.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import textwrap
from typing import TYPE_CHECKING

from .types import TranslationConfig, TranslationContext, TranslationResult

if TYPE_CHECKING:
    from ..hypothesis_alignment import Hypothesis
    from ..strategies.base import ResearchFactor

logger = logging.getLogger(__name__)


class TranslationOrchestrator:
    """
    Orchestrate Python to TypeScript translation.

    Coordinates:
    1. Golden file generation from Python
    2. Context preparation for translation
    3. Equivalence testing of translated code

    Example:
        orchestrator = TranslationOrchestrator()
        result = await orchestrator.translate(factor, hypothesis)
        if result.equivalence_passed:
            print("Translation successful!")
    """

    def __init__(self, config: TranslationConfig | None = None) -> None:
        """
        Initialize the orchestrator.

        Args:
            config: Translation configuration
        """
        self.config = config or TranslationConfig()

    async def prepare_translation_context(
        self,
        factor: ResearchFactor,
        hypothesis: Hypothesis,
    ) -> TranslationContext:
        """
        Prepare context for translating a factor.

        Generates golden files and builds translation context.

        Args:
            factor: Python factor to translate
            hypothesis: Associated hypothesis

        Returns:
            TranslationContext with all necessary information
        """
        from ..equivalence import EquivalenceValidator

        validator = EquivalenceValidator(
            factor.metadata.factor_id,
            tolerance=self.config.tolerance,
        )

        params = factor.get_parameters()
        golden_dir = await validator.generate_golden_files(
            factor,
            params,
            n_samples=self.config.golden_samples,
        )

        python_source = self._get_factor_source(factor)
        param_source = self._get_parameter_source(factor)
        module_path = self._get_module_path(factor)

        return TranslationContext(
            factor_id=factor.metadata.factor_id,
            hypothesis_id=hypothesis.hypothesis_id,
            python_source=python_source,
            parameter_dataclass=param_source,
            required_features=factor.get_required_features(),
            golden_input_path=str(golden_dir / "input_sample.json"),
            golden_output_path=str(golden_dir / "expected_output.json"),
            golden_params_path=str(golden_dir / "params.json"),
            python_module_path=module_path,
            parameter_defaults=params,
        )

    def _get_factor_source(self, factor: ResearchFactor) -> str:
        """Extract source code of compute_signal method."""
        try:
            source = inspect.getsource(factor.compute_signal)
            return textwrap.dedent(source)
        except (OSError, TypeError) as e:
            logger.warning(f"Could not get source for compute_signal: {e}")
            return "# Source not available"

    def _get_parameter_source(self, factor: ResearchFactor) -> str:
        """Extract parameter-related source code."""
        try:
            source = inspect.getsource(factor.get_parameters)
            return textwrap.dedent(source)
        except (OSError, TypeError):
            return f"# Default parameters: {factor.get_parameters()}"

    def _get_module_path(self, factor: ResearchFactor) -> str:
        """Get the module path for the factor."""
        try:
            module = inspect.getmodule(factor.__class__)
            if module and module.__file__:
                return module.__file__
        except Exception:
            pass
        return f"packages/research/research/strategies/{factor.metadata.factor_id}/factor.py"

    async def validate_translation(
        self,
        factor_id: str,
        typescript_output: list[float] | None = None,
    ) -> TranslationResult:
        """
        Validate TypeScript translation against golden files.

        Can validate either:
        1. TypeScript output provided directly
        2. By running TypeScript tests (if typescript_output is None)

        Args:
            factor_id: Factor ID to validate
            typescript_output: Optional TypeScript output to validate

        Returns:
            TranslationResult with equivalence status
        """
        from ..equivalence import EquivalenceValidator

        validator = EquivalenceValidator(
            factor_id,
            tolerance=self.config.tolerance,
        )

        if typescript_output is not None:
            result = await validator.validate_output(typescript_output)

            return TranslationResult(
                factor_id=factor_id,
                typescript_path=self.config.typescript_output_dir / factor_id,
                equivalence_passed=result.passed,
                max_divergence=result.max_divergence,
                mean_divergence=result.mean_divergence,
                failed_indices=result.failed_indices,
            )

        return await self._run_typescript_tests(factor_id)

    async def _run_typescript_tests(self, factor_id: str) -> TranslationResult:
        """
        Run TypeScript equivalence tests.

        Args:
            factor_id: Factor ID to test

        Returns:
            TranslationResult from test run
        """
        ts_path = self.config.typescript_output_dir / factor_id

        if not ts_path.exists():
            return TranslationResult(
                factor_id=factor_id,
                typescript_path=None,
                equivalence_passed=False,
                max_divergence=float("inf"),
                mean_divergence=float("inf"),
                failed_indices=[],
                error_message=f"TypeScript implementation not found at {ts_path}",
            )

        try:
            result = await asyncio.wait_for(
                asyncio.create_subprocess_exec(
                    "bun",
                    "test",
                    str(ts_path / "equivalence.test.ts"),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                ),
                timeout=self.config.run_tests_timeout,
            )

            stdout, stderr = await result.communicate()

            if result.returncode == 0:
                return TranslationResult(
                    factor_id=factor_id,
                    typescript_path=ts_path,
                    equivalence_passed=True,
                    max_divergence=0.0,
                    mean_divergence=0.0,
                    failed_indices=[],
                )

            return TranslationResult(
                factor_id=factor_id,
                typescript_path=ts_path,
                equivalence_passed=False,
                max_divergence=float("inf"),
                mean_divergence=float("inf"),
                failed_indices=[],
                error_message=stderr.decode() if stderr else stdout.decode(),
            )

        except TimeoutError:
            return TranslationResult(
                factor_id=factor_id,
                typescript_path=ts_path,
                equivalence_passed=False,
                max_divergence=float("inf"),
                mean_divergence=float("inf"),
                failed_indices=[],
                error_message=f"Test timed out after {self.config.run_tests_timeout}s",
            )
        except FileNotFoundError:
            return TranslationResult(
                factor_id=factor_id,
                typescript_path=ts_path,
                equivalence_passed=False,
                max_divergence=float("inf"),
                mean_divergence=float("inf"),
                failed_indices=[],
                error_message="bun not found - cannot run TypeScript tests",
            )

    async def translate(
        self,
        factor: ResearchFactor,
        hypothesis: Hypothesis,
    ) -> tuple[TranslationContext, TranslationResult | None]:
        """
        Prepare translation and optionally validate if TypeScript exists.

        This method:
        1. Generates golden files from Python
        2. Prepares translation context
        3. If TypeScript already exists, validates it

        The actual code translation is done externally (e.g., by Claude Code).

        Args:
            factor: Python factor to translate
            hypothesis: Associated hypothesis

        Returns:
            Tuple of (TranslationContext, TranslationResult or None)
        """
        context = await self.prepare_translation_context(factor, hypothesis)

        ts_path = self.config.typescript_output_dir / factor.metadata.factor_id
        if ts_path.exists():
            result = await self.validate_translation(factor.metadata.factor_id)
            return context, result

        return context, None
