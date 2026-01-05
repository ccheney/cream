//! Backtest configuration types.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Slippage model type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SlippageModel {
    /// Fixed basis points of slippage.
    #[default]
    FixedBps,
    /// Slippage as fraction of bid-ask spread.
    SpreadBased,
    /// Market impact based on order size (square-root law).
    VolumeImpact,
}

/// Fixed basis points slippage configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FixedBpsConfig {
    /// Basis points slippage for entry orders.
    pub entry_bps: Decimal,
    /// Basis points slippage for exit orders.
    pub exit_bps: Decimal,
}

impl Default for FixedBpsConfig {
    fn default() -> Self {
        Self {
            entry_bps: Decimal::new(5, 0),  // 5 bps
            exit_bps: Decimal::new(10, 0),  // 10 bps
        }
    }
}

/// Spread-based slippage configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpreadBasedConfig {
    /// Fill at mid + fraction * (half-spread).
    /// 0.0 = fill at mid, 1.0 = fill at far side of spread.
    pub spread_fraction: Decimal,
}

impl Default for SpreadBasedConfig {
    fn default() -> Self {
        Self {
            spread_fraction: Decimal::new(5, 1), // 0.5
        }
    }
}

/// Volume impact slippage configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeImpactConfig {
    /// Impact coefficient.
    pub impact_coefficient: Decimal,
    /// Volume exponent (0.5 for square-root law).
    pub volume_exponent: Decimal,
}

impl Default for VolumeImpactConfig {
    fn default() -> Self {
        Self {
            impact_coefficient: Decimal::new(1, 1),  // 0.1
            volume_exponent: Decimal::new(5, 1),     // 0.5 (square-root law)
        }
    }
}

/// Slippage configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlippageConfig {
    /// Active slippage model.
    pub model: SlippageModel,
    /// Fixed BPS configuration.
    pub fixed_bps: FixedBpsConfig,
    /// Spread-based configuration.
    pub spread_based: SpreadBasedConfig,
    /// Volume impact configuration.
    pub volume_impact: VolumeImpactConfig,
}

impl Default for SlippageConfig {
    fn default() -> Self {
        Self {
            model: SlippageModel::FixedBps,
            fixed_bps: FixedBpsConfig::default(),
            spread_based: SpreadBasedConfig::default(),
            volume_impact: VolumeImpactConfig::default(),
        }
    }
}

/// Partial fill configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartialFillConfig {
    /// Whether partial fills are enabled.
    pub enabled: bool,
    /// Probability of partial fill (0.0 to 1.0).
    pub probability: Decimal,
    /// Minimum fill fraction on partial fill.
    pub min_fill_fraction: Decimal,
    /// Maximum fill fraction on partial fill.
    pub max_fill_fraction: Decimal,
    /// Whether to use liquidity-based partial fills.
    pub liquidity_based_enabled: bool,
    /// Maximum order size as fraction of bar volume.
    pub max_order_fraction_of_volume: Decimal,
}

impl Default for PartialFillConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            probability: Decimal::new(1, 1),       // 0.1 (10%)
            min_fill_fraction: Decimal::new(3, 1), // 0.3 (30%)
            max_fill_fraction: Decimal::new(9, 1), // 0.9 (90%)
            liquidity_based_enabled: false,
            max_order_fraction_of_volume: Decimal::new(5, 2), // 0.05 (5%)
        }
    }
}

/// Commission model type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CommissionModel {
    /// Per-unit commission (per share or per contract).
    #[default]
    PerUnit,
    /// Tiered commission based on volume.
    Tiered,
    /// Fixed commission per trade.
    Fixed,
}

/// Per-unit commission configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerUnitCommissionConfig {
    /// Commission per share for equities.
    pub equity_per_share: Decimal,
    /// Commission per contract for options.
    pub option_per_contract: Decimal,
    /// Minimum commission per trade.
    pub minimum: Decimal,
}

impl Default for PerUnitCommissionConfig {
    fn default() -> Self {
        Self {
            equity_per_share: Decimal::ZERO,       // Commission-free
            option_per_contract: Decimal::new(65, 2), // $0.65
            minimum: Decimal::ZERO,
        }
    }
}

/// Regulatory fees configuration (2026 rates).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegulatoryFeesConfig {
    /// SEC Section 31 fee per dollar of notional (equity sells).
    pub sec_fee_per_dollar: Decimal,
    /// FINRA TAF fee per share (equity sells).
    pub taf_fee_per_share: Decimal,
    /// FINRA TAF fee per contract (options sells).
    pub taf_fee_per_contract: Decimal,
    /// TAF maximum per trade.
    pub taf_max_per_trade: Decimal,
    /// Options Regulatory Fee per contract.
    pub orf_fee_per_contract: Decimal,
}

