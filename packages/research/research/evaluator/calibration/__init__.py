"""
Probability Calibration Package

Implements probability calibration using Platt scaling and isotonic regression,
with drift detection for triggering recalibration.

See: docs/plans/10-research.md - Calibration Approach
"""

from .calibrator import CalibratedProbabilityEstimator, ProbabilityCalibrator
from .drift import CalibrationDriftDetector, compute_ece
from .types import (
    CalibrationConfig,
    CalibrationMethod,
    CalibrationMetrics,
    DriftConfig,
    DriftMetrics,
)

__all__ = [
    # Types
    "CalibrationMethod",
    "CalibrationConfig",
    "CalibrationMetrics",
    "DriftConfig",
    "DriftMetrics",
    # Functions
    "compute_ece",
    # Classes
    "ProbabilityCalibrator",
    "CalibrationDriftDetector",
    "CalibratedProbabilityEstimator",
]
