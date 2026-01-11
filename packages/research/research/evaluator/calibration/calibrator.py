"""
Probability Calibrator Module

Implements probability calibration using Platt scaling and isotonic regression.
"""

import logging
import pickle
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss

from .drift import CalibrationDriftDetector, compute_ece
from .types import (
    CalibrationConfig,
    CalibrationMethod,
    CalibrationMetrics,
    DriftConfig,
    DriftMetrics,
)

logger = logging.getLogger(__name__)


class ProbabilityCalibrator:
    """
    Probability calibrator using Platt scaling or isotonic regression.

    Automatically switches between methods based on sample count:
    - <1000 samples: Platt scaling (sigmoid)
    - >=1000 samples: Isotonic regression

    Usage:
        calibrator = ProbabilityCalibrator()
        for pred, outcome in data:
            calibrator.update(pred, outcome)
        calibrated = calibrator.calibrate(raw_prob)
    """

    def __init__(self, config: CalibrationConfig | None = None):
        """
        Initialize the calibrator.

        Args:
            config: Calibration configuration (uses defaults if None)
        """
        self.config = config or CalibrationConfig()

        # Storage for predictions and outcomes
        self._predictions: list[float] = []
        self._outcomes: list[int] = []

        # Calibration models
        self._platt_model: LogisticRegression | None = None
        self._isotonic_model: IsotonicRegression | None = None

        # State tracking
        self._current_method: CalibrationMethod = CalibrationMethod.PLATT
        self._is_fitted: bool = False
        self._last_fit_timestamp: str = ""
        self._samples_since_fit: int = 0

    @property
    def sample_count(self) -> int:
        """Get current sample count."""
        return len(self._predictions)

    @property
    def is_fitted(self) -> bool:
        """Check if calibrator is fitted."""
        return self._is_fitted

    @property
    def current_method(self) -> CalibrationMethod:
        """Get current calibration method."""
        return self._current_method

    def update(self, prediction: float, outcome: int) -> None:
        """
        Update the calibrator with a new observation.

        Args:
            prediction: Raw probability prediction (0.0 to 1.0)
            outcome: Actual binary outcome (0 or 1)
        """
        # Validate inputs
        if not 0.0 <= prediction <= 1.0:
            raise ValueError(f"Prediction must be in [0, 1], got {prediction}")
        if outcome not in (0, 1):
            raise ValueError(f"Outcome must be 0 or 1, got {outcome}")

        self._predictions.append(prediction)
        self._outcomes.append(outcome)
        self._samples_since_fit += 1

        # Trigger refit if needed
        if self._samples_since_fit >= self.config.refit_interval:
            self._fit()

    def update_batch(
        self,
        predictions: NDArray[np.float64] | list[float],
        outcomes: NDArray[np.int_] | list[int],
    ) -> None:
        """
        Update with a batch of observations.

        Args:
            predictions: Array of predictions
            outcomes: Array of outcomes
        """
        for pred, out in zip(predictions, outcomes, strict=True):
            self.update(float(pred), int(out))

    def calibrate(self, raw_prob: float | NDArray[np.float64]) -> float | NDArray[np.float64]:
        """
        Calibrate a raw probability.

        Args:
            raw_prob: Raw probability (scalar or array)

        Returns:
            Calibrated probability (same shape as input)
        """
        if not self._is_fitted:
            # Return raw probability if not fitted
            return raw_prob

        is_scalar = np.isscalar(raw_prob)
        probs = np.atleast_1d(raw_prob).reshape(-1, 1)

        if self._current_method == CalibrationMethod.PLATT and self._platt_model is not None:
            # Platt scaling: apply sigmoid calibration
            calibrated = self._platt_model.predict_proba(probs)[:, 1]
        elif (
            self._current_method == CalibrationMethod.ISOTONIC and self._isotonic_model is not None
        ):
            # Isotonic regression: use fitted curve
            calibrated = self._isotonic_model.predict(probs.ravel())
            # Clip to [0, 1] range
            calibrated = np.clip(calibrated, 0.0, 1.0)
        else:
            calibrated = probs.ravel()

        if is_scalar:
            return float(calibrated[0])
        return calibrated

    def get_calibration_metrics(self) -> CalibrationMetrics:
        """
        Get current calibration metrics.

        Returns:
            CalibrationMetrics with Brier score and ECE
        """
        if len(self._predictions) == 0:
            return CalibrationMetrics(
                brier_score=0.0,
                ece=0.0,
                sample_count=0,
                method="none",
                last_fit_timestamp="",
                is_fitted=False,
            )

        y_true = np.array(self._outcomes)
        y_prob = np.array(self._predictions)

        # Calibrate predictions if fitted
        y_prob_cal = self.calibrate(y_prob) if self._is_fitted else y_prob

        # Compute metrics
        brier = brier_score_loss(y_true, y_prob_cal)
        ece = compute_ece(y_true, y_prob_cal, self.config.n_bins)

        return CalibrationMetrics(
            brier_score=brier,
            ece=ece,
            sample_count=len(self._predictions),
            method=self._current_method.value,
            last_fit_timestamp=self._last_fit_timestamp,
            is_fitted=self._is_fitted,
        )

    def _fit(self) -> None:
        """Fit the calibration model."""
        if len(self._predictions) < self.config.min_samples_for_fit:
            logger.debug(
                f"Not enough samples for fit: {len(self._predictions)} < {self.config.min_samples_for_fit}"
            )
            return

        y_true = np.array(self._outcomes)
        y_prob = np.array(self._predictions).reshape(-1, 1)

        # Determine method
        if self.config.method == CalibrationMethod.AUTO:
            if len(self._predictions) < self.config.platt_threshold:
                method = CalibrationMethod.PLATT
            else:
                method = CalibrationMethod.ISOTONIC
        else:
            method = self.config.method

        try:
            if method == CalibrationMethod.PLATT:
                self._fit_platt(y_prob, y_true)
            else:
                self._fit_isotonic(y_prob.ravel(), y_true)

            self._current_method = method
            self._is_fitted = True
            self._last_fit_timestamp = datetime.now().isoformat()
            self._samples_since_fit = 0

            logger.info(
                f"Calibrator fitted with {len(self._predictions)} samples using {method.value}"
            )
        except Exception as e:
            logger.warning(f"Failed to fit calibrator: {e}")

    def _fit_platt(self, X: NDArray[np.float64], y: NDArray[np.int_]) -> None:
        """Fit Platt scaling (logistic regression)."""
        self._platt_model = LogisticRegression(
            solver="lbfgs",
            max_iter=1000,
            C=1e10,  # No regularization
        )
        self._platt_model.fit(X, y)

    def _fit_isotonic(self, X: NDArray[np.float64], y: NDArray[np.int_]) -> None:
        """Fit isotonic regression."""
        self._isotonic_model = IsotonicRegression(
            y_min=0.0,
            y_max=1.0,
            out_of_bounds="clip",
        )
        self._isotonic_model.fit(X, y)

    def reset(self) -> None:
        """Reset the calibrator to initial state."""
        self._predictions.clear()
        self._outcomes.clear()
        self._platt_model = None
        self._isotonic_model = None
        self._is_fitted = False
        self._last_fit_timestamp = ""
        self._samples_since_fit = 0
        self._current_method = CalibrationMethod.PLATT

    def save(self, path: str | Path) -> None:
        """
        Save calibrator state to file.

        Args:
            path: Path to save file
        """
        state = {
            "config": self.config,
            "predictions": self._predictions,
            "outcomes": self._outcomes,
            "platt_model": self._platt_model,
            "isotonic_model": self._isotonic_model,
            "current_method": self._current_method,
            "is_fitted": self._is_fitted,
            "last_fit_timestamp": self._last_fit_timestamp,
            "samples_since_fit": self._samples_since_fit,
        }
        with open(path, "wb") as f:
            pickle.dump(state, f)

    @classmethod
    def load(cls, path: str | Path) -> ProbabilityCalibrator:
        """
        Load calibrator state from file.

        Args:
            path: Path to load file

        Returns:
            Loaded ProbabilityCalibrator
        """
        with open(path, "rb") as f:
            state = pickle.load(f)

        calibrator = cls(config=state["config"])
        calibrator._predictions = state["predictions"]
        calibrator._outcomes = state["outcomes"]
        calibrator._platt_model = state["platt_model"]
        calibrator._isotonic_model = state["isotonic_model"]
        calibrator._current_method = state["current_method"]
        calibrator._is_fitted = state["is_fitted"]
        calibrator._last_fit_timestamp = state["last_fit_timestamp"]
        calibrator._samples_since_fit = state["samples_since_fit"]

        return calibrator


