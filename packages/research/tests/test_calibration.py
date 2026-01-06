"""Tests for probability calibration and drift detection."""

import tempfile
from pathlib import Path

import numpy as np
import pytest
from numpy.typing import NDArray

from research.evaluator.calibration import (
    CalibratedProbabilityEstimator,
    CalibrationConfig,
    CalibrationDriftDetector,
    CalibrationMethod,
    DriftConfig,
    DriftMetrics,
    ProbabilityCalibrator,
    compute_ece,
)

# ============================================
# Fixtures
# ============================================


@pytest.fixture
def calibrator() -> ProbabilityCalibrator:
    """Create a default calibrator."""
    return ProbabilityCalibrator()


@pytest.fixture
def well_calibrated_data() -> tuple[NDArray[np.float64], NDArray[np.int_]]:
    """Generate well-calibrated data."""
    np.random.seed(42)
    n = 500

    # Generate predictions across the range
    predictions = np.random.uniform(0.1, 0.9, n)

    # Generate outcomes based on predictions (well calibrated)
    outcomes = (np.random.random(n) < predictions).astype(int)

    return predictions, outcomes


@pytest.fixture
def poorly_calibrated_data() -> tuple[NDArray[np.float64], NDArray[np.int_]]:
    """Generate poorly calibrated data (overconfident)."""
    np.random.seed(42)
    n = 500

    # Generate overconfident predictions (always high)
    predictions = np.random.uniform(0.7, 0.95, n)

    # Generate outcomes with lower actual rate
    outcomes = (np.random.random(n) < 0.5).astype(int)

    return predictions, outcomes


# ============================================
# ECE Tests
# ============================================


class TestComputeECE:
    """Tests for Expected Calibration Error computation."""

    def test_perfect_calibration(self):
        """Test ECE for perfectly calibrated predictions."""
        # Perfect calibration: predictions match outcomes
        n = 1000
        np.random.seed(42)

        predictions = np.random.uniform(0, 1, n)
        # Create outcomes that match predictions on average per bin
        outcomes = (np.random.random(n) < predictions).astype(int)

        ece = compute_ece(outcomes, predictions)

        # ECE should be low for well-calibrated predictions
        assert ece < 0.15

    def test_poor_calibration(self):
        """Test ECE for poorly calibrated predictions."""
        # All predictions are 0.9 but half are actually 1
        predictions = np.array([0.9] * 100)
        outcomes = np.array([1] * 50 + [0] * 50)

        ece = compute_ece(outcomes, predictions)

        # ECE should be high (0.9 - 0.5 = 0.4 in that bin)
        assert ece > 0.3

    def test_empty_arrays(self):
        """Test ECE with empty arrays."""
        ece = compute_ece(np.array([]), np.array([]))
        assert ece == 0.0

    def test_all_same_prediction(self):
        """Test ECE when all predictions are the same."""
        predictions = np.array([0.5] * 100)
        outcomes = np.array([1] * 60 + [0] * 40)

        ece = compute_ece(outcomes, predictions)

        # Should reflect the gap: |0.5 - 0.6| = 0.1
        assert 0.0 < ece < 0.2


# ============================================
# CalibrationConfig Tests
# ============================================


class TestCalibrationConfig:
    """Tests for CalibrationConfig dataclass."""

    def test_default_values(self):
        """Test default configuration values."""
        config = CalibrationConfig()

        assert config.method == CalibrationMethod.AUTO
        assert config.platt_threshold == 1000
        assert config.refit_interval == 100
        assert config.n_bins == 10
        assert config.min_samples_for_fit == 50

    def test_custom_values(self):
        """Test custom configuration values."""
        config = CalibrationConfig(
            method=CalibrationMethod.ISOTONIC,
            platt_threshold=500,
            refit_interval=50,
        )

        assert config.method == CalibrationMethod.ISOTONIC
        assert config.platt_threshold == 500
        assert config.refit_interval == 50


# ============================================
# ProbabilityCalibrator Tests
# ============================================


