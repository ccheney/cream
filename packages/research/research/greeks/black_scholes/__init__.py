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
- sigma: Implied volatility (annualized)
- q: Dividend yield (continuous)

References:
- Black, F., & Scholes, M. (1973). The Pricing of Options and Corporate Liabilities.
- Merton, R. C. (1973). Theory of Rational Option Pricing.
"""

from .calculator import compute_all_greeks
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

__all__ = [
    # Types
    "BlackScholesGreeks",
    # Pricing
    "call_price",
    "put_price",
    # Delta
    "call_delta",
    "put_delta",
    # Gamma
    "call_gamma",
    "put_gamma",
    # Theta
    "call_theta",
    "put_theta",
    # Vega
    "call_vega",
    "put_vega",
    # Rho
    "call_rho",
    "put_rho",
    # Second-order Greeks
    "vanna",
    "charm",
    "vomma",
    # Calculator
    "compute_all_greeks",
]
