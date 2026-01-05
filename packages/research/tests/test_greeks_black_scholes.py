"""Tests for Black-Scholes Greeks computation."""

import pytest

from research.greeks.black_scholes import (
    BlackScholesGreeks,
    call_delta,
    call_gamma,
    call_price,
    call_rho,
    call_theta,
    call_vega,
    charm,
    compute_all_greeks,
    put_delta,
    put_gamma,
    put_price,
    put_rho,
    put_theta,
    put_vega,
    vanna,
    vomma,
)


class TestBlackScholesPrice:
    """Test Black-Scholes option pricing."""

    def test_call_price_atm(self) -> None:
        """Test ATM call option pricing."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        price = call_price(S, K, T, r, sigma)

        # ATM call should be worth more than intrinsic value (0)
        assert price > 0
        # Approximate expected value (can be verified with BS calculator)
        assert 9.0 < price < 11.0

    def test_put_price_atm(self) -> None:
        """Test ATM put option pricing."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        price = put_price(S, K, T, r, sigma)

        # ATM put should be worth more than intrinsic value (0)
        assert price > 0
        # Put-call parity: P = C - S + K*e^(-rT)
        call = call_price(S, K, T, r, sigma)
        expected_put = call - S + K * 0.951229  # e^(-0.05*1)
        assert abs(price - expected_put) < 0.01

    def test_deep_itm_call(self) -> None:
        """Test deep ITM call approaches intrinsic value."""
        S = 150.0
        K = 100.0
        T = 0.1  # Short time
        r = 0.05
        sigma = 0.2

        price = call_price(S, K, T, r, sigma)
        intrinsic = S - K

        # Deep ITM with short time should be close to intrinsic
        assert price > intrinsic
        assert price - intrinsic < 2.0  # Small time value

    def test_deep_otm_call(self) -> None:
        """Test deep OTM call approaches zero."""
        S = 50.0
        K = 100.0
        T = 0.1
        r = 0.05
        sigma = 0.2

        price = call_price(S, K, T, r, sigma)

        # Deep OTM should be near zero
        assert price < 0.1


class TestDelta:
    """Test delta calculations."""

    def test_call_delta_range(self) -> None:
        """Test call delta is between 0 and 1."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        delta = call_delta(S, K, T, r, sigma)

        assert 0 < delta < 1
        # ATM call delta should be around 0.5
        assert 0.45 < delta < 0.65

    def test_put_delta_range(self) -> None:
        """Test put delta is between -1 and 0."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        delta = put_delta(S, K, T, r, sigma)

        assert -1 < delta < 0
        # ATM put delta should be around -0.5
        assert -0.65 < delta < -0.35

    def test_itm_call_delta(self) -> None:
        """Test ITM call delta approaches 1."""
        S = 150.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        delta = call_delta(S, K, T, r, sigma)

        # Deep ITM call delta should be close to 1
        assert delta > 0.9

    def test_otm_put_delta(self) -> None:
        """Test OTM put delta approaches 0."""
        S = 150.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        delta = put_delta(S, K, T, r, sigma)

        # Deep OTM put delta should be close to 0
        assert delta > -0.1


class TestGamma:
    """Test gamma calculations."""

    def test_gamma_positive(self) -> None:
        """Test gamma is always positive."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        gamma_call = call_gamma(S, K, T, r, sigma)
        gamma_put = put_gamma(S, K, T, r, sigma)

        assert gamma_call > 0
        assert gamma_put > 0
        # Call and put gamma are identical
        assert abs(gamma_call - gamma_put) < 1e-10

    def test_gamma_peaks_atm(self) -> None:
        """Test gamma is highest for ATM options."""
        S = 100.0
        K_atm = 100.0
        K_itm = 80.0
        K_otm = 120.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        gamma_atm = call_gamma(S, K_atm, T, r, sigma)
        gamma_itm = call_gamma(S, K_itm, T, r, sigma)
        gamma_otm = call_gamma(S, K_otm, T, r, sigma)

        # ATM gamma should be highest
        assert gamma_atm > gamma_itm
        assert gamma_atm > gamma_otm


class TestTheta:
    """Test theta calculations."""

    def test_call_theta_negative(self) -> None:
        """Test call theta is typically negative (time decay)."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        theta = call_theta(S, K, T, r, sigma)

        # ATM call theta should be negative
        assert theta < 0

    def test_put_theta_negative(self) -> None:
        """Test put theta is typically negative."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        theta = put_theta(S, K, T, r, sigma)

        # ATM put theta should be negative
        assert theta < 0

    def test_theta_accelerates_near_expiry(self) -> None:
        """Test theta accelerates as expiration approaches."""
        S = 100.0
        K = 100.0
        r = 0.05
        sigma = 0.2

        theta_long = call_theta(S, K, 1.0, r, sigma)
        theta_short = call_theta(S, K, 0.1, r, sigma)

        # Theta should be more negative closer to expiry (per day)
        # Note: theta_short is daily theta for a shorter period
        assert abs(theta_short) > abs(theta_long)


class TestVega:
    """Test vega calculations."""

    def test_vega_positive(self) -> None:
        """Test vega is always positive."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        vega_call = call_vega(S, K, T, r, sigma)
        vega_put = put_vega(S, K, T, r, sigma)

        assert vega_call > 0
        assert vega_put > 0
        # Call and put vega are identical
        assert abs(vega_call - vega_put) < 1e-10

    def test_vega_peaks_atm(self) -> None:
        """Test vega is highest for ATM options."""
        S = 100.0
        K_atm = 100.0
        K_itm = 80.0
        K_otm = 120.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        vega_atm = call_vega(S, K_atm, T, r, sigma)
        vega_itm = call_vega(S, K_itm, T, r, sigma)
        vega_otm = call_vega(S, K_otm, T, r, sigma)

        # ATM vega should be highest
        assert vega_atm > vega_itm
        assert vega_atm > vega_otm

    def test_vega_decreases_near_expiry(self) -> None:
        """Test vega decreases as expiration approaches."""
        S = 100.0
        K = 100.0
        r = 0.05
        sigma = 0.2

        vega_long = call_vega(S, K, 1.0, r, sigma)
        vega_short = call_vega(S, K, 0.1, r, sigma)

        # Longer dated options have more vega
        assert vega_long > vega_short