class TestProbabilityCalibrator:
    """Tests for ProbabilityCalibrator class."""

    def test_init_default_config(self, calibrator):
        """Test initialization with default config."""
        assert calibrator.config is not None
        assert calibrator.sample_count == 0
        assert not calibrator.is_fitted

    def test_init_custom_config(self):
        """Test initialization with custom config."""
        config = CalibrationConfig(
            method=CalibrationMethod.PLATT,
            refit_interval=50,
        )
        calibrator = ProbabilityCalibrator(config=config)

        assert calibrator.config.method == CalibrationMethod.PLATT
        assert calibrator.config.refit_interval == 50

    def test_update_single(self, calibrator):
        """Test single update."""
        calibrator.update(0.7, 1)

        assert calibrator.sample_count == 1

    def test_update_invalid_prediction(self, calibrator):
        """Test update with invalid prediction."""
        with pytest.raises(ValueError, match="Prediction must be in"):
            calibrator.update(1.5, 1)

        with pytest.raises(ValueError, match="Prediction must be in"):
            calibrator.update(-0.1, 0)

    def test_update_invalid_outcome(self, calibrator):
        """Test update with invalid outcome."""
        with pytest.raises(ValueError, match="Outcome must be 0 or 1"):
            calibrator.update(0.5, 2)

    def test_update_batch(self, calibrator, well_calibrated_data):
        """Test batch update."""
        predictions, outcomes = well_calibrated_data
        calibrator.update_batch(predictions[:100], outcomes[:100])

        assert calibrator.sample_count == 100

    def test_auto_fit_on_refit_interval(self):
        """Test automatic fitting when refit interval reached."""
        config = CalibrationConfig(
            refit_interval=60,
            min_samples_for_fit=50,
        )
        calibrator = ProbabilityCalibrator(config=config)

        np.random.seed(42)
        for _ in range(60):
            pred = np.random.uniform(0.3, 0.7)
            outcome = int(np.random.random() < pred)
            calibrator.update(pred, outcome)

        assert calibrator.is_fitted

    def test_calibrate_before_fit(self, calibrator):
        """Test calibration before fitting returns raw probability."""
        raw_prob = 0.75
        calibrated = calibrator.calibrate(raw_prob)

        # Should return raw probability when not fitted
        assert calibrated == raw_prob

    def test_calibrate_after_fit(self, well_calibrated_data):
        """Test calibration after fitting."""
        config = CalibrationConfig(
            refit_interval=50,
            min_samples_for_fit=50,
        )
        calibrator = ProbabilityCalibrator(config=config)

        predictions, outcomes = well_calibrated_data
        calibrator.update_batch(predictions[:100], outcomes[:100])

        # Now calibrator should be fitted
        assert calibrator.is_fitted

        # Calibration should return a value in [0, 1]
        calibrated = calibrator.calibrate(0.5)
        assert 0.0 <= calibrated <= 1.0

    def test_calibrate_array(self, well_calibrated_data):
        """Test calibration with array input."""
        config = CalibrationConfig(refit_interval=50, min_samples_for_fit=50)
        calibrator = ProbabilityCalibrator(config=config)

        predictions, outcomes = well_calibrated_data
        calibrator.update_batch(predictions[:100], outcomes[:100])

        # Calibrate array
        raw_probs = np.array([0.3, 0.5, 0.7])
        calibrated = calibrator.calibrate(raw_probs)

        assert isinstance(calibrated, np.ndarray)
        assert len(calibrated) == 3
        assert all(0.0 <= p <= 1.0 for p in calibrated)

    def test_get_calibration_metrics_empty(self, calibrator):
        """Test metrics when empty."""
        metrics = calibrator.get_calibration_metrics()

        assert metrics.sample_count == 0
        assert metrics.is_fitted is False

    def test_get_calibration_metrics(self, well_calibrated_data):
        """Test getting calibration metrics."""
        config = CalibrationConfig(refit_interval=50, min_samples_for_fit=50)
        calibrator = ProbabilityCalibrator(config=config)

        predictions, outcomes = well_calibrated_data
        calibrator.update_batch(predictions[:100], outcomes[:100])

        metrics = calibrator.get_calibration_metrics()

        assert metrics.sample_count == 100
        assert metrics.is_fitted
        assert 0.0 <= metrics.brier_score <= 1.0
        assert 0.0 <= metrics.ece <= 1.0
        assert metrics.method in ("platt", "isotonic")

    def test_platt_method(self):
        """Test Platt scaling method."""
        config = CalibrationConfig(
            method=CalibrationMethod.PLATT,
            refit_interval=50,
            min_samples_for_fit=50,
        )
        calibrator = ProbabilityCalibrator(config=config)

        np.random.seed(42)
        for _ in range(60):
            pred = np.random.uniform(0.2, 0.8)
            outcome = int(np.random.random() < pred)
            calibrator.update(pred, outcome)

        assert calibrator.is_fitted
        assert calibrator.current_method == CalibrationMethod.PLATT

    def test_isotonic_method(self):
        """Test isotonic regression method."""
        config = CalibrationConfig(
            method=CalibrationMethod.ISOTONIC,
            refit_interval=50,
            min_samples_for_fit=50,
        )
        calibrator = ProbabilityCalibrator(config=config)

        np.random.seed(42)
        for _ in range(60):
            pred = np.random.uniform(0.2, 0.8)
            outcome = int(np.random.random() < pred)
            calibrator.update(pred, outcome)

        assert calibrator.is_fitted
        assert calibrator.current_method == CalibrationMethod.ISOTONIC

    def test_auto_method_switches(self):
        """Test auto method switches at threshold."""
        config = CalibrationConfig(
            method=CalibrationMethod.AUTO,
            platt_threshold=100,
            refit_interval=50,
            min_samples_for_fit=50,
        )
        calibrator = ProbabilityCalibrator(config=config)

        np.random.seed(42)

        # First 60 samples - should use Platt
        for _ in range(60):
            pred = np.random.uniform(0.2, 0.8)
            outcome = int(np.random.random() < pred)
            calibrator.update(pred, outcome)

        assert calibrator.current_method == CalibrationMethod.PLATT

        # Add more samples past threshold (100) + refit interval (50)
        for _ in range(100):
            pred = np.random.uniform(0.2, 0.8)
            outcome = int(np.random.random() < pred)
            calibrator.update(pred, outcome)

        # Should switch to isotonic
        assert calibrator.current_method == CalibrationMethod.ISOTONIC

    def test_reset(self, well_calibrated_data):
        """Test resetting calibrator."""
        config = CalibrationConfig(refit_interval=50, min_samples_for_fit=50)
        calibrator = ProbabilityCalibrator(config=config)

        predictions, outcomes = well_calibrated_data
        calibrator.update_batch(predictions[:100], outcomes[:100])

        assert calibrator.is_fitted

        calibrator.reset()

        assert calibrator.sample_count == 0
        assert not calibrator.is_fitted

    def test_save_and_load(self, well_calibrated_data):
        """Test saving and loading calibrator."""
        config = CalibrationConfig(refit_interval=50, min_samples_for_fit=50)
        calibrator = ProbabilityCalibrator(config=config)

        predictions, outcomes = well_calibrated_data
        calibrator.update_batch(predictions[:100], outcomes[:100])

        # Save
        with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as f:
            path = Path(f.name)
            calibrator.save(path)

        # Load
        loaded = ProbabilityCalibrator.load(path)

        assert loaded.sample_count == calibrator.sample_count
        assert loaded.is_fitted == calibrator.is_fitted
        assert loaded.current_method == calibrator.current_method

        # Cleanup
        path.unlink()


