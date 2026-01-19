//! Risk constraint configuration for position and portfolio limits.

use serde::{Deserialize, Serialize};

/// Risk constraint configuration.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ConstraintsConfig {
    /// Per-instrument limits.
    #[serde(default)]
    pub per_instrument: PerInstrumentConstraints,
    /// Portfolio-level limits.
    #[serde(default)]
    pub portfolio: PortfolioConstraints,
    /// Options-specific limits.
    #[serde(default)]
    pub options: OptionsConstraints,
    /// Buying power requirements.
    #[serde(default)]
    pub buying_power: BuyingPowerConstraints,
    /// Per-trade risk limits.
    #[serde(default)]
    pub risk_limits: RiskLimitsConstraints,
    /// Pattern Day Trader (PDT) constraints.
    #[serde(default)]
    pub pdt: PdtConstraints,
}

/// Per-instrument constraint limits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerInstrumentConstraints {
    /// Maximum notional value.
    #[serde(default = "default_max_notional")]
    pub max_notional: f64,
    /// Maximum units (shares/contracts).
    #[serde(default = "default_max_units")]
    pub max_units: u32,
    /// Maximum equity percentage.
    #[serde(default = "default_max_equity_pct")]
    pub max_equity_pct: f64,
}

impl Default for PerInstrumentConstraints {
    fn default() -> Self {
        Self {
            max_notional: default_max_notional(),
            max_units: default_max_units(),
            max_equity_pct: default_max_equity_pct(),
        }
    }
}

pub const fn default_max_notional() -> f64 {
    50000.0
}

const fn default_max_units() -> u32 {
    1000
}

const fn default_max_equity_pct() -> f64 {
    0.10
}

/// Portfolio-level constraint limits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortfolioConstraints {
    /// Maximum gross notional.
    #[serde(default = "default_max_gross_notional")]
    pub max_gross_notional: f64,
    /// Maximum net notional.
    #[serde(default = "default_max_net_notional")]
    pub max_net_notional: f64,
    /// Maximum leverage ratio.
    #[serde(default = "default_max_leverage")]
    pub max_leverage: f64,
}

impl Default for PortfolioConstraints {
    fn default() -> Self {
        Self {
            max_gross_notional: default_max_gross_notional(),
            max_net_notional: default_max_net_notional(),
            max_leverage: default_max_leverage(),
        }
    }
}

pub const fn default_max_gross_notional() -> f64 {
    500_000.0
}

const fn default_max_net_notional() -> f64 {
    200_000.0
}

pub const fn default_max_leverage() -> f64 {
    2.0
}

/// Options-specific constraint limits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionsConstraints {
    /// Maximum delta per underlying.
    #[serde(default = "default_max_delta_per_underlying")]
    pub max_delta_per_underlying: f64,
    /// Maximum portfolio delta.
    #[serde(default = "default_max_portfolio_delta")]
    pub max_portfolio_delta: f64,
    /// Maximum portfolio gamma.
    #[serde(default = "default_max_portfolio_gamma")]
    pub max_portfolio_gamma: f64,
    /// Maximum portfolio vega.
    #[serde(default = "default_max_portfolio_vega")]
    pub max_portfolio_vega: f64,
    /// Maximum portfolio theta.
    #[serde(default = "default_max_portfolio_theta")]
    pub max_portfolio_theta: f64,
    /// Maximum contracts per underlying.
    #[serde(default = "default_max_contracts_per_underlying")]
    pub max_contracts_per_underlying: u32,
}

impl Default for OptionsConstraints {
    fn default() -> Self {
        Self {
            max_delta_per_underlying: default_max_delta_per_underlying(),
            max_portfolio_delta: default_max_portfolio_delta(),
            max_portfolio_gamma: default_max_portfolio_gamma(),
            max_portfolio_vega: default_max_portfolio_vega(),
            max_portfolio_theta: default_max_portfolio_theta(),
            max_contracts_per_underlying: default_max_contracts_per_underlying(),
        }
    }
}

const fn default_max_delta_per_underlying() -> f64 {
    100.0
}

const fn default_max_portfolio_delta() -> f64 {
    500.0
}

const fn default_max_portfolio_gamma() -> f64 {
    50.0
}

