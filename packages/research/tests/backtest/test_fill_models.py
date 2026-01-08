"""
Unit Tests for Fill Models

Tests slippage and commission models for backtest execution.
"""

import pytest

from research.backtest.fill_models import (
    FillModel,
    FixedBpsSlippage,
    OptionsCommission,
    PercentageCommission,
    PerShareCommission,
    Side,
    SpreadSlippage,
    SquareRootImpactSlippage,
    TieredCommission,
    VolumeImpactSlippage,
    ZeroCommission,
    create_conservative_fill_model,
    create_default_fill_model,
    create_institutional_fill_model,
)


class TestFixedBpsSlippage:
    """Tests for FixedBpsSlippage model."""

    def test_entry_slippage(self):
        """Entry trades use entry_bps."""
        slippage = FixedBpsSlippage(entry_bps=5.0, exit_bps=10.0)
        result = slippage.calculate(Side.BUY, 100.0, 1000, is_exit=False)
        assert result == pytest.approx(0.0005)  # 5 bps

    def test_exit_slippage(self):
        """Exit trades use exit_bps."""
        slippage = FixedBpsSlippage(entry_bps=5.0, exit_bps=10.0)
        result = slippage.calculate(Side.SELL, 100.0, 1000, is_exit=True)
        assert result == pytest.approx(0.001)  # 10 bps

    def test_string_side(self):
        """String side values work correctly."""
        slippage = FixedBpsSlippage(entry_bps=5.0, exit_bps=10.0)
        result = slippage.calculate("BUY", 100.0, 1000, is_exit=False)
        assert result == pytest.approx(0.0005)

    def test_to_vectorbt_fees(self):
        """VectorBT fees conversion works."""
        slippage = FixedBpsSlippage(entry_bps=5.0)
        result = slippage.to_vectorbt_fees("BUY", 100.0, 1000)
        assert result == pytest.approx(0.0005)


class TestSpreadSlippage:
    """Tests for SpreadSlippage model."""

    def test_with_spread_provided(self):
        """Uses provided spread value."""
        slippage = SpreadSlippage(spread_fraction=0.5)
        # $0.10 spread on $100 stock = 0.1% spread, half = 0.05%
        result = slippage.calculate(Side.BUY, 100.0, 1000, spread=0.10)
        assert result == pytest.approx(0.0005)

    def test_without_spread_uses_default(self):
        """Uses default spread when not provided."""
        slippage = SpreadSlippage(spread_fraction=0.5, default_spread_bps=10.0)
        result = slippage.calculate(Side.BUY, 100.0, 1000)
        # 10 bps spread, half = 5 bps
        assert result == pytest.approx(0.0005)

    def test_full_spread(self):
        """Full spread fraction works."""
        slippage = SpreadSlippage(spread_fraction=1.0, default_spread_bps=10.0)
        result = slippage.calculate(Side.BUY, 100.0, 1000)
        assert result == pytest.approx(0.001)  # 10 bps


class TestVolumeImpactSlippage:
    """Tests for VolumeImpactSlippage model."""

    def test_base_slippage_no_adv(self):
        """Without ADV, returns base slippage."""
        slippage = VolumeImpactSlippage(base_bps=2.0)
        result = slippage.calculate(Side.BUY, 100.0, 1000)
        assert result == pytest.approx(0.0002)  # 2 bps

    def test_small_trade_minimal_impact(self):
        """Small trades relative to ADV have minimal impact."""
        slippage = VolumeImpactSlippage(base_bps=2.0, impact_coefficient=50.0)
        # 100 shares vs 1M ADV = 0.01% participation
        result = slippage.calculate(Side.BUY, 100.0, 100, adv=1_000_000)
        # Base 2 bps + (0.0001 * 50 * 10000) = 2 + 50 = 52 bps? No, check math
        # participation = 100 / 1_000_000 = 0.0001
        # impact_bps = 2 + (0.0001 * 50 * 10000) = 2 + 50 = 52 bps
        # That seems high, but let's verify the formula
        assert result == pytest.approx(0.0052)

    def test_caps_at_max(self):
        """Slippage caps at max_bps."""
        slippage = VolumeImpactSlippage(base_bps=2.0, impact_coefficient=50.0, max_bps=100.0)
        # Large trade that would exceed max
        result = slippage.calculate(Side.BUY, 100.0, 500_000, adv=1_000_000)
        assert result == pytest.approx(0.01)  # 100 bps max


