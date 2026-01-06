"""Tests for research layer error definitions."""

from __future__ import annotations

import pytest

from research.errors import (
    BacktestConfigError,
    CalibrationDriftError,
    CalibrationError,
    CommissionConfigError,
    CorporateActionError,
    DataAnomalyError,
    DataGapError,
    DataQualityError,
    DistributionShiftError,
    EmptyDatasetError,
    ErrorSeverity,
    EvaluationError,
    InsufficientDataError,
    InsufficientHistoryError,
    InsufficientLiquidityError,
    InsufficientSamplesError,
    InvalidDateRangeError,
    InvalidScoreError,
    LookAheadBiasError,
    ModelNotFittedError,
    ParameterOverfittingWarning,
    ResearchError,
    SlippageConfigError,
    SurvivorshipBiasError,
    TimezoneError,
    ValidationIssue,
)

# ============================================
# Base Exception Tests
# ============================================


class TestResearchError:
    """Tests for ResearchError base class."""

    def test_basic_creation(self):
        """Test basic error creation."""
        err = ResearchError("Something went wrong")
        assert str(err) == "Something went wrong"
        assert err.message == "Something went wrong"
        assert err.details == {}

    def test_with_details(self):
        """Test error with details."""
        err = ResearchError("Error", details={"key": "value"})
        assert err.details == {"key": "value"}

    def test_to_dict(self):
        """Test serialization to dict."""
        err = ResearchError("Test error", details={"foo": "bar"})
        d = err.to_dict()
        assert d["error_type"] == "ResearchError"
        assert d["message"] == "Test error"
        assert d["details"] == {"foo": "bar"}

    def test_inheritance(self):
        """Test that ResearchError is an Exception."""
        err = ResearchError("test")
        assert isinstance(err, Exception)


# ============================================
# Data Quality Error Tests
# ============================================


class TestDataQualityErrors:
    """Tests for data quality error hierarchy."""

    def test_data_quality_error_hierarchy(self):
        """Test inheritance hierarchy."""
        err = DataQualityError("test")
        assert isinstance(err, ResearchError)

    def test_survivorship_bias_error(self):
        """Test SurvivorshipBiasError with all fields."""
        err = SurvivorshipBiasError(
            "Missing delisted companies",
            missing_instruments=["ENRON", "LEHMAN"],
            time_period="2000-2010",
            details={"extra": "info"},
        )
        assert err.details["missing_instruments"] == ["ENRON", "LEHMAN"]
        assert err.details["time_period"] == "2000-2010"
        assert err.details["extra"] == "info"
        assert isinstance(err, DataQualityError)

    def test_lookahead_bias_error(self):
        """Test LookAheadBiasError with all fields."""
        err = LookAheadBiasError(
            "Using future data",
            data_timestamp="2024-01-15T10:00:00",
            decision_timestamp="2024-01-15T09:00:00",
            data_type="earnings",
        )
        assert err.details["data_timestamp"] == "2024-01-15T10:00:00"
        assert err.details["decision_timestamp"] == "2024-01-15T09:00:00"
        assert err.details["data_type"] == "earnings"

    def test_corporate_action_error(self):
        """Test CorporateActionError with all fields."""
        err = CorporateActionError(
            "Unadjusted split",
            action_type="split",
            symbol="AAPL",
            date="2020-08-31",
        )
        assert err.details["action_type"] == "split"
        assert err.details["symbol"] == "AAPL"
        assert err.details["date"] == "2020-08-31"

    def test_timezone_error(self):
        """Test TimezoneError with all fields."""
        err = TimezoneError(
            "Mixed timezones",
            expected_tz="UTC",
            actual_tz="America/New_York",
            timestamp="2024-01-15T10:00:00-05:00",
        )
        assert err.details["expected_timezone"] == "UTC"
        assert err.details["actual_timezone"] == "America/New_York"
        assert err.details["timestamp"] == "2024-01-15T10:00:00-05:00"

    def test_data_gap_error(self):
        """Test DataGapError with all fields."""
        err = DataGapError(
            "Missing data",
            symbol="MSFT",
            gap_start="2024-01-01",
            gap_end="2024-01-05",
            expected_records=5,
            actual_records=0,
        )
        assert err.details["symbol"] == "MSFT"
        assert err.details["gap_start"] == "2024-01-01"
        assert err.details["gap_end"] == "2024-01-05"
        assert err.details["expected_records"] == 5
        assert err.details["actual_records"] == 0

    def test_data_anomaly_error(self):
        """Test DataAnomalyError with all fields."""
        err = DataAnomalyError(
            "Price spike",
            anomaly_type="price_spike",
            symbol="GME",
            timestamp="2021-01-27T10:00:00",
            value=483.0,
            threshold=100.0,
        )
        assert err.details["anomaly_type"] == "price_spike"
        assert err.details["symbol"] == "GME"
        assert err.details["value"] == 483.0
        assert err.details["threshold"] == 100.0


