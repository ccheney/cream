"""
Fill Models Implementations

Concrete slippage and commission model implementations.
"""

from __future__ import annotations

from dataclasses import dataclass

from .base import CommissionModel, SlippageModel
from .types import Side

# ============================================
# Slippage Models
# ============================================


@dataclass
class FixedBpsSlippage(SlippageModel):
    """
    Fixed basis points slippage model.

    Typical range: 2-10 bps for liquid large-cap stocks.
    Research shows over half of trades have slippage < 10 bps;
    only ~2% exceed 100 bps.

    Args:
        entry_bps: Slippage in basis points for entry trades (default: 5)
        exit_bps: Slippage in basis points for exit trades (default: 10)
    """

    entry_bps: float = 5.0
    exit_bps: float = 10.0

    def calculate(
        self,
        side: str | Side,
        price: float,
        size: float,
        is_exit: bool = False,
        **kwargs,
    ) -> float:
        """Calculate fixed basis points slippage."""
        del side, price, size, kwargs  # Unused
        bps = self.exit_bps if is_exit else self.entry_bps
        return bps / 10_000  # Convert bps to decimal


@dataclass
class SpreadSlippage(SlippageModel):
    """
    Spread-based slippage model.

    Slippage is a fraction of the bid-ask spread.
    For buys: pay half spread above mid
    For sells: receive half spread below mid

    Args:
        spread_fraction: Fraction of spread to use (default: 0.5 = half spread)
        default_spread_bps: Default spread in bps if not provided (default: 10)
    """

    spread_fraction: float = 0.5
    default_spread_bps: float = 10.0

    def calculate(
        self,
        side: str | Side,
        price: float,
        size: float,
        is_exit: bool = False,
        spread: float | None = None,
        **kwargs,
    ) -> float:
        """
        Calculate spread-based slippage.

        Args:
            spread: Bid-ask spread in dollars. If None, uses default_spread_bps.
        """
        del side, size, is_exit, kwargs  # Unused
        spread_pct = spread / price if spread is not None else self.default_spread_bps / 10_000

        return spread_pct * self.spread_fraction


@dataclass
class VolumeImpactSlippage(SlippageModel):
    """
    Volume impact (market impact) slippage model.

    Based on the square-root law: Impact ~ sigma * sqrt(Q/V)
    where Q is trade size, V is average daily volume, sigma is volatility.

    This is a simplified linear version for smaller trades:
    slippage = base_bps + (size / adv) * impact_coefficient

    Args:
        base_bps: Minimum slippage in basis points (default: 2)
        impact_coefficient: Impact multiplier (default: 50)
        max_bps: Maximum slippage cap in basis points (default: 200)
    """

    base_bps: float = 2.0
    impact_coefficient: float = 50.0
    max_bps: float = 200.0

    def calculate(
        self,
        side: str | Side,
        price: float,
        size: float,
        is_exit: bool = False,
        adv: float | None = None,
        **kwargs,
    ) -> float:
        """
        Calculate volume-based market impact slippage.

        Args:
            adv: Average daily volume. If None, assumes 100% of ADV.
        """
        del side, price, is_exit, kwargs  # Unused
        if adv is None or adv <= 0:
            return self.base_bps / 10_000

        participation = size / adv
        impact_bps = self.base_bps + (participation * self.impact_coefficient * 10_000)
        capped_bps = min(impact_bps, self.max_bps)

        return capped_bps / 10_000


@dataclass
class SquareRootImpactSlippage(SlippageModel):
    """
    Square-root market impact model.

    Based on empirical research: Impact ~ sigma * sqrt(Q/V)

    More realistic for larger trades than linear models.

    Args:
        sigma: Daily volatility (default: 0.02 = 2%)
        base_bps: Minimum slippage in basis points (default: 2)
        max_bps: Maximum slippage cap in basis points (default: 500)
    """

    sigma: float = 0.02
    base_bps: float = 2.0
    max_bps: float = 500.0

    def calculate(
        self,
        side: str | Side,
        price: float,
        size: float,
        is_exit: bool = False,
        adv: float | None = None,
        **kwargs,
    ) -> float:
        """
        Calculate square-root market impact slippage.

        Args:
            adv: Average daily volume. If None, assumes minimal impact.
        """
        del side, price, is_exit, kwargs  # Unused
        if adv is None or adv <= 0:
            return self.base_bps / 10_000

        participation = size / adv
        impact = self.sigma * (participation**0.5)

        total_bps = self.base_bps + (impact * 10_000)
        capped_bps = min(total_bps, self.max_bps)

        return capped_bps / 10_000


# ============================================
# Commission Models
# ============================================


@dataclass
class PerShareCommission(CommissionModel):
    """
    Per-share commission model.

    Args:
        per_share: Commission per share (default: 0.005)
        minimum: Minimum commission per trade (default: 0.0)
        maximum: Maximum commission per trade (default: inf)
    """

    per_share: float = 0.005
    minimum: float = 0.0
    maximum: float = float("inf")

    def calculate(
        self,
        price: float,
        size: float,
        side: str | Side | None = None,
        **kwargs,
    ) -> float:
        """Calculate per-share commission."""
        del price, side, kwargs  # Unused
        commission = size * self.per_share
        return max(self.minimum, min(commission, self.maximum))


@dataclass
class PercentageCommission(CommissionModel):
    """
    Percentage-based commission model.

    Args:
        percentage: Commission as percentage of trade value (default: 0.001 = 0.1%)
        minimum: Minimum commission per trade (default: 0.0)
        maximum: Maximum commission per trade (default: inf)
    """

    percentage: float = 0.001
    minimum: float = 0.0
    maximum: float = float("inf")

    def calculate(
        self,
        price: float,
        size: float,
        side: str | Side | None = None,
        **kwargs,
    ) -> float:
        """Calculate percentage-based commission."""
        del side, kwargs  # Unused
        trade_value = price * size
        commission = trade_value * self.percentage
        return max(self.minimum, min(commission, self.maximum))


