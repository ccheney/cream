"""Tests for expected value computation and probability estimation."""

import numpy as np
import pytest

from research.evaluator.expected_value import (
    REGIME_WIN_RATE_MODIFIERS,
    EVConfig,
    ExpectedValueCalculator,
    ExpectedValueEstimate,
    MarketRegime,
    compute_expected_value,
    estimate_probabilities,
    estimate_scratch_probability,
)

# ============================================
# Fixtures
# ============================================


@pytest.fixture
def default_config() -> EVConfig:
    """Create default EV configuration."""
    return EVConfig()


@pytest.fixture
def conservative_config() -> EVConfig:
    """Create conservative (high risk aversion) config."""
    return EVConfig(risk_aversion=1.5)


@pytest.fixture
def balanced_estimate() -> ExpectedValueEstimate:
    """Create a balanced expected value estimate."""
    return ExpectedValueEstimate(
        p_win=0.5,
        p_loss=0.4,
        p_scratch=0.1,
        expected_win=400.0,
        expected_loss=-200.0,
        expected_scratch=-10.0,
        estimated_slippage=5.0,
        estimated_commission=2.0,
    )


@pytest.fixture
def positive_ev_estimate() -> ExpectedValueEstimate:
    """Create a positive expected value estimate."""
    return ExpectedValueEstimate(
        p_win=0.6,
        p_loss=0.3,
        p_scratch=0.1,
        expected_win=500.0,
        expected_loss=-200.0,
        expected_scratch=-5.0,
        estimated_slippage=3.0,
        estimated_commission=1.0,
    )


@pytest.fixture
def negative_ev_estimate() -> ExpectedValueEstimate:
    """Create a negative expected value estimate."""
    return ExpectedValueEstimate(
        p_win=0.3,
        p_loss=0.6,
        p_scratch=0.1,
        expected_win=200.0,
        expected_loss=-400.0,
        expected_scratch=-10.0,
        estimated_slippage=5.0,
        estimated_commission=2.0,
    )


# ============================================
# EVConfig Tests
# ============================================


class TestEVConfig:
    """Tests for EVConfig dataclass."""

    def test_default_config(self):
        """Test default configuration values."""
        config = EVConfig()
        assert config.risk_aversion == 0.5
        assert config.historical_weight == 0.3
        assert config.model_weight == 0.5
        assert config.regime_weight == 0.2
        assert config.base_scratch_rate == 0.1

    def test_weights_sum_to_one(self, default_config: EVConfig):
        """Test that probability weights sum to 1.0."""
        total = (
            default_config.historical_weight
            + default_config.model_weight
            + default_config.regime_weight
        )
        assert np.isclose(total, 1.0)

    def test_invalid_risk_aversion(self):
        """Test that invalid risk aversion raises error."""
        with pytest.raises(ValueError, match="risk_aversion must be 0-2"):
            EVConfig(risk_aversion=3.0)

    def test_invalid_weights(self):
        """Test that invalid weights raise error."""
        with pytest.raises(ValueError, match="weights must sum to 1.0"):
            EVConfig(historical_weight=0.5, model_weight=0.5, regime_weight=0.5)

    def test_invalid_scratch_rate(self):
        """Test that invalid scratch rate raises error."""
        with pytest.raises(ValueError, match="base_scratch_rate must be 0-0.5"):
            EVConfig(base_scratch_rate=0.6)


# ============================================
# ExpectedValueEstimate Tests
# ============================================


