"""
Fill Models Package

Provides realistic slippage and commission models for backtest execution.
Designed for integration with VectorBT Portfolio simulations.

Example usage:
    >>> slippage = FixedBpsSlippage(entry_bps=5.0, exit_bps=10.0)
    >>> slippage.calculate("BUY", 100.0, 1000, is_exit=False)
    0.05  # 5 bps = 0.05%

    >>> commission = PerShareCommission(per_share=0.005, minimum=1.0)
    >>> commission.calculate(100.0, 1000)
    5.0  # $0.005 * 1000 shares = $5.00
"""

from .base import CommissionModel, SlippageModel
from .factory import (
    create_conservative_fill_model,
    create_default_fill_model,
    create_institutional_fill_model,
)
from .models import (
    FillModel,
    FixedBpsSlippage,
    OptionsCommission,
    PercentageCommission,
    PerShareCommission,
    SpreadSlippage,
    SquareRootImpactSlippage,
    TieredCommission,
    VolumeImpactSlippage,
    ZeroCommission,
)
from .types import Side

__all__ = [
    # Types
    "Side",
    # Base classes
    "SlippageModel",
    "CommissionModel",
    # Slippage models
    "FixedBpsSlippage",
    "SpreadSlippage",
    "VolumeImpactSlippage",
    "SquareRootImpactSlippage",
    # Commission models
    "PerShareCommission",
    "PercentageCommission",
    "TieredCommission",
    "ZeroCommission",
    "OptionsCommission",
    # Combined model
    "FillModel",
    # Factory functions
    "create_default_fill_model",
    "create_conservative_fill_model",
    "create_institutional_fill_model",
]
