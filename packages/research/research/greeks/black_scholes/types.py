"""Type definitions for Black-Scholes Greeks computation.

Contains dataclasses and type definitions used throughout the black_scholes package.
"""

from dataclasses import dataclass


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