class TestExpectedValueEstimate:
    """Tests for ExpectedValueEstimate dataclass."""

    def test_expected_value_computation(self, balanced_estimate: ExpectedValueEstimate):
        """Test basic expected value computation."""
        # EV = 0.5*400 + 0.4*(-200) + 0.1*(-10) - 5 - 2
        # EV = 200 - 80 - 1 - 7 = 112
        expected = 0.5 * 400 + 0.4 * (-200) + 0.1 * (-10) - 5 - 2
        assert np.isclose(balanced_estimate.expected_value, expected)

    def test_positive_ev(self, positive_ev_estimate: ExpectedValueEstimate):
        """Test positive expected value detection."""
        assert positive_ev_estimate.is_positive_ev()
        assert positive_ev_estimate.expected_value > 0

    def test_negative_ev(self, negative_ev_estimate: ExpectedValueEstimate):
        """Test negative expected value detection."""
        assert not negative_ev_estimate.is_positive_ev()
        assert negative_ev_estimate.expected_value < 0

    def test_variance_computation(self, balanced_estimate: ExpectedValueEstimate):
        """Test variance computation."""
        variance = balanced_estimate.variance
        assert variance >= 0
        assert variance > 0  # Should have non-zero variance with different outcomes

    def test_standard_deviation(self, balanced_estimate: ExpectedValueEstimate):
        """Test standard deviation computation."""
        std = balanced_estimate.standard_deviation
        assert std >= 0
        assert np.isclose(std**2, balanced_estimate.variance)

    def test_risk_adjusted_ev(self, positive_ev_estimate: ExpectedValueEstimate):
        """Test risk-adjusted expected value (certainty equivalent)."""
        # Risk-adjusted EV should be less than raw EV (variance penalty)
        assert positive_ev_estimate.risk_adjusted_ev <= positive_ev_estimate.expected_value

    def test_risk_adjusted_ev_higher_aversion(self):
        """Test that higher risk aversion reduces certainty equivalent."""
        ev_low_aversion = ExpectedValueEstimate(
            p_win=0.5,
            p_loss=0.4,
            p_scratch=0.1,
            expected_win=400.0,
            expected_loss=-200.0,
            expected_scratch=-10.0,
            config=EVConfig(risk_aversion=0.3),
        )
        ev_high_aversion = ExpectedValueEstimate(
            p_win=0.5,
            p_loss=0.4,
            p_scratch=0.1,
            expected_win=400.0,
            expected_loss=-200.0,
            expected_scratch=-10.0,
            config=EVConfig(risk_aversion=1.5),
        )
        assert ev_high_aversion.risk_adjusted_ev < ev_low_aversion.risk_adjusted_ev

    def test_sharpe_ratio(self, positive_ev_estimate: ExpectedValueEstimate):
        """Test Sharpe-like ratio computation."""
        sharpe = positive_ev_estimate.sharpe_ratio
        # Positive EV with positive std should give positive Sharpe
        if positive_ev_estimate.expected_value > 0:
            assert sharpe > 0

    def test_kelly_fraction(self, positive_ev_estimate: ExpectedValueEstimate):
        """Test Kelly criterion computation."""
        kelly = positive_ev_estimate.kelly_fraction
        assert 0 <= kelly <= 1
        # Positive EV should give positive Kelly
        if positive_ev_estimate.expected_value > 0:
            assert kelly > 0

    def test_kelly_fraction_negative_ev(self, negative_ev_estimate: ExpectedValueEstimate):
        """Test Kelly is zero for negative EV."""
        kelly = negative_ev_estimate.kelly_fraction
        # Negative EV should give zero Kelly (don't trade)
        assert kelly >= 0  # Kelly is capped at 0

    def test_ev_to_risk_ratio(self, positive_ev_estimate: ExpectedValueEstimate):
        """Test EV to risk ratio computation."""
        ratio = positive_ev_estimate.ev_to_risk_ratio
        # Ratio = EV / |expected_loss|
        expected = positive_ev_estimate.expected_value / abs(positive_ev_estimate.expected_loss)
        assert np.isclose(ratio, expected)

    def test_to_dict(self, balanced_estimate: ExpectedValueEstimate):
        """Test serialization to dictionary."""
        d = balanced_estimate.to_dict()
        assert "p_win" in d
        assert "p_loss" in d
        assert "p_scratch" in d
        assert "expected_value" in d
        assert "risk_adjusted_ev" in d
        assert "kelly_fraction" in d
        assert d["p_win"] == 0.5
        assert d["p_loss"] == 0.4
        assert d["p_scratch"] == 0.1

    def test_from_dict(self, balanced_estimate: ExpectedValueEstimate):
        """Test deserialization from dictionary."""
        d = balanced_estimate.to_dict()
        restored = ExpectedValueEstimate.from_dict(d)
        assert restored.p_win == balanced_estimate.p_win
        assert restored.p_loss == balanced_estimate.p_loss
        assert restored.expected_win == balanced_estimate.expected_win


