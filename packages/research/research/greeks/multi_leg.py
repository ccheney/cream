"""Multi-Leg Options Strategy Greeks

Implements Greeks aggregation for complex multi-leg option strategies:
- Vertical spreads (bull call, bear put, etc.)
- Horizontal spreads (calendar spreads)
- Diagonal spreads
- Iron condors, butterflies, straddles, strangles
- Custom combinations

Greeks for multi-leg strategies are computed as weighted sums of individual
leg Greeks, accounting for position direction (long/short) and quantity.

Example:
    Bull Call Spread = Long Call (lower strike) + Short Call (higher strike)
    Total Delta = Delta_long_call * qty - Delta_short_call * qty

References:
- McMillan, L. G. (2012). Options as a Strategic Investment (5th ed.)
- Natenberg, S. (2015). Option Volatility and Pricing (2nd ed.)
"""

from dataclasses import dataclass
from typing import Literal

from research.greeks.black_scholes import (
    BlackScholesGreeks,
    call_delta,
    call_gamma,
    call_price,
    call_rho,
    call_theta,
    call_vega,
    charm,
    put_delta,
    put_gamma,
    put_price,
    put_rho,
    put_theta,
    put_vega,
    vanna,
    vomma,
)


@dataclass
class OptionLeg:
    """Single leg of a multi-leg option strategy.

    Attributes:
        option_type: "call" or "put"
        position: "long" (buy) or "short" (sell)
        quantity: Number of contracts (positive)
        strike: Strike price
        expiration: Time to expiration (years)
        underlying_price: Current underlying price
        risk_free_rate: Risk-free rate (annualized)
        volatility: Implied volatility (annualized)
        dividend_yield: Dividend yield (continuous, default 0)
    """

    option_type: Literal["call", "put"]
    position: Literal["long", "short"]
    quantity: float
    strike: float
    expiration: float
    underlying_price: float
    risk_free_rate: float
    volatility: float
    dividend_yield: float = 0.0

    def __post_init__(self) -> None:
        """Validate leg parameters."""
        if self.quantity <= 0:
            raise ValueError(f"Quantity must be positive, got: {self.quantity}")
        if self.strike <= 0:
            raise ValueError(f"Strike must be positive, got: {self.strike}")
        if self.expiration <= 0:
            raise ValueError(f"Expiration must be positive, got: {self.expiration}")
        if self.underlying_price <= 0:
            raise ValueError(f"Underlying price must be positive, got: {self.underlying_price}")
        if self.volatility <= 0:
            raise ValueError(f"Volatility must be positive, got: {self.volatility}")

    @property
    def direction(self) -> int:
        """Return +1 for long positions, -1 for short positions."""
        return 1 if self.position == "long" else -1

    def compute_greeks(self, include_second_order: bool = False) -> BlackScholesGreeks:
        """Compute Greeks for this leg.

        Greeks are adjusted by position direction and quantity:
        - Long position: positive contribution
        - Short position: negative contribution

        Args:
            include_second_order: If True, compute vanna, charm, and vomma

        Returns:
            BlackScholesGreeks for this leg (adjusted for direction and quantity)
        """
        is_call = self.option_type == "call"

        # Select appropriate pricing and Greeks functions
        if is_call:
            price_func = call_price
            delta_func = call_delta
            gamma_func = call_gamma
            theta_func = call_theta
            vega_func = call_vega
            rho_func = call_rho
        else:
            price_func = put_price
            delta_func = put_delta
            gamma_func = put_gamma
            theta_func = put_theta
            vega_func = put_vega
            rho_func = put_rho

        # Compute base Greeks
        S = self.underlying_price
        K = self.strike
        T = self.expiration
        r = self.risk_free_rate
        sigma = self.volatility
        q = self.dividend_yield

        price = price_func(S, K, T, r, sigma, q)
        delta = delta_func(S, K, T, r, sigma, q)
        gamma = gamma_func(S, K, T, r, sigma, q)
        theta = theta_func(S, K, T, r, sigma, q)
        vega_val = vega_func(S, K, T, r, sigma, q)
        rho = rho_func(S, K, T, r, sigma, q)

        # Compute second-order Greeks if requested
        vanna_val = None
        charm_val = None
        vomma_val = None

        if include_second_order:
            vanna_val = vanna(S, K, T, r, sigma, q)
            charm_val = charm(S, K, T, r, sigma, q)
            vomma_val = vomma(S, K, T, r, sigma, q)

        # Adjust for direction (long=+1, short=-1) and quantity
        multiplier = self.direction * self.quantity

        return BlackScholesGreeks(
            price=price * multiplier,
            delta=delta * multiplier,
            gamma=gamma * multiplier,
            theta=theta * multiplier,
            vega=vega_val * multiplier,
            rho=rho * multiplier,
            vanna=vanna_val * multiplier if vanna_val is not None else None,
            charm=charm_val * multiplier if charm_val is not None else None,
            vomma=vomma_val * multiplier if vomma_val is not None else None,
        )