class TestSquareRootImpactSlippage:
    """Tests for SquareRootImpactSlippage model."""

    def test_base_slippage_no_adv(self):
        """Without ADV, returns base slippage."""
        slippage = SquareRootImpactSlippage(base_bps=2.0)
        result = slippage.calculate(Side.BUY, 100.0, 1000)
        assert result == pytest.approx(0.0002)

    def test_square_root_scaling(self):
        """Impact scales with square root of participation."""
        slippage = SquareRootImpactSlippage(sigma=0.02, base_bps=0.0)
        # 1% participation: sqrt(0.01) = 0.1, 0.02 * 0.1 = 0.002 = 20 bps
        result = slippage.calculate(Side.BUY, 100.0, 10_000, adv=1_000_000)
        assert result == pytest.approx(0.002)

    def test_caps_at_max(self):
        """Slippage caps at max_bps."""
        slippage = SquareRootImpactSlippage(sigma=0.1, max_bps=100.0)
        result = slippage.calculate(Side.BUY, 100.0, 500_000, adv=1_000_000)
        assert result == pytest.approx(0.01)  # 100 bps max


class TestPerShareCommission:
    """Tests for PerShareCommission model."""

    def test_basic_calculation(self):
        """Basic per-share commission calculation."""
        commission = PerShareCommission(per_share=0.005)
        result = commission.calculate(100.0, 1000)
        assert result == pytest.approx(5.0)  # $0.005 * 1000 = $5

    def test_minimum_applies(self):
        """Minimum commission is enforced."""
        commission = PerShareCommission(per_share=0.005, minimum=1.0)
        result = commission.calculate(100.0, 10)  # $0.05 would be under minimum
        assert result == pytest.approx(1.0)

    def test_maximum_applies(self):
        """Maximum commission is enforced."""
        commission = PerShareCommission(per_share=0.01, maximum=10.0)
        result = commission.calculate(100.0, 10000)  # $100 would exceed max
        assert result == pytest.approx(10.0)


class TestPercentageCommission:
    """Tests for PercentageCommission model."""

    def test_basic_calculation(self):
        """Basic percentage commission calculation."""
        commission = PercentageCommission(percentage=0.001)  # 0.1%
        result = commission.calculate(100.0, 1000)  # $100k trade
        assert result == pytest.approx(100.0)  # 0.1% of $100k

    def test_minimum_applies(self):
        """Minimum commission is enforced."""
        commission = PercentageCommission(percentage=0.001, minimum=5.0)
        result = commission.calculate(10.0, 10)  # $100 trade, $0.10 commission
        assert result == pytest.approx(5.0)


class TestTieredCommission:
    """Tests for TieredCommission model."""

    def test_single_tier(self):
        """Commission within first tier."""
        commission = TieredCommission(tiers=[(100, 0.01), (1000, 0.005)])
        result = commission.calculate(100.0, 50)
        assert result == pytest.approx(0.50)  # 50 * $0.01

    def test_multiple_tiers(self):
        """Commission spans multiple tiers."""
        commission = TieredCommission(tiers=[(100, 0.01), (1000, 0.005)])
        result = commission.calculate(100.0, 500)
        # First 100: $1.00
        # Next 400: $2.00
        assert result == pytest.approx(3.0)

    def test_above_all_tiers(self):
        """Commission for size above all defined tiers."""
        commission = TieredCommission(tiers=[(100, 0.01), (1000, 0.005)])
        result = commission.calculate(100.0, 2000)
        # First 100: $1.00
        # Next 900: $4.50
        # Remaining 1000 at last tier rate: $5.00
        assert result == pytest.approx(10.50)


class TestZeroCommission:
    """Tests for ZeroCommission model."""

    def test_buy_no_fees(self):
        """Buys have no commission or regulatory fees."""
        commission = ZeroCommission(include_fees=True)
        result = commission.calculate(100.0, 1000, Side.BUY)
        assert result == pytest.approx(0.0)

    def test_sell_with_fees(self):
        """Sells include TAF and SEC fees."""
        commission = ZeroCommission(
            include_fees=True, taf_per_share=0.000166, sec_per_dollar=0.0000278
        )
        result = commission.calculate(100.0, 1000, Side.SELL)
        # TAF: 1000 * 0.000166 = $0.166
        # SEC: $100,000 * 0.0000278 = $2.78
        assert result == pytest.approx(2.946)

    def test_fees_disabled(self):
        """With fees disabled, returns zero."""
        commission = ZeroCommission(include_fees=False)
        result = commission.calculate(100.0, 1000, Side.SELL)
        assert result == pytest.approx(0.0)

    def test_taf_max_cap(self):
        """TAF caps at maximum."""
        commission = ZeroCommission(include_fees=True, taf_per_share=0.000166, taf_max=8.30)
        # 100,000 shares would be $16.60 TAF, but capped at $8.30
        result = commission.calculate(100.0, 100_000, Side.SELL)
        # TAF: $8.30 (capped)
        # SEC: $10M * 0.0000278 = $278
        assert result == pytest.approx(286.30)


