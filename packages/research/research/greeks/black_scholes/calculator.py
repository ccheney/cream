"""Convenience function for computing all Greeks at once.

Provides a unified interface for calculating all Greeks for a given option.
"""

from .formulas import call_price, put_price
from .greeks import (
    call_delta,
    call_gamma,
    call_rho,
    call_theta,
    call_vega,
    charm,
    put_delta,
    put_gamma,
    put_rho,
    put_theta,
    put_vega,
    vanna,
    vomma,
)
from .types import BlackScholesGreeks


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
