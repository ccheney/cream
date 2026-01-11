"""
Historical Data Validation Module

Provides validation for historical price data including:
- Survivorship bias checks
- Look-ahead bias checks
- Data gap detection
- Anomaly detection
- Timezone validation
"""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

import pandas as pd

from research.errors import ErrorSeverity, ValidationIssue

from .config import ValidationConfig
from .protocols import CorporateActionProvider, UniverseProvider
from .utils import to_date

if TYPE_CHECKING:
    from collections.abc import Sequence


def check_survivorship_bias(
    prices: pd.DataFrame,
    symbols: Sequence[str],
    start_date: date,
    config: ValidationConfig,
    universe_provider: UniverseProvider | None = None,
) -> list[ValidationIssue]:
    """Check for survivorship bias in the data."""
    issues: list[ValidationIssue] = []

    if universe_provider is not None:
        historical_universe = universe_provider.get_constituents(start_date)
        current_symbols = set(symbols)

        new_symbols = current_symbols - historical_universe
        if new_symbols:
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.WARNING,
                    error_type="SurvivorshipBiasWarning",
                    message=(
                        f"Found {len(new_symbols)} symbols in current universe "
                        f"that weren't constituents on {start_date}"
                    ),
                    details={
                        "new_symbols": list(new_symbols)[:10],
                        "total_new": len(new_symbols),
                    },
                )
            )

        delisted = historical_universe - current_symbols
        if delisted:
            missing_pct = len(delisted) / len(historical_universe)
            severity = (
                ErrorSeverity.ERROR
                if missing_pct > config.max_missing_symbols_pct
                else ErrorSeverity.WARNING
            )
            issues.append(
                ValidationIssue(
                    severity=severity,
                    error_type="SurvivorshipBias",
                    message=(
                        f"Missing {len(delisted)} symbols ({missing_pct:.1%}) "
                        f"that were in universe on {start_date}"
                    ),
                    details={
                        "delisted_symbols": list(delisted)[:10],
                        "total_delisted": len(delisted),
                        "missing_pct": missing_pct,
                    },
                )
            )

    if "date" in prices.columns and "symbol" in prices.columns:
        for symbol in symbols:
            symbol_data = prices[prices["symbol"] == symbol]
            if len(symbol_data) < config.min_history_days:
                issues.append(
                    ValidationIssue(
                        severity=ErrorSeverity.WARNING,
                        error_type="InsufficientHistory",
                        message=(
                            f"Symbol {symbol} has only {len(symbol_data)} days "
                            f"of history (minimum: {config.min_history_days})"
                        ),
                        details={
                            "symbol": symbol,
                            "available_days": len(symbol_data),
                            "required_days": config.min_history_days,
                        },
                    )
                )

    return issues


def check_lookahead_bias(
    prices: pd.DataFrame,
    symbols: Sequence[str],
    start_date: date,
    end_date: date,
    config: ValidationConfig,
    corporate_action_provider: CorporateActionProvider | None = None,
) -> list[ValidationIssue]:
    """Check for look-ahead bias in the data."""
    issues: list[ValidationIssue] = []

    if corporate_action_provider is not None:
        for symbol in symbols:
            actions = corporate_action_provider.get_actions(symbol, start_date, end_date)
            for action in actions:
                action_date = action.get("date")
                action_type = action.get("type", "unknown")

                if action_date and action_type in ("split", "dividend", "merger"):
                    issues.append(
                        ValidationIssue(
                            severity=ErrorSeverity.WARNING,
                            error_type="CorporateActionWarning",
                            message=(
                                f"Corporate action ({action_type}) for {symbol} "
                                f"on {action_date} - verify data is point-in-time"
                            ),
                            details={
                                "symbol": symbol,
                                "action_type": action_type,
                                "action_date": str(action_date),
                                "lag_days": config.corporate_action_lag_days,
                            },
                        )
                    )

    if "timestamp" in prices.columns and "date" in prices.columns:
        prices_copy = prices.copy()
        prices_copy["date_dt"] = pd.to_datetime(prices_copy["date"])
        prices_copy["ts_dt"] = pd.to_datetime(prices_copy["timestamp"])

        future_data = prices_copy[prices_copy["ts_dt"] > prices_copy["date_dt"]]
        if not future_data.empty:
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.CRITICAL,
                    error_type="LookAheadBias",
                    message=(
                        f"Found {len(future_data)} records with timestamps "
                        "after their date - possible look-ahead bias"
                    ),
                    details={
                        "affected_records": len(future_data),
                        "sample_symbols": future_data["symbol"].unique()[:5].tolist()
                        if "symbol" in future_data.columns
                        else [],
                    },
                )
            )

    return issues