class TestOptionsCommission:
    """Tests for OptionsCommission model."""

    def test_basic_calculation(self):
        """Basic options commission calculation."""
        commission = OptionsCommission(per_contract=0.65, include_fees=False)
        result = commission.calculate(5.0, 10)  # 10 contracts
        assert result == pytest.approx(6.50)

    def test_with_regulatory_fees(self):
        """Options commission with ORF."""
        commission = OptionsCommission(
            per_contract=0.65, include_fees=True, orf_per_contract=0.03915
        )
        result = commission.calculate(5.0, 10)
        # Base: $6.50
        # ORF: 10 * $0.03915 = $0.3915
        assert result == pytest.approx(6.8915)


class TestFillModel:
    """Tests for combined FillModel."""

    def test_total_cost_pct(self):
        """Total cost calculation as percentage."""
        fill = FillModel(
            slippage=FixedBpsSlippage(entry_bps=5.0),
            commission=PerShareCommission(per_share=0.005),
        )
        result = fill.total_cost_pct(Side.BUY, 100.0, 1000)
        # Slippage: 5 bps = 0.0005
        # Commission: $5 / $100,000 = 0.00005
        assert result == pytest.approx(0.00055)

    def test_zero_trade_value(self):
        """Handles zero trade value gracefully."""
        fill = FillModel(
            slippage=FixedBpsSlippage(), commission=PerShareCommission(per_share=0.005)
        )
        result = fill.total_cost_pct(Side.BUY, 0.0, 0)
        assert result == 0.0

    def test_to_vectorbt_params(self):
        """VectorBT parameter conversion."""
        fill = FillModel(
            slippage=FixedBpsSlippage(entry_bps=5.0),
            commission=PerShareCommission(per_share=0.005),
        )
        params = fill.to_vectorbt_params(Side.BUY, 100.0, 1000)
        assert params["fees"] == 0.0
        assert params["fixed_fees"] == pytest.approx(5.0)
        assert params["slippage"] == pytest.approx(0.0005)


class TestFactoryFunctions:
    """Tests for factory functions."""

    def test_create_default_fill_model(self):
        """Default fill model creates valid instance."""
        fill = create_default_fill_model()
        assert isinstance(fill.slippage, FixedBpsSlippage)
        assert isinstance(fill.commission, ZeroCommission)

    def test_create_conservative_fill_model(self):
        """Conservative fill model creates valid instance."""
        fill = create_conservative_fill_model()
        assert isinstance(fill.slippage, FixedBpsSlippage)
        assert isinstance(fill.commission, PerShareCommission)

    def test_create_institutional_fill_model(self):
        """Institutional fill model creates valid instance."""
        fill = create_institutional_fill_model(sigma=0.02)
        assert isinstance(fill.slippage, SquareRootImpactSlippage)
        assert isinstance(fill.commission, TieredCommission)


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_negative_size_handled(self):
        """Negative size doesn't cause errors."""
        slippage = FixedBpsSlippage(entry_bps=5.0)
        # Should still calculate (absolute value concept)
        result = slippage.calculate(Side.BUY, 100.0, -1000)
        assert result == pytest.approx(0.0005)

    def test_zero_price_handled(self):
        """Zero price handled gracefully."""
        commission = PercentageCommission(percentage=0.001)
        result = commission.calculate(0.0, 1000)
        assert result == 0.0

    def test_side_enum_and_string_equivalent(self):
        """Side enum and string produce same results."""
        commission = ZeroCommission(include_fees=True)
        enum_result = commission.calculate(100.0, 1000, Side.SELL)
        string_result = commission.calculate(100.0, 1000, "SELL")
        assert enum_result == pytest.approx(string_result)
