"""Tests for portfolio Greeks."""


from research.greeks.multi_leg import bull_call_spread, straddle
from research.greeks.portfolio import PortfolioGreeks


class TestPortfolioGreeks:
    """Test portfolio-level Greeks aggregation."""

    def test_empty_portfolio(self) -> None:
        """Test empty portfolio initialization."""
        portfolio = PortfolioGreeks(name="Test Portfolio")

        greeks = portfolio.compute_total_greeks()

        assert greeks.price == 0.0
        assert greeks.delta == 0.0
        assert greeks.gamma == 0.0

    def test_underlying_position_only(self) -> None:
        """Test portfolio with only underlying position."""
        portfolio = PortfolioGreeks()
        portfolio.add_underlying(symbol="AAPL", quantity=100, price=150.0)

        greeks = portfolio.compute_total_greeks()

        # Underlying contributes to delta and market value only
        assert greeks.price == 15000.0  # 100 shares * $150
        assert greeks.delta == 100.0  # 100 shares
        assert greeks.gamma == 0.0  # No gamma from stock
        assert greeks.vega == 0.0  # No vega from stock

    def test_short_underlying_position(self) -> None:
        """Test portfolio with short underlying position."""
        portfolio = PortfolioGreeks()
        portfolio.add_underlying(symbol="AAPL", quantity=-100, price=150.0)

        greeks = portfolio.compute_total_greeks()

        assert greeks.price == -15000.0  # Short position
        assert greeks.delta == -100.0  # Negative delta

    def test_single_option_position(self) -> None:
        """Test portfolio with single option."""
        portfolio = PortfolioGreeks()
        portfolio.add_option(
            symbol="AAPL",
            option_type="call",
            position="long",
            quantity=1.0,
            strike=150.0,
            expiration=1.0,
            underlying_price=150.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        greeks = portfolio.compute_total_greeks()

        # Long call should have positive delta, gamma, vega
        assert greeks.delta > 0
        assert greeks.gamma > 0
        assert greeks.vega > 0
        assert greeks.theta < 0

    def test_covered_call(self) -> None:
        """Test covered call strategy (long stock + short call)."""
        portfolio = PortfolioGreeks()

        # Long 100 shares
        portfolio.add_underlying(symbol="AAPL", quantity=100, price=150.0)

        # Short 1 call contract (100 shares)
        portfolio.add_option(
            symbol="AAPL",
            option_type="call",
            position="short",
            quantity=1.0,
            strike=155.0,
            expiration=1.0,
            underlying_price=150.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        greeks = portfolio.compute_total_greeks()

        # Covered call should have:
        # - Positive delta (but less than 100)
        # - Negative gamma (from short call)
        # - Negative vega (from short call)
        # - Positive theta (from short call)
        assert 0 < greeks.delta < 100
        assert greeks.gamma < 0
        assert greeks.vega < 0
        assert greeks.theta > 0

    def test_delta_neutral_portfolio(self) -> None:
        """Test calculating delta neutral hedge."""
        portfolio = PortfolioGreeks()

        # Long call with delta ~0.6 (ATM call with positive interest rate)
        portfolio.add_option(
            symbol="AAPL",
            option_type="call",
            position="long",
            quantity=10.0,  # 10 contracts
            strike=150.0,
            expiration=1.0,
            underlying_price=150.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        delta_hedge = portfolio.delta_neutral()

        # Should suggest selling shares to hedge delta
        # Each contract has delta ~0.6, so 10 contracts need ~6 shares hedged
        assert delta_hedge < 0  # Need to sell
        assert abs(delta_hedge) > 2  # Meaningful hedge amount

    def test_multiple_symbols(self) -> None:
        """Test portfolio with multiple underlying symbols."""
        portfolio = PortfolioGreeks()

        # AAPL position
        portfolio.add_option(
            symbol="AAPL",
            option_type="call",
            position="long",
            quantity=1.0,
            strike=150.0,
            expiration=1.0,
            underlying_price=150.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        # MSFT position
        portfolio.add_option(
            symbol="MSFT",
            option_type="put",
            position="long",
            quantity=1.0,
            strike=300.0,
            expiration=1.0,
            underlying_price=300.0,
            risk_free_rate=0.05,
            volatility=0.20,
        )

        greeks_by_symbol = portfolio.compute_greeks_by_symbol()

        assert "AAPL" in greeks_by_symbol
        assert "MSFT" in greeks_by_symbol

        # AAPL long call should have positive delta
        assert greeks_by_symbol["AAPL"].delta > 0

        # MSFT long put should have negative delta
        assert greeks_by_symbol["MSFT"].delta < 0

    def test_strategy_position(self) -> None:
        """Test adding multi-leg strategy to portfolio."""
        portfolio = PortfolioGreeks()

        strategy = bull_call_spread(
            underlying_price=150.0,
            lower_strike=145.0,
            upper_strike=155.0,
            expiration=1.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        portfolio.add_strategy(symbol="AAPL", strategy=strategy)

        greeks = portfolio.compute_total_greeks()

        # Bull call spread should have positive but limited delta
        assert 0 < greeks.delta < 1.0

    def test_multiple_strategies(self) -> None:
        """Test portfolio with multiple strategies."""
        portfolio = PortfolioGreeks()

        # Bull call spread on AAPL
        bull_spread = bull_call_spread(
            underlying_price=150.0,
            lower_strike=145.0,
            upper_strike=155.0,
            expiration=1.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )
        portfolio.add_strategy(symbol="AAPL", strategy=bull_spread)

        # Long straddle on MSFT
        straddle_strategy = straddle(
            underlying_price=300.0,
            strike=300.0,
            expiration=1.0,
            risk_free_rate=0.05,
            volatility=0.20,
            position="long",
        )
        portfolio.add_strategy(symbol="MSFT", strategy=straddle_strategy)

        greeks = portfolio.compute_total_greeks()

        # Should aggregate Greeks from both strategies
        assert greeks.gamma > 0  # Long straddle adds positive gamma
        assert greeks.vega > 0  # Long straddle adds positive vega

    def test_portfolio_summary(self) -> None:
        """Test portfolio summary generation."""
        portfolio = PortfolioGreeks()

        portfolio.add_underlying(symbol="AAPL", quantity=100, price=150.0)

        portfolio.add_option(
            symbol="AAPL",
            option_type="call",
            position="short",
            quantity=1.0,
            strike=155.0,
            expiration=1.0,
            underlying_price=150.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        summary = portfolio.summary()

        # Check all required fields
        assert "total_value" in summary
        assert "net_delta" in summary
        assert "net_gamma" in summary
        assert "net_theta_daily" in summary
        assert "net_vega" in summary
        assert "net_rho" in summary
        assert "delta_neutral_shares" in summary
        assert "position_count" in summary

        # Should have 2 positions
        assert summary["position_count"] == 2

    def test_portfolio_summary_with_second_order(self) -> None:
        """Test portfolio summary with second-order Greeks."""
        portfolio = PortfolioGreeks()

        portfolio.add_option(
            symbol="AAPL",
            option_type="call",
            position="long",
            quantity=1.0,
            strike=150.0,
            expiration=1.0,
            underlying_price=150.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        summary = portfolio.summary(include_second_order=True)

        # Check second-order Greeks in summary
        assert "net_vanna" in summary
        assert "net_charm" in summary
        assert "net_vomma" in summary

    def test_complex_portfolio(self) -> None:
        """Test complex portfolio with mixed positions."""
        portfolio = PortfolioGreeks()

        # Underlying positions
        portfolio.add_underlying(symbol="AAPL", quantity=200, price=150.0)
        portfolio.add_underlying(symbol="MSFT", quantity=-100, price=300.0)

        # Individual options
        portfolio.add_option(
            symbol="AAPL",
            option_type="call",
            position="short",
            quantity=2.0,
            strike=155.0,
            expiration=1.0,
            underlying_price=150.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        portfolio.add_option(
            symbol="MSFT",
            option_type="put",
            position="long",
            quantity=1.0,
            strike=295.0,
            expiration=0.5,
            underlying_price=300.0,
            risk_free_rate=0.05,
            volatility=0.20,
        )

        # Strategy
        strategy = straddle(
            underlying_price=150.0,
            strike=150.0,
            expiration=1.0,
            risk_free_rate=0.05,
            volatility=0.25,
            position="long",
        )
        portfolio.add_strategy(symbol="AAPL", strategy=strategy)

        # Total Greeks
        total_greeks = portfolio.compute_total_greeks()

        # Should have meaningful values
        assert total_greeks.price != 0
        assert total_greeks.delta != 0

        # Greeks by symbol
        by_symbol = portfolio.compute_greeks_by_symbol()

        assert len(by_symbol) == 2  # AAPL and MSFT
        assert "AAPL" in by_symbol
        assert "MSFT" in by_symbol

    def test_hedged_portfolio(self) -> None:
        """Test portfolio with hedged positions."""
        portfolio = PortfolioGreeks()

        # Long straddle (long volatility)
        long_straddle = straddle(
            underlying_price=100.0,
            strike=100.0,
            expiration=1.0,
            risk_free_rate=0.05,
            volatility=0.25,
            position="long",
            quantity=2.0,
        )
        portfolio.add_strategy(symbol="SPY", strategy=long_straddle)

        # Short straddle (short volatility) - partial hedge
        short_straddle = straddle(
            underlying_price=100.0,
            strike=100.0,
            expiration=1.0,
            risk_free_rate=0.05,
            volatility=0.25,
            position="short",
            quantity=1.0,
        )
        portfolio.add_strategy(symbol="SPY", strategy=short_straddle)

        greeks = portfolio.compute_total_greeks()

        # Net position should be reduced but not zero
        # (2 long - 1 short = 1 net long straddle)
        assert greeks.gamma > 0  # Still positive but reduced
        assert greeks.vega > 0  # Still positive but reduced
