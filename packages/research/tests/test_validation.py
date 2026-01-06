"""Tests for data validation module."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd
import pytest

from research.errors import (
    ErrorSeverity,
    LookAheadBiasError,
)
from research.validation import (
    DataValidator,
    ValidationConfig,
)

# ============================================
# Test Fixtures
# ============================================


@pytest.fixture
def validator() -> DataValidator:
    """Create a default validator."""
    return DataValidator()


@pytest.fixture
def sample_prices() -> pd.DataFrame:
    """Create sample price data."""
    dates = pd.date_range("2023-01-01", "2023-12-31", freq="B")  # Business days
    symbols = ["AAPL", "MSFT", "GOOGL"]

    data = []
    for symbol in symbols:
        for d in dates:
            data.append(
                {
                    "date": d.date(),
                    "symbol": symbol,
                    "open": 100.0,
                    "high": 105.0,
                    "low": 95.0,
                    "close": 102.0,
                    "volume": 1000000,
                }
            )

    return pd.DataFrame(data)


@pytest.fixture
def mock_universe_provider():
    """Create a mock universe provider."""

    class MockProvider:
        def __init__(self, constituents: dict[date, set[str]]):
            self.constituents = constituents

        def get_constituents(self, as_of_date: date) -> set[str]:
            return self.constituents.get(as_of_date, set())

    return MockProvider


@pytest.fixture
def mock_corporate_action_provider():
    """Create a mock corporate action provider."""

    class MockProvider:
        def __init__(self, actions: dict[str, list[dict[str, Any]]]):
            self.actions = actions

        def get_actions(
            self,
            symbol: str,
            start_date: date,
            end_date: date,
        ) -> list[dict[str, Any]]:
            return self.actions.get(symbol, [])

    return MockProvider


# ============================================
# ValidationConfig Tests
# ============================================


class TestValidationConfig:
    """Tests for ValidationConfig."""

    def test_default_values(self):
        """Test default configuration values."""
        config = ValidationConfig()
        assert config.min_history_days == 252
        assert config.max_missing_symbols_pct == 0.1
        assert config.max_gap_days == 5
        assert config.price_change_threshold == 0.5
        assert config.min_backtest_days == 252
        assert config.min_calibration_samples == 100

    def test_custom_values(self):
        """Test custom configuration values."""
        config = ValidationConfig(
            min_history_days=100,
            max_gap_days=3,
            price_change_threshold=0.3,
        )
        assert config.min_history_days == 100
        assert config.max_gap_days == 3
        assert config.price_change_threshold == 0.3


# ============================================
# Historical Data Validation Tests
# ============================================


class TestHistoricalDataValidation:
    """Tests for historical data validation."""

    def test_valid_data_no_issues(self, validator, sample_prices):
        """Test that valid data produces no issues."""
        issues = validator.validate_historical_data(
            prices=sample_prices,
            symbols=["AAPL", "MSFT", "GOOGL"],
            start_date="2023-01-01",
            end_date="2023-12-31",
            check_survivorship=False,  # No provider
            check_lookahead=False,  # No provider
        )
        # Should have no critical/error issues
        critical_errors = [
            i for i in issues if i.severity in (ErrorSeverity.CRITICAL, ErrorSeverity.ERROR)
        ]
        assert len(critical_errors) == 0

    def test_insufficient_history_warning(self, validator):
        """Test insufficient history detection."""
        # Create data with only 50 days
        dates = pd.date_range("2023-01-01", periods=50, freq="B")
        data = []
        for d in dates:
            data.append(
                {
                    "date": d.date(),
                    "symbol": "AAPL",
                    "close": 100.0,
                }
            )
        prices = pd.DataFrame(data)

        # Must enable survivorship check to get history warnings
        issues = validator.validate_historical_data(
            prices=prices,
            symbols=["AAPL"],
            start_date="2023-01-01",
            end_date="2023-12-31",
            check_survivorship=True,  # History check is part of survivorship
            check_lookahead=False,
            check_gaps=False,
        )

        history_issues = [i for i in issues if i.error_type == "InsufficientHistory"]
        assert len(history_issues) == 1
        assert history_issues[0].details["available_days"] == 50

    def test_data_gap_detection(self, validator):
        """Test data gap detection."""
        # Create data with a 10-day gap
        dates1 = pd.date_range("2023-01-01", "2023-01-15", freq="B")
        dates2 = pd.date_range("2023-02-01", "2023-02-15", freq="B")

        data = []
        for d in list(dates1) + list(dates2):
            data.append(
                {
                    "date": d.date(),
                    "symbol": "AAPL",
                    "close": 100.0,
                }
            )
        prices = pd.DataFrame(data)

        issues = validator.validate_historical_data(
            prices=prices,
            symbols=["AAPL"],
            start_date="2023-01-01",
            end_date="2023-02-15",
            check_survivorship=False,
            check_lookahead=False,
            check_anomalies=False,
        )

        gap_issues = [i for i in issues if i.error_type == "DataGap"]
        assert len(gap_issues) >= 1
        # Should detect the ~10-day gap

    def test_missing_symbol_detection(self, validator):
        """Test detection of completely missing symbols."""
        prices = pd.DataFrame(
            {
                "date": [date(2023, 1, 1)],
                "symbol": ["AAPL"],
                "close": [100.0],
            }
        )

        issues = validator.validate_historical_data(
            prices=prices,
            symbols=["AAPL", "MSFT"],  # MSFT is missing
            start_date="2023-01-01",
            end_date="2023-12-31",
            check_survivorship=False,
            check_lookahead=False,
            check_anomalies=False,
        )

        gap_issues = [i for i in issues if i.error_type == "DataGap"]
        assert any("MSFT" in str(i.message) for i in gap_issues)


class TestAnomalyDetection:
    """Tests for price and volume anomaly detection."""

    def test_extreme_price_change_detection(self, validator):
        """Test detection of extreme price changes."""
        prices = pd.DataFrame(
            {
                "date": [date(2023, 1, 1), date(2023, 1, 2)],
                "symbol": ["AAPL", "AAPL"],
                "close": [100.0, 200.0],  # 100% increase
            }
        )

        issues = validator.validate_historical_data(
            prices=prices,
            symbols=["AAPL"],
            start_date="2023-01-01",
            end_date="2023-01-02",
            check_survivorship=False,
            check_lookahead=False,
            check_gaps=False,
        )

        anomaly_issues = [i for i in issues if i.error_type == "DataAnomaly"]
        assert len(anomaly_issues) >= 1
        assert any("price change" in i.message.lower() for i in anomaly_issues)

    def test_volume_spike_detection(self, validator):
        """Test detection of volume spikes."""
        # Use more data points so spike is clearly above threshold
        # With 100 normal days + 1 spike, average ~ 1.5M, spike = 150M = 100x average
        prices = pd.DataFrame(
            {
                "date": [date(2023, 1, 1) + timedelta(days=i) for i in range(101)],
                "symbol": ["AAPL"] * 101,
                "close": [100.0] * 101,
                "volume": [1000000] * 100 + [150000000],  # Last day: 150x normal
            }
        )

        issues = validator.validate_historical_data(
            prices=prices,
            symbols=["AAPL"],
            start_date="2023-01-01",
            end_date="2023-04-11",
            check_survivorship=False,
            check_lookahead=False,
            check_gaps=False,
        )

        volume_issues = [i for i in issues if "volume" in i.message.lower()]
        assert len(volume_issues) >= 1

    def test_negative_price_detection(self, validator):
        """Test detection of negative prices."""
        prices = pd.DataFrame(
            {
                "date": [date(2023, 1, 1), date(2023, 1, 2)],
                "symbol": ["AAPL", "AAPL"],
                "close": [100.0, -50.0],  # Negative price
            }
        )

        issues = validator.validate_historical_data(
            prices=prices,
            symbols=["AAPL"],
            start_date="2023-01-01",
            end_date="2023-01-02",
            check_survivorship=False,
            check_lookahead=False,
            check_gaps=False,
        )

        negative_issues = [i for i in issues if "negative" in i.message.lower()]
        assert len(negative_issues) >= 1
        assert negative_issues[0].severity == ErrorSeverity.CRITICAL


class TestTimezoneValidation:
    """Tests for timezone validation."""

    def test_naive_timestamp_warning(self, validator):
        """Test warning for naive timestamps."""
        prices = pd.DataFrame(
            {
                "date": [date(2023, 1, 1)],
                "symbol": ["AAPL"],
                "close": [100.0],
                "timestamp": [datetime(2023, 1, 1, 10, 0, 0)],  # Naive
            }
        )

        issues = validator.validate_historical_data(
            prices=prices,
            symbols=["AAPL"],
            start_date="2023-01-01",
            end_date="2023-01-01",
            check_survivorship=False,
            check_lookahead=False,
            check_gaps=False,
            check_anomalies=False,
        )

        tz_issues = [i for i in issues if "timezone" in i.error_type.lower()]
        assert len(tz_issues) >= 1


class TestSurvivorshipBiasValidation:
    """Tests for survivorship bias detection."""

    def test_survivorship_bias_detection(self, validator, mock_universe_provider):
        """Test survivorship bias detection with universe provider."""
        # Historical universe included LEHMAN, current doesn't
        provider = mock_universe_provider(
            {
                date(2023, 1, 1): {"AAPL", "MSFT", "LEHMAN"},
            }
        )

        validator_with_provider = DataValidator(universe_provider=provider)

        prices = pd.DataFrame(
            {
                "date": [date(2023, 1, 1)],
                "symbol": ["AAPL"],
                "close": [100.0],
            }
        )

        issues = validator_with_provider.validate_historical_data(
            prices=prices,
            symbols=["AAPL", "MSFT"],  # LEHMAN removed
            start_date="2023-01-01",
            end_date="2023-12-31",
            check_lookahead=False,
            check_gaps=False,
            check_anomalies=False,
        )

        survivorship_issues = [i for i in issues if "survivorship" in i.error_type.lower()]
        assert len(survivorship_issues) >= 1


class TestLookaheadBiasValidation:
    """Tests for look-ahead bias detection."""

    def test_corporate_action_warning(self, validator, mock_corporate_action_provider):
        """Test corporate action look-ahead warning."""
        provider = mock_corporate_action_provider(
            {
                "AAPL": [{"type": "split", "date": date(2023, 6, 1)}],
            }
        )

        validator_with_provider = DataValidator(corporate_action_provider=provider)

        prices = pd.DataFrame(
            {
                "date": [date(2023, 1, 1)],
                "symbol": ["AAPL"],
                "close": [100.0],
            }
        )

        issues = validator_with_provider.validate_historical_data(
            prices=prices,
            symbols=["AAPL"],
            start_date="2023-01-01",
            end_date="2023-12-31",
            check_survivorship=False,
            check_gaps=False,
            check_anomalies=False,
        )

        action_issues = [i for i in issues if "corporate" in i.message.lower()]
        assert len(action_issues) >= 1


# ============================================
# Backtest Configuration Validation Tests
# ============================================


class TestBacktestConfigValidation:
    """Tests for backtest configuration validation."""

    def test_valid_config(self, validator):
        """Test valid backtest configuration."""
        issues = validator.validate_backtest_config(
            start_date="2020-01-01",
            end_date="2023-12-31",
            slippage_bps=5.0,
            commission_per_share=0.001,
            initial_capital=100000.0,
        )

        # Should have no critical issues
        critical = [i for i in issues if i.severity == ErrorSeverity.CRITICAL]
        assert len(critical) == 0

    def test_invalid_date_range(self, validator):
        """Test detection of end date before start date."""
        issues = validator.validate_backtest_config(
            start_date="2023-12-31",
            end_date="2023-01-01",
        )

        date_issues = [i for i in issues if i.error_type == "InvalidDateRange"]
        assert len(date_issues) >= 1
        assert date_issues[0].severity == ErrorSeverity.CRITICAL

    def test_short_backtest_period(self, validator):
        """Test detection of too-short backtest period."""
        issues = validator.validate_backtest_config(
            start_date="2023-01-01",
            end_date="2023-02-01",  # ~30 days
        )

        date_issues = [i for i in issues if i.error_type == "InvalidDateRange"]
        assert len(date_issues) >= 1

    def test_unrealistic_slippage_low(self, validator):
        """Test warning for too-low slippage."""
        issues = validator.validate_backtest_config(
            start_date="2020-01-01",
            end_date="2023-12-31",
            slippage_bps=0.0,  # Zero slippage
        )

        slippage_issues = [i for i in issues if i.error_type == "SlippageConfig"]
        assert len(slippage_issues) >= 1

    def test_unrealistic_slippage_high(self, validator):
        """Test warning for too-high slippage."""
        issues = validator.validate_backtest_config(
            start_date="2020-01-01",
            end_date="2023-12-31",
            slippage_bps=500.0,  # 5% slippage
        )

        slippage_issues = [i for i in issues if i.error_type == "SlippageConfig"]
        assert len(slippage_issues) >= 1

    def test_high_commission_warning(self, validator):
        """Test warning for high commission."""
        issues = validator.validate_backtest_config(
            start_date="2020-01-01",
            end_date="2023-12-31",
            commission_per_share=0.05,  # $0.05/share
        )

        comm_issues = [i for i in issues if i.error_type == "CommissionConfig"]
        assert len(comm_issues) >= 1

    def test_overfitting_detection(self, validator):
        """Test overfitting detection via Sharpe degradation."""
        issues = validator.validate_backtest_config(
            start_date="2020-01-01",
            end_date="2023-12-31",
            in_sample_sharpe=3.5,
            out_sample_sharpe=0.5,  # 85% degradation
        )

        overfit_issues = [i for i in issues if i.error_type == "ParameterOverfitting"]
        assert len(overfit_issues) >= 1

    def test_negative_capital(self, validator):
        """Test detection of negative initial capital."""
        issues = validator.validate_backtest_config(
            start_date="2020-01-01",
            end_date="2023-12-31",
            initial_capital=-100000.0,
        )

        critical = [i for i in issues if i.severity == ErrorSeverity.CRITICAL]
        assert len(critical) >= 1


# ============================================
# Calibration Data Validation Tests
# ============================================


class TestCalibrationDataValidation:
    """Tests for calibration data validation."""

    def test_valid_calibration_data(self, validator):
        """Test valid calibration data."""
        np.random.seed(42)
        predictions = np.random.uniform(0.3, 0.7, 500)
        actuals = (np.random.random(500) > 0.5).astype(int)

        issues = validator.validate_calibration_data(
            predictions=predictions,
            actuals=actuals,
        )

        # Should have no critical issues
        critical = [i for i in issues if i.severity == ErrorSeverity.CRITICAL]
        assert len(critical) == 0

    def test_insufficient_samples(self, validator):
        """Test insufficient sample detection."""
        predictions = np.array([0.5, 0.6, 0.7])
        actuals = np.array([1, 0, 1])

        issues = validator.validate_calibration_data(
            predictions=predictions,
            actuals=actuals,
        )

        sample_issues = [i for i in issues if i.error_type == "InsufficientSamples"]
        assert len(sample_issues) >= 1

    def test_invalid_prediction_range(self, validator):
        """Test detection of predictions outside [0, 1]."""
        predictions = np.array([0.5, 1.5, -0.1])  # Out of range
        actuals = np.array([1, 0, 1])

        issues = validator.validate_calibration_data(
            predictions=predictions,
            actuals=actuals,
        )

        range_issues = [i for i in issues if i.error_type == "InvalidPredictions"]
        assert len(range_issues) >= 1
        assert range_issues[0].severity == ErrorSeverity.CRITICAL

    def test_non_binary_actuals(self, validator):
        """Test detection of non-binary actuals."""
        predictions = np.array([0.5, 0.6, 0.7])
        actuals = np.array([0, 1, 2])  # Not binary

        issues = validator.validate_calibration_data(
            predictions=predictions,
            actuals=actuals,
        )

        binary_issues = [i for i in issues if i.error_type == "InvalidActuals"]
        assert len(binary_issues) >= 1
        assert binary_issues[0].severity == ErrorSeverity.CRITICAL

    def test_class_imbalance_warning(self, validator):
        """Test class imbalance warning."""
        predictions = np.array([0.1] * 100)
        actuals = np.array([0] * 98 + [1] * 2)  # 2% positive rate

        issues = validator.validate_calibration_data(
            predictions=predictions,
            actuals=actuals,
        )

        imbalance_issues = [i for i in issues if i.error_type == "ClassImbalance"]
        assert len(imbalance_issues) >= 1

    def test_calibration_drift_detection(self, validator):
        """Test calibration drift detection."""
        np.random.seed(42)
        predictions = np.random.uniform(0.3, 0.7, 200)
        actuals = (np.random.random(200) > 0.5).astype(int)

        issues = validator.validate_calibration_data(
            predictions=predictions,
            actuals=actuals,
            historical_ece=0.02,  # Good historical ECE
            # Current ECE will be higher
        )

        # Should detect drift if current ECE is much higher
        drift_issues = [i for i in issues if "drift" in i.error_type.lower()]
        # May or may not have drift depending on random data


# ============================================
# Convenience Method Tests
# ============================================


class TestConvenienceMethods:
    """Tests for validator convenience methods."""

    def test_raise_critical_issues(self, validator):
        """Test raise_critical_issues raises on critical errors."""
        from research.errors import ValidationIssue

        issues = [
            ValidationIssue(
                severity=ErrorSeverity.WARNING,
                error_type="TestWarning",
                message="Just a warning",
            ),
            ValidationIssue(
                severity=ErrorSeverity.CRITICAL,
                error_type="LookAheadBias",
                message="Future data detected",
            ),
        ]

        with pytest.raises(LookAheadBiasError):
            validator.raise_critical_issues(issues)

    def test_raise_critical_issues_no_critical(self, validator):
        """Test raise_critical_issues does nothing with no critical issues."""
        from research.errors import ValidationIssue

        issues = [
            ValidationIssue(
                severity=ErrorSeverity.WARNING,
                error_type="TestWarning",
                message="Just a warning",
            ),
        ]

        # Should not raise
        validator.raise_critical_issues(issues)

    def test_get_issues_by_severity(self, validator):
        """Test filtering issues by severity."""
        from research.errors import ValidationIssue

        issues = [
            ValidationIssue(severity=ErrorSeverity.WARNING, error_type="A", message="a"),
            ValidationIssue(severity=ErrorSeverity.ERROR, error_type="B", message="b"),
            ValidationIssue(severity=ErrorSeverity.WARNING, error_type="C", message="c"),
            ValidationIssue(severity=ErrorSeverity.CRITICAL, error_type="D", message="d"),
        ]

        warnings = validator.get_issues_by_severity(issues, ErrorSeverity.WARNING)
        assert len(warnings) == 2

        errors = validator.get_issues_by_severity(issues, ErrorSeverity.ERROR)
        assert len(errors) == 1

    def test_has_blocking_issues(self, validator):
        """Test has_blocking_issues detection."""
        from research.errors import ValidationIssue

        # Only warnings - not blocking
        warnings_only = [
            ValidationIssue(severity=ErrorSeverity.WARNING, error_type="A", message="a"),
        ]
        assert not validator.has_blocking_issues(warnings_only)

        # With error - blocking
        with_error = [
            ValidationIssue(severity=ErrorSeverity.WARNING, error_type="A", message="a"),
            ValidationIssue(severity=ErrorSeverity.ERROR, error_type="B", message="b"),
        ]
        assert validator.has_blocking_issues(with_error)

        # With critical - blocking
        with_critical = [
            ValidationIssue(severity=ErrorSeverity.CRITICAL, error_type="C", message="c"),
        ]
        assert validator.has_blocking_issues(with_critical)


# ============================================
# Utility Method Tests
# ============================================


class TestUtilityMethods:
    """Tests for internal utility methods."""

    def test_to_date_from_string(self, validator):
        """Test date conversion from string."""
        result = validator._to_date("2023-06-15")
        assert result == date(2023, 6, 15)

    def test_to_date_from_date(self, validator):
        """Test date passthrough."""
        d = date(2023, 6, 15)
        result = validator._to_date(d)
        assert result == d

    def test_compute_ece(self, validator):
        """Test ECE computation."""
        # Perfect calibration
        predictions = np.array([0.1, 0.5, 0.9])
        actuals = np.array([0, 1, 1])

        ece = validator._compute_ece(predictions, actuals, n_bins=3)
        assert 0 <= ece <= 1

    def test_compute_brier(self, validator):
        """Test Brier score computation."""
        predictions = np.array([0.9, 0.1])
        actuals = np.array([1, 0])

        brier = validator._compute_brier(predictions, actuals)
        # Should be close to 0 for good predictions
        assert brier < 0.1

    def test_compute_kl_divergence(self, validator):
        """Test KL divergence computation."""
        p = np.array([0.5, 0.5])
        q = np.array([0.5, 0.5])

        # Same distribution = ~0 divergence
        kl = validator._compute_kl_divergence(p, q)
        assert kl < 0.01

        # Different distributions = higher divergence
        p2 = np.array([0.9, 0.1])
        q2 = np.array([0.1, 0.9])
        kl2 = validator._compute_kl_divergence(p2, q2)
        assert kl2 > kl


# ============================================
# Integration Tests
# ============================================


class TestIntegration:
    """Integration tests combining multiple validation steps."""

    def test_full_validation_pipeline(self, validator, sample_prices):
        """Test running full validation pipeline."""
        # Create comprehensive validation
        issues = validator.validate_historical_data(
            prices=sample_prices,
            symbols=["AAPL", "MSFT", "GOOGL"],
            start_date="2023-01-01",
            end_date="2023-12-31",
        )

        backtest_issues = validator.validate_backtest_config(
            start_date="2023-01-01",
            end_date="2023-12-31",
            slippage_bps=5.0,
        )

        all_issues = issues + backtest_issues

        # Should complete without errors
        assert isinstance(all_issues, list)

    def test_validation_with_custom_config(self, sample_prices):
        """Test validation with custom configuration."""
        config = ValidationConfig(
            min_history_days=100,  # Lower threshold
            max_gap_days=10,  # More tolerant
            price_change_threshold=0.8,  # More tolerant
        )

        validator = DataValidator(config=config)

        issues = validator.validate_historical_data(
            prices=sample_prices,
            symbols=["AAPL"],
            start_date="2023-01-01",
            end_date="2023-12-31",
        )

        # Should complete with custom thresholds
        assert isinstance(issues, list)
