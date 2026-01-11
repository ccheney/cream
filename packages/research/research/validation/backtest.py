"""
Backtest Configuration Validation Module

Provides validation for backtest configuration parameters including:
- Date range validation
- Slippage and commission configuration
- Overfitting detection
"""

from __future__ import annotations

from datetime import date

from research.errors import ErrorSeverity, ValidationIssue

from .config import ValidationConfig
from .utils import to_date


def validate_backtest_config(
    start_date: date | str,
    end_date: date | str,
    config: ValidationConfig,
    slippage_bps: float | None = None,
    commission_per_share: float | None = None,
    initial_capital: float | None = None,
    in_sample_sharpe: float | None = None,
    out_sample_sharpe: float | None = None,
) -> list[ValidationIssue]:
    """
    Validate backtest configuration parameters.

    Args:
        start_date: Backtest start date.
        end_date: Backtest end date.
        config: Validation configuration.
        slippage_bps: Slippage in basis points.
        commission_per_share: Commission per share.
        initial_capital: Initial portfolio capital.
        in_sample_sharpe: In-sample Sharpe ratio (for overfitting check).
        out_sample_sharpe: Out-of-sample Sharpe ratio (for overfitting check).

    Returns:
        List of validation issues found.
    """
    issues: list[ValidationIssue] = []

    start = to_date(start_date)
    end = to_date(end_date)

    issues.extend(_validate_date_range(start, end, config))
    issues.extend(_validate_slippage(slippage_bps, config))
    issues.extend(_validate_commission(commission_per_share, config))
    issues.extend(_validate_overfitting(in_sample_sharpe, out_sample_sharpe, config))
    issues.extend(_validate_capital(initial_capital))

    return issues


def _validate_date_range(
    start: date,
    end: date,
    config: ValidationConfig,
) -> list[ValidationIssue]:
    """Validate date range for backtest."""
    issues: list[ValidationIssue] = []

    if end <= start:
        issues.append(
            ValidationIssue(
                severity=ErrorSeverity.CRITICAL,
                error_type="InvalidDateRange",
                message="End date must be after start date",
                details={"start_date": str(start), "end_date": str(end)},
            )
        )
        return issues

    days = (end - start).days
    trading_days = int(days * (252 / 365))

    if trading_days < config.min_backtest_days:
        issues.append(
            ValidationIssue(
                severity=ErrorSeverity.ERROR,
                error_type="InvalidDateRange",
                message=(
                    f"Backtest period too short: ~{trading_days} trading days "
                    f"(minimum: {config.min_backtest_days})"
                ),
                details={
                    "calendar_days": days,
                    "estimated_trading_days": trading_days,
                    "min_required": config.min_backtest_days,
                },
            )
        )

    return issues


def _validate_slippage(
    slippage_bps: float | None,
    config: ValidationConfig,
) -> list[ValidationIssue]:
    """Validate slippage configuration."""
    issues: list[ValidationIssue] = []

    if slippage_bps is None:
        return issues

    slippage_pct = slippage_bps / 10000
    min_slip, max_slip = config.realistic_slippage_range

    if slippage_pct < min_slip:
        issues.append(
            ValidationIssue(
                severity=ErrorSeverity.WARNING,
                error_type="SlippageConfig",
                message=(
                    f"Slippage {slippage_bps:.1f}bps may be too low - "
                    "results may be unrealistically optimistic"
                ),
                details={
                    "configured_bps": slippage_bps,
                    "realistic_min_bps": min_slip * 10000,
                    "realistic_max_bps": max_slip * 10000,
                },
            )
        )
    elif slippage_pct > max_slip:
        issues.append(
            ValidationIssue(
                severity=ErrorSeverity.WARNING,
                error_type="SlippageConfig",
                message=(
                    f"Slippage {slippage_bps:.1f}bps is unusually high - verify this is intentional"
                ),
                details={
                    "configured_bps": slippage_bps,
                    "realistic_min_bps": min_slip * 10000,
                    "realistic_max_bps": max_slip * 10000,
                },
            )
        )

    return issues


def _validate_commission(
    commission_per_share: float | None,
    config: ValidationConfig,
) -> list[ValidationIssue]:
    """Validate commission configuration."""
    issues: list[ValidationIssue] = []

    if commission_per_share is None:
        return issues

    _min_comm, max_comm = config.realistic_commission_range
    if commission_per_share > max_comm:
        issues.append(
            ValidationIssue(
                severity=ErrorSeverity.WARNING,
                error_type="CommissionConfig",
                message=(
                    f"Commission ${commission_per_share:.4f}/share is high - "
                    "most brokers are commission-free"
                ),
                details={
                    "configured": commission_per_share,
                    "realistic_max": max_comm,
                },
            )
        )

    return issues


def _validate_overfitting(
    in_sample_sharpe: float | None,
    out_sample_sharpe: float | None,
    config: ValidationConfig,
) -> list[ValidationIssue]:
    """Validate for overfitting via Sharpe degradation."""
    issues: list[ValidationIssue] = []

    if in_sample_sharpe is None or out_sample_sharpe is None:
        return issues

    if in_sample_sharpe <= 0:
        return issues

    degradation = 1 - (out_sample_sharpe / in_sample_sharpe)
    if degradation > config.sharpe_degradation_threshold:
        issues.append(
            ValidationIssue(
                severity=ErrorSeverity.ERROR,
                error_type="ParameterOverfitting",
                message=(
                    f"Sharpe ratio degraded {degradation:.1%} out-of-sample - likely overfitting"
                ),
                details={
                    "in_sample_sharpe": in_sample_sharpe,
                    "out_sample_sharpe": out_sample_sharpe,
                    "degradation_pct": degradation,
                    "threshold": config.sharpe_degradation_threshold,
                },
            )
        )

    return issues


def _validate_capital(initial_capital: float | None) -> list[ValidationIssue]:
    """Validate initial capital configuration."""
    issues: list[ValidationIssue] = []

    if initial_capital is not None and initial_capital <= 0:
        issues.append(
            ValidationIssue(
                severity=ErrorSeverity.CRITICAL,
                error_type="InvalidConfig",
                message="Initial capital must be positive",
                details={"initial_capital": initial_capital},
            )
        )

    return issues


__all__ = ["validate_backtest_config"]