@dataclass
class MultiLegGreeks:
    """Multi-leg option strategy Greeks aggregator.

    Attributes:
        legs: List of option legs in the strategy
        name: Optional strategy name (e.g., "Bull Call Spread")
    """

    legs: list[OptionLeg]
    name: str = "Custom Strategy"

    def __post_init__(self) -> None:
        """Validate strategy."""
        if not self.legs:
            raise ValueError("Strategy must have at least one leg")

    def compute_greeks(self, include_second_order: bool = False) -> BlackScholesGreeks:
        """Compute aggregate Greeks for the entire strategy.

        Greeks are computed as the sum of individual leg Greeks,
        properly accounting for position direction and quantity.

        Args:
            include_second_order: If True, compute vanna, charm, and vomma

        Returns:
            Aggregated BlackScholesGreeks for the strategy
        """
        total_price = 0.0
        total_delta = 0.0
        total_gamma = 0.0
        total_theta = 0.0
        total_vega = 0.0
        total_rho = 0.0
        total_vanna = 0.0
        total_charm = 0.0
        total_vomma = 0.0

        for leg in self.legs:
            leg_greeks = leg.compute_greeks(include_second_order=include_second_order)

            total_price += leg_greeks.price
            total_delta += leg_greeks.delta
            total_gamma += leg_greeks.gamma
            total_theta += leg_greeks.theta
            total_vega += leg_greeks.vega
            total_rho += leg_greeks.rho

            if include_second_order:
                if leg_greeks.vanna is not None:
                    total_vanna += leg_greeks.vanna
                if leg_greeks.charm is not None:
                    total_charm += leg_greeks.charm
                if leg_greeks.vomma is not None:
                    total_vomma += leg_greeks.vomma

        return BlackScholesGreeks(
            price=total_price,
            delta=total_delta,
            gamma=total_gamma,
            theta=total_theta,
            vega=total_vega,
            rho=total_rho,
            vanna=total_vanna if include_second_order else None,
            charm=total_charm if include_second_order else None,
            vomma=total_vomma if include_second_order else None,
        )

    def get_leg_greeks(self, include_second_order: bool = False) -> list[BlackScholesGreeks]:
        """Get Greeks for each individual leg.

        Args:
            include_second_order: If True, compute vanna, charm, and vomma

        Returns:
            List of BlackScholesGreeks, one per leg
        """
        return [leg.compute_greeks(include_second_order) for leg in self.legs]

    def net_premium(self) -> float:
        """Calculate net premium paid/received for the strategy.

        Returns:
            Net premium (positive = debit, negative = credit)
        """
        return sum(leg.compute_greeks().price for leg in self.legs)

    def max_profit(self) -> float | None:
        """Calculate maximum profit for common strategies.

        Returns:
            Maximum profit, or None if unbounded
        """
        # This is strategy-specific and would need to be implemented
        # based on the specific strategy type
        return None

    def max_loss(self) -> float | None:
        """Calculate maximum loss for common strategies.

        Returns:
            Maximum loss, or None if unbounded
        """
        # This is strategy-specific and would need to be implemented
        # based on the specific strategy type
        return None

    def breakeven_points(self) -> list[float]:
        """Calculate breakeven point(s) at expiration.

        Returns:
            List of breakeven underlying prices
        """
        # This requires root-finding and is strategy-specific
        return []


# ============================================================================
# Common Strategy Builders
# ============================================================================


def bull_call_spread(
    underlying_price: float,
    lower_strike: float,
    upper_strike: float,
    expiration: float,
    risk_free_rate: float,
    volatility: float,
    quantity: float = 1.0,
    dividend_yield: float = 0.0,
) -> MultiLegGreeks:
    """Create a bull call spread strategy.

    Long call at lower strike + Short call at higher strike.
    Limited profit, limited risk.

    Args:
        underlying_price: Current underlying price
        lower_strike: Strike of long call (lower)
        upper_strike: Strike of short call (higher)
        expiration: Time to expiration (years)
        risk_free_rate: Risk-free rate (annualized)
        volatility: Implied volatility (annualized)
        quantity: Number of spreads
        dividend_yield: Dividend yield (continuous)

    Returns:
        MultiLegGreeks strategy
    """
    if lower_strike >= upper_strike:
        raise ValueError("Lower strike must be less than upper strike")

    legs = [
        OptionLeg(
            option_type="call",
            position="long",
            quantity=quantity,
            strike=lower_strike,
            expiration=expiration,
            underlying_price=underlying_price,
            risk_free_rate=risk_free_rate,
            volatility=volatility,
            dividend_yield=dividend_yield,
        ),
        OptionLeg(
            option_type="call",
            position="short",
            quantity=quantity,
            strike=upper_strike,
            expiration=expiration,
            underlying_price=underlying_price,
            risk_free_rate=risk_free_rate,
            volatility=volatility,
            dividend_yield=dividend_yield,
        ),
    ]

    return MultiLegGreeks(legs=legs, name="Bull Call Spread")