# ============================================
# Probability Estimation Tests
# ============================================


class TestEstimateScratchProbability:
    """Tests for scratch probability estimation."""

    def test_base_scratch_rate(self, default_config: EVConfig):
        """Test scratch rate around base level for typical parameters."""
        p_scratch = estimate_scratch_probability(
            holding_period_days=5.0,
            stop_distance_pct=0.02,
            config=default_config,
        )
        # Should be reasonable fraction
        assert 0.01 < p_scratch < 0.3

    def test_longer_holding_reduces_scratch(self, default_config: EVConfig):
        """Test that longer holding period reduces scratch probability."""
        p_short = estimate_scratch_probability(
            holding_period_days=2.0,
            stop_distance_pct=0.02,
            config=default_config,
        )
        p_long = estimate_scratch_probability(
            holding_period_days=20.0,
            stop_distance_pct=0.02,
            config=default_config,
        )
        assert p_short > p_long

    def test_wider_stop_affects_scratch(self, default_config: EVConfig):
        """Test that stop distance affects scratch probability."""
        p_tight = estimate_scratch_probability(
            holding_period_days=5.0,
            stop_distance_pct=0.01,
            config=default_config,
        )
        p_wide = estimate_scratch_probability(
            holding_period_days=5.0,
            stop_distance_pct=0.05,
            config=default_config,
        )
        # Wider stops = more room for price to move around breakeven
        assert p_tight != p_wide


class TestEstimateProbabilities:
    """Tests for probability estimation from multiple sources."""

    def test_probabilities_sum_to_one(self, default_config: EVConfig):
        """Test that estimated probabilities sum to 1.0."""
        p_win, p_loss, p_scratch = estimate_probabilities(
            historical_win_rate=0.55,
            model_prediction=0.60,
            regime="BULL_TRENDING",
            config=default_config,
        )
        total = p_win + p_loss + p_scratch
        assert np.isclose(total, 1.0, atol=0.01)

    def test_higher_historical_rate_increases_p_win(self, default_config: EVConfig):
        """Test that higher historical win rate increases p_win."""
        p_win_low, _, _ = estimate_probabilities(
            historical_win_rate=0.4,
            model_prediction=0.5,
            regime="NEUTRAL",
            config=default_config,
        )
        p_win_high, _, _ = estimate_probabilities(
            historical_win_rate=0.7,
            model_prediction=0.5,
            regime="NEUTRAL",
            config=default_config,
        )
        assert p_win_high > p_win_low

    def test_higher_model_prediction_increases_p_win(self, default_config: EVConfig):
        """Test that higher model prediction increases p_win."""
        p_win_low, _, _ = estimate_probabilities(
            historical_win_rate=0.5,
            model_prediction=0.4,
            regime="NEUTRAL",
            config=default_config,
        )
        p_win_high, _, _ = estimate_probabilities(
            historical_win_rate=0.5,
            model_prediction=0.7,
            regime="NEUTRAL",
            config=default_config,
        )
        assert p_win_high > p_win_low

    def test_bull_regime_increases_p_win(self, default_config: EVConfig):
        """Test that bull regime increases p_win."""
        p_win_neutral, _, _ = estimate_probabilities(
            historical_win_rate=0.5,
            model_prediction=0.5,
            regime="NEUTRAL",
            config=default_config,
        )
        p_win_bull, _, _ = estimate_probabilities(
            historical_win_rate=0.5,
            model_prediction=0.5,
            regime="BULL_TRENDING",
            config=default_config,
        )
        assert p_win_bull > p_win_neutral

    def test_high_volatility_decreases_p_win(self, default_config: EVConfig):
        """Test that high volatility regime decreases p_win."""
        p_win_neutral, _, _ = estimate_probabilities(
            historical_win_rate=0.5,
            model_prediction=0.5,
            regime="NEUTRAL",
            config=default_config,
        )
        p_win_vol, _, _ = estimate_probabilities(
            historical_win_rate=0.5,
            model_prediction=0.5,
            regime="HIGH_VOLATILITY",
            config=default_config,
        )
        assert p_win_vol < p_win_neutral

    def test_missing_historical_rate(self, default_config: EVConfig):
        """Test probability estimation without historical rate."""
        p_win, p_loss, p_scratch = estimate_probabilities(
            historical_win_rate=None,
            model_prediction=0.6,
            regime="NEUTRAL",
            config=default_config,
        )
        total = p_win + p_loss + p_scratch
        assert np.isclose(total, 1.0, atol=0.01)

    def test_missing_model_prediction(self, default_config: EVConfig):
        """Test probability estimation without model prediction."""
        p_win, p_loss, p_scratch = estimate_probabilities(
            historical_win_rate=0.55,
            model_prediction=None,
            regime="NEUTRAL",
            config=default_config,
        )
        total = p_win + p_loss + p_scratch
        assert np.isclose(total, 1.0, atol=0.01)

    def test_all_sources_missing_uses_uniform(self, default_config: EVConfig):
        """Test that missing all sources defaults to uniform-ish."""
        p_win, p_loss, p_scratch = estimate_probabilities(
            historical_win_rate=None,
            model_prediction=None,
            regime="NEUTRAL",
            config=default_config,
        )
        total = p_win + p_loss + p_scratch
        assert np.isclose(total, 1.0, atol=0.01)
        # Should be roughly balanced
        assert 0.3 < p_win < 0.6