const fn default_max_portfolio_vega() -> f64 {
    1000.0
}

const fn default_max_portfolio_theta() -> f64 {
    -500.0
}

const fn default_max_contracts_per_underlying() -> u32 {
    100
}

/// Buying power constraint requirements.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuyingPowerConstraints {
    /// Minimum buying power ratio to maintain.
    #[serde(default = "default_min_buying_power_ratio")]
    pub min_buying_power_ratio: f64,
    /// Margin safety buffer.
    #[serde(default = "default_margin_buffer")]
    pub margin_buffer: f64,
}

impl Default for BuyingPowerConstraints {
    fn default() -> Self {
        Self {
            min_buying_power_ratio: default_min_buying_power_ratio(),
            margin_buffer: default_margin_buffer(),
        }
    }
}

const fn default_min_buying_power_ratio() -> f64 {
    0.20
}

const fn default_margin_buffer() -> f64 {
    0.10
}

/// Per-trade risk limit constraints.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskLimitsConstraints {
    /// Maximum percentage of account equity at risk per trade.
    #[serde(default = "default_max_per_trade_risk_pct")]
    pub max_per_trade_risk_pct: f64,
    /// Minimum risk-reward ratio for new positions.
    #[serde(default = "default_min_risk_reward_ratio")]
    pub min_risk_reward_ratio: f64,
    /// Sizing sanity threshold multiplier (reject if position > multiplier * median).
    #[serde(default = "default_sizing_sanity_threshold")]
    pub sizing_sanity_threshold: f64,
}

impl Default for RiskLimitsConstraints {
    fn default() -> Self {
        Self {
            max_per_trade_risk_pct: default_max_per_trade_risk_pct(),
            min_risk_reward_ratio: default_min_risk_reward_ratio(),
            sizing_sanity_threshold: default_sizing_sanity_threshold(),
        }
    }
}

const fn default_max_per_trade_risk_pct() -> f64 {
    2.0
}

const fn default_min_risk_reward_ratio() -> f64 {
    1.5
}

const fn default_sizing_sanity_threshold() -> f64 {
    3.0
}

/// Pattern Day Trader (PDT) constraint configuration.
///
/// FINRA Rule 4210 defines a pattern day trader as any customer who executes
/// four or more day trades within five business days, provided the number of
/// day trades represents more than 6% of total trades in that period.
///
/// Accounts with equity below $25,000 are restricted to 3 day trades per
/// rolling 5 business day period.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PdtConstraints {
    /// Enable PDT constraint enforcement.
    #[serde(default = "default_pdt_enabled")]
    pub enabled: bool,
    /// Minimum equity threshold to be exempt from PDT restrictions ($25,000).
    #[serde(default = "default_pdt_equity_threshold")]
    pub equity_threshold: f64,
    /// Maximum day trades allowed in rolling 5-day period when under threshold.
    #[serde(default = "default_max_day_trades")]
    pub max_day_trades: u32,
    /// Rolling window in business days for day trade counting.
    #[serde(default = "default_rolling_window_days")]
    pub rolling_window_days: u32,
}

impl Default for PdtConstraints {
    fn default() -> Self {
        Self {
            enabled: default_pdt_enabled(),
            equity_threshold: default_pdt_equity_threshold(),
            max_day_trades: default_max_day_trades(),
            rolling_window_days: default_rolling_window_days(),
        }
    }
}

const fn default_pdt_enabled() -> bool {
    true
}

const fn default_pdt_equity_threshold() -> f64 {
    25_000.0
}

const fn default_max_day_trades() -> u32 {
    3
}

const fn default_rolling_window_days() -> u32 {
    5
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_constraint_limits() {
        let config = ConstraintsConfig::default();

        assert!((config.per_instrument.max_notional - 50000.0).abs() < 1e-10);
        assert_eq!(config.per_instrument.max_units, 1000);
        assert!((config.portfolio.max_gross_notional - 500_000.0).abs() < 1e-10);
        assert!((config.options.max_portfolio_delta - 500.0).abs() < 1e-10);
        assert!((config.buying_power.min_buying_power_ratio - 0.20).abs() < f64::EPSILON);
    }
}
