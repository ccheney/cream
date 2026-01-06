"""Black-Scholes-Merton Greeks Implementation

Implements Greeks computation using the Black-Scholes-Merton model:
- Analytical formulas for European options
- First and second-order Greeks
- Support for dividend-paying assets

Mathematical foundations:
- S: Current stock price
- K: Strike price
- T: Time to expiration (years)
- r: Risk-free interest rate (annualized)
- σ (sigma): Implied volatility (annualized)
- q: Dividend yield (continuous)

References:
- Black, F., & Scholes, M. (1973). The Pricing of Options and Corporate Liabilities.
- Merton, R. C. (1973). Theory of Rational Option Pricing.
"""

from dataclasses import dataclass
from math import exp, log, sqrt

from scipy import stats


@dataclass
class BlackScholesGreeks:
    """Container for all Greeks computed via Black-Scholes model.

    Attributes:
        price: Option theoretical value
        delta: Rate of change of option price w.r.t. underlying price
        gamma: Rate of change of delta w.r.t. underlying price
        theta: Rate of change of option price w.r.t. time (per day)
        vega: Rate of change of option price w.r.t. volatility (per 1% change)
        rho: Rate of change of option price w.r.t. interest rate (per 1% change)
        vanna: Rate of change of delta w.r.t. volatility (cross-Greek)
        charm: Rate of change of delta w.r.t. time (delta decay)
        vomma: Rate of change of vega w.r.t. volatility (vega convexity)
    """

    price: float
    delta: float
    gamma: float
    theta: float
    vega: float
    rho: float
    vanna: float | None = None
    charm: float | None = None
    vomma: float | None = None