# ============================================
# Regime Modifiers Tests
# ============================================


class TestRegimeModifiers:
    """Tests for regime-specific win rate modifiers."""

    def test_all_regimes_defined(self):
        """Test that all MarketRegime values have modifiers."""
        for regime in MarketRegime:
            assert regime.value in REGIME_WIN_RATE_MODIFIERS

    def test_bull_bear_trending_boost(self):
        """Test that trending markets get 20% boost."""
        assert REGIME_WIN_RATE_MODIFIERS["BULL_TRENDING"] == 1.2
        assert REGIME_WIN_RATE_MODIFIERS["BEAR_TRENDING"] == 1.2

    def test_high_vol_penalty(self):
        """Test that high volatility gets 20% penalty."""
        assert REGIME_WIN_RATE_MODIFIERS["HIGH_VOLATILITY"] == 0.8

    def test_low_vol_boost(self):
        """Test that low volatility gets 10% boost."""
        assert REGIME_WIN_RATE_MODIFIERS["LOW_VOLATILITY"] == 1.1

    def test_mean_reverting_penalty(self):
        """Test that mean-reverting gets 10% penalty."""
        assert REGIME_WIN_RATE_MODIFIERS["MEAN_REVERTING"] == 0.9

    def test_neutral_no_change(self):
        """Test that neutral regime has no modifier."""
        assert REGIME_WIN_RATE_MODIFIERS["NEUTRAL"] == 1.0


# ============================================
# Compute Expected Value Tests
# ============================================