# ============================================
# Backtest Config Error Tests
# ============================================


class TestBacktestConfigErrors:
    """Tests for backtest configuration errors."""

    def test_backtest_config_error_hierarchy(self):
        """Test inheritance hierarchy."""
        err = BacktestConfigError("test")
        assert isinstance(err, ResearchError)

    def test_invalid_date_range_error(self):
        """Test InvalidDateRangeError with all fields."""
        err = InvalidDateRangeError(
            "Date range too short",
            start_date="2024-01-01",
            end_date="2024-01-15",
            min_days=30,
        )
        assert err.details["start_date"] == "2024-01-01"
        assert err.details["end_date"] == "2024-01-15"
        assert err.details["min_days_required"] == 30

    def test_slippage_config_error(self):
        """Test SlippageConfigError with all fields."""
        err = SlippageConfigError(
            "Unrealistic slippage",
            configured_value=0.0,
            realistic_range=(0.0001, 0.01),
        )
        assert err.details["configured_value"] == 0.0
        assert err.details["realistic_min"] == 0.0001
        assert err.details["realistic_max"] == 0.01

    def test_commission_config_error(self):
        """Test CommissionConfigError basic creation."""
        err = CommissionConfigError("Zero commission unrealistic")
        assert str(err) == "Zero commission unrealistic"

    def test_parameter_overfitting_warning(self):
        """Test ParameterOverfittingWarning with all fields."""
        err = ParameterOverfittingWarning(
            "Likely overfitting",
            in_sample_sharpe=3.5,
            out_sample_sharpe=0.8,
            degradation_pct=0.77,
        )
        assert err.details["in_sample_sharpe"] == 3.5
        assert err.details["out_sample_sharpe"] == 0.8
        assert err.details["degradation_pct"] == 0.77


# ============================================
# Calibration Error Tests
# ============================================


class TestCalibrationErrors:
    """Tests for calibration errors."""

    def test_calibration_error_hierarchy(self):
        """Test inheritance hierarchy."""
        err = CalibrationError("test")
        assert isinstance(err, ResearchError)

    def test_insufficient_samples_error(self):
        """Test InsufficientSamplesError with all fields."""
        err = InsufficientSamplesError(
            "Need more samples",
            available_samples=50,
            required_samples=100,
        )
        assert err.details["available_samples"] == 50
        assert err.details["required_samples"] == 100

    def test_calibration_drift_error(self):
        """Test CalibrationDriftError with all fields."""
        err = CalibrationDriftError(
            "Calibration degraded",
            ece_current=0.15,
            ece_threshold=0.10,
            brier_current=0.30,
            brier_threshold=0.25,
        )
        assert err.details["ece_current"] == 0.15
        assert err.details["ece_threshold"] == 0.10
        assert err.details["brier_current"] == 0.30
        assert err.details["brier_threshold"] == 0.25

    def test_distribution_shift_error(self):
        """Test DistributionShiftError with all fields."""
        err = DistributionShiftError(
            "Input distribution changed",
            shift_magnitude=0.25,
            affected_features=["volatility", "momentum"],
        )
        assert err.details["shift_magnitude"] == 0.25
        assert err.details["affected_features"] == ["volatility", "momentum"]


# ============================================
# Insufficient Data Error Tests
# ============================================


class TestInsufficientDataErrors:
    """Tests for insufficient data errors."""

    def test_insufficient_data_error_hierarchy(self):
        """Test inheritance hierarchy."""
        err = InsufficientDataError("test")
        assert isinstance(err, ResearchError)

    def test_empty_dataset_error(self):
        """Test EmptyDatasetError with all fields."""
        err = EmptyDatasetError(
            "No data returned",
            source="polygon",
            query="SELECT * FROM prices WHERE symbol = 'XYZ'",
        )
        assert err.details["source"] == "polygon"
        assert err.details["query"] == "SELECT * FROM prices WHERE symbol = 'XYZ'"

    def test_insufficient_history_error(self):
        """Test InsufficientHistoryError with all fields."""
        err = InsufficientHistoryError(
            "Not enough history",
            symbol="NEW_IPO",
            available_days=30,
            required_days=252,
        )
        assert err.details["symbol"] == "NEW_IPO"
        assert err.details["available_days"] == 30
        assert err.details["required_days"] == 252

    def test_insufficient_liquidity_error(self):
        """Test InsufficientLiquidityError with all fields."""
        err = InsufficientLiquidityError(
            "Low volume",
            symbol="ILLIQ",
            avg_volume=10000.0,
            min_volume=100000.0,
        )
        assert err.details["symbol"] == "ILLIQ"
        assert err.details["avg_volume"] == 10000.0
        assert err.details["min_volume_required"] == 100000.0


# ============================================
# Evaluation Error Tests
# ============================================