@dataclass
class TieredCommission(CommissionModel):
    """
    Volume-based tiered commission model.

    Tiers are defined as (volume_threshold, rate) tuples.
    Rate applies to volume up to that threshold.

    Args:
        tiers: List of (threshold, rate) tuples, sorted by threshold ascending
        minimum: Minimum commission per trade (default: 0.0)
    """

    tiers: list[tuple[float, float]]
    minimum: float = 0.0

    def __post_init__(self):
        self.tiers = sorted(self.tiers, key=lambda x: x[0])

    def calculate(
        self,
        price: float,
        size: float,
        side: str | Side | None = None,
        **kwargs,
    ) -> float:
        """Calculate tiered commission based on trade size."""
        del price, side, kwargs  # Unused
        remaining = size
        total_commission = 0.0
        prev_threshold = 0.0

        for threshold, rate in self.tiers:
            tier_size = min(remaining, threshold - prev_threshold)
            if tier_size > 0:
                total_commission += tier_size * rate
                remaining -= tier_size
            prev_threshold = threshold

            if remaining <= 0:
                break

        if remaining > 0 and self.tiers:
            total_commission += remaining * self.tiers[-1][1]

        return max(self.minimum, total_commission)


@dataclass
class ZeroCommission(CommissionModel):
    """
    Zero commission model (for commission-free brokers like Robinhood).

    Still accounts for regulatory fees on sells if include_fees is True.

    Args:
        include_fees: Whether to include TAF/SEC fees (default: True)
        taf_per_share: FINRA TAF fee per share (default: 0.000166)
        taf_max: Maximum TAF per trade (default: 8.30)
        sec_per_dollar: SEC fee per dollar of sell proceeds (default: 0.0000278)
    """

    include_fees: bool = True
    taf_per_share: float = 0.000166
    taf_max: float = 8.30
    sec_per_dollar: float = 0.0000278

    def calculate(
        self,
        price: float,
        size: float,
        side: str | Side | None = None,
        **_kwargs,
    ) -> float:
        """Calculate regulatory fees (commission is zero)."""
        if not self.include_fees:
            return 0.0

        if isinstance(side, str):
            side = Side(side.upper())

        if side in (Side.SELL, Side.SHORT):
            taf = min(size * self.taf_per_share, self.taf_max)
            sec = price * size * self.sec_per_dollar
            return taf + sec

        return 0.0


@dataclass
class OptionsCommission(CommissionModel):
    """
    Options-specific commission model.

    Args:
        per_contract: Commission per contract (default: 0.65)
        minimum: Minimum commission per trade (default: 0.0)
        include_fees: Whether to include regulatory fees (default: True)
        orf_per_contract: Options Regulatory Fee per contract (default: 0.03915)
    """

    per_contract: float = 0.65
    minimum: float = 0.0
    include_fees: bool = True
    orf_per_contract: float = 0.03915

    def calculate(
        self,
        price: float,
        size: float,
        side: str | Side | None = None,
        **kwargs,
    ) -> float:
        """Calculate options commission."""
        del price, side, kwargs  # Unused
        base = size * self.per_contract

        if self.include_fees:
            base += size * self.orf_per_contract

        return max(self.minimum, base)


# ============================================
# Combined Fill Model
# ============================================


@dataclass
class FillModel:
    """
    Combined fill model with both slippage and commission.

    Provides a unified interface for calculating total transaction costs.

    Example:
        >>> fill = FillModel(
        ...     slippage=FixedBpsSlippage(5.0, 10.0),
        ...     commission=PerShareCommission(0.005, minimum=1.0)
        ... )
        >>> fill.total_cost_pct(Side.BUY, 100.0, 1000)
        0.0006  # 5 bps slippage + $5 commission on $100k trade
    """

    slippage: SlippageModel
    commission: CommissionModel

    def calculate_slippage(
        self,
        side: str | Side,
        price: float,
        size: float,
        is_exit: bool = False,
        **kwargs,
    ) -> float:
        """Calculate slippage as decimal."""
        return self.slippage.calculate(side, price, size, is_exit, **kwargs)

    def calculate_commission(
        self,
        price: float,
        size: float,
        side: str | Side | None = None,
        **kwargs,
    ) -> float:
        """Calculate commission in dollars."""
        return self.commission.calculate(price, size, side, **kwargs)

    def total_cost_pct(
        self,
        side: str | Side,
        price: float,
        size: float,
        is_exit: bool = False,
        **kwargs,
    ) -> float:
        """
        Calculate total transaction cost as percentage of trade value.

        Returns:
            Total cost as decimal (e.g., 0.001 = 0.1%)
        """
        trade_value = price * size
        if trade_value <= 0:
            return 0.0

        slippage_pct = self.calculate_slippage(side, price, size, is_exit, **kwargs)
        commission_pct = self.calculate_commission(price, size, side, **kwargs) / trade_value

        return slippage_pct + commission_pct

    def to_vectorbt_params(
        self,
        side: str | Side,
        price: float,
        size: float,
        is_exit: bool = False,
        **kwargs,
    ) -> dict[str, float]:
        """
        Get parameters for VectorBT Portfolio simulation.

        Returns:
            Dict with 'fees' (percentage), 'fixed_fees' (dollars), 'slippage' (percentage)
        """
        return {
            "fees": 0.0,
            "fixed_fees": self.calculate_commission(price, size, side, **kwargs),
            "slippage": self.calculate_slippage(side, price, size, is_exit, **kwargs),
        }
