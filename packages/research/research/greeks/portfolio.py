"""Portfolio Greeks Computation

Aggregates Greeks across an entire portfolio of options and underlying positions.
Provides portfolio-level risk metrics and exposure analysis.

Portfolio Greeks account for:
- Multiple option positions (calls, puts, multi-leg strategies)
- Underlying stock/ETF positions
- Different expiration dates
- Different underlying assets

Key risk metrics:
- Net Delta: Directional exposure (equivalent shares)
- Net Gamma: Delta convexity (delta sensitivity)
- Net Theta: Time decay (P&L per day)
- Net Vega: Volatility exposure (P&L per 1% vol change)
- Net Rho: Interest rate exposure (P&L per 1% rate change)

References:
- Taleb, N. N. (1997). Dynamic Hedging: Managing Vanilla and Exotic Options
- Gatheral, J. (2006). The Volatility Surface: A Practitioner's Guide
"""

from dataclasses import dataclass, field
from typing import Literal

from research.greeks.black_scholes import BlackScholesGreeks
from research.greeks.multi_leg import MultiLegGreeks, OptionLeg


@dataclass
class UnderlyingPosition:
    """Position in the underlying asset (stock, ETF, etc.).

    Attributes:
        symbol: Ticker symbol
        quantity: Number of shares (positive for long, negative for short)
        price: Current price per share
    """

    symbol: str
    quantity: float
    price: float

    @property
    def market_value(self) -> float:
        """Market value of position (positive for long, negative for short)."""
        return self.quantity * self.price

    @property
    def delta(self) -> float:
        """Delta equivalent (1.0 per share for underlying)."""
        return self.quantity


@dataclass
class OptionPosition:
    """Single option position in the portfolio.

    Attributes:
        symbol: Underlying ticker symbol
        leg: Option leg definition
    """

    symbol: str
    leg: OptionLeg

    def compute_greeks(self, include_second_order: bool = False) -> BlackScholesGreeks:
        """Compute Greeks for this position.

        Args:
            include_second_order: If True, compute vanna, charm, and vomma

        Returns:
            BlackScholesGreeks for this position
        """
        return self.leg.compute_greeks(include_second_order=include_second_order)


@dataclass
class StrategyPosition:
    """Multi-leg strategy position in the portfolio.

    Attributes:
        symbol: Underlying ticker symbol
        strategy: Multi-leg strategy definition
    """

    symbol: str
    strategy: MultiLegGreeks

    def compute_greeks(self, include_second_order: bool = False) -> BlackScholesGreeks:
        """Compute aggregate Greeks for this strategy.

        Args:
            include_second_order: If True, compute vanna, charm, and vomma

        Returns:
            Aggregated BlackScholesGreeks for the strategy
        """
        return self.strategy.compute_greeks(include_second_order=include_second_order)


