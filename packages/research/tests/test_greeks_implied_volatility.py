"""Tests for implied volatility solver."""

import pytest

from research.greeks.black_scholes import call_price, put_price
from research.greeks.implied_volatility import (
    ImpliedVolatilityError,
    ImpliedVolatilitySolver,
    compute_implied_volatility,
    implied_volatility_bisection,
    implied_volatility_newton_raphson,
)


class TestImpliedVolatilityNewtonRaphson:
    """Test Newton-Raphson IV solver."""

    def test_atm_call_iv(self) -> None:
        """Test IV calculation for ATM call."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        true_sigma = 0.25

        # Generate market price using true volatility
        market_price = call_price(S, K, T, r, true_sigma)

        # Solve for IV
        solved_sigma = implied_volatility_newton_raphson(market_price, S, K, T, r)

        # Should recover original volatility
        assert abs(solved_sigma - true_sigma) < 1e-4

    def test_atm_put_iv(self) -> None:
        """Test IV calculation for ATM put."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        true_sigma = 0.30

        market_price = put_price(S, K, T, r, true_sigma)
        solved_sigma = implied_volatility_newton_raphson(
            market_price, S, K, T, r, option_type="put"
        )

        assert abs(solved_sigma - true_sigma) < 1e-4

    def test_itm_call_iv(self) -> None:
        """Test IV calculation for ITM call."""
        S = 110.0
        K = 100.0
        T = 0.5
        r = 0.05
        true_sigma = 0.20

        market_price = call_price(S, K, T, r, true_sigma)
        solved_sigma = implied_volatility_newton_raphson(market_price, S, K, T, r)

        assert abs(solved_sigma - true_sigma) < 1e-4

    def test_otm_put_iv(self) -> None:
        """Test IV calculation for OTM put."""
        S = 110.0
        K = 100.0
        T = 0.5
        r = 0.05
        true_sigma = 0.35

        market_price = put_price(S, K, T, r, true_sigma)
        solved_sigma = implied_volatility_newton_raphson(
            market_price, S, K, T, r, option_type="put"
        )

        assert abs(solved_sigma - true_sigma) < 1e-4

    def test_high_volatility(self) -> None:
        """Test IV calculation with high volatility."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        true_sigma = 1.0  # 100% volatility

        market_price = call_price(S, K, T, r, true_sigma)
        solved_sigma = implied_volatility_newton_raphson(market_price, S, K, T, r)

        assert abs(solved_sigma - true_sigma) < 1e-3

    def test_low_volatility(self) -> None:
        """Test IV calculation with low volatility."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        true_sigma = 0.05  # 5% volatility

        market_price = call_price(S, K, T, r, true_sigma)
        solved_sigma = implied_volatility_newton_raphson(market_price, S, K, T, r)

        assert abs(solved_sigma - true_sigma) < 1e-4

    def test_short_expiry(self) -> None:
        """Test IV calculation near expiration."""
        S = 100.0
        K = 100.0
        T = 0.01  # ~4 days
        r = 0.05
        true_sigma = 0.25

        market_price = call_price(S, K, T, r, true_sigma)
        solved_sigma = implied_volatility_newton_raphson(market_price, S, K, T, r)

        assert abs(solved_sigma - true_sigma) < 1e-3

    def test_custom_initial_guess(self) -> None:
        """Test IV calculation with custom initial guess."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        true_sigma = 0.25

        market_price = call_price(S, K, T, r, true_sigma)
        solved_sigma = implied_volatility_newton_raphson(
            market_price, S, K, T, r, initial_guess=0.5
        )

        # Should still converge even with poor initial guess
        assert abs(solved_sigma - true_sigma) < 1e-4

    def test_with_dividends(self) -> None:
        """Test IV calculation with dividend yield."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        q = 0.02  # 2% dividend yield
        true_sigma = 0.25

        market_price = call_price(S, K, T, r, true_sigma, q)
        solved_sigma = implied_volatility_newton_raphson(market_price, S, K, T, r, q=q)

        assert abs(solved_sigma - true_sigma) < 1e-4

    def test_custom_config(self) -> None:
        """Test IV calculation with custom solver config."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        true_sigma = 0.25

        market_price = call_price(S, K, T, r, true_sigma)

        config = ImpliedVolatilitySolver(max_iterations=50, tolerance=1e-8)
        solved_sigma = implied_volatility_newton_raphson(
            market_price, S, K, T, r, config=config
        )

        assert abs(solved_sigma - true_sigma) < 1e-8

    def test_price_below_intrinsic(self) -> None:
        """Test error when market price is below intrinsic value."""
        S = 110.0
        K = 100.0
        T = 1.0
        r = 0.05
        market_price = 5.0  # Less than intrinsic value of 10

        with pytest.raises(ValueError, match="less than intrinsic value"):
            implied_volatility_newton_raphson(market_price, S, K, T, r)

    def test_negative_market_price(self) -> None:
        """Test error on negative market price."""
        with pytest.raises(ValueError, match="Market price must be positive"):
            implied_volatility_newton_raphson(-1.0, 100, 100, 1.0, 0.05)


class TestImpliedVolatilityBisection:
    """Test bisection IV solver."""

    def test_atm_call_iv_bisection(self) -> None:
        """Test IV calculation using bisection."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        true_sigma = 0.25

        market_price = call_price(S, K, T, r, true_sigma)
        solved_sigma = implied_volatility_bisection(market_price, S, K, T, r)

        # Bisection should converge (though slower than Newton-Raphson)
        assert abs(solved_sigma - true_sigma) < 1e-4

    def test_extreme_itm_bisection(self) -> None:
        """Test bisection for deep ITM option (where Newton-Raphson might struggle)."""
        S = 150.0
        K = 100.0
        T = 0.1
        r = 0.05
        true_sigma = 0.15

        market_price = call_price(S, K, T, r, true_sigma)
        solved_sigma = implied_volatility_bisection(market_price, S, K, T, r)

        # Deep ITM with short time has low vega, making IV less sensitive
        assert abs(solved_sigma - true_sigma) < 0.02  # Looser tolerance for deep ITM

    def test_price_out_of_bounds(self) -> None:
        """Test error when market price is outside feasible bounds."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05

        # Price too high for any reasonable volatility
        market_price = 200.0

        with pytest.raises(ImpliedVolatilityError, match="above maximum bound"):
            implied_volatility_bisection(market_price, S, K, T, r)


class TestComputeImpliedVolatility:
    """Test automatic fallback IV solver."""

    def test_auto_fallback_success(self) -> None:
        """Test that automatic method selection works."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        true_sigma = 0.25

        market_price = call_price(S, K, T, r, true_sigma)
        solved_sigma = compute_implied_volatility(market_price, S, K, T, r)

        assert abs(solved_sigma - true_sigma) < 1e-4

    def test_method_selection_newton(self) -> None:
        """Test explicit Newton-Raphson method selection."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        true_sigma = 0.25

        market_price = call_price(S, K, T, r, true_sigma)

        config = ImpliedVolatilitySolver(method="newton-raphson")
        solved_sigma = compute_implied_volatility(market_price, S, K, T, r, config=config)

        assert abs(solved_sigma - true_sigma) < 1e-4

    def test_method_selection_bisection(self) -> None:
        """Test explicit bisection method selection."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        true_sigma = 0.25

        market_price = call_price(S, K, T, r, true_sigma)

        config = ImpliedVolatilitySolver(method="bisection")
        solved_sigma = compute_implied_volatility(market_price, S, K, T, r, config=config)

        assert abs(solved_sigma - true_sigma) < 1e-4


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_very_low_price(self) -> None:
        """Test IV for very low priced option."""
        S = 100.0
        K = 150.0  # Deep OTM
        T = 0.1
        r = 0.05
        true_sigma = 0.20

        market_price = call_price(S, K, T, r, true_sigma)

        if market_price > 0.01:  # Only test if price is meaningful
            solved_sigma = compute_implied_volatility(market_price, S, K, T, r)
            assert abs(solved_sigma - true_sigma) < 1e-2  # Looser tolerance for low prices

    def test_convergence_iterations(self) -> None:
        """Test that solver respects iteration limit."""
        S = 100.0
        K = 100.0
        T = 1.0
        r = 0.05
        market_price = 10.0

        config = ImpliedVolatilitySolver(max_iterations=5, tolerance=1e-10)

        # With very tight tolerance and few iterations, may fail to converge
        # But should either succeed or raise error (not hang)
        try:
            solved_sigma = implied_volatility_newton_raphson(
                market_price, S, K, T, r, config=config
            )
            assert 0.01 < solved_sigma < 5.0  # Reasonable range
        except ImpliedVolatilityError:
            pass  # Acceptable outcome with tight constraints