def check_data_gaps(
    prices: pd.DataFrame,
    symbols: Sequence[str],
    start_date: date,
    end_date: date,
    config: ValidationConfig,
) -> list[ValidationIssue]:
    """Check for gaps in the data."""
    issues: list[ValidationIssue] = []

    if "date" not in prices.columns or "symbol" not in prices.columns:
        return issues

    all_days = pd.date_range(start=start_date, end=end_date, freq="B")
    expected_days = len(all_days)

    for symbol in symbols:
        symbol_data = prices[prices["symbol"] == symbol]
        if symbol_data.empty:
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.ERROR,
                    error_type="DataGap",
                    message=f"No data found for symbol {symbol}",
                    details={"symbol": symbol, "expected_days": expected_days},
                )
            )
            continue

        symbol_dates = pd.to_datetime(symbol_data["date"]).dt.date
        unique_dates = set(symbol_dates)

        missing_count = expected_days - len(unique_dates)
        if missing_count > 0:
            sorted_dates = sorted(unique_dates)
            max_gap = 0
            gap_start = None
            gap_end = None

            for i in range(1, len(sorted_dates)):
                gap = (sorted_dates[i] - sorted_dates[i - 1]).days
                if gap > max_gap:
                    max_gap = gap
                    gap_start = sorted_dates[i - 1]
                    gap_end = sorted_dates[i]

            if max_gap > config.max_gap_days:
                issues.append(
                    ValidationIssue(
                        severity=ErrorSeverity.ERROR,
                        error_type="DataGap",
                        message=(
                            f"Found {max_gap}-day gap in {symbol} data "
                            f"from {gap_start} to {gap_end}"
                        ),
                        details={
                            "symbol": symbol,
                            "gap_days": max_gap,
                            "gap_start": str(gap_start),
                            "gap_end": str(gap_end),
                            "total_missing": missing_count,
                        },
                    )
                )
            elif missing_count > expected_days * 0.1:
                issues.append(
                    ValidationIssue(
                        severity=ErrorSeverity.WARNING,
                        error_type="DataGap",
                        message=(
                            f"Symbol {symbol} missing {missing_count} days "
                            f"({missing_count / expected_days:.1%})"
                        ),
                        details={
                            "symbol": symbol,
                            "missing_days": missing_count,
                            "expected_days": expected_days,
                            "actual_days": len(unique_dates),
                        },
                    )
                )

    return issues


def check_anomalies(
    prices: pd.DataFrame,
    symbols: Sequence[str],
    config: ValidationConfig,
) -> list[ValidationIssue]:
    """Check for price and volume anomalies."""
    issues: list[ValidationIssue] = []

    if "close" not in prices.columns:
        return issues

    for symbol in symbols:
        if "symbol" in prices.columns:
            symbol_data = prices[prices["symbol"] == symbol].copy()
        else:
            symbol_data = prices.copy()

        if len(symbol_data) < 2:
            continue

        if "date" in symbol_data.columns:
            symbol_data = symbol_data.sort_values("date")

        symbol_data["pct_change"] = symbol_data["close"].pct_change()
        extreme_changes = symbol_data[
            symbol_data["pct_change"].abs() > config.price_change_threshold
        ]

        for _, row in extreme_changes.iterrows():
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.WARNING,
                    error_type="DataAnomaly",
                    message=(f"Extreme price change of {row['pct_change']:.1%} for {symbol}"),
                    details={
                        "symbol": symbol,
                        "date": str(row.get("date", "unknown")),
                        "pct_change": float(row["pct_change"]),
                        "close": float(row["close"]),
                        "threshold": config.price_change_threshold,
                    },
                )
            )

        if "volume" in symbol_data.columns:
            avg_volume = symbol_data["volume"].mean()
            if avg_volume > 0:
                volume_spikes = symbol_data[
                    symbol_data["volume"] > avg_volume * config.volume_spike_threshold
                ]
                for _, row in volume_spikes.iterrows():
                    issues.append(
                        ValidationIssue(
                            severity=ErrorSeverity.WARNING,
                            error_type="DataAnomaly",
                            message=(
                                f"Volume spike ({row['volume'] / avg_volume:.1f}x average) "
                                f"for {symbol}"
                            ),
                            details={
                                "symbol": symbol,
                                "date": str(row.get("date", "unknown")),
                                "volume": int(row["volume"]),
                                "avg_volume": int(avg_volume),
                                "multiple": float(row["volume"] / avg_volume),
                            },
                        )
                    )

        negative_prices = symbol_data[symbol_data["close"] <= 0]
        if not negative_prices.empty:
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.CRITICAL,
                    error_type="DataAnomaly",
                    message=f"Found {len(negative_prices)} negative/zero prices for {symbol}",
                    details={
                        "symbol": symbol,
                        "count": len(negative_prices),
                    },
                )
            )

    return issues


