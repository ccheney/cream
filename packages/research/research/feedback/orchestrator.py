"""
Refinement Orchestrator

Orchestrates the hypothesis refinement loop, coordinating between
validation and feedback generation.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import polars as pl

from .generator import FeedbackGenerator
from .types import FeedbackConfig, ValidationFeedback

if TYPE_CHECKING:
    from ..hypothesis_alignment import Hypothesis
    from ..strategies.base import ResearchFactor

logger = logging.getLogger(__name__)


class RefinementOrchestrator:
    """
    Orchestrate hypothesis refinement loop.

    Coordinates between validation and feedback generation,
    running up to MAX_ITERATIONS before abandonment.
    """

    def __init__(
        self,
        feedback_generator: FeedbackGenerator,
        config: FeedbackConfig | None = None,
    ) -> None:
        """
        Initialize the orchestrator.

        Args:
            feedback_generator: Generator for validation feedback
            config: Feedback configuration
        """
        self.feedback_gen = feedback_generator
        self.config = config or FeedbackConfig()

    async def run_refinement_loop(
        self,
        factor: ResearchFactor,
        hypothesis: Hypothesis,
        data: pl.DataFrame,
        params: dict[str, Any],
        existing_factors: list[ResearchFactor] | None = None,
    ) -> tuple[ResearchFactor, ValidationFeedback]:
        """
        Run validation with refinement loop.

        Args:
            factor: Research factor to validate
            hypothesis: Research hypothesis
            data: Historical data
            params: Factor parameters
            existing_factors: Optional existing factors for correlation

        Returns:
            Tuple of (final factor, final feedback)
        """
        from ..stage_validation import Stage1Validator, Stage2Validator

        current_factor = factor
        feedback: ValidationFeedback | None = None

        for iteration in range(1, self.config.max_iterations + 1):
            logger.info(f"Refinement iteration {iteration}/{self.config.max_iterations}")

            stage1_validator = Stage1Validator(current_factor, data)
            stage1_results = await stage1_validator.validate(params)

            if not stage1_results.passed_gates:
                feedback = await self.feedback_gen.generate_feedback(
                    factor=current_factor,
                    stage1_results=stage1_results,
                    stage2_results=None,
                    hypothesis=hypothesis,
                    iteration=iteration,
                    data=data,
                    existing_factors=existing_factors,
                )

                if feedback.action == "ABANDON":
                    logger.info(f"Abandoning after iteration {iteration}")
                    return current_factor, feedback

                logger.info(f"Stage 1 failed, suggestions: {feedback.suggested_modifications}")
                continue

            stage2_validator = Stage2Validator(current_factor, data)
            stage2_results = await stage2_validator.validate(params)

            feedback = await self.feedback_gen.generate_feedback(
                factor=current_factor,
                stage1_results=stage1_results,
                stage2_results=stage2_results,
                hypothesis=hypothesis,
                iteration=iteration,
                data=data,
                existing_factors=existing_factors,
            )

            if feedback.action == "ACCEPT":
                logger.info("Factor accepted!")
                return current_factor, feedback
            if feedback.action == "ABANDON":
                logger.info(f"Abandoning after iteration {iteration}")
                return current_factor, feedback

            logger.info(f"Stage 2 failed, suggestions: {feedback.suggested_modifications}")

        if feedback is None:
            stage1_validator = Stage1Validator(current_factor, data)
            stage1_results = await stage1_validator.validate(params)
            feedback = await self.feedback_gen.generate_feedback(
                factor=current_factor,
                stage1_results=stage1_results,
                stage2_results=None,
                hypothesis=hypothesis,
                iteration=self.config.max_iterations,
                data=data,
                existing_factors=existing_factors,
            )

        return current_factor, feedback
