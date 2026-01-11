"""
Validation Utility Functions

Provides utility functions for date conversion and statistical metrics.
"""

from __future__ import annotations

from datetime import date, datetime

import numpy as np


def to_date(d: date | str) -> date:
    """Convert string or date to date object."""
    if isinstance(d, str):
        return datetime.strptime(d, "%Y-%m-%d").date()
    return d


def compute_ece(
    predictions: np.ndarray,
    actuals: np.ndarray,
    n_bins: int = 10,
) -> float:
    """
    Compute Expected Calibration Error.

    Args:
        predictions: Predicted probabilities (0-1).
        actuals: Actual binary outcomes (0 or 1).
        n_bins: Number of bins for calibration.

    Returns:
        ECE score (lower is better).
    """
    bin_boundaries = np.linspace(0, 1, n_bins + 1)
    ece = 0.0

    for i in range(n_bins):
        mask = (predictions >= bin_boundaries[i]) & (predictions < bin_boundaries[i + 1])
        if i == n_bins - 1:
            mask = (predictions >= bin_boundaries[i]) & (predictions <= bin_boundaries[i + 1])

        if mask.sum() > 0:
            bin_accuracy = actuals[mask].mean()
            bin_confidence = predictions[mask].mean()
            ece += mask.sum() * abs(bin_accuracy - bin_confidence)

    return ece / len(predictions) if len(predictions) > 0 else 0.0


def compute_brier(
    predictions: np.ndarray,
    actuals: np.ndarray,
) -> float:
    """
    Compute Brier score.

    Args:
        predictions: Predicted probabilities (0-1).
        actuals: Actual binary outcomes (0 or 1).

    Returns:
        Brier score (lower is better).
    """
    return float(np.mean((predictions - actuals) ** 2))


def compute_kl_divergence(
    p: np.ndarray,
    q: np.ndarray,
    epsilon: float = 1e-10,
) -> float:
    """
    Compute KL divergence between two distributions.

    Args:
        p: First probability distribution.
        q: Second probability distribution.
        epsilon: Small value to avoid log(0).

    Returns:
        KL divergence score.
    """
    p = np.asarray(p, dtype=float)
    q = np.asarray(q, dtype=float)

    p = p / (p.sum() + epsilon)
    q = q / (q.sum() + epsilon)

    p = p + epsilon
    q = q + epsilon

    return float(np.sum(p * np.log(p / q)))


__all__ = [
    "compute_brier",
    "compute_ece",
    "compute_kl_divergence",
    "to_date",
]