def _d1(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate d1 parameter for Black-Scholes formula.

    d1 = [ln(S/K) + (r - q + σ²/2)T] / (σ√T)

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
    if T <= 0:
        raise ValueError("Time to expiration must be positive")
    if sigma <= 0:
        raise ValueError("Volatility must be positive")
    if S <= 0:
        raise ValueError("Stock price must be positive")
    if K <= 0:
        raise ValueError("Strike price must be positive")

    return (log(S / K) + (r - q + 0.5 * sigma**2) * T) / (sigma * sqrt(T))


def _d2(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate d2 parameter for Black-Scholes formula.

    d2 = d1 - σ√T

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
    return _d1(S, K, T, r, sigma, q) - sigma * sqrt(T)


def _norm_pdf(x: float) -> float:
    """Standard normal probability density function.

    φ(x) = (1/√(2π)) * e^(-x²/2)

    Args:
        x: Input value

    Returns:
        Probability density at x
    """
    return float(stats.norm.pdf(x))


def _norm_cdf(x: float) -> float:
    """Standard normal cumulative distribution function.

    N(x) = ∫_{-∞}^{x} φ(t) dt

    Args:
        x: Input value

    Returns:
        Cumulative probability up to x
    """
    return float(stats.norm.cdf(x))


# ============================================================================
# Option Pricing
# ============================================================================


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
    d1 = _d1(S, K, T, r, sigma, q)
    d2 = _d2(S, K, T, r, sigma, q)

    call = S * exp(-q * T) * _norm_cdf(d1) - K * exp(-r * T) * _norm_cdf(d2)
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
    d1 = _d1(S, K, T, r, sigma, q)
    d2 = _d2(S, K, T, r, sigma, q)

    put = K * exp(-r * T) * _norm_cdf(-d2) - S * exp(-q * T) * _norm_cdf(-d1)
    return float(put)


# ============================================================================
# Delta (∂V/∂S)
# ============================================================================


def call_delta(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate call option delta.

    Δ_call = e^(-qT) * N(d1)

    Delta measures the rate of change of option price with respect to the
    underlying asset price. For calls, delta ranges from 0 to 1.

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)

    Returns:
        Call delta
    """
    d1 = _d1(S, K, T, r, sigma, q)
    return float(exp(-q * T) * _norm_cdf(d1))


def put_delta(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate put option delta.

    Δ_put = -e^(-qT) * N(-d1) = e^(-qT) * (N(d1) - 1)

    Delta measures the rate of change of option price with respect to the
    underlying asset price. For puts, delta ranges from -1 to 0.

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)

    Returns:
        Put delta
    """
    d1 = _d1(S, K, T, r, sigma, q)
    return float(exp(-q * T) * (_norm_cdf(d1) - 1))


# ============================================================================
# Gamma (∂²V/∂S²)
# ============================================================================


def call_gamma(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate call option gamma.

    Γ = [e^(-qT) * φ(d1)] / [S * σ * √T]

    Gamma measures the rate of change of delta with respect to the underlying
    asset price. Gamma is identical for calls and puts.

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)

    Returns:
        Call gamma
    """
    d1 = _d1(S, K, T, r, sigma, q)
    gamma = (exp(-q * T) * _norm_pdf(d1)) / (S * sigma * sqrt(T))
    return float(gamma)


def put_gamma(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate put option gamma.

    Γ = [e^(-qT) * φ(d1)] / [S * σ * √T]

    Gamma measures the rate of change of delta with respect to the underlying
    asset price. Gamma is identical for calls and puts.

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)

    Returns:
        Put gamma (same as call gamma)
    """
    return call_gamma(S, K, T, r, sigma, q)


# ============================================================================
# Theta (∂V/∂t)
# ============================================================================


def call_theta(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate call option theta (per calendar day).

    Θ_call = -[S*φ(d1)*σ*e^(-qT)] / [2*√T] - r*K*e^(-rT)*N(d2) + q*S*e^(-qT)*N(d1)

    Theta measures the rate of change of option price with respect to time.
    Returned value is per calendar day (divide by 365 for annual theta).

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)

    Returns:
        Call theta per day
    """
    d1 = _d1(S, K, T, r, sigma, q)
    d2 = _d2(S, K, T, r, sigma, q)

    term1 = -(S * _norm_pdf(d1) * sigma * exp(-q * T)) / (2 * sqrt(T))
    term2 = -r * K * exp(-r * T) * _norm_cdf(d2)
    term3 = q * S * exp(-q * T) * _norm_cdf(d1)

    # Convert from annual to daily
    theta_annual = term1 + term2 + term3
    return float(theta_annual / 365.0)


def put_theta(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate put option theta (per calendar day).

    Θ_put = -[S*φ(d1)*σ*e^(-qT)] / [2*√T] + r*K*e^(-rT)*N(-d2) - q*S*e^(-qT)*N(-d1)

    Theta measures the rate of change of option price with respect to time.
    Returned value is per calendar day (divide by 365 for annual theta).

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)

    Returns:
        Put theta per day
    """
    d1 = _d1(S, K, T, r, sigma, q)
    d2 = _d2(S, K, T, r, sigma, q)

    term1 = -(S * _norm_pdf(d1) * sigma * exp(-q * T)) / (2 * sqrt(T))
    term2 = r * K * exp(-r * T) * _norm_cdf(-d2)
    term3 = -q * S * exp(-q * T) * _norm_cdf(-d1)

    # Convert from annual to daily
    theta_annual = term1 + term2 + term3
    return float(theta_annual / 365.0)


# ============================================================================
# Vega (∂V/∂σ)
# ============================================================================


def call_vega(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate call option vega (per 1% change in volatility).

    ν = S * e^(-qT) * φ(d1) * √T

    Vega measures the rate of change of option price with respect to volatility.
    Vega is identical for calls and puts. Returned value is per 1% (0.01) change.

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)

    Returns:
        Call vega (per 1% volatility change)
    """
    d1 = _d1(S, K, T, r, sigma, q)
    vega = S * exp(-q * T) * _norm_pdf(d1) * sqrt(T)
    # Convert to per 1% change (0.01)
    return float(vega / 100.0)


def put_vega(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate put option vega (per 1% change in volatility).

    ν = S * e^(-qT) * φ(d1) * √T

    Vega measures the rate of change of option price with respect to volatility.
    Vega is identical for calls and puts. Returned value is per 1% (0.01) change.

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)

    Returns:
        Put vega (per 1% volatility change, same as call vega)
    """
    return call_vega(S, K, T, r, sigma, q)


# ============================================================================
# Rho (∂V/∂r)
# ============================================================================


def call_rho(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate call option rho (per 1% change in interest rate).

    ρ_call = K * T * e^(-rT) * N(d2)

    Rho measures the rate of change of option price with respect to the
    risk-free interest rate. Returned value is per 1% (0.01) change.

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)

    Returns:
        Call rho (per 1% rate change)
    """
    d2 = _d2(S, K, T, r, sigma, q)
    rho = K * T * exp(-r * T) * _norm_cdf(d2)
    # Convert to per 1% change (0.01)
    return float(rho / 100.0)


def put_rho(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate put option rho (per 1% change in interest rate).

    ρ_put = -K * T * e^(-rT) * N(-d2)

    Rho measures the rate of change of option price with respect to the
    risk-free interest rate. Returned value is per 1% (0.01) change.

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)

    Returns:
        Put rho (per 1% rate change)
    """
    d2 = _d2(S, K, T, r, sigma, q)
    rho = -K * T * exp(-r * T) * _norm_cdf(-d2)
    # Convert to per 1% change (0.01)
    return float(rho / 100.0)


# ============================================================================
# Second-Order Greeks
# ============================================================================


def vanna(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate vanna (∂²V/∂S∂σ or ∂Δ/∂σ).

    Vanna = -e^(-qT) * φ(d1) * d2 / σ

    Vanna measures how delta changes with volatility, or equivalently,
    how vega changes with the underlying price. Same for calls and puts.

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)

    Returns:
        Vanna
    """
    d1 = _d1(S, K, T, r, sigma, q)
    d2 = _d2(S, K, T, r, sigma, q)

    vanna_value = -exp(-q * T) * _norm_pdf(d1) * d2 / sigma
    return float(vanna_value / 100.0)  # Per 1% volatility change


def charm(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate charm (∂²V/∂S∂t or ∂Δ/∂t) for calls.

    Charm measures how delta changes over time (delta decay).
    Also known as delta bleed.

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)

    Returns:
        Call charm (per day)
    """
    d1 = _d1(S, K, T, r, sigma, q)
    d2 = _d2(S, K, T, r, sigma, q)

    term1 = -exp(-q * T) * _norm_pdf(d1) * (2 * (r - q) * T - d2 * sigma * sqrt(T))
    term2 = 2 * T * sigma * sqrt(T)

    charm_annual = term1 / term2
    return float(charm_annual / 365.0)  # Convert to daily


def vomma(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate vomma (∂²V/∂σ² or ∂ν/∂σ).

    Vomma = S * e^(-qT) * φ(d1) * √T * (d1 * d2) / σ

    Vomma measures how vega changes with volatility (vega convexity).
    Also known as volga or vega convexity. Same for calls and puts.

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)

    Returns:
        Vomma
    """
    d1 = _d1(S, K, T, r, sigma, q)
    d2 = _d2(S, K, T, r, sigma, q)

    vomma_value = S * exp(-q * T) * _norm_pdf(d1) * sqrt(T) * (d1 * d2) / sigma
    return float(vomma_value / 10000.0)  # Per 1% volatility change squared


# ============================================================================
# Convenience Function
# ============================================================================


def compute_all_greeks(
    S: float,
    K: float,
    T: float,
    r: float,
    sigma: float,
    q: float = 0.0,
    option_type: str = "call",
    include_second_order: bool = False,
) -> BlackScholesGreeks:
    """Compute all Greeks for a European option.

    Args:
        S: Current stock price
        K: Strike price
        T: Time to expiration (years)
        r: Risk-free rate (annualized)
        sigma: Volatility (annualized)
        q: Dividend yield (continuous)
        option_type: "call" or "put"
        include_second_order: If True, compute vanna, charm, and vomma

    Returns:
        BlackScholesGreeks object with all computed Greeks

    Raises:
        ValueError: If option_type is not "call" or "put"
    """
    if option_type.lower() not in ["call", "put"]:
        raise ValueError(f"option_type must be 'call' or 'put', got: {option_type}")

    is_call = option_type.lower() == "call"

    if is_call:
        price = call_price(S, K, T, r, sigma, q)
        delta = call_delta(S, K, T, r, sigma, q)
        gamma = call_gamma(S, K, T, r, sigma, q)
        theta = call_theta(S, K, T, r, sigma, q)
        vega_val = call_vega(S, K, T, r, sigma, q)
        rho = call_rho(S, K, T, r, sigma, q)
    else:
        price = put_price(S, K, T, r, sigma, q)
        delta = put_delta(S, K, T, r, sigma, q)
        gamma = put_gamma(S, K, T, r, sigma, q)
        theta = put_theta(S, K, T, r, sigma, q)
        vega_val = put_vega(S, K, T, r, sigma, q)
        rho = put_rho(S, K, T, r, sigma, q)

    vanna_val = None
    charm_val = None
    vomma_val = None

    if include_second_order:
        vanna_val = vanna(S, K, T, r, sigma, q)
        charm_val = charm(S, K, T, r, sigma, q)
        vomma_val = vomma(S, K, T, r, sigma, q)

    return BlackScholesGreeks(
        price=price,
        delta=delta,
        gamma=gamma,
        theta=theta,
        vega=vega_val,
        rho=rho,
        vanna=vanna_val,
        charm=charm_val,
        vomma=vomma_val,
    )
