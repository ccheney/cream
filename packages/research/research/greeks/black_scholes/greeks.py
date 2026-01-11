"""Greeks calculations using Black-Scholes model.

Implements first-order and second-order Greeks:

First-order Greeks:
- Delta: Rate of change of option price w.r.t. underlying price
- Gamma: Rate of change of delta w.r.t. underlying price
- Theta: Rate of change of option price w.r.t. time
- Vega: Rate of change of option price w.r.t. volatility
- Rho: Rate of change of option price w.r.t. interest rate

Second-order Greeks:
- Vanna: Cross-partial of delta w.r.t. volatility
- Charm: Cross-partial of delta w.r.t. time (delta decay)
- Vomma: Second partial of option price w.r.t. volatility (vega convexity)
"""

from math import exp, sqrt

from .formulas import d1, d2, norm_cdf, norm_pdf

# ============================================================================
# Delta
# ============================================================================


def call_delta(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate call option delta.

    Delta_call = e^(-qT) * N(d1)

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
    d1_val = d1(S, K, T, r, sigma, q)
    return float(exp(-q * T) * norm_cdf(d1_val))


def put_delta(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate put option delta.

    Delta_put = -e^(-qT) * N(-d1) = e^(-qT) * (N(d1) - 1)

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
    d1_val = d1(S, K, T, r, sigma, q)
    return float(exp(-q * T) * (norm_cdf(d1_val) - 1))


# ============================================================================
# Gamma
# ============================================================================


def call_gamma(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate call option gamma.

    Gamma = [e^(-qT) * phi(d1)] / [S * sigma * sqrt(T)]

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
    d1_val = d1(S, K, T, r, sigma, q)
    gamma = (exp(-q * T) * norm_pdf(d1_val)) / (S * sigma * sqrt(T))
    return float(gamma)


def put_gamma(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate put option gamma.

    Gamma = [e^(-qT) * phi(d1)] / [S * sigma * sqrt(T)]

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
# Theta
# ============================================================================


def call_theta(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate call option theta (per calendar day).

    Theta_call = -[S*phi(d1)*sigma*e^(-qT)] / [2*sqrt(T)]
                 - r*K*e^(-rT)*N(d2) + q*S*e^(-qT)*N(d1)

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
    d1_val = d1(S, K, T, r, sigma, q)
    d2_val = d2(S, K, T, r, sigma, q)

    term1 = -(S * norm_pdf(d1_val) * sigma * exp(-q * T)) / (2 * sqrt(T))
    term2 = -r * K * exp(-r * T) * norm_cdf(d2_val)
    term3 = q * S * exp(-q * T) * norm_cdf(d1_val)

    theta_annual = term1 + term2 + term3
    return float(theta_annual / 365.0)


def put_theta(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate put option theta (per calendar day).

    Theta_put = -[S*phi(d1)*sigma*e^(-qT)] / [2*sqrt(T)]
                + r*K*e^(-rT)*N(-d2) - q*S*e^(-qT)*N(-d1)

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
    d1_val = d1(S, K, T, r, sigma, q)
    d2_val = d2(S, K, T, r, sigma, q)

    term1 = -(S * norm_pdf(d1_val) * sigma * exp(-q * T)) / (2 * sqrt(T))
    term2 = r * K * exp(-r * T) * norm_cdf(-d2_val)
    term3 = -q * S * exp(-q * T) * norm_cdf(-d1_val)

    theta_annual = term1 + term2 + term3
    return float(theta_annual / 365.0)


# ============================================================================
# Vega
# ============================================================================


def call_vega(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate call option vega (per 1% change in volatility).

    nu = S * e^(-qT) * phi(d1) * sqrt(T)

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
    d1_val = d1(S, K, T, r, sigma, q)
    vega = S * exp(-q * T) * norm_pdf(d1_val) * sqrt(T)
    return float(vega / 100.0)


def put_vega(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate put option vega (per 1% change in volatility).

    nu = S * e^(-qT) * phi(d1) * sqrt(T)

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
# Rho
# ============================================================================


def call_rho(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate call option rho (per 1% change in interest rate).

    rho_call = K * T * e^(-rT) * N(d2)

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
    d2_val = d2(S, K, T, r, sigma, q)
    rho = K * T * exp(-r * T) * norm_cdf(d2_val)
    return float(rho / 100.0)


def put_rho(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate put option rho (per 1% change in interest rate).

    rho_put = -K * T * e^(-rT) * N(-d2)

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
    d2_val = d2(S, K, T, r, sigma, q)
    rho = -K * T * exp(-r * T) * norm_cdf(-d2_val)
    return float(rho / 100.0)


# ============================================================================
# Second-Order Greeks
# ============================================================================


def vanna(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate vanna (d^2V/dS*d_sigma or dDelta/d_sigma).

    Vanna = -e^(-qT) * phi(d1) * d2 / sigma

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
        Vanna (per 1% volatility change)
    """
    d1_val = d1(S, K, T, r, sigma, q)
    d2_val = d2(S, K, T, r, sigma, q)

    vanna_value = -exp(-q * T) * norm_pdf(d1_val) * d2_val / sigma
    return float(vanna_value / 100.0)


def charm(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate charm (d^2V/dS*dt or dDelta/dt) for calls.

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
    d1_val = d1(S, K, T, r, sigma, q)
    d2_val = d2(S, K, T, r, sigma, q)

    term1 = -exp(-q * T) * norm_pdf(d1_val) * (2 * (r - q) * T - d2_val * sigma * sqrt(T))
    term2 = 2 * T * sigma * sqrt(T)

    charm_annual = term1 / term2
    return float(charm_annual / 365.0)


def vomma(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    """Calculate vomma (d^2V/d_sigma^2 or dVega/d_sigma).

    Vomma = S * e^(-qT) * phi(d1) * sqrt(T) * (d1 * d2) / sigma

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
    d1_val = d1(S, K, T, r, sigma, q)
    d2_val = d2(S, K, T, r, sigma, q)

    vomma_value = S * exp(-q * T) * norm_pdf(d1_val) * sqrt(T) * (d1_val * d2_val) / sigma
    return float(vomma_value / 10000.0)