@dataclass
class PortfolioGreeks:
    """Portfolio-level Greeks aggregator.

    Manages multiple positions across different underlying assets and
    computes portfolio-wide risk metrics.

    Attributes:
        underlying_positions: List of underlying asset positions
        option_positions: List of individual option positions
        strategy_positions: List of multi-leg strategy positions
        name: Portfolio identifier
    """

    underlying_positions: list[UnderlyingPosition] = field(default_factory=list)
    option_positions: list[OptionPosition] = field(default_factory=list)
    strategy_positions: list[StrategyPosition] = field(default_factory=list)
    name: str = "Portfolio"

    def add_underlying(self, symbol: str, quantity: float, price: float) -> None:
        """Add underlying position to portfolio.

        Args:
            symbol: Ticker symbol
            quantity: Number of shares (positive for long, negative for short)
            price: Current price per share
        """
        self.underlying_positions.append(
            UnderlyingPosition(symbol=symbol, quantity=quantity, price=price)
        )

    def add_option(
        self,
        symbol: str,
        option_type: Literal["call", "put"],
        position: Literal["long", "short"],
        quantity: float,
        strike: float,
        expiration: float,
        underlying_price: float,
        risk_free_rate: float,
        volatility: float,
        dividend_yield: float = 0.0,
    ) -> None:
        """Add option position to portfolio.

        Args:
            symbol: Underlying ticker symbol
            option_type: "call" or "put"
            position: "long" or "short"
            quantity: Number of contracts
            strike: Strike price
            expiration: Time to expiration (years)
            underlying_price: Current underlying price
            risk_free_rate: Risk-free rate (annualized)
            volatility: Implied volatility (annualized)
            dividend_yield: Dividend yield (continuous)
        """
        leg = OptionLeg(
            option_type=option_type,
            position=position,
            quantity=quantity,
            strike=strike,
            expiration=expiration,
            underlying_price=underlying_price,
            risk_free_rate=risk_free_rate,
            volatility=volatility,
            dividend_yield=dividend_yield,
        )
        self.option_positions.append(OptionPosition(symbol=symbol, leg=leg))

    def add_strategy(self, symbol: str, strategy: MultiLegGreeks) -> None:
        """Add multi-leg strategy to portfolio.

        Args:
            symbol: Underlying ticker symbol
            strategy: Multi-leg strategy definition
        """
        self.strategy_positions.append(StrategyPosition(symbol=symbol, strategy=strategy))

    def compute_total_greeks(self, include_second_order: bool = False) -> BlackScholesGreeks:
        """Compute portfolio-wide aggregate Greeks.

        Sums Greeks across all positions:
        - Underlying positions contribute only to delta
        - Option positions contribute to all Greeks
        - Strategy positions contribute aggregated Greeks

        Args:
            include_second_order: If True, compute vanna, charm, and vomma

        Returns:
            Total portfolio Greeks
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

        # Underlying positions contribute to delta and market value
        for position in self.underlying_positions:
            total_price += position.market_value
            total_delta += position.delta

        # Option positions
        for position in self.option_positions:
            greeks = position.compute_greeks(include_second_order=include_second_order)
            total_price += greeks.price
            total_delta += greeks.delta
            total_gamma += greeks.gamma
            total_theta += greeks.theta
            total_vega += greeks.vega
            total_rho += greeks.rho

            if include_second_order:
                if greeks.vanna is not None:
                    total_vanna += greeks.vanna
                if greeks.charm is not None:
                    total_charm += greeks.charm
                if greeks.vomma is not None:
                    total_vomma += greeks.vomma

        # Strategy positions
        for position in self.strategy_positions:
            greeks = position.compute_greeks(include_second_order=include_second_order)
            total_price += greeks.price
            total_delta += greeks.delta
            total_gamma += greeks.gamma
            total_theta += greeks.theta
            total_vega += greeks.vega
            total_rho += greeks.rho

            if include_second_order:
                if greeks.vanna is not None:
                    total_vanna += greeks.vanna
                if greeks.charm is not None:
                    total_charm += greeks.charm
                if greeks.vomma is not None:
                    total_vomma += greeks.vomma

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

    def compute_greeks_by_symbol(
        self, include_second_order: bool = False
    ) -> dict[str, BlackScholesGreeks]:
        """Compute Greeks grouped by underlying symbol.

        Useful for analyzing exposure to individual assets.

        Args:
            include_second_order: If True, compute vanna, charm, and vomma

        Returns:
            Dictionary mapping symbol to aggregated Greeks
        """
        symbol_greeks: dict[str, BlackScholesGreeks] = {}

        # Process underlying positions
        for position in self.underlying_positions:
            if position.symbol not in symbol_greeks:
                symbol_greeks[position.symbol] = BlackScholesGreeks(
                    price=0.0,
                    delta=0.0,
                    gamma=0.0,
                    theta=0.0,
                    vega=0.0,
                    rho=0.0,
                    vanna=0.0 if include_second_order else None,
                    charm=0.0 if include_second_order else None,
                    vomma=0.0 if include_second_order else None,
                )

            symbol_greeks[position.symbol] = BlackScholesGreeks(
                price=symbol_greeks[position.symbol].price + position.market_value,
                delta=symbol_greeks[position.symbol].delta + position.delta,
                gamma=symbol_greeks[position.symbol].gamma,
                theta=symbol_greeks[position.symbol].theta,
                vega=symbol_greeks[position.symbol].vega,
                rho=symbol_greeks[position.symbol].rho,
                vanna=symbol_greeks[position.symbol].vanna,
                charm=symbol_greeks[position.symbol].charm,
                vomma=symbol_greeks[position.symbol].vomma,
            )

        # Process option positions
        for position in self.option_positions:
            if position.symbol not in symbol_greeks:
                symbol_greeks[position.symbol] = BlackScholesGreeks(
                    price=0.0,
                    delta=0.0,
                    gamma=0.0,
                    theta=0.0,
                    vega=0.0,
                    rho=0.0,
                    vanna=0.0 if include_second_order else None,
                    charm=0.0 if include_second_order else None,
                    vomma=0.0 if include_second_order else None,
                )

            greeks = position.compute_greeks(include_second_order=include_second_order)
            current = symbol_greeks[position.symbol]

            symbol_greeks[position.symbol] = BlackScholesGreeks(
                price=current.price + greeks.price,
                delta=current.delta + greeks.delta,
                gamma=current.gamma + greeks.gamma,
                theta=current.theta + greeks.theta,
                vega=current.vega + greeks.vega,
                rho=current.rho + greeks.rho,
                vanna=(current.vanna or 0.0) + (greeks.vanna or 0.0)
                if include_second_order
                else None,
                charm=(current.charm or 0.0) + (greeks.charm or 0.0)
                if include_second_order
                else None,
                vomma=(current.vomma or 0.0) + (greeks.vomma or 0.0)
                if include_second_order
                else None,
            )

        # Process strategy positions
        for position in self.strategy_positions:
            if position.symbol not in symbol_greeks:
                symbol_greeks[position.symbol] = BlackScholesGreeks(
                    price=0.0,
                    delta=0.0,
                    gamma=0.0,
                    theta=0.0,
                    vega=0.0,
                    rho=0.0,
                    vanna=0.0 if include_second_order else None,
                    charm=0.0 if include_second_order else None,
                    vomma=0.0 if include_second_order else None,
                )

            greeks = position.compute_greeks(include_second_order=include_second_order)
            current = symbol_greeks[position.symbol]

            symbol_greeks[position.symbol] = BlackScholesGreeks(
                price=current.price + greeks.price,
                delta=current.delta + greeks.delta,
                gamma=current.gamma + greeks.gamma,
                theta=current.theta + greeks.theta,
                vega=current.vega + greeks.vega,
                rho=current.rho + greeks.rho,
                vanna=(current.vanna or 0.0) + (greeks.vanna or 0.0)
                if include_second_order
                else None,
                charm=(current.charm or 0.0) + (greeks.charm or 0.0)
                if include_second_order
                else None,
                vomma=(current.vomma or 0.0) + (greeks.vomma or 0.0)
                if include_second_order
                else None,
            )

        return symbol_greeks

    def delta_neutral(self) -> float:
        """Calculate number of underlying shares needed for delta neutrality.

        Returns:
            Shares to buy/sell to achieve delta neutrality (positive = buy, negative = sell)
        """
        total_greeks = self.compute_total_greeks()
        return -total_greeks.delta

    def summary(self, include_second_order: bool = False) -> dict[str, float]:
        """Generate portfolio summary with key metrics.

        Args:
            include_second_order: If True, include vanna, charm, and vomma

        Returns:
            Dictionary of portfolio metrics
        """
        greeks = self.compute_total_greeks(include_second_order=include_second_order)

        summary_dict = {
            "total_value": greeks.price,
            "net_delta": greeks.delta,
            "net_gamma": greeks.gamma,
            "net_theta_daily": greeks.theta,
            "net_vega": greeks.vega,
            "net_rho": greeks.rho,
            "delta_neutral_shares": self.delta_neutral(),
            "position_count": (
                len(self.underlying_positions)
                + len(self.option_positions)
                + len(self.strategy_positions)
            ),
        }

        if include_second_order:
            summary_dict["net_vanna"] = greeks.vanna or 0.0
            summary_dict["net_charm"] = greeks.charm or 0.0
            summary_dict["net_vomma"] = greeks.vomma or 0.0

        return summary_dict
