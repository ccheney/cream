"""
Paper Validation Worker

Daily worker that runs paper validation comparisons at market close.

See: docs/plans/20-research-to-production-pipeline.md - Phase 6
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Protocol

import polars as pl

from .service import (
    DailyComparison,
    PaperValidationConfig,
    PaperValidationResult,
    PaperValidationService,
)

if TYPE_CHECKING:
    from ..strategies.base import ResearchFactor

logger = logging.getLogger(__name__)


# US Eastern timezone offset (simplified - doesn't handle DST)
ET_OFFSET_HOURS = -5


class FactorProvider(Protocol):
    """Protocol for loading factors by ID."""

    async def get_factor(self, factor_id: str) -> ResearchFactor | None:
        """Load a factor by its ID."""
        ...


class MarketDataProvider(Protocol):
    """Protocol for fetching market data."""

    async def get_daily_data(self, symbols: list[str]) -> pl.DataFrame:
        """Get daily OHLCV data for symbols."""
        ...


class ComparisonLogger(Protocol):
    """Protocol for logging comparisons to database."""

    async def log_comparison(
        self,
        factor_id: str,
        comparison: DailyComparison,
    ) -> None:
        """Log a daily comparison to the database."""
        ...

    async def log_result(
        self,
        factor_id: str,
        result: PaperValidationResult,
    ) -> None:
        """Log final validation result."""
        ...


@dataclass
class PaperValidationState:
    """State for a factor in paper validation."""

    factor_id: str
    """Factor being validated."""

    config: PaperValidationConfig
    """Validation configuration."""

    service: PaperValidationService
    """Active validation service."""

    start_date: datetime
    """When validation started."""


class PaperValidationWorker:
    """
    Daily worker for paper validation comparisons.

    Runs at market close (4:30 PM ET) to compare Python and TypeScript
    factor implementations on the day's market data.

    Example:
        worker = PaperValidationWorker(
            factor_provider=my_factor_provider,
            market_data_provider=my_market_data_provider,
            comparison_logger=my_logger,
        )

        # Start the worker (blocks forever)
        await worker.run()

        # Or run a single validation cycle
        await worker.run_daily_cycle()
    """

    # Market close time in ET (4:30 PM to allow data settlement)
    MARKET_CLOSE_HOUR = 16
    MARKET_CLOSE_MINUTE = 30

    def __init__(
        self,
        factor_provider: FactorProvider,
        market_data_provider: MarketDataProvider,
        comparison_logger: ComparisonLogger,
        check_interval_seconds: int = 60,
    ) -> None:
        """
        Initialize paper validation worker.

        Args:
            factor_provider: Provider for loading factors
            market_data_provider: Provider for market data
            comparison_logger: Logger for comparisons and results
            check_interval_seconds: How often to check if it's time to run
        """
        self.factor_provider = factor_provider
        self.market_data_provider = market_data_provider
        self.comparison_logger = comparison_logger
        self.check_interval = check_interval_seconds

        # Active validations keyed by factor_id
        self._active_validations: dict[str, PaperValidationState] = {}

        # Track last run date to avoid duplicate runs
        self._last_run_date: datetime | None = None

    async def run(self) -> None:
        """
        Run the worker continuously.

        Blocks forever, running daily validation at market close.
        """
        logger.info("Paper validation worker started")

        while True:
            try:
                # Check if it's time to run
                if self._should_run():
                    await self.run_daily_cycle()
                    self._last_run_date = datetime.now(UTC)
            except Exception as e:
                logger.error(f"Error in paper validation worker: {e}", exc_info=True)

            await asyncio.sleep(self.check_interval)

    def _should_run(self) -> bool:
        """Check if it's time to run daily validation."""
        now = datetime.now(UTC)

        # Convert to ET (simplified)
        et_hour = (now.hour + ET_OFFSET_HOURS) % 24

        # Check if we're past market close
        if et_hour < self.MARKET_CLOSE_HOUR:
            return False
        if et_hour == self.MARKET_CLOSE_HOUR and now.minute < self.MARKET_CLOSE_MINUTE:
            return False

        # Check if we already ran today
        if self._last_run_date is not None:
            if self._last_run_date.date() == now.date():
                return False

        return True

    async def run_daily_cycle(self) -> dict[str, DailyComparison | PaperValidationResult]:
        """
        Run daily validation cycle for all active factors.

        Returns:
            Dict mapping factor_id to comparison or result (if completed)
        """
        logger.info("Running daily paper validation cycle")

        results: dict[str, DailyComparison | PaperValidationResult] = {}

        for factor_id, state in list(self._active_validations.items()):
            try:
                result = await self._run_factor_validation(state)
                results[factor_id] = result

                # Check if validation is complete
                if isinstance(result, PaperValidationResult):
                    await self._handle_completion(factor_id, result)
            except Exception as e:
                logger.error(
                    f"Error validating factor {factor_id}: {e}",
                    exc_info=True,
                )

        return results

    async def _run_factor_validation(
        self,
        state: PaperValidationState,
    ) -> DailyComparison | PaperValidationResult:
        """
        Run validation for a single factor.

        Args:
            state: Validation state for this factor

        Returns:
            DailyComparison if continuing, PaperValidationResult if complete
        """
        # Get today's market data using symbols from config
        data = await self.market_data_provider.get_daily_data(state.config.symbols)

        # Run comparison
        comparison = await state.service.run_daily_comparison(data)

        # Log to database
        await self.comparison_logger.log_comparison(state.factor_id, comparison)

        # Check for early termination
        should_terminate, reason = await state.service.check_early_termination()

        if should_terminate:
            logger.warning(f"Early termination for {state.factor_id}: {reason}")
            result = state.service.get_final_result()
            return result

        # Check if minimum duration reached
        days_elapsed = (datetime.now() - state.start_date).days

        if days_elapsed >= state.config.min_duration_days:
            result = state.service.get_final_result()

            # If passed and ready to promote, return result
            if result.recommendation == "PROMOTE":
                return result
            # Otherwise keep running until max duration
            if days_elapsed >= state.config.max_duration_days:
                return result

        return comparison

    async def _handle_completion(
        self,
        factor_id: str,
        result: PaperValidationResult,
    ) -> None:
        """Handle completion of paper validation."""
        logger.info(f"Paper validation complete for {factor_id}: {result.recommendation}")

        # Log final result
        await self.comparison_logger.log_result(factor_id, result)

        # Remove from active validations
        if factor_id in self._active_validations:
            state = self._active_validations.pop(factor_id)
            await state.service.close()

    async def start_validation(
        self,
        factor_id: str,
        config: PaperValidationConfig | None = None,
    ) -> bool:
        """
        Start paper validation for a factor.

        Args:
            factor_id: Factor to validate
            config: Optional custom configuration

        Returns:
            True if validation started, False if already running
        """
        if factor_id in self._active_validations:
            logger.warning(f"Factor {factor_id} already in paper validation")
            return False

        # Load factor
        factor = await self.factor_provider.get_factor(factor_id)
        if factor is None:
            raise ValueError(f"Factor not found: {factor_id}")

        # Create config if not provided
        if config is None:
            config = PaperValidationConfig(
                factor_id=factor_id,
                start_date=datetime.now(),
            )

        # Create service
        service = PaperValidationService(config, factor)

        # Track state
        state = PaperValidationState(
            factor_id=factor_id,
            config=config,
            service=service,
            start_date=datetime.now(),
        )

        self._active_validations[factor_id] = state

        logger.info(f"Started paper validation for {factor_id}")
        return True

    async def stop_validation(self, factor_id: str) -> PaperValidationResult | None:
        """
        Stop paper validation for a factor.

        Args:
            factor_id: Factor to stop

        Returns:
            Final result if stopped, None if not running
        """
        if factor_id not in self._active_validations:
            return None

        state = self._active_validations.pop(factor_id)
        result = state.service.get_final_result()

        await state.service.close()

        logger.info(f"Stopped paper validation for {factor_id}")
        return result

    def get_active_validations(self) -> list[str]:
        """Get list of factors currently in paper validation."""
        return list(self._active_validations.keys())

    async def close(self) -> None:
        """Close all active services."""
        for state in self._active_validations.values():
            await state.service.close()
        self._active_validations.clear()
