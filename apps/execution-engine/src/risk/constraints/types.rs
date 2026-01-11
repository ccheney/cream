//! Type definitions for constraint validation.
//!
//! Contains the core data structures used throughout constraint validation:
//! - Greeks snapshot for options validation
//! - Buying power / margin information
//! - Extended constraint context
//! - Sizing sanity warnings

use rust_decimal::Decimal;
use std::collections::HashMap;

/// Greeks snapshot for options constraint validation.
#[derive(Debug, Clone, Default)]
pub struct GreeksSnapshot {
    /// Delta-adjusted notional (directional exposure).
    pub delta_notional: Decimal,
    /// Gamma exposure.
    pub gamma: Decimal,
    /// Vega exposure.
    pub vega: Decimal,
    /// Theta (time decay, typically negative for long options).
    pub theta: Decimal,
}

/// Buying power / margin information.
#[derive(Debug, Clone)]
pub struct BuyingPowerInfo {
    /// Available buying power.
    pub available: Decimal,
    /// Required margin for pending orders.
    pub required_margin: Decimal,
}

impl Default for BuyingPowerInfo {
    fn default() -> Self {
        // Default to zero available buying power to enforce explicit provision
        // of buying power info. Using MAX would bypass all buying power checks.
        Self {
            available: Decimal::ZERO,
            required_margin: Decimal::ZERO,
        }
    }
}

impl BuyingPowerInfo {
    /// Create a new `BuyingPowerInfo` with specified available buying power.
    #[must_use]
    pub const fn new(available: Decimal, required_margin: Decimal) -> Self {
        Self {
            available,
            required_margin,
        }
    }

    /// Create `BuyingPowerInfo` with unlimited buying power (for testing only).
    #[cfg(test)]
    #[must_use]
    pub const fn unlimited() -> Self {
        Self {
            available: Decimal::MAX,
            required_margin: Decimal::ZERO,
        }
    }
}

/// Extended request with optional Greeks and buying power.
#[derive(Debug, Clone, Default)]
pub struct ExtendedConstraintContext {
    /// Portfolio Greeks snapshot (optional, for options validation).
    pub greeks: Option<GreeksSnapshot>,
    /// Buying power information.
    pub buying_power: BuyingPowerInfo,
    /// Current positions by instrument (for conflicting order detection).
    pub current_positions: HashMap<String, Decimal>,
    /// Historical position sizes for sizing sanity check.
    /// List of recent position notional values.
    pub historical_position_sizes: Vec<Decimal>,
}

/// Sizing sanity warning (not an error, just a warning).
#[derive(Debug, Clone)]
pub struct SizingSanityWarning {
    /// Proposed position notional.
    pub proposed_notional: Decimal,
    /// Typical (median) position size.
    pub typical_size: Decimal,
    /// Multiplier of typical size.
    pub size_multiplier: Decimal,
    /// Threshold multiplier that was exceeded.
    pub threshold: Decimal,
    /// Warning message.
    pub message: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_greeks_snapshot_default() {
        let greeks = GreeksSnapshot::default();
        assert_eq!(greeks.delta_notional, Decimal::ZERO);
        assert_eq!(greeks.gamma, Decimal::ZERO);
        assert_eq!(greeks.vega, Decimal::ZERO);
        assert_eq!(greeks.theta, Decimal::ZERO);
    }

    #[test]
    fn test_buying_power_info_default() {
        let bp = BuyingPowerInfo::default();
        assert_eq!(bp.available, Decimal::ZERO);
        assert_eq!(bp.required_margin, Decimal::ZERO);
    }

    #[test]
    fn test_buying_power_info_new() {
        let bp = BuyingPowerInfo::new(Decimal::new(50_000, 0), Decimal::new(10_000, 0));
        assert_eq!(bp.available, Decimal::new(50_000, 0));
        assert_eq!(bp.required_margin, Decimal::new(10_000, 0));
    }

    #[test]
    fn test_buying_power_info_unlimited() {
        let bp = BuyingPowerInfo::unlimited();
        assert_eq!(bp.available, Decimal::MAX);
        assert_eq!(bp.required_margin, Decimal::ZERO);
    }

    #[test]
    fn test_extended_constraint_context_default() {
        let ctx = ExtendedConstraintContext::default();
        assert!(ctx.greeks.is_none());
        assert_eq!(ctx.buying_power.available, Decimal::ZERO);
        assert!(ctx.current_positions.is_empty());
        assert!(ctx.historical_position_sizes.is_empty());
    }
}