class CalibratedProbabilityEstimator:
    """
    Combined calibrator and drift detector.

    Provides a single interface for:
    - Probability calibration (Platt/isotonic)
    - Drift detection with automatic recalibration
    - Metrics tracking
    """

    def __init__(
        self,
        calibration_config: CalibrationConfig | None = None,
        drift_config: DriftConfig | None = None,
    ):
        """
        Initialize the estimator.

        Args:
            calibration_config: Calibration configuration
            drift_config: Drift detection configuration
        """
        self.calibrator = ProbabilityCalibrator(calibration_config)
        self.drift_detector = CalibrationDriftDetector(drift_config)

        self._recalibration_count: int = 0

    def update(self, prediction: float, outcome: int) -> DriftMetrics | None:
        """
        Update with a new observation and check for drift.

        Args:
            prediction: Raw probability prediction
            outcome: Actual binary outcome

        Returns:
            DriftMetrics if drift detected, None otherwise
        """
        # Update calibrator with raw prediction
        self.calibrator.update(prediction, outcome)

        # Calibrate and update drift detector
        if self.calibrator.is_fitted:
            calibrated = self.calibrator.calibrate(prediction)
            self.drift_detector.update(float(calibrated), outcome)

            # Check for drift
            drift = self.drift_detector.check_drift()
            if drift.is_drifted:
                logger.warning(f"Calibration drift detected: {drift.reason}")
                self._handle_drift()
                return drift

        return None

    def _handle_drift(self) -> None:
        """Handle detected drift by triggering recalibration."""
        self._recalibration_count += 1
        self.drift_detector.reset_baseline()
        logger.info(f"Recalibration triggered (count: {self._recalibration_count})")

    def calibrate(self, raw_prob: float | NDArray[np.float64]) -> float | NDArray[np.float64]:
        """
        Calibrate a probability.

        Args:
            raw_prob: Raw probability

        Returns:
            Calibrated probability
        """
        return self.calibrator.calibrate(raw_prob)

    def get_metrics(self) -> dict[str, Any]:
        """
        Get combined metrics.

        Returns:
            Dictionary with calibration and drift metrics
        """
        cal_metrics = self.calibrator.get_calibration_metrics()
        drift_metrics = self.drift_detector.check_drift()

        return {
            "calibration": {
                "brier_score": cal_metrics.brier_score,
                "ece": cal_metrics.ece,
                "sample_count": cal_metrics.sample_count,
                "method": cal_metrics.method,
                "is_fitted": cal_metrics.is_fitted,
            },
            "drift": {
                "is_drifted": drift_metrics.is_drifted,
                "current_ece": drift_metrics.current_ece,
                "current_brier": drift_metrics.current_brier,
                "reason": drift_metrics.reason,
            },
            "recalibration_count": self._recalibration_count,
        }