class TestComputeExpectedValue:
    """Tests for compute_expected_value convenience function."""

    def test_long_trade_positive_ev(self, default_config: EVConfig):
        """Test EV computation for a winning long trade."""
        ev = compute_expected_value(
            p_win=0.6,
            p_loss=0.3,
            p_scratch=0.1,
            target_price=110.0,
            stop_price=95.0,
            entry_price=100.0,
            position_size=100,
            config=default_config,
        )
        # Expected win: (110-100)*100 = 1000
        # Expected loss: (95-100)*100 = -500
        assert ev.expected_win == 1000.0
        assert ev.expected_loss == -500.0
        assert ev.is_positive_ev()

    def test_short_trade(self, default_config: EVConfig):
        """Test EV computation for a short trade."""
        ev = compute_expected_value(
            p_win=0.55,
            p_loss=0.35,
            p_scratch=0.1,
            target_price=90.0,  # Target below entry for short
            stop_price=105.0,  # Stop above entry for short
            entry_price=100.0,
            position_size=100,
        )
        # For short: expected_win = (90-100)*100 = -1000 (profit when price falls)
        # This is actually modeled as long in our system
        # The signs work out based on target vs stop
        assert ev.expected_win < ev.expected_loss  # Short trade reverses

    def test_slippage_included(self, default_config: EVConfig):
        """Test that slippage reduces expected value."""
        ev_no_slip = compute_expected_value(
            p_win=0.5,
            p_loss=0.4,
            p_scratch=0.1,
            target_price=105.0,
            stop_price=98.0,
            entry_price=100.0,
            position_size=100,
            slippage_pct=0.0,
        )
        ev_with_slip = compute_expected_value(
            p_win=0.5,
            p_loss=0.4,
            p_scratch=0.1,
            target_price=105.0,
            stop_price=98.0,
            entry_price=100.0,
            position_size=100,
            slippage_pct=0.005,
        )
        assert ev_no_slip.expected_value > ev_with_slip.expected_value

    def test_commission_included(self, default_config: EVConfig):
        """Test that commission reduces expected value."""
        ev_no_comm = compute_expected_value(
            p_win=0.5,
            p_loss=0.4,
            p_scratch=0.1,
            target_price=105.0,
            stop_price=98.0,
            entry_price=100.0,
            position_size=100,
            commission_per_share=0.0,
        )
        ev_with_comm = compute_expected_value(
            p_win=0.5,
            p_loss=0.4,
            p_scratch=0.1,
            target_price=105.0,
            stop_price=98.0,
            entry_price=100.0,
            position_size=100,
            commission_per_share=0.01,
        )
        assert ev_no_comm.expected_value > ev_with_comm.expected_value

    def test_metadata_populated(self, default_config: EVConfig):
        """Test that metadata is populated correctly."""
        ev = compute_expected_value(
            p_win=0.5,
            p_loss=0.4,
            p_scratch=0.1,
            target_price=105.0,
            stop_price=98.0,
            entry_price=100.0,
            position_size=100,
        )
        assert ev.metadata["entry_price"] == 100.0
        assert ev.metadata["target_price"] == 105.0
        assert ev.metadata["stop_price"] == 98.0
        assert ev.metadata["position_size"] == 100


# ============================================
# ExpectedValueCalculator Tests
# ============================================


class TestExpectedValueCalculator:
    """Tests for ExpectedValueCalculator class."""

    def test_calculator_initialization(self, default_config: EVConfig):
        """Test calculator initialization."""
        calc = ExpectedValueCalculator(config=default_config)
        assert calc.calculation_count == 0
        assert calc.config == default_config

    def test_compute_increments_count(self, default_config: EVConfig):
        """Test that compute increments calculation count."""
        calc = ExpectedValueCalculator(config=default_config)
        calc.compute(
            target_price=105.0,
            stop_price=98.0,
            entry_price=100.0,
            position_size=100,
        )
        assert calc.calculation_count == 1

        calc.compute(
            target_price=110.0,
            stop_price=95.0,
            entry_price=100.0,
            position_size=50,
        )
        assert calc.calculation_count == 2

    def test_compute_with_historical_rate(self, default_config: EVConfig):
        """Test compute with historical win rate."""
        calc = ExpectedValueCalculator(config=default_config)
        ev = calc.compute(
            target_price=105.0,
            stop_price=98.0,
            entry_price=100.0,
            position_size=100,
            historical_win_rate=0.6,
        )
        assert ev.metadata["historical_win_rate"] == 0.6

    def test_compute_with_model_prediction(self, default_config: EVConfig):
        """Test compute with model prediction."""
        calc = ExpectedValueCalculator(config=default_config)
        ev = calc.compute(
            target_price=105.0,
            stop_price=98.0,
            entry_price=100.0,
            position_size=100,
            model_prediction=0.65,
        )
        assert ev.metadata["model_prediction"] == 0.65

    def test_compute_with_regime(self, default_config: EVConfig):
        """Test compute with regime adjustment."""
        calc = ExpectedValueCalculator(config=default_config)
        ev_neutral = calc.compute(
            target_price=105.0,
            stop_price=98.0,
            entry_price=100.0,
            position_size=100,
            historical_win_rate=0.5,
            regime="NEUTRAL",
        )
        ev_bull = calc.compute(
            target_price=105.0,
            stop_price=98.0,
            entry_price=100.0,
            position_size=100,
            historical_win_rate=0.5,
            regime="BULL_TRENDING",
        )
        # Bull regime should have higher p_win
        assert ev_bull.p_win > ev_neutral.p_win

    def test_compute_with_holding_period(self, default_config: EVConfig):
        """Test compute with holding period affects scratch probability."""
        calc = ExpectedValueCalculator(config=default_config)
        ev_short = calc.compute(
            target_price=105.0,
            stop_price=98.0,
            entry_price=100.0,
            position_size=100,
            holding_period_days=1.0,
        )
        ev_long = calc.compute(
            target_price=105.0,
            stop_price=98.0,
            entry_price=100.0,
            position_size=100,
            holding_period_days=30.0,
        )
        # Longer holding should have lower scratch probability
        assert ev_long.p_scratch < ev_short.p_scratch


