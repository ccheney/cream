"""
Fill Models Base Classes

Abstract base classes for slippage and commission models.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from .types import Side


class SlippageModel(ABC):
    """Abstract base class for slippage models."""

    @abstractmethod
    def calculate(
        self,
        side: str | Side,
        price: float,
        size: float,
        is_exit: bool = False,
        **kwargs,
    ) -> float:
        """
        Calculate slippage as a decimal (e.g., 0.0005 = 5 bps).

        Args:
            side: Trade side (BUY, SELL, SHORT, COVER)
            price: Order price
            size: Order size (shares/contracts)
            is_exit: Whether this is an exit trade
            **kwargs: Model-specific parameters (e.g., spread, adv)

        Returns:
            Slippage as decimal fraction (0.0005 = 5 bps = 0.05%)
        """
        pass

    def to_vectorbt_fees(
        self,
        side: str | Side,
        price: float,
        size: float,
        is_exit: bool = False,
        **kwargs,
    ) -> float:
        """
        Get slippage as VectorBT fees parameter (decimal).

        VectorBT applies fees as: fill_price = price * (1 + fees)
        So we return the raw decimal slippage.
        """
        return self.calculate(side, price, size, is_exit, **kwargs)


class CommissionModel(ABC):
    """Abstract base class for commission models."""

    @abstractmethod
    def calculate(
        self,
        price: float,
        size: float,
        side: str | Side | None = None,
        **kwargs,
    ) -> float:
        """
        Calculate commission in dollars.

        Args:
            price: Trade price per share
            size: Number of shares/contracts
            side: Trade side (for sell-only fees like TAF)
            **kwargs: Model-specific parameters

        Returns:
            Commission in dollars
        """
        pass

    def to_vectorbt_fixed_fees(
        self,
        price: float,
        size: float,
        side: str | Side | None = None,
        **kwargs,
    ) -> float:
        """Get commission as VectorBT fixed_fees parameter (dollars)."""
        return self.calculate(price, size, side, **kwargs)
