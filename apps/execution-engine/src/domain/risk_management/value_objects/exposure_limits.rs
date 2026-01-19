//! Exposure limit configurations.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Per-instrument exposure limits.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PerInstrumentLimits {
    /// Maximum units/contracts per instrument.
    pub max_units: u32,
    /// Maximum notional value per instrument (in cents for precision).
    pub max_notional_cents: i64,
    /// Maximum percentage of equity per instrument (as basis points, e.g., 1000 = 10%).
    pub max_pct_equity_bps: u32,
}

impl Default for PerInstrumentLimits {
    fn default() -> Self {
        Self {
            max_units: 1000,
            max_notional_cents: 5_000_000, // $50,000
            max_pct_equity_bps: 1000,      // 10%
        }
    }
}

impl PerInstrumentLimits {
    /// Get max notional as Decimal.
    #[must_use]
    pub fn max_notional(&self) -> Decimal {
        Decimal::new(self.max_notional_cents, 2)
    }

    /// Get max percent of equity as Decimal (0.0 to 1.0).
    #[must_use]
    pub fn max_pct_equity(&self) -> Decimal {
        Decimal::new(i64::from(self.max_pct_equity_bps), 4)
    }
}

/// Portfolio-level exposure limits.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PortfolioLimits {
    /// Maximum gross notional (sum of absolute values, in cents).
    pub max_gross_notional_cents: i64,
    /// Maximum net notional (long - short, in cents).
    pub max_net_notional_cents: i64,
    /// Maximum gross exposure as % of equity (basis points).
    pub max_pct_equity_gross_bps: u32,
    /// Maximum net exposure as % of equity (basis points).
    pub max_pct_equity_net_bps: u32,
}

impl Default for PortfolioLimits {
    fn default() -> Self {
        Self {
            max_gross_notional_cents: 50_000_000, // $500,000
            max_net_notional_cents: 25_000_000,   // $250,000
            max_pct_equity_gross_bps: 20_000,     // 200%
            max_pct_equity_net_bps: 10_000,       // 100%
        }
    }
}

impl PortfolioLimits {
    /// Get max gross notional as Decimal.
    #[must_use]
    pub fn max_gross_notional(&self) -> Decimal {
        Decimal::new(self.max_gross_notional_cents, 2)
    }

    /// Get max net notional as Decimal.
    #[must_use]
    pub fn max_net_notional(&self) -> Decimal {
        Decimal::new(self.max_net_notional_cents, 2)
    }

    /// Get max gross percent of equity as Decimal.
    #[must_use]
    pub fn max_pct_equity_gross(&self) -> Decimal {
        Decimal::new(i64::from(self.max_pct_equity_gross_bps), 4)
    }

    /// Get max net percent of equity as Decimal.
    #[must_use]
    pub fn max_pct_equity_net(&self) -> Decimal {
        Decimal::new(i64::from(self.max_pct_equity_net_bps), 4)
    }
}

/// Options-specific limits.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OptionsLimits {
    /// Maximum delta-adjusted notional (in cents).
    pub max_delta_notional_cents: i64,
    /// Maximum gamma exposure (scaled by 1000).
    pub max_gamma_scaled: i64,
    /// Maximum vega exposure (in cents).
    pub max_vega_cents: i64,
    /// Maximum theta (daily time decay, in cents, negative for long).
    pub max_theta_cents: i64,
}

impl Default for OptionsLimits {
    fn default() -> Self {
        Self {
            max_delta_notional_cents: 10_000_000, // $100,000
            max_gamma_scaled: 1_000_000,          // 1000.0
            max_vega_cents: 500_000,              // $5,000
            max_theta_cents: -50_000,             // -$500
        }
    }
}

impl OptionsLimits {
    /// Get max delta notional as Decimal.
    #[must_use]
    pub fn max_delta_notional(&self) -> Decimal {
        Decimal::new(self.max_delta_notional_cents, 2)
    }

    /// Get max gamma as Decimal.
    #[must_use]
    pub fn max_gamma(&self) -> Decimal {
        Decimal::new(self.max_gamma_scaled, 3)
    }

    /// Get max vega as Decimal.
    #[must_use]
    pub fn max_vega(&self) -> Decimal {
        Decimal::new(self.max_vega_cents, 2)
    }

    /// Get max theta as Decimal.
    #[must_use]
    pub fn max_theta(&self) -> Decimal {
        Decimal::new(self.max_theta_cents, 2)
    }
}

/// Position sizing sanity check limits.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SizingLimits {
    /// Multiplier for flagging unusually large positions (scaled by 10).
    /// Positions > multiplier * typical_size trigger warnings.
    pub sanity_threshold_multiplier_scaled: u32,
}

impl Default for SizingLimits {
    fn default() -> Self {
        Self {
            sanity_threshold_multiplier_scaled: 30, // 3.0x
        }
    }
}

impl SizingLimits {
    /// Get sanity threshold multiplier as Decimal.
    #[must_use]
    pub fn sanity_threshold_multiplier(&self) -> Decimal {
        Decimal::new(i64::from(self.sanity_threshold_multiplier_scaled), 1)
    }
}

/// Complete exposure limits configuration.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExposureLimits {
    /// Per-instrument limits.
    pub per_instrument: PerInstrumentLimits,
    /// Portfolio limits.
    pub portfolio: PortfolioLimits,
    /// Options limits.
    pub options: OptionsLimits,
    /// Sizing sanity limits.
    pub sizing: SizingLimits,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn per_instrument_limits_default() {
        let limits = PerInstrumentLimits::default();
        assert_eq!(limits.max_units, 1000);
        assert_eq!(limits.max_notional(), Decimal::new(5_000_000, 2));
        assert_eq!(limits.max_pct_equity(), Decimal::new(1000, 4)); // 0.1 = 10%
    }

    #[test]
    fn portfolio_limits_default() {
        let limits = PortfolioLimits::default();
        assert_eq!(limits.max_gross_notional(), Decimal::new(50_000_000, 2));
        assert_eq!(limits.max_pct_equity_gross(), Decimal::new(20_000, 4)); // 2.0 = 200%
    }

    #[test]
    fn options_limits_default() {
        let limits = OptionsLimits::default();
        assert_eq!(limits.max_delta_notional(), Decimal::new(10_000_000, 2));
    }

    #[test]
    fn sizing_limits_default() {
        let limits = SizingLimits::default();
        assert_eq!(limits.sanity_threshold_multiplier(), Decimal::new(30, 1)); // 3.0
    }

    #[test]
    fn exposure_limits_default() {
        let limits = ExposureLimits::default();
        assert_eq!(limits.per_instrument.max_units, 1000);
    }

    #[test]
    fn exposure_limits_serde() {
        let limits = ExposureLimits::default();
        let json = serde_json::to_string(&limits).unwrap();
        let parsed: ExposureLimits = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, limits);
    }
}
