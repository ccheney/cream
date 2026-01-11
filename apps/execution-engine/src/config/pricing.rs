//! Pricing model configuration for options and risk calculations.

use serde::{Deserialize, Serialize};

/// Pricing model configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PricingConfig {
    /// Risk-free rate (annualized).
    #[serde(default = "default_risk_free_rate")]
    pub risk_free_rate: f64,
    /// Default dividend yield.
    #[serde(default)]
    pub default_dividend_yield: f64,
    /// Volatility calculation window in days.
    #[serde(default = "default_volatility_window")]
    pub volatility_window_days: u32,
    /// Use implied volatility when available.
    #[serde(default = "default_true")]
    pub use_implied_volatility: bool,
}

impl Default for PricingConfig {
    fn default() -> Self {
        Self {
            risk_free_rate: default_risk_free_rate(),
            default_dividend_yield: 0.0,
            volatility_window_days: default_volatility_window(),
            use_implied_volatility: true,
        }
    }
}

pub(crate) const fn default_risk_free_rate() -> f64 {
    0.05
}

const fn default_volatility_window() -> u32 {
    30
}

pub(crate) const fn default_true() -> bool {
    true
}