class TestRho:
    """Test rho calculations."""

    def test_call_rho_positive(self) -> None:
        """Test call rho is positive."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        rho = call_rho(S, K, T, r, sigma)

        # Call rho should be positive (benefits from higher rates)
        assert rho > 0

    def test_put_rho_negative(self) -> None:
        """Test put rho is negative."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        rho = put_rho(S, K, T, r, sigma)

        # Put rho should be negative (hurt by higher rates)
        assert rho < 0


class TestSecondOrderGreeks:
    """Test second-order Greeks."""

    def test_vanna(self) -> None:
        """Test vanna computation."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        vanna_val = vanna(S, K, T, r, sigma)

        # Vanna exists and is finite
        assert isinstance(vanna_val, float)
        assert abs(vanna_val) < 10.0  # Reasonable bound

    def test_charm(self) -> None:
        """Test charm computation."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        charm_val = charm(S, K, T, r, sigma)

        # Charm exists and is finite
        assert isinstance(charm_val, float)

    def test_vomma_positive(self) -> None:
        """Test vomma is positive for ATM options."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        vomma_val = vomma(S, K, T, r, sigma)

        # Vomma should be positive for ATM
        assert vomma_val > 0


class TestComputeAllGreeks:
    """Test convenience function for computing all Greeks."""

    def test_compute_all_call_greeks(self) -> None:
        """Test computing all Greeks for call option."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        greeks = compute_all_greeks(S, K, T, r, sigma, option_type="call")

        assert isinstance(greeks, BlackScholesGreeks)
        assert greeks.price > 0
        assert 0 < greeks.delta < 1
        assert greeks.gamma > 0
        assert greeks.theta < 0
        assert greeks.vega > 0
        assert greeks.rho > 0

    def test_compute_all_put_greeks(self) -> None:
        """Test computing all Greeks for put option."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        greeks = compute_all_greeks(S, K, T, r, sigma, option_type="put")

        assert isinstance(greeks, BlackScholesGreeks)
        assert greeks.price > 0
        assert -1 < greeks.delta < 0
        assert greeks.gamma > 0
        assert greeks.theta < 0
        assert greeks.vega > 0
        assert greeks.rho < 0

    def test_compute_with_second_order(self) -> None:
        """Test computing Greeks with second-order terms."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        sigma = 0.2

        greeks = compute_all_greeks(S, K, T, r, sigma, include_second_order=True)

        assert greeks.vanna is not None
        assert greeks.charm is not None
        assert greeks.vomma is not None

    def test_invalid_option_type(self) -> None:
        """Test error handling for invalid option type."""
        with pytest.raises(ValueError, match="option_type must be"):
            compute_all_greeks(100, 100, 1.0, 0.05, 0.2, option_type="invalid")


class TestInputValidation:
    """Test input validation."""

    def test_negative_stock_price(self) -> None:
        """Test error on negative stock price."""
        with pytest.raises(ValueError, match="Stock price must be positive"):
            call_price(-100, 100, 1.0, 0.05, 0.2)

    def test_negative_strike(self) -> None:
        """Test error on negative strike."""
        with pytest.raises(ValueError, match="Strike price must be positive"):
            call_price(100, -100, 1.0, 0.05, 0.2)

    def test_negative_time(self) -> None:
        """Test error on negative time to expiration."""
        with pytest.raises(ValueError, match="Time to expiration must be positive"):
            call_price(100, 100, -1.0, 0.05, 0.2)

    def test_negative_volatility(self) -> None:
        """Test error on negative volatility."""
        with pytest.raises(ValueError, match="Volatility must be positive"):
            call_price(100, 100, 1.0, 0.05, -0.2)