def check_timezone(prices: pd.DataFrame) -> list[ValidationIssue]:
    """Check for timezone issues in the data."""
    issues: list[ValidationIssue] = []

    if "timestamp" not in prices.columns:
        return issues

    sample_ts = prices["timestamp"].iloc[0] if len(prices) > 0 else None
    if sample_ts is None:
        return issues

    if isinstance(sample_ts, datetime):
        if sample_ts.tzinfo is None:
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.WARNING,
                    error_type="TimezoneWarning",
                    message="Timestamps are timezone-naive - should be UTC",
                    details={"sample_timestamp": str(sample_ts)},
                )
            )
        elif str(sample_ts.tzinfo) != "UTC":
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.WARNING,
                    error_type="TimezoneWarning",
                    message=(f"Timestamps use {sample_ts.tzinfo} timezone - should be UTC"),
                    details={
                        "actual_timezone": str(sample_ts.tzinfo),
                        "expected_timezone": "UTC",
                    },
                )
            )

    return issues


def validate_historical_data(
    prices: pd.DataFrame,
    symbols: Sequence[str],
    start_date: date | str,
    end_date: date | str,
    config: ValidationConfig,
    universe_provider: UniverseProvider | None = None,
    corporate_action_provider: CorporateActionProvider | None = None,
    check_survivorship: bool = True,
    check_lookahead: bool = True,
    check_gaps: bool = True,
    check_anomalies_flag: bool = True,
    check_timezone_flag: bool = True,
) -> list[ValidationIssue]:
    """
    Validate historical price data for common issues.

    Args:
        prices: DataFrame with columns [date, symbol, open, high, low, close, volume].
        symbols: List of symbols that should be present.
        start_date: Start of the analysis period.
        end_date: End of the analysis period.
        config: Validation configuration.
        universe_provider: Optional provider for historical universe data.
        corporate_action_provider: Optional provider for corporate actions.
        check_survivorship: Check for survivorship bias.
        check_lookahead: Check for look-ahead bias.
        check_gaps: Check for data gaps.
        check_anomalies_flag: Check for price/volume anomalies.
        check_timezone_flag: Check for timezone issues.

    Returns:
        List of validation issues found.
    """
    issues: list[ValidationIssue] = []

    start = to_date(start_date)
    end = to_date(end_date)

    if check_survivorship:
        issues.extend(check_survivorship_bias(prices, symbols, start, config, universe_provider))

    if check_lookahead:
        issues.extend(
            check_lookahead_bias(prices, symbols, start, end, config, corporate_action_provider)
        )

    if check_gaps:
        issues.extend(check_data_gaps(prices, symbols, start, end, config))

    if check_anomalies_flag:
        issues.extend(check_anomalies(prices, symbols, config))

    if check_timezone_flag:
        issues.extend(check_timezone(prices))

    return issues


__all__ = [
    "check_anomalies",
    "check_data_gaps",
    "check_lookahead_bias",
    "check_survivorship_bias",
    "check_timezone",
    "validate_historical_data",
]
