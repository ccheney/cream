"""
Calibration Data Validation Module

Provides validation for calibration data quality including:
- Sample size validation
- Prediction range validation
- Class balance checks
- Calibration metrics (ECE, Brier)
- Calibration drift detection
- Distribution shift detection
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np

from research.errors import ErrorSeverity, ValidationIssue

from .config import ValidationConfig
from .utils import compute_brier, compute_ece, compute_kl_divergence

if TYPE_CHECKING:
    from collections.abc import Sequence


def validate_calibration_data(
    predictions: np.ndarray | Sequence[float],
    actuals: np.ndarray | Sequence[int],
    config: ValidationConfig,
    historical_ece: float | None = None,
    historical_brier: float | None = None,
    feature_distributions: dict[str, tuple[np.ndarray, np.ndarray]] | None = None,
) -> list[ValidationIssue]:
    """
    Validate calibration data quality.

    Args:
        predictions: Predicted probabilities (0-1).
        actuals: Actual binary outcomes (0 or 1).
        config: Validation configuration.
        historical_ece: Historical Expected Calibration Error for drift detection.
        historical_brier: Historical Brier score for drift detection.
        feature_distributions: Dict of feature name to (historical, current) distributions.

    Returns:
        List of validation issues found.
    """
    issues: list[ValidationIssue] = []

    predictions = np.asarray(predictions)
    actuals = np.asarray(actuals)

    issues.extend(_validate_sample_size(predictions, config))
    issues.extend(_validate_prediction_range(predictions))
    issues.extend(_validate_actuals_binary(actuals))
    issues.extend(_validate_class_balance(actuals))

    current_ece = compute_ece(predictions, actuals)
    current_brier = compute_brier(predictions, actuals)

    issues.extend(_validate_calibration_metrics(current_ece, current_brier, config))
    issues.extend(
        _validate_calibration_drift(
            current_ece, current_brier, historical_ece, historical_brier, config
        )
    )
    issues.extend(_validate_distribution_shift(feature_distributions, config))

    return issues


def _validate_sample_size(
    predictions: np.ndarray,
    config: ValidationConfig,
) -> list[ValidationIssue]:
    """Validate sample size for calibration."""
    issues: list[ValidationIssue] = []

    n_samples = len(predictions)
    if n_samples < config.min_calibration_samples:
        issues.append(
            ValidationIssue(
                severity=ErrorSeverity.ERROR,
                error_type="InsufficientSamples",
                message=(
                    f"Only {n_samples} samples for calibration "
                    f"(minimum: {config.min_calibration_samples})"
                ),
                details={
                    "available_samples": n_samples,
                    "required_samples": config.min_calibration_samples,
                },
            )
        )

    return issues


def _validate_prediction_range(predictions: np.ndarray) -> list[ValidationIssue]:
    """Validate predictions are in [0, 1] range."""
    issues: list[ValidationIssue] = []

    if predictions.min() < 0 or predictions.max() > 1:
        issues.append(
            ValidationIssue(
                severity=ErrorSeverity.CRITICAL,
                error_type="InvalidPredictions",
                message="Predictions must be in range [0, 1]",
                details={
                    "min_prediction": float(predictions.min()),
                    "max_prediction": float(predictions.max()),
                },
            )
        )

    return issues


def _validate_actuals_binary(actuals: np.ndarray) -> list[ValidationIssue]:
    """Validate actuals are binary (0 or 1)."""
    issues: list[ValidationIssue] = []

    unique_actuals = np.unique(actuals)
    if not np.all(np.isin(unique_actuals, [0, 1])):
        issues.append(
            ValidationIssue(
                severity=ErrorSeverity.CRITICAL,
                error_type="InvalidActuals",
                message="Actuals must be binary (0 or 1)",
                details={"unique_values": unique_actuals.tolist()},
            )
        )

    return issues


def _validate_class_balance(actuals: np.ndarray) -> list[ValidationIssue]:
    """Validate class balance is reasonable."""
    issues: list[ValidationIssue] = []

    positive_rate = actuals.mean()
    if positive_rate < 0.05 or positive_rate > 0.95:
        issues.append(
            ValidationIssue(
                severity=ErrorSeverity.WARNING,
                error_type="ClassImbalance",
                message=(f"Severe class imbalance: {positive_rate:.1%} positive rate"),
                details={"positive_rate": float(positive_rate)},
            )
        )

    return issues


def _validate_calibration_metrics(
    current_ece: float,
    current_brier: float,
    config: ValidationConfig,
) -> list[ValidationIssue]:
    """Validate calibration metrics are within thresholds."""
    issues: list[ValidationIssue] = []

    if current_ece > config.ece_threshold:
        issues.append(
            ValidationIssue(
                severity=ErrorSeverity.WARNING,
                error_type="PoorCalibration",
                message=(f"ECE {current_ece:.3f} exceeds threshold ({config.ece_threshold})"),
                details={
                    "current_ece": current_ece,
                    "threshold": config.ece_threshold,
                },
            )
        )

    if current_brier > config.brier_threshold:
        issues.append(
            ValidationIssue(
                severity=ErrorSeverity.WARNING,
                error_type="PoorCalibration",
                message=(
                    f"Brier score {current_brier:.3f} exceeds threshold ({config.brier_threshold})"
                ),
                details={
                    "current_brier": current_brier,
                    "threshold": config.brier_threshold,
                },
            )
        )

    return issues


def _validate_calibration_drift(
    current_ece: float,
    current_brier: float,
    historical_ece: float | None,
    historical_brier: float | None,
    config: ValidationConfig,
) -> list[ValidationIssue]:
    """Validate for calibration drift from historical baseline."""
    issues: list[ValidationIssue] = []

    if historical_ece is not None:
        ece_drift = current_ece - historical_ece
        if ece_drift > config.ece_threshold:
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.ERROR,
                    error_type="CalibrationDrift",
                    message=(f"ECE increased by {ece_drift:.3f} from historical baseline"),
                    details={
                        "historical_ece": historical_ece,
                        "current_ece": current_ece,
                        "drift": ece_drift,
                    },
                )
            )

    if historical_brier is not None:
        brier_drift = current_brier - historical_brier
        if brier_drift > config.brier_threshold / 2:
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.ERROR,
                    error_type="CalibrationDrift",
                    message=(f"Brier score increased by {brier_drift:.3f} from baseline"),
                    details={
                        "historical_brier": historical_brier,
                        "current_brier": current_brier,
                        "drift": brier_drift,
                    },
                )
            )

    return issues


def _validate_distribution_shift(
    feature_distributions: dict[str, tuple[np.ndarray, np.ndarray]] | None,
    config: ValidationConfig,
) -> list[ValidationIssue]:
    """Validate for distribution shift in features."""
    issues: list[ValidationIssue] = []

    if not feature_distributions:
        return issues

    for feature_name, (hist_dist, curr_dist) in feature_distributions.items():
        kl_div = compute_kl_divergence(hist_dist, curr_dist)
        if kl_div > config.distribution_shift_threshold:
            issues.append(
                ValidationIssue(
                    severity=ErrorSeverity.WARNING,
                    error_type="DistributionShift",
                    message=(
                        f"Distribution shift detected in '{feature_name}' "
                        f"(KL divergence: {kl_div:.3f})"
                    ),
                    details={
                        "feature": feature_name,
                        "kl_divergence": kl_div,
                        "threshold": config.distribution_shift_threshold,
                    },
                )
            )

    return issues


__all__ = ["validate_calibration_data"]
