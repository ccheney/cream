"""
Calibration Types Module

Enums and dataclasses for probability calibration.
"""

from dataclasses import dataclass
from enum import Enum


class CalibrationMethod(Enum):
    """Calibration method type."""

    PLATT = "platt"
    """Platt scaling (sigmoid calibration) - for <1000 samples."""

    ISOTONIC = "isotonic"
    """Isotonic regression - for >=1000 samples."""

    AUTO = "auto"
    """Auto-select based on sample count."""


@dataclass
class CalibrationConfig:
    """Configuration for probability calibration."""

    method: CalibrationMethod = CalibrationMethod.AUTO
    """Calibration method to use."""

    platt_threshold: int = 1000
    """Sample count threshold to switch from Platt to isotonic."""

    refit_interval: int = 100
    """Refit calibrator every N observations."""

    n_bins: int = 10
    """Number of bins for ECE calculation."""

    min_samples_for_fit: int = 50
    """Minimum samples required before fitting."""


@dataclass
class CalibrationMetrics:
    """Metrics for calibration quality assessment."""

    brier_score: float
    """Brier score (lower is better, range [0, 1])."""

    ece: float
    """Expected Calibration Error (lower is better)."""

    sample_count: int
    """Number of samples used for metrics."""

    method: str
    """Current calibration method being used."""

    last_fit_timestamp: str
    """ISO-8601 timestamp of last model fit."""

    is_fitted: bool = False
    """Whether the calibrator has been fitted."""


@dataclass
class DriftConfig:
    """Configuration for drift detection."""

    window_size: int = 200
    """Sliding window size for drift detection."""

    ece_threshold: float = 0.15
    """ECE threshold for absolute drift detection."""

    brier_threshold: float = 0.25
    """Brier score threshold for absolute drift detection."""

    relative_threshold: float = 0.05
    """Relative change threshold (5% change triggers drift)."""

    n_bins: int = 10
    """Number of bins for ECE calculation."""


@dataclass
class DriftMetrics:
    """Metrics for drift detection."""

    is_drifted: bool
    """Whether drift has been detected."""

    current_ece: float
    """Current ECE value."""

    current_brier: float
    """Current Brier score."""

    baseline_ece: float
    """Baseline ECE value."""

    baseline_brier: float
    """Baseline Brier score."""

    ece_change_pct: float
    """Percentage change in ECE."""

    brier_change_pct: float
    """Percentage change in Brier score."""

    reason: str = ""
    """Reason for drift detection."""
