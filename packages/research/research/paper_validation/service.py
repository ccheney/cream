"""
Paper Validation Service

Runs Python and TypeScript factor implementations in parallel on live market data
for 14-30 days to verify production-readiness before promotion.

See: docs/plans/20-research-to-production-pipeline.md - Phase 6
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING, Any, Literal

import numpy as np
import polars as pl

if TYPE_CHECKING:
    import httpx

    from ..strategies.base import ResearchFactor

logger = logging.getLogger(__name__)


@dataclass
class PaperValidationConfig:
    """Configuration for paper validation period."""

    factor_id: str
    """Factor ID being validated."""

    start_date: datetime
    """When validation started."""

    min_duration_days: int = 14
    """Minimum days to run before promotion (default 14)."""

    max_duration_days: int = 30
    """Maximum days before forced decision (default 30)."""

    max_divergences: int = 5
    """Maximum allowed divergent days before rejection."""

    divergence_tolerance: float = 0.001
    """Maximum allowed signal divergence."""

    typescript_api_url: str = "http://localhost:3001"
    """URL for TypeScript factor API."""


@dataclass
class DailyComparison:
    """Result of comparing Python and TypeScript signals for one day."""

    date: datetime
    """Date of comparison."""

    python_signal: float
    """Signal from Python implementation."""

    typescript_signal: float
    """Signal from TypeScript implementation."""

    divergence: float
    """Absolute difference between signals."""

    is_divergent: bool
    """Whether divergence exceeds tolerance."""

    market_data: dict[str, Any] = field(default_factory=dict)
    """Market data snapshot for debugging."""


@dataclass
class PaperValidationResult:
    """Final result of paper validation period."""

    factor_id: str
    """Factor that was validated."""

    start_date: datetime
    """When validation started."""

    end_date: datetime
    """When validation ended."""

    total_days: int
    """Total days of validation."""

    # Comparison metrics
    total_comparisons: int
    """Number of daily comparisons performed."""

    divergent_days: int
    """Number of days with divergence above tolerance."""

    max_divergence: float
    """Maximum divergence observed."""

    mean_divergence: float
    """Mean divergence across all days."""

    correlation: float
    """Correlation between Python and TypeScript signals."""

    # Performance metrics
    python_sharpe: float
    """Sharpe ratio from Python signals."""

    typescript_sharpe: float
    """Sharpe ratio from TypeScript signals."""

    # Outcome
    passed: bool
    """Whether validation passed all gates."""

    failure_reason: str | None = None
    """Reason for failure, if any."""

    recommendation: Literal["PROMOTE", "EXTEND", "REJECT"] = "EXTEND"
    """Recommended action based on results."""

    def summary(self) -> str:
        """Get human-readable summary."""
        status = "PASSED" if self.passed else "FAILED"
        return (
            f"[{status}] Paper Validation for {self.factor_id}\n"
            f"Duration: {self.total_days} days\n"
            f"Divergent days: {self.divergent_days}\n"
            f"Max divergence: {self.max_divergence:.6f}\n"
            f"Correlation: {self.correlation:.4f}\n"
            f"Recommendation: {self.recommendation}"
        )


class PaperValidationService:
    """
    Run parallel Python/TypeScript execution for paper validation.

    This service:
    1. Runs Python factor on live market data
    2. Calls TypeScript implementation via HTTP API
    3. Compares signals and tracks divergence
    4. Recommends promotion, extension, or rejection

    Example:
        config = PaperValidationConfig(
            factor_id="momentum-001",
            start_date=datetime.now(),
        )
        factor = MomentumFactor(metadata)
        service = PaperValidationService(config, factor)

        # Run daily comparison
        comparison = await service.run_daily_comparison(market_data)

        # Check if should terminate early
        terminate, reason = await service.check_early_termination()
    """

    def __init__(
        self,
        config: PaperValidationConfig,
        factor: ResearchFactor,
    ) -> None:
        """
        Initialize paper validation service.

        Args:
            config: Validation configuration
            factor: Python factor implementation to validate
        """
        self.config = config
        self.factor = factor
        self.comparisons: list[DailyComparison] = []
        self._http_client: httpx.AsyncClient | None = None

    async def get_http_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._http_client is None:
            import httpx

            self._http_client = httpx.AsyncClient(
                base_url=self.config.typescript_api_url,
                timeout=30.0,
            )
        return self._http_client

    async def close(self) -> None:
        """Close HTTP client."""
        if self._http_client is not None:
            await self._http_client.aclose()
            self._http_client = None

    async def run_daily_comparison(
        self,
        market_data: pl.DataFrame,
        factor_params: dict[str, Any] | None = None,
    ) -> DailyComparison:
        """
        Compare Python and TypeScript signals for today.

        Args:
            market_data: OHLCV candle data
            factor_params: Optional parameter overrides

        Returns:
            DailyComparison with both signals and divergence
        """
        params = factor_params or {}

        # Run both implementations
        python_signal = await self._run_python_factor(market_data, params)
        typescript_signal = await self._run_typescript_factor(market_data, params)

        # Compute divergence
        divergence = abs(python_signal - typescript_signal)
        is_divergent = divergence > self.config.divergence_tolerance

        comparison = DailyComparison(
            date=datetime.now(),
            python_signal=python_signal,
            typescript_signal=typescript_signal,
            divergence=divergence,
            is_divergent=is_divergent,
            market_data={"rows": len(market_data)},
        )

        self.comparisons.append(comparison)

        logger.info(
            f"Paper validation comparison for {self.config.factor_id}: "
            f"py={python_signal:.6f}, ts={typescript_signal:.6f}, "
            f"div={divergence:.6f}, divergent={is_divergent}"
        )

        return comparison

    async def _run_python_factor(
        self,
        data: pl.DataFrame,
        params: dict[str, Any],
    ) -> float:
        """
        Run Python factor implementation.

        Args:
            data: Market data
            params: Factor parameters

        Returns:
            Latest signal value
        """
        # Set parameters on the factor
        self.factor.set_parameters(params)

        # Compute signals
        signals = self.factor.compute_signal(data)

        # Return latest non-null signal
        non_null = signals.drop_nulls()
        if len(non_null) == 0:
            return 0.0
        return float(non_null[-1])

    async def _run_typescript_factor(
        self,
        data: pl.DataFrame,
        params: dict[str, Any],
    ) -> float:
        """
        Run TypeScript factor via HTTP API.

        Args:
            data: Market data
            params: Factor parameters

        Returns:
            Latest signal value
        """
        client = await self.get_http_client()

        # Convert DataFrame to list of dicts for JSON
        candles = data.to_dicts()

        response = await client.post(
            f"/api/factors/{self.config.factor_id}/signal",
            json={
                "candles": candles,
                "params": params,
            },
        )

        if response.status_code != 200:
            logger.error(f"TypeScript factor API error: {response.status_code} - {response.text}")
            raise RuntimeError(f"TypeScript factor API returned {response.status_code}")

        result = response.json()
        return float(result.get("signal", 0.0))

    async def check_early_termination(self) -> tuple[bool, str | None]:
        """
        Check if validation should terminate early.

        Returns:
            Tuple of (should_terminate, reason)
        """
        divergent_count = sum(1 for c in self.comparisons if c.is_divergent)

        # Too many divergences
        if divergent_count > self.config.max_divergences:
            return True, f"Too many divergences: {divergent_count}"

        # Check for drift (increasing divergence trend)
        if len(self.comparisons) >= 7:
            recent = [c.divergence for c in self.comparisons[-7:]]
            # Linear regression slope
            slope = np.polyfit(range(7), recent, 1)[0]
            if slope > 0.0001:
                return True, "Divergence trending upward (drift detected)"

        # Max duration exceeded
        days_elapsed = (datetime.now() - self.config.start_date).days
        if days_elapsed >= self.config.max_duration_days:
            return True, f"Max duration exceeded: {days_elapsed} days"

        return False, None

    def get_final_result(self) -> PaperValidationResult:
        """
        Compute final validation result.

        Returns:
            PaperValidationResult with all metrics and recommendation
        """
        if not self.comparisons:
            return PaperValidationResult(
                factor_id=self.config.factor_id,
                start_date=self.config.start_date,
                end_date=datetime.now(),
                total_days=0,
                total_comparisons=0,
                divergent_days=0,
                max_divergence=0.0,
                mean_divergence=0.0,
                correlation=0.0,
                python_sharpe=0.0,
                typescript_sharpe=0.0,
                passed=False,
                failure_reason="No comparisons performed",
                recommendation="REJECT",
            )

        divergences = [c.divergence for c in self.comparisons]
        python_signals = [c.python_signal for c in self.comparisons]
        ts_signals = [c.typescript_signal for c in self.comparisons]

        divergent_days = sum(1 for c in self.comparisons if c.is_divergent)
        passed = divergent_days <= self.config.max_divergences

        # Compute correlation
        if len(python_signals) > 1:
            correlation = float(np.corrcoef(python_signals, ts_signals)[0, 1])
            if np.isnan(correlation):
                correlation = 1.0  # All same values
        else:
            correlation = 1.0

        # Compute Sharpe ratios (simplified - assumes daily returns)
        python_sharpe = self._compute_sharpe(python_signals)
        typescript_sharpe = self._compute_sharpe(ts_signals)

        # Determine recommendation
        if not passed:
            recommendation: Literal["PROMOTE", "EXTEND", "REJECT"] = "REJECT"
            failure_reason = (
                f"Divergent days ({divergent_days}) exceeded max ({self.config.max_divergences})"
            )
        elif correlation > 0.99 and divergent_days == 0:
            recommendation = "PROMOTE"
            failure_reason = None
        elif correlation > 0.95:
            recommendation = (
                "EXTEND" if len(self.comparisons) < self.config.min_duration_days else "PROMOTE"
            )
            failure_reason = None
        else:
            recommendation = "REJECT"
            failure_reason = f"Correlation too low: {correlation:.4f}"

        return PaperValidationResult(
            factor_id=self.config.factor_id,
            start_date=self.comparisons[0].date,
            end_date=self.comparisons[-1].date,
            total_days=len(self.comparisons),
            total_comparisons=len(self.comparisons),
            divergent_days=divergent_days,
            max_divergence=max(divergences),
            mean_divergence=float(np.mean(divergences)),
            correlation=correlation,
            python_sharpe=python_sharpe,
            typescript_sharpe=typescript_sharpe,
            passed=passed,
            failure_reason=failure_reason,
            recommendation=recommendation,
        )

    def _compute_sharpe(self, signals: list[float], risk_free_rate: float = 0.0) -> float:
        """
        Compute annualized Sharpe ratio from daily signals.

        Args:
            signals: Daily signal values
            risk_free_rate: Annual risk-free rate

        Returns:
            Annualized Sharpe ratio
        """
        if len(signals) < 2:
            return 0.0

        # Compute returns from signals
        returns = np.diff(signals)

        if len(returns) == 0 or np.std(returns) == 0:
            return 0.0

        daily_rf = risk_free_rate / 252
        excess_returns = returns - daily_rf

        sharpe = float(np.mean(excess_returns) / np.std(excess_returns))

        # Annualize
        return sharpe * np.sqrt(252)
