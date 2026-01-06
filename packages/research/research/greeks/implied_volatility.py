"""Implied Volatility Computation

Solves for implied volatility given market option price using:
- Newton-Raphson method (fast convergence for well-behaved cases)
- Brent's method fallback (robust for edge cases)
- Bisection method (guaranteed convergence, slower)

Implied volatility (IV) is the volatility parameter σ that makes the
Black-Scholes theoretical price equal to the observed market price.

Mathematical formulation:
    Given market price P_market, find σ such that:
    BS(S, K, T, r, σ, q) = P_market

References:
- Li, S. (2005). "A New Formula for Computing Implied Volatility"
- Jaeckel, P. (2015). "Let's Be Rational" (LetsBeRational algorithm)
"""

from dataclasses import dataclass
from typing import Literal

from research.greeks.black_scholes import call_price, call_vega, put_price, put_vega


@dataclass
class ImpliedVolatilitySolver:
    """Configuration for implied volatility solver.

    Attributes:
        max_iterations: Maximum number of iterations
        tolerance: Convergence tolerance (absolute error in price)
        min_vol: Minimum volatility bound (default 0.01 = 1%)
        max_vol: Maximum volatility bound (default 5.0 = 500%)
        method: Solver method ("newton-raphson" or "brent")
    """

    max_iterations: int = 100
    tolerance: float = 1e-6
    min_vol: float = 0.01
    max_vol: float = 5.0
    method: Literal["newton-raphson", "brent", "bisection"] = "newton-raphson"


class ImpliedVolatilityError(Exception):
    """Raised when implied volatility calculation fails to converge."""

    pass


def implied_volatility_newton_raphson(
    market_price: float,
    S: float,
    K: float,
    T: float,
    r: float,
    q: float = 0.0,
    option_type: str = "call",
    initial_guess: float = 0.3,
    config: ImpliedVolatilitySolver | None = None,
) -> float:
    """Calculate implied volatility using Newton-Raphson method.

    Newton-Raphson iteration:
        σ_(n+1) = σ_n - [BS(σ_n) - P_market] / vega(σ_n)

    This method converges quadratically when close to the solution but
    may diverge or oscillate for poor initial guesses.

    Args:
        market_price: Observed market price of the option
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        q: Dividend yield (continuous)
        option_type: "call" or "put"
        initial_guess: Starting volatility guess (default 30%)
        config: Solver configuration (optional)

    Returns:
        Implied volatility (annualized)

    Raises:
        ImpliedVolatilityError: If convergence fails
        ValueError: If inputs are invalid
    """
    if config is None:
        config = ImpliedVolatilitySolver()

    # Validate inputs
    if market_price <= 0:
        raise ValueError(f"Market price must be positive, got: {market_price}")
    if S <= 0:
        raise ValueError(f"Stock price must be positive, got: {S}")
    if K <= 0:
        raise ValueError(f"Strike price must be positive, got: {K}")
    if T <= 0:
        raise ValueError(f"Time to expiration must be positive, got: {T}")

    # Check intrinsic value bounds
    is_call = option_type.lower() == "call"
    if is_call:
        intrinsic_value = max(0, S - K)
        price_func = call_price
        vega_func = call_vega
    else:
        intrinsic_value = max(0, K - S)
        price_func = put_price
        vega_func = put_vega

    if market_price < intrinsic_value:
        raise ValueError(
            f"Market price ({market_price:.4f}) is less than "
            f"intrinsic value ({intrinsic_value:.4f})"
        )

    # Initialize
    sigma = max(config.min_vol, min(config.max_vol, initial_guess))

    for iteration in range(config.max_iterations):
        # Compute theoretical price and vega
        try:
            theoretical_price = price_func(S, K, T, r, sigma, q)
            vega = vega_func(S, K, T, r, sigma, q)
        except (ValueError, ZeroDivisionError) as e:
            raise ImpliedVolatilityError(
                f"Error computing price/vega at iteration {iteration}: {e}"
            ) from e

        # Check convergence
        price_diff = theoretical_price - market_price
        if abs(price_diff) < config.tolerance:
            return sigma

        # Check for invalid vega
        if abs(vega) < 1e-10:
            raise ImpliedVolatilityError(
                f"Vega too small ({vega}) at iteration {iteration}, cannot continue"
            )

        # Newton-Raphson update
        # Note: vega is already per 1% (0.01), so multiply by 100
        sigma_new = sigma - price_diff / (vega * 100.0)

        # Enforce bounds
        sigma_new = max(config.min_vol, min(config.max_vol, sigma_new))

        # Check for oscillation or stagnation
        if abs(sigma_new - sigma) < config.tolerance * 0.01:
            # Converged on sigma value even if price hasn't converged
            return sigma_new

        sigma = sigma_new

    raise ImpliedVolatilityError(
        f"Failed to converge after {config.max_iterations} iterations. "
        f"Last sigma: {sigma:.6f}, price diff: {price_diff:.6f}"
    )