def iron_condor(
    underlying_price: float,
    put_lower_strike: float,
    put_upper_strike: float,
    call_lower_strike: float,
    call_upper_strike: float,
    expiration: float,
    risk_free_rate: float,
    volatility: float,
    quantity: float = 1.0,
    dividend_yield: float = 0.0,
) -> MultiLegGreeks:
    """Create an iron condor strategy.

    Short put spread + Short call spread.
    Limited profit, limited risk, profits from low volatility.

    Args:
        underlying_price: Current underlying price
        put_lower_strike: Strike of long put (lowest)
        put_upper_strike: Strike of short put
        call_lower_strike: Strike of short call
        call_upper_strike: Strike of long call (highest)
        expiration: Time to expiration (years)
        risk_free_rate: Risk-free rate (annualized)
        volatility: Implied volatility (annualized)
        quantity: Number of condors
        dividend_yield: Dividend yield (continuous)

    Returns:
        MultiLegGreeks strategy
    """
    if not (put_lower_strike < put_upper_strike < call_lower_strike < call_upper_strike):
        raise ValueError("Strikes must be in ascending order")

    legs = [
        # Put spread (short)
        OptionLeg(
            option_type="put",
            position="long",
            quantity=quantity,
            strike=put_lower_strike,
            expiration=expiration,
            underlying_price=underlying_price,
            risk_free_rate=risk_free_rate,
            volatility=volatility,
            dividend_yield=dividend_yield,
        ),
        OptionLeg(
            option_type="put",
            position="short",
            quantity=quantity,
            strike=put_upper_strike,
            expiration=expiration,
            underlying_price=underlying_price,
            risk_free_rate=risk_free_rate,
            volatility=volatility,
            dividend_yield=dividend_yield,
        ),
        # Call spread (short)
        OptionLeg(
            option_type="call",
            position="short",
            quantity=quantity,
            strike=call_lower_strike,
            expiration=expiration,
            underlying_price=underlying_price,
            risk_free_rate=risk_free_rate,
            volatility=volatility,
            dividend_yield=dividend_yield,
        ),
        OptionLeg(
            option_type="call",
            position="long",
            quantity=quantity,
            strike=call_upper_strike,
            expiration=expiration,
            underlying_price=underlying_price,
            risk_free_rate=risk_free_rate,
            volatility=volatility,
            dividend_yield=dividend_yield,
        ),
    ]

    return MultiLegGreeks(legs=legs, name="Iron Condor")


def straddle(
    underlying_price: float,
    strike: float,
    expiration: float,
    risk_free_rate: float,
    volatility: float,
    position: Literal["long", "short"] = "long",
    quantity: float = 1.0,
    dividend_yield: float = 0.0,
) -> MultiLegGreeks:
    """Create a straddle strategy.

    Long/Short call + Long/Short put at same strike.
    Profits from volatility (long) or lack thereof (short).

    Args:
        underlying_price: Current underlying price
        strike: Strike price (same for call and put)
        expiration: Time to expiration (years)
        risk_free_rate: Risk-free rate (annualized)
        volatility: Implied volatility (annualized)
        position: "long" or "short"
        quantity: Number of straddles
        dividend_yield: Dividend yield (continuous)

    Returns:
        MultiLegGreeks strategy
    """
    legs = [
        OptionLeg(
            option_type="call",
            position=position,
            quantity=quantity,
            strike=strike,
            expiration=expiration,
            underlying_price=underlying_price,
            risk_free_rate=risk_free_rate,
            volatility=volatility,
            dividend_yield=dividend_yield,
        ),
        OptionLeg(
            option_type="put",
            position=position,
            quantity=quantity,
            strike=strike,
            expiration=expiration,
            underlying_price=underlying_price,
            risk_free_rate=risk_free_rate,
            volatility=volatility,
            dividend_yield=dividend_yield,
        ),
    ]

    name = f"{'Long' if position == 'long' else 'Short'} Straddle"
    return MultiLegGreeks(legs=legs, name=name)