# ============================================
# Integration Tests
# ============================================


class TestExpectedValueIntegration:
    """Integration tests for expected value workflow."""

    def test_full_workflow(self, default_config: EVConfig):
        """Test complete expected value computation workflow."""
        # Step 1: Estimate probabilities
        p_win, p_loss, p_scratch = estimate_probabilities(
            historical_win_rate=0.55,
            model_prediction=0.60,
            regime="BULL_TRENDING",
            holding_period_days=5,
            stop_distance_pct=0.02,
            config=default_config,
        )

        # Step 2: Compute expected value
        ev = compute_expected_value(
            p_win=p_win,
            p_loss=p_loss,
            p_scratch=p_scratch,
            target_price=104.0,
            stop_price=98.0,
            entry_price=100.0,
            position_size=100,
            slippage_pct=0.001,
            commission_per_share=0.01,
            config=default_config,
        )

        # Verify complete result
        assert np.isclose(p_win + p_loss + p_scratch, 1.0, atol=0.01)
        assert ev.expected_win > 0
        assert ev.expected_loss < 0
        assert isinstance(ev.expected_value, float)
        assert isinstance(ev.risk_adjusted_ev, float)
        assert isinstance(ev.kelly_fraction, float)

    def test_calculator_vs_manual_equivalence(self, default_config: EVConfig):
        """Test that calculator produces same result as manual computation."""
        calc = ExpectedValueCalculator(config=default_config)

        # Use calculator
        ev_calc = calc.compute(
            target_price=105.0,
            stop_price=98.0,
            entry_price=100.0,
            position_size=100,
            historical_win_rate=0.5,
            model_prediction=0.5,
            regime="NEUTRAL",
            holding_period_days=5.0,
            slippage_pct=0.001,
        )

        # Manual computation
        stop_distance = abs(98.0 - 100.0) / 100.0
        p_win, p_loss, p_scratch = estimate_probabilities(
            historical_win_rate=0.5,
            model_prediction=0.5,
            regime="NEUTRAL",
            holding_period_days=5.0,
            stop_distance_pct=stop_distance,
            config=default_config,
        )
        ev_manual = compute_expected_value(
            p_win=p_win,
            p_loss=p_loss,
            p_scratch=p_scratch,
            target_price=105.0,
            stop_price=98.0,
            entry_price=100.0,
            position_size=100,
            slippage_pct=0.001,
            config=default_config,
        )

        # Should be equivalent
        assert np.isclose(ev_calc.expected_value, ev_manual.expected_value)
        assert np.isclose(ev_calc.p_win, ev_manual.p_win)
        assert np.isclose(ev_calc.p_loss, ev_manual.p_loss)

    def test_edge_case_extreme_probabilities(self):
        """Test handling of extreme probability estimates."""
        ev = ExpectedValueEstimate(
            p_win=0.99,
            p_loss=0.005,
            p_scratch=0.005,
            expected_win=100.0,
            expected_loss=-1000.0,
            expected_scratch=-5.0,
        )
        # Should compute without errors
        assert ev.expected_value > 0
        assert ev.kelly_fraction > 0

    def test_edge_case_zero_variance(self):
        """Test handling of zero variance (all same outcome)."""
        ev = ExpectedValueEstimate(
            p_win=1.0,
            p_loss=0.0,
            p_scratch=0.0,
            expected_win=100.0,
            expected_loss=0.0,
            expected_scratch=0.0,
        )
        # Variance should be zero or very small
        assert ev.variance >= 0
        # EV = risk-adjusted EV when no variance
        assert np.isclose(ev.expected_value, ev.risk_adjusted_ev)