def implied_volatility_bisection(
    market_price: float,
    S: float,
    K: float,
    T: float,
    r: float,
    q: float = 0.0,
    option_type: str = "call",
    config: ImpliedVolatilitySolver | None = None,
) -> float:
    """Calculate implied volatility using bisection method.

    Bisection method guarantees convergence but is slower than Newton-Raphson.
    Use this as a fallback when Newton-Raphson fails.

    Args:
        market_price: Observed market price of the option
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        q: Dividend yield (continuous)
        option_type: "call" or "put"
        config: Solver configuration (optional)

    Returns:
        Implied volatility (annualized)

    Raises:
        ImpliedVolatilityError: If convergence fails
    """
    if config is None:
        config = ImpliedVolatilitySolver()

    is_call = option_type.lower() == "call"
    price_func = call_price if is_call else put_price

    # Initialize bounds
    sigma_low = config.min_vol
    sigma_high = config.max_vol

    # Check that solution exists in bounds
    price_low = price_func(S, K, T, r, sigma_low, q)
    price_high = price_func(S, K, T, r, sigma_high, q)

    if market_price < price_low:
        raise ImpliedVolatilityError(
            f"Market price {market_price:.4f} is below minimum bound "
            f"price {price_low:.4f} at vol={sigma_low}"
        )
    if market_price > price_high:
        raise ImpliedVolatilityError(
            f"Market price {market_price:.4f} is above maximum bound "
            f"price {price_high:.4f} at vol={sigma_high}"
        )

    # Bisection iteration
    for _iteration in range(config.max_iterations):
        sigma_mid = (sigma_low + sigma_high) / 2.0
        price_mid = price_func(S, K, T, r, sigma_mid, q)

        price_diff = price_mid - market_price

        if abs(price_diff) < config.tolerance:
            return sigma_mid

        # Update bounds
        if price_diff > 0:
            sigma_high = sigma_mid
        else:
            sigma_low = sigma_mid

        # Check convergence on sigma
        if sigma_high - sigma_low < config.tolerance * 0.01:
            return sigma_mid

    raise ImpliedVolatilityError(
        f"Bisection failed to converge after {config.max_iterations} iterations"
    )


def implied_volatility_brent(
    market_price: float,
    S: float,
    K: float,
    T: float,
    r: float,
    q: float = 0.0,
    option_type: str = "call",
    config: ImpliedVolatilitySolver | None = None,
) -> float:
    """Calculate implied volatility using Brent's method.

    Brent's method combines bisection, secant, and inverse quadratic
    interpolation for robust and fast convergence.

    This is a wrapper around scipy.optimize.brentq for convenience.

    Args:
        market_price: Observed market price of the option
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        q: Dividend yield (continuous)
        option_type: "call" or "put"
        config: Solver configuration (optional)

    Returns:
        Implied volatility (annualized)

    Raises:
        ImpliedVolatilityError: If convergence fails
    """
    if config is None:
        config = ImpliedVolatilitySolver()

    is_call = option_type.lower() == "call"
    price_func = call_price if is_call else put_price

    def objective(sigma: float) -> float:
        """Objective function: BS(sigma) - market_price"""
        return price_func(S, K, T, r, sigma, q) - market_price

    try:
        from scipy.optimize import brentq

        sigma = brentq(
            objective,
            config.min_vol,
            config.max_vol,
            xtol=config.tolerance,
            maxiter=config.max_iterations,
        )
        return float(sigma)
    except ValueError as e:
        raise ImpliedVolatilityError(f"Brent's method failed: {e}") from e
    except ImportError as e:
        raise ImpliedVolatilityError(
            "scipy.optimize.brentq not available, cannot use Brent's method"
        ) from e


def compute_implied_volatility(
    market_price: float,
    S: float,
    K: float,
    T: float,
    r: float,
    q: float = 0.0,
    option_type: str = "call",
    initial_guess: float = 0.3,
    config: ImpliedVolatilitySolver | None = None,
) -> float:
    """Compute implied volatility with automatic fallback between methods.

    Tries methods in order:
    1. Newton-Raphson (fast, may fail)
    2. Brent's method (robust, scipy required)
    3. Bisection (guaranteed, slow)

    Args:
        market_price: Observed market price of the option
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        q: Dividend yield (continuous)
        option_type: "call" or "put"
        initial_guess: Starting volatility guess for Newton-Raphson
        config: Solver configuration (optional)

    Returns:
        Implied volatility (annualized)

    Raises:
        ImpliedVolatilityError: If all methods fail
    """
    if config is None:
        config = ImpliedVolatilitySolver()

    errors = []

    # Method 1: Newton-Raphson
    if config.method in ["newton-raphson", "brent", "bisection"]:
        try:
            return implied_volatility_newton_raphson(
                market_price, S, K, T, r, q, option_type, initial_guess, config
            )
        except (ImpliedVolatilityError, ValueError) as e:
            errors.append(f"Newton-Raphson: {e}")

    # Method 2: Brent's method
    if config.method in ["brent", "bisection"]:
        try:
            return implied_volatility_brent(market_price, S, K, T, r, q, option_type, config)
        except (ImpliedVolatilityError, ValueError) as e:
            errors.append(f"Brent: {e}")

    # Method 3: Bisection (fallback)
    try:
        return implied_volatility_bisection(market_price, S, K, T, r, q, option_type, config)
    except (ImpliedVolatilityError, ValueError) as e:
        errors.append(f"Bisection: {e}")

    # All methods failed
    raise ImpliedVolatilityError("All IV methods failed:\n" + "\n".join(errors))