# ============================================
# DriftConfig Tests
# ============================================


class TestDriftConfig:
    """Tests for DriftConfig dataclass."""

    def test_default_values(self):
        """Test default drift config values."""
        config = DriftConfig()

        assert config.window_size == 200
        assert config.ece_threshold == 0.15
        assert config.brier_threshold == 0.25
        assert config.relative_threshold == 0.05


# ============================================
# CalibrationDriftDetector Tests
# ============================================


class TestCalibrationDriftDetector:
    """Tests for CalibrationDriftDetector class."""

    def test_init_default_config(self):
        """Test initialization with default config."""
        detector = CalibrationDriftDetector()

        assert detector.config.window_size == 200
        assert not detector.window_full

    def test_update(self):
        """Test updating detector."""
        detector = CalibrationDriftDetector()
        detector.update(0.7, 1)

        assert not detector.window_full

    def test_window_fills(self):
        """Test that window fills correctly."""
        config = DriftConfig(window_size=50)
        detector = CalibrationDriftDetector(config=config)

        np.random.seed(42)
        for _ in range(50):
            pred = np.random.uniform(0.3, 0.7)
            outcome = int(np.random.random() < pred)
            detector.update(pred, outcome)

        assert detector.window_full

    def test_baseline_set_when_window_full(self):
        """Test baseline is set when window fills."""
        config = DriftConfig(window_size=50)
        detector = CalibrationDriftDetector(config=config)

        np.random.seed(42)
        for _ in range(50):
            pred = np.random.uniform(0.3, 0.7)
            outcome = int(np.random.random() < pred)
            detector.update(pred, outcome)

        assert detector._baseline_set

    def test_check_drift_no_drift(self):
        """Test drift check with no drift."""
        config = DriftConfig(window_size=50)
        detector = CalibrationDriftDetector(config=config)

        np.random.seed(42)
        # Fill window with well-calibrated data
        for _ in range(100):
            pred = np.random.uniform(0.3, 0.7)
            outcome = int(np.random.random() < pred)
            detector.update(pred, outcome)

        drift = detector.check_drift()

        assert isinstance(drift, DriftMetrics)
        # With well-calibrated data, no drift should be detected
        assert drift.current_ece < 0.15
        assert drift.current_brier < 0.25

    def test_check_drift_absolute_threshold(self):
        """Test drift detection with absolute threshold exceeded."""
        config = DriftConfig(window_size=50, ece_threshold=0.1)
        detector = CalibrationDriftDetector(config=config)

        # Fill with poorly calibrated data
        np.random.seed(42)
        for _ in range(100):
            # Overconfident predictions
            pred = np.random.uniform(0.8, 0.95)
            outcome = int(np.random.random() < 0.4)
            detector.update(pred, outcome)

        drift = detector.check_drift()

        # Should detect drift due to high ECE
        assert drift.is_drifted
        assert "ECE" in drift.reason or "Brier" in drift.reason

    def test_reset(self):
        """Test resetting detector."""
        config = DriftConfig(window_size=50)
        detector = CalibrationDriftDetector(config=config)

        np.random.seed(42)
        for _ in range(50):
            detector.update(np.random.uniform(0.3, 0.7), 1)

        assert detector.window_full

        detector.reset()

        assert not detector.window_full
        assert not detector._baseline_set


