//! Core types for position sizing calculations.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::fmt;

/// Unit of measurement for position sizing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SizingUnit {
    /// Fixed number of shares.
    Shares,
    /// Fixed number of option contracts.
    Contracts,
    /// Dollar amount to allocate (converted to shares based on price).
    Dollars,
    /// Percentage of total equity (converted to shares).
    PctEquity,
}

impl fmt::Display for SizingUnit {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Shares => write!(f, "SHARES"),
            Self::Contracts => write!(f, "CONTRACTS"),
            Self::Dollars => write!(f, "DOLLARS"),
            Self::PctEquity => write!(f, "PCT_EQUITY"),
        }
    }
}

/// Input parameters for position sizing calculation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SizingInput {
    /// The sizing value (shares, contracts, dollars, or percentage).
    pub sizing_value: Decimal,
    /// The unit of the sizing value.
    pub sizing_unit: SizingUnit,
    /// Current price of the instrument.
    pub current_price: Decimal,
    /// Total portfolio equity (required for `PCT_EQUITY`).
    pub total_equity: Decimal,
    /// Available cash for new positions.
    pub available_cash: Decimal,
    /// Maximum position size in shares/contracts (0 = unlimited).
    pub max_position_size: u64,
    /// Minimum order size in shares/contracts.
    pub min_order_size: u64,
    /// Option contract multiplier (default: 100 for equity options).
    pub contract_multiplier: u32,
    /// Whether this is an options position.
    pub is_options: bool,
}

impl Default for SizingInput {
    fn default() -> Self {
        Self {
            sizing_value: Decimal::ZERO,
            sizing_unit: SizingUnit::Shares,
            current_price: Decimal::ZERO,
            total_equity: Decimal::ZERO,
            available_cash: Decimal::ZERO,
            max_position_size: 0,
            min_order_size: 1,
            contract_multiplier: 100,
            is_options: false,
        }
    }
}

/// Result of position sizing calculation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SizingResult {
    /// Calculated number of shares (or contracts if `is_options`).
    pub quantity: u64,
    /// Total notional value of the position.
    pub notional_value: Decimal,
    /// Percentage of equity this represents.
    pub equity_percentage: Decimal,
    /// Whether the result was constrained (reduced from requested).
    pub was_constrained: bool,
    /// Reason for constraint if any.
    pub constraint_reason: Option<String>,
}
