"""Tests for multi-leg strategy Greeks."""

import pytest

from research.greeks.multi_leg import (
    MultiLegGreeks,
    OptionLeg,
    bull_call_spread,
    iron_condor,
    straddle,
)


class TestOptionLeg:
    """Test individual option leg."""

    def test_leg_creation(self) -> None:
        """Test creating an option leg."""
        leg = OptionLeg(
            option_type="call",
            position="long",
            quantity=1.0,
            strike=100.0,
            expiration=1.0,
            underlying_price=100.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        assert leg.option_type == "call"
        assert leg.position == "long"
        assert leg.direction == 1

    def test_short_leg_direction(self) -> None:
        """Test short position has negative direction."""
        leg = OptionLeg(
            option_type="call",
            position="short",
            quantity=1.0,
            strike=100.0,
            expiration=1.0,
            underlying_price=100.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        assert leg.direction == -1

    def test_long_call_greeks(self) -> None:
        """Test Greeks for long call position."""
        leg = OptionLeg(
            option_type="call",
            position="long",
            quantity=1.0,
            strike=100.0,
            expiration=1.0,
            underlying_price=100.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        greeks = leg.compute_greeks()

        # Long call should have positive delta, gamma, vega
        assert greeks.delta > 0
        assert greeks.gamma > 0
        assert greeks.vega > 0
        assert greeks.theta < 0  # Time decay

    def test_short_call_greeks(self) -> None:
        """Test Greeks for short call position."""
        leg = OptionLeg(
            option_type="call",
            position="short",
            quantity=1.0,
            strike=100.0,
            expiration=1.0,
            underlying_price=100.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        greeks = leg.compute_greeks()

        # Short call should have negative delta, gamma, vega
        assert greeks.delta < 0
        assert greeks.gamma < 0
        assert greeks.vega < 0
        assert greeks.theta > 0  # Benefits from time decay

    def test_quantity_scaling(self) -> None:
        """Test that Greeks scale with quantity."""
        leg_1x = OptionLeg(
            option_type="call",
            position="long",
            quantity=1.0,
            strike=100.0,
            expiration=1.0,
            underlying_price=100.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        leg_2x = OptionLeg(
            option_type="call",
            position="long",
            quantity=2.0,
            strike=100.0,
            expiration=1.0,
            underlying_price=100.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        greeks_1x = leg_1x.compute_greeks()
        greeks_2x = leg_2x.compute_greeks()

        # 2x quantity should give 2x Greeks
        assert abs(greeks_2x.delta - 2 * greeks_1x.delta) < 1e-6
        assert abs(greeks_2x.gamma - 2 * greeks_1x.gamma) < 1e-6
        assert abs(greeks_2x.vega - 2 * greeks_1x.vega) < 1e-6

    def test_second_order_greeks(self) -> None:
        """Test computing second-order Greeks."""
        leg = OptionLeg(
            option_type="call",
            position="long",
            quantity=1.0,
            strike=100.0,
            expiration=1.0,
            underlying_price=100.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        greeks = leg.compute_greeks(include_second_order=True)

        assert greeks.vanna is not None
        assert greeks.charm is not None
        assert greeks.vomma is not None

    def test_invalid_quantity(self) -> None:
        """Test error on invalid quantity."""
        with pytest.raises(ValueError, match="Quantity must be positive"):
            OptionLeg(
                option_type="call",
                position="long",
                quantity=-1.0,
                strike=100.0,
                expiration=1.0,
                underlying_price=100.0,
                risk_free_rate=0.05,
                volatility=0.25,
            )


class TestMultiLegGreeks:
    """Test multi-leg strategy aggregation."""

    def test_single_leg_strategy(self) -> None:
        """Test strategy with single leg."""
        leg = OptionLeg(
            option_type="call",
            position="long",
            quantity=1.0,
            strike=100.0,
            expiration=1.0,
            underlying_price=100.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        strategy = MultiLegGreeks(legs=[leg], name="Long Call")
        greeks = strategy.compute_greeks()

        # Should match single leg Greeks
        leg_greeks = leg.compute_greeks()
        assert abs(greeks.delta - leg_greeks.delta) < 1e-10
        assert abs(greeks.gamma - leg_greeks.gamma) < 1e-10

    def test_long_short_cancellation(self) -> None:
        """Test that long and short positions partially cancel."""
        long_leg = OptionLeg(
            option_type="call",
            position="long",
            quantity=1.0,
            strike=100.0,
            expiration=1.0,
            underlying_price=100.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        short_leg = OptionLeg(
            option_type="call",
            position="short",
            quantity=1.0,
            strike=105.0,  # Different strike
            expiration=1.0,
            underlying_price=100.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        strategy = MultiLegGreeks(legs=[long_leg, short_leg])
        greeks = strategy.compute_greeks()

        # Net delta should be less than single long call
        long_greeks = long_leg.compute_greeks()
        assert abs(greeks.delta) < abs(long_greeks.delta)

    def test_get_individual_leg_greeks(self) -> None:
        """Test retrieving individual leg Greeks."""
        leg1 = OptionLeg(
            option_type="call",
            position="long",
            quantity=1.0,
            strike=100.0,
            expiration=1.0,
            underlying_price=100.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        leg2 = OptionLeg(
            option_type="call",
            position="short",
            quantity=1.0,
            strike=105.0,
            expiration=1.0,
            underlying_price=100.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        strategy = MultiLegGreeks(legs=[leg1, leg2])
        leg_greeks = strategy.get_leg_greeks()

        assert len(leg_greeks) == 2
        assert leg_greeks[0].delta > 0  # Long call
        assert leg_greeks[1].delta < 0  # Short call

    def test_net_premium(self) -> None:
        """Test net premium calculation."""
        leg1 = OptionLeg(
            option_type="call",
            position="long",
            quantity=1.0,
            strike=100.0,
            expiration=1.0,
            underlying_price=100.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        leg2 = OptionLeg(
            option_type="call",
            position="short",
            quantity=1.0,
            strike=105.0,
            expiration=1.0,
            underlying_price=100.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        strategy = MultiLegGreeks(legs=[leg1, leg2])
        net_premium = strategy.net_premium()

        # Bull call spread should be a debit (positive net premium paid)
        assert net_premium > 0

    def test_empty_strategy(self) -> None:
        """Test error on empty strategy."""
        with pytest.raises(ValueError, match="at least one leg"):
            MultiLegGreeks(legs=[], name="Empty")


class TestBullCallSpread:
    """Test bull call spread builder."""

    def test_bull_call_spread_creation(self) -> None:
        """Test creating bull call spread."""
        strategy = bull_call_spread(
            underlying_price=100.0,
            lower_strike=95.0,
            upper_strike=105.0,
            expiration=1.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        assert strategy.name == "Bull Call Spread"
        assert len(strategy.legs) == 2

    def test_bull_call_spread_greeks(self) -> None:
        """Test Greeks for bull call spread."""
        strategy = bull_call_spread(
            underlying_price=100.0,
            lower_strike=95.0,
            upper_strike=105.0,
            expiration=1.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        greeks = strategy.compute_greeks()

        # Bull call spread should have:
        # - Positive delta (bullish)
        # - Limited delta (capped by short call)
        assert greeks.delta > 0
        assert greeks.delta < 1.0  # Limited upside

        # Net premium should be positive (debit spread)
        assert strategy.net_premium() > 0

    def test_bull_call_spread_invalid_strikes(self) -> None:
        """Test error on invalid strike order."""
        with pytest.raises(ValueError, match="Lower strike must be less than upper strike"):
            bull_call_spread(
                underlying_price=100.0,
                lower_strike=105.0,  # Invalid: higher than upper
                upper_strike=95.0,
                expiration=1.0,
                risk_free_rate=0.05,
                volatility=0.25,
            )


class TestIronCondor:
    """Test iron condor builder."""

    def test_iron_condor_creation(self) -> None:
        """Test creating iron condor."""
        strategy = iron_condor(
            underlying_price=100.0,
            put_lower_strike=85.0,
            put_upper_strike=90.0,
            call_lower_strike=110.0,
            call_upper_strike=115.0,
            expiration=1.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        assert strategy.name == "Iron Condor"
        assert len(strategy.legs) == 4

    def test_iron_condor_greeks(self) -> None:
        """Test Greeks for iron condor."""
        strategy = iron_condor(
            underlying_price=100.0,
            put_lower_strike=85.0,
            put_upper_strike=90.0,
            call_lower_strike=110.0,
            call_upper_strike=115.0,
            expiration=1.0,
            risk_free_rate=0.05,
            volatility=0.25,
        )

        greeks = strategy.compute_greeks()

        # Iron condor should have:
        # - Near-zero delta (neutral)
        # - Negative gamma (short volatility)
        # - Negative vega (profits from low vol)
        # - Positive theta (time decay benefit)
        assert abs(greeks.delta) < 0.2  # Nearly delta neutral
        assert greeks.gamma < 0  # Short gamma
        assert greeks.vega < 0  # Short vega
        assert greeks.theta > 0  # Positive theta

        # Net premium should be negative (credit spread)
        assert strategy.net_premium() < 0

    def test_iron_condor_invalid_strikes(self) -> None:
        """Test error on invalid strike ordering."""
        with pytest.raises(ValueError, match="Strikes must be in ascending order"):
            iron_condor(
                underlying_price=100.0,
                put_lower_strike=90.0,  # Invalid ordering
                put_upper_strike=85.0,
                call_lower_strike=110.0,
                call_upper_strike=115.0,
                expiration=1.0,
                risk_free_rate=0.05,
                volatility=0.25,
            )


class TestStraddle:
    """Test straddle builder."""

    def test_long_straddle_creation(self) -> None:
        """Test creating long straddle."""
        strategy = straddle(
            underlying_price=100.0,
            strike=100.0,
            expiration=1.0,
            risk_free_rate=0.05,
            volatility=0.25,
            position="long",
        )

        assert strategy.name == "Long Straddle"
        assert len(strategy.legs) == 2

    def test_long_straddle_greeks(self) -> None:
        """Test Greeks for long straddle."""
        strategy = straddle(
            underlying_price=100.0,
            strike=100.0,
            expiration=1.0,
            risk_free_rate=0.05,
            volatility=0.25,
            position="long",
        )

        greeks = strategy.compute_greeks()

        # Long ATM straddle should have:
        # - Near-zero delta (but not exactly due to interest rate effects)
        # - Positive gamma (benefits from movement)
        # - Positive vega (benefits from volatility increase)
        # - Negative theta (time decay hurts)
        assert abs(greeks.delta) < 0.3  # Nearly delta neutral (allowing for r != 0)
        assert greeks.gamma > 0  # Long gamma
        assert greeks.vega > 0  # Long vega
        assert greeks.theta < 0  # Negative theta

    def test_short_straddle_greeks(self) -> None:
        """Test Greeks for short straddle."""
        strategy = straddle(
            underlying_price=100.0,
            strike=100.0,
            expiration=1.0,
            risk_free_rate=0.05,
            volatility=0.25,
            position="short",
        )

        greeks = strategy.compute_greeks()

        # Short ATM straddle should have opposite signs
        assert abs(greeks.delta) < 0.3  # Nearly delta neutral (allowing for r != 0)
        assert greeks.gamma < 0  # Short gamma
        assert greeks.vega < 0  # Short vega
        assert greeks.theta > 0  # Positive theta
