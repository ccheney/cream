"""
Drift Detection Module

Implements calibration drift detection using sliding window metrics.
"""

import logging
from collections import deque

import numpy as np
from sklearn.metrics import brier_score_loss

from .types import DriftConfig, DriftMetrics

logger = logging.getLogger(__name__)


def compute_ece(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    n_bins: int = 10,
) -> float:
    """
    Compute Expected Calibration Error (ECE).

    ECE measures the average absolute difference between predicted
    probabilities and actual outcomes across bins.

    Args:
        y_true: True binary labels (0 or 1)
        y_prob: Predicted probabilities
        n_bins: Number of bins (default: 10)

    Returns:
        ECE value (lower is better)
    """
    if len(y_true) == 0 or len(y_prob) == 0:
        return 0.0

    bin_boundaries = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    n_samples = len(y_true)

    for i in range(n_bins):
        lower = bin_boundaries[i]
        upper = bin_boundaries[i + 1]

        # Find samples in this bin
        in_bin = (y_prob >= lower) & (y_prob < upper)
        if i == n_bins - 1:  # Include right edge in last bin
            in_bin = (y_prob >= lower) & (y_prob <= upper)

        bin_count = np.sum(in_bin)
        if bin_count == 0:
            continue

        # Compute accuracy and confidence in this bin
        bin_accuracy = np.mean(y_true[in_bin])
        bin_confidence = np.mean(y_prob[in_bin])

        # Weighted contribution to ECE
        ece += (bin_count / n_samples) * np.abs(bin_accuracy - bin_confidence)

    return float(ece)


class CalibrationDriftDetector:
    """
    Detects drift in calibration quality using sliding window.

    Monitors ECE and Brier score over time and triggers when:
    - ECE > 0.15 (absolute threshold)
    - Brier > 0.25 (absolute threshold)
    - >5% relative change from baseline
    """

    def __init__(self, config: DriftConfig | None = None):
        """
        Initialize the drift detector.

        Args:
            config: Drift detection configuration
        """
        self.config = config or DriftConfig()

        # Sliding window
        self._predictions: deque[float] = deque(maxlen=self.config.window_size)
        self._outcomes: deque[int] = deque(maxlen=self.config.window_size)

        # Baseline metrics (set after initial window fills)
        self._baseline_ece: float | None = None
        self._baseline_brier: float | None = None
        self._baseline_set: bool = False

    @property
    def window_full(self) -> bool:
        """Check if the sliding window is full."""
        return len(self._predictions) >= self.config.window_size

    def update(self, prediction: float, outcome: int) -> None:
        """
        Update with a new observation.

        Args:
            prediction: Calibrated probability (0.0 to 1.0)
            outcome: Actual binary outcome (0 or 1)
        """
        self._predictions.append(prediction)
        self._outcomes.append(outcome)

        # Set baseline when window first fills
        if not self._baseline_set and self.window_full:
            self._set_baseline()

    def _set_baseline(self) -> None:
        """Set baseline metrics from current window."""
        metrics = self._compute_current_metrics()
        self._baseline_ece = metrics["ece"]
        self._baseline_brier = metrics["brier"]
        self._baseline_set = True
        logger.info(
            f"Drift baseline set: ECE={self._baseline_ece:.4f}, Brier={self._baseline_brier:.4f}"
        )

    def reset_baseline(self) -> None:
        """Reset baseline to current metrics."""
        if self.window_full:
            self._set_baseline()

    def _compute_current_metrics(self) -> dict[str, float]:
        """Compute metrics for current window."""
        if len(self._predictions) == 0:
            return {"ece": 0.0, "brier": 0.0}

        y_true = np.array(list(self._outcomes))
        y_prob = np.array(list(self._predictions))

        ece = compute_ece(y_true, y_prob, self.config.n_bins)
        brier = brier_score_loss(y_true, y_prob)

        return {"ece": ece, "brier": brier}

    def check_drift(self) -> DriftMetrics:
        """
        Check for calibration drift.

        Returns:
            DriftMetrics with current state
        """
        current = self._compute_current_metrics()
        current_ece = current["ece"]
        current_brier = current["brier"]

        baseline_ece = self._baseline_ece or 0.0
        baseline_brier = self._baseline_brier or 0.0

        # Compute relative changes
        ece_change = 0.0
        brier_change = 0.0
        if baseline_ece > 0:
            ece_change = (current_ece - baseline_ece) / baseline_ece
        if baseline_brier > 0:
            brier_change = (current_brier - baseline_brier) / baseline_brier

        # Check drift conditions
        is_drifted = False
        reason = ""

        if current_ece > self.config.ece_threshold:
            is_drifted = True
            reason = f"ECE {current_ece:.4f} > threshold {self.config.ece_threshold}"
        elif current_brier > self.config.brier_threshold:
            is_drifted = True
            reason = f"Brier {current_brier:.4f} > threshold {self.config.brier_threshold}"
        elif self._baseline_set and abs(ece_change) > self.config.relative_threshold:
            is_drifted = True
            reason = (
                f"ECE changed {ece_change * 100:.1f}% > {self.config.relative_threshold * 100:.1f}%"
            )
        elif self._baseline_set and abs(brier_change) > self.config.relative_threshold:
            is_drifted = True
            reason = f"Brier changed {brier_change * 100:.1f}% > {self.config.relative_threshold * 100:.1f}%"

        return DriftMetrics(
            is_drifted=is_drifted,
            current_ece=current_ece,
            current_brier=current_brier,
            baseline_ece=baseline_ece,
            baseline_brier=baseline_brier,
            ece_change_pct=ece_change * 100,
            brier_change_pct=brier_change * 100,
            reason=reason,
        )

    def reset(self) -> None:
        """Reset the drift detector."""
        self._predictions.clear()
        self._outcomes.clear()
        self._baseline_ece = None
        self._baseline_brier = None
        self._baseline_set = False