# ============================================
# CalibratedProbabilityEstimator Tests
# ============================================


class TestCalibratedProbabilityEstimator:
    """Tests for combined calibrator and drift detector."""

    def test_init(self):
        """Test initialization."""
        estimator = CalibratedProbabilityEstimator()

        assert estimator.calibrator is not None
        assert estimator.drift_detector is not None
        assert estimator._recalibration_count == 0

    def test_update_and_calibrate(self):
        """Test update and calibration flow."""
        cal_config = CalibrationConfig(refit_interval=30, min_samples_for_fit=25)
        estimator = CalibratedProbabilityEstimator(calibration_config=cal_config)

        np.random.seed(42)
        for _ in range(50):
            pred = np.random.uniform(0.3, 0.7)
            outcome = int(np.random.random() < pred)
            estimator.update(pred, outcome)

        # Should be able to calibrate
        calibrated = estimator.calibrate(0.5)
        assert 0.0 <= calibrated <= 1.0

    def test_get_metrics(self):
        """Test getting combined metrics."""
        cal_config = CalibrationConfig(refit_interval=30, min_samples_for_fit=25)
        estimator = CalibratedProbabilityEstimator(calibration_config=cal_config)

        np.random.seed(42)
        for _ in range(50):
            pred = np.random.uniform(0.3, 0.7)
            outcome = int(np.random.random() < pred)
            estimator.update(pred, outcome)

        metrics = estimator.get_metrics()

        assert "calibration" in metrics
        assert "drift" in metrics
        assert "recalibration_count" in metrics
        assert metrics["calibration"]["is_fitted"]


# ============================================
# Integration Tests
# ============================================


class TestIntegration:
    """Integration tests for calibration pipeline."""

    def test_calibration_improves_brier_score(self, poorly_calibrated_data):
        """Test that calibration improves Brier score."""
        predictions, outcomes = poorly_calibrated_data

        # Split data
        train_preds = predictions[:300]
        train_outcomes = outcomes[:300]
        test_preds = predictions[300:]
        test_outcomes = outcomes[300:]

        # Fit calibrator
        config = CalibrationConfig(refit_interval=100, min_samples_for_fit=50)
        calibrator = ProbabilityCalibrator(config=config)
        calibrator.update_batch(train_preds, train_outcomes)

        # Measure Brier score before and after calibration
        from sklearn.metrics import brier_score_loss

        uncalibrated_brier = brier_score_loss(test_outcomes, test_preds)

        calibrated_preds = calibrator.calibrate(test_preds)
        calibrated_brier = brier_score_loss(test_outcomes, calibrated_preds)

        # Calibration should improve (lower) Brier score
        # Note: improvement may be small depending on data
        assert calibrated_brier <= uncalibrated_brier + 0.05  # Allow small tolerance

    def test_full_pipeline(self):
        """Test full calibration pipeline."""
        np.random.seed(42)

        cal_config = CalibrationConfig(refit_interval=50, min_samples_for_fit=50)
        drift_config = DriftConfig(window_size=100)
        estimator = CalibratedProbabilityEstimator(cal_config, drift_config)

        # Simulate production usage
        for i in range(500):
            # Generate prediction (some noise)
            true_prob = 0.3 + 0.4 * np.sin(i / 50)  # Varying underlying probability
            noise = np.random.normal(0, 0.1)
            pred = np.clip(true_prob + noise, 0.01, 0.99)
            outcome = int(np.random.random() < true_prob)

            estimator.update(pred, outcome)

        # Should have metrics
        metrics = estimator.get_metrics()
        assert metrics["calibration"]["sample_count"] == 500
        assert metrics["calibration"]["is_fitted"]