impl Default for RegulatoryFeesConfig {
    fn default() -> Self {
        Self {
            sec_fee_per_dollar: Decimal::new(278, 7),      // $0.0000278
            taf_fee_per_share: Decimal::new(195, 6),      // $0.000195
            taf_fee_per_contract: Decimal::new(329, 5),   // $0.00329
            taf_max_per_trade: Decimal::new(979, 2),      // $9.79
            orf_fee_per_contract: Decimal::new(26, 4),    // $0.0026
        }
    }
}

/// Commission configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommissionConfig {
    /// Active commission model.
    pub model: CommissionModel,
    /// Per-unit configuration.
    pub per_unit: PerUnitCommissionConfig,
    /// Regulatory fees.
    pub fees: RegulatoryFeesConfig,
}

impl Default for CommissionConfig {
    fn default() -> Self {
        Self {
            model: CommissionModel::PerUnit,
            per_unit: PerUnitCommissionConfig::default(),
            fees: RegulatoryFeesConfig::default(),
        }
    }
}

/// Same-bar priority rule for stop/target triggers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SameBarPriority {
    /// Assume stop triggered first (conservative).
    #[default]
    StopFirst,
    /// Assume target triggered first (optimistic).
    TargetFirst,
    /// Always take the worse outcome.
    WorstCase,
    /// Random selection (50/50).
    Random,
}

/// Stop/target fill model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum StopTargetFillModel {
    /// Fill at exact level.
    #[default]
    Level,
    /// Apply slippage to stop/target fills.
    Slipped,
}

/// Slipped stop/target configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlippedStopTargetConfig {
    /// Slippage BPS for stop orders.
    pub stop_slippage_bps: Decimal,
    /// Slippage BPS for target orders.
    pub target_slippage_bps: Decimal,
}

impl Default for SlippedStopTargetConfig {
    fn default() -> Self {
        Self {
            stop_slippage_bps: Decimal::new(20, 0),  // 20 bps
            target_slippage_bps: Decimal::new(5, 0), // 5 bps
        }
    }
}

/// Stop/target configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopTargetConfig {
    /// Same-bar priority rule.
    pub same_bar_priority: SameBarPriority,
    /// Fill model for stops/targets.
    pub fill_model: StopTargetFillModel,
    /// Slipped configuration.
    pub slipped: SlippedStopTargetConfig,
}

impl Default for StopTargetConfig {
    fn default() -> Self {
        Self {
            same_bar_priority: SameBarPriority::StopFirst,
            fill_model: StopTargetFillModel::Level,
            slipped: SlippedStopTargetConfig::default(),
        }
    }
}

/// Limit order verification configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LimitOrderConfig {
    /// Number of ticks beyond limit price required for fill.
    pub verify_ticks: u32,
    /// Tick size for the instrument.
    pub tick_size: Decimal,
}

impl Default for LimitOrderConfig {
    fn default() -> Self {
        Self {
            verify_ticks: 0,
            tick_size: Decimal::new(1, 2), // $0.01
        }
    }
}

/// Fill model configuration.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FillModelConfig {
    /// Slippage configuration.
    pub slippage: SlippageConfig,
    /// Partial fill configuration.
    pub partial_fills: PartialFillConfig,
    /// Limit order configuration.
    pub limit_orders: LimitOrderConfig,
}

/// Complete backtest configuration.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BacktestConfig {
    /// Fill model configuration.
    pub fill_model: FillModelConfig,
    /// Commission configuration.
    pub commission: CommissionConfig,
    /// Stop/target configuration.
    pub stop_target: StopTargetConfig,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = BacktestConfig::default();

        assert_eq!(config.fill_model.slippage.model, SlippageModel::FixedBps);
        assert_eq!(config.fill_model.slippage.fixed_bps.entry_bps, Decimal::new(5, 0));
        assert!(!config.fill_model.partial_fills.enabled);
        assert_eq!(config.commission.model, CommissionModel::PerUnit);
        assert_eq!(config.stop_target.same_bar_priority, SameBarPriority::StopFirst);
    }

    #[test]
    fn test_slippage_models() {
        assert_eq!(SlippageModel::default(), SlippageModel::FixedBps);
    }

    #[test]
    fn test_regulatory_fees_2026() {
        let fees = RegulatoryFeesConfig::default();

        // Verify 2026 rates
        assert_eq!(fees.taf_fee_per_share, Decimal::new(195, 6));
        assert_eq!(fees.taf_max_per_trade, Decimal::new(979, 2));
    }
}
