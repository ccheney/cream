"""Greeks Computation Engine

This module provides comprehensive Greeks computation for options trading,
including:
- First-order Greeks: Delta, Vega, Theta, Rho
- Second-order Greeks: Gamma, Vanna, Charm, Vomma
- Implied Volatility solver (Newton-Raphson method)
- Multi-leg strategy Greeks aggregation
- Portfolio-level Greeks computation

Based on Black-Scholes-Merton model with support for:
- European options
- American options (via binomial tree approximation)
- Dividend-paying underlying assets

References:
- Hull, J. C. (2018). Options, Futures, and Other Derivatives (10th ed.)
- Haug, E. G. (2007). The Complete Guide to Option Pricing Formulas (2nd ed.)
"""

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
from research.greeks.implied_volatility import (
    ImpliedVolatilitySolver,
    implied_volatility_newton_raphson,
)
from research.greeks.multi_leg import MultiLegGreeks, OptionLeg
from research.greeks.portfolio import PortfolioGreeks

__all__ = [
    # Black-Scholes pricing
    "call_price",
    "put_price",
    # First-order Greeks
    "call_delta",
    "put_delta",
    "call_gamma",
    "put_gamma",
    "call_theta",
    "put_theta",
    "call_vega",
    "put_vega",
    "call_rho",
    "put_rho",
    # Second-order Greeks
    "vanna",
    "charm",
    "vomma",
    # Calculator
    "compute_all_greeks",
    # Classes
    "BlackScholesGreeks",
    "ImpliedVolatilitySolver",
    "implied_volatility_newton_raphson",
    "MultiLegGreeks",
    "OptionLeg",
    "PortfolioGreeks",
]