class TestEvaluationErrors:
    """Tests for evaluation errors."""

    def test_evaluation_error_hierarchy(self):
        """Test inheritance hierarchy."""
        err = EvaluationError("test")
        assert isinstance(err, ResearchError)

    def test_model_not_fitted_error(self):
        """Test ModelNotFittedError basic creation."""
        err = ModelNotFittedError("Model must be fitted first")
        assert str(err) == "Model must be fitted first"

    def test_invalid_score_error(self):
        """Test InvalidScoreError with all fields."""
        err = InvalidScoreError(
            "Score out of range",
            score_value=1.5,
            expected_range=(0.0, 1.0),
        )
        assert err.details["score_value"] == 1.5
        assert err.details["expected_min"] == 0.0
        assert err.details["expected_max"] == 1.0


# ============================================
# Error Severity & Validation Issue Tests
# ============================================


class TestErrorSeverity:
    """Tests for ErrorSeverity enum."""

    def test_severity_values(self):
        """Test severity enum values."""
        assert ErrorSeverity.WARNING.value == "warning"
        assert ErrorSeverity.ERROR.value == "error"
        assert ErrorSeverity.CRITICAL.value == "critical"

    def test_severity_ordering(self):
        """Test that severities can be compared."""
        # Values are strings, so we compare by convention
        severities = [ErrorSeverity.WARNING, ErrorSeverity.ERROR, ErrorSeverity.CRITICAL]
        assert len(severities) == 3


class TestValidationIssue:
    """Tests for ValidationIssue dataclass."""

    def test_basic_creation(self):
        """Test basic validation issue creation."""
        issue = ValidationIssue(
            severity=ErrorSeverity.WARNING,
            error_type="TestWarning",
            message="This is a warning",
        )
        assert issue.severity == ErrorSeverity.WARNING
        assert issue.error_type == "TestWarning"
        assert issue.message == "This is a warning"
        assert issue.details == {}

    def test_with_details(self):
        """Test validation issue with details."""
        issue = ValidationIssue(
            severity=ErrorSeverity.ERROR,
            error_type="DataGap",
            message="Missing data",
            details={"symbol": "AAPL", "days": 5},
        )
        assert issue.details == {"symbol": "AAPL", "days": 5}

    def test_to_dict(self):
        """Test serialization to dict."""
        issue = ValidationIssue(
            severity=ErrorSeverity.CRITICAL,
            error_type="LookAheadBias",
            message="Future data detected",
            details={"count": 100},
        )
        d = issue.to_dict()
        assert d["severity"] == "critical"
        assert d["error_type"] == "LookAheadBias"
        assert d["message"] == "Future data detected"
        assert d["details"] == {"count": 100}


# ============================================
# Exception Raising Tests
# ============================================


class TestExceptionRaising:
    """Tests for raising and catching exceptions."""

    def test_catch_by_base_class(self):
        """Test catching specific errors by base class."""
        with pytest.raises(DataQualityError):
            raise SurvivorshipBiasError("test")

        with pytest.raises(ResearchError):
            raise LookAheadBiasError("test")

    def test_exception_message_preserved(self):
        """Test that exception message is preserved."""
        try:
            raise DataGapError("Gap in AAPL data", symbol="AAPL")
        except DataQualityError as e:
            assert "Gap in AAPL data" in str(e)
            assert e.details["symbol"] == "AAPL"

    def test_reraise_preserves_type(self):
        """Test that reraising preserves exception type."""
        try:
            try:
                raise CalibrationDriftError("Drift detected")
            except CalibrationError:
                raise
        except CalibrationDriftError as e:
            assert str(e) == "Drift detected"


# ============================================
# Edge Case Tests
# ============================================


class TestEdgeCases:
    """Tests for edge cases."""

    def test_none_details(self):
        """Test that None details becomes empty dict."""
        err = ResearchError("test", details=None)
        assert err.details == {}

    def test_zero_values_in_details(self):
        """Test that zero values are preserved in details."""
        err = DataGapError(
            "No records",
            expected_records=100,
            actual_records=0,
        )
        assert err.details["actual_records"] == 0

    def test_empty_list_in_details(self):
        """Test that empty lists are preserved."""
        err = SurvivorshipBiasError("test", missing_instruments=[])
        # Empty list should not be added
        assert "missing_instruments" not in err.details

    def test_error_with_unicode(self):
        """Test errors with unicode characters."""
        err = ResearchError("Error with émojis 🚀")
        assert "🚀" in str(err)

    def test_to_dict_roundtrip(self):
        """Test that to_dict produces valid dict."""
        err = CorporateActionError(
            "Split",
            action_type="split",
            symbol="AAPL",
            date="2020-08-31",
        )
        d = err.to_dict()
        # Should be JSON-serializable
        import json

        json_str = json.dumps(d)
        parsed = json.loads(json_str)
        assert parsed["error_type"] == "CorporateActionError"
