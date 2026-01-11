"""
Fill Models Factory

Factory functions for creating common fill model configurations.
"""

from __future__ import annotations

from .models import (
    FillModel,
    FixedBpsSlippage,
    PerShareCommission,
    SquareRootImpactSlippage,
    TieredCommission,
    ZeroCommission,
)


def create_default_fill_model() -> FillModel:
    """
    Create a default fill model suitable for US equities.

    Uses:
    - 5 bps entry slippage, 10 bps exit slippage
    - Zero commission (modern broker) with regulatory fees
    """
    return FillModel(
        slippage=FixedBpsSlippage(entry_bps=5.0, exit_bps=10.0),
        commission=ZeroCommission(include_fees=True),
    )


def create_conservative_fill_model() -> FillModel:
    """
    Create a conservative fill model with higher costs.

    Uses:
    - 10 bps entry slippage, 20 bps exit slippage
    - $0.005/share commission with $1 minimum
    """
    return FillModel(
        slippage=FixedBpsSlippage(entry_bps=10.0, exit_bps=20.0),
        commission=PerShareCommission(per_share=0.005, minimum=1.0),
    )


def create_institutional_fill_model(sigma: float = 0.02) -> FillModel:
    """
    Create an institutional fill model with market impact.

    Uses square-root impact model for slippage and tiered commissions.

    Args:
        sigma: Daily volatility estimate (default: 2%)
    """
    return FillModel(
        slippage=SquareRootImpactSlippage(sigma=sigma, base_bps=2.0, max_bps=500.0),
        commission=TieredCommission(
            tiers=[
                (100, 0.01),
                (1000, 0.007),
                (10000, 0.005),
                (float("inf"), 0.003),
            ],
            minimum=1.0,
        ),
    )
