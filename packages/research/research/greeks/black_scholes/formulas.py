"""Core Black-Scholes formulas.

Implements the fundamental Black-Scholes-Merton formulas:
- d1 and d2 parameters
- Normal distribution functions
- European call and put option pricing

Mathematical foundations:
- S: Current stock price
- K: Strike price
- T: Time to expiration (years)
- r: Risk-free interest rate (annualized)
- sigma: Implied volatility (annualized)
- q: Dividend yield (continuous)

References:
- Black, F., & Scholes, M. (1973). The Pricing of Options and Corporate Liabilities.
- Merton, R. C. (1973). Theory of Rational Option Pricing.
"""

from math import exp, log, sqrt

from scipy import stats


def validate_inputs(S: float, K: float, T: float, sigma: float) -> None:
    """Validate Black-Scholes input parameters.

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        sigma: Volatility (annualized)

    Raises:
        ValueError: If any parameter is invalid
    """
    if T <= 0:
        raise ValueError("Time to expiration must be positive")
    if sigma <= 0:
        raise ValueError("Volatility must be positive")
    if S <= 0:
        raise ValueError("Stock price must be positive")
    if K <= 0:
        raise ValueError("Strike price must be positive")


def d1(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate d1 parameter for Black-Scholes formula.

    d1 = [ln(S/K) + (r - q + sigma^2/2)T] / (sigma * sqrt(T))

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)

    Returns:
        d1 parameter
    """
    validate_inputs(S, K, T, sigma)
    return (log(S / K) + (r - q + 0.5 * sigma**2) * T) / (sigma * sqrt(T))


def d2(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate d2 parameter for Black-Scholes formula.

    d2 = d1 - sigma * sqrt(T)

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)

    Returns:
        d2 parameter
    """
    return d1(S, K, T, r, sigma, q) - sigma * sqrt(T)


def norm_pdf(x: float) -> float:
    """Standard normal probability density function.

    phi(x) = (1/sqrt(2*pi)) * e^(-x^2/2)

    Args:
        x: Input value

    Returns:
        Probability density at x
    """
    return float(stats.norm.pdf(x))


def norm_cdf(x: float) -> float:
    """Standard normal cumulative distribution function.

    N(x) = integral from -inf to x of phi(t) dt

    Args:
        x: Input value

    Returns:
        Cumulative probability up to x
    """
    return float(stats.norm.cdf(x))


def call_price(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate European call option price using Black-Scholes formula.

    C = S*e^(-qT)*N(d1) - K*e^(-rT)*N(d2)

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)

    Returns:
        Call option price
    """
    d1_val = d1(S, K, T, r, sigma, q)
    d2_val = d2(S, K, T, r, sigma, q)

    call = S * exp(-q * T) * norm_cdf(d1_val) - K * exp(-r * T) * norm_cdf(d2_val)
    return float(call)


def put_price(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate European put option price using Black-Scholes formula.

    P = K*e^(-rT)*N(-d2) - S*e^(-qT)*N(-d1)

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)

    Returns:
        Put option price
    """
    d1_val = d1(S, K, T, r, sigma, q)
    d2_val = d2(S, K, T, r, sigma, q)

    put = K * exp(-r * T) * norm_cdf(-d2_val) - S * exp(-q * T) * norm_cdf(-d1_val)
    return float(put)
