//! Roll configuration parameters.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Rolling configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollConfig {
    // Time-based triggers
    /// Roll credit positions when DTE <= this value.
    pub credit_dte_trigger: u32,
    /// Roll all positions when DTE <= this value (urgent).
    pub urgent_dte_trigger: u32,
    /// Roll when DTE <= this AND profitable.
    pub profitable_dte_trigger: u32,

    // Profit/loss triggers
    /// Roll credit spreads at this percentage of max profit (0.50 = 50%).
    pub profit_target_pct: Decimal,
    /// Roll credit spreads when loss reaches this multiple of credit (2.0 = 2x).
    pub loss_trigger_multiple: Decimal,

    // Roll timing
    /// Preferred roll hour (ET, 24-hour).
    pub preferred_roll_hour: u8,
    /// Avoid overnight exposure for ITM options.
    pub avoid_itm_overnight: bool,

    // Partial fill handling
    /// Timeout for partial fills before cancellation (seconds).
    pub partial_fill_timeout_secs: u64,
    /// Assignment risk check interval during roll (seconds).
    pub assignment_check_interval_secs: u64,

    // New position parameters
    /// DTE for new position (standard roll).
    pub roll_target_dte_min: u32,
    /// DTE for new position (max).
    pub roll_target_dte_max: u32,
}

impl Default for RollConfig {
    fn default() -> Self {
        Self {
            // Time-based
            credit_dte_trigger: 7,
            urgent_dte_trigger: 3,
            profitable_dte_trigger: 21,

            // Profit/loss
            profit_target_pct: Decimal::new(50, 2),    // 50%
            loss_trigger_multiple: Decimal::new(2, 0), // 2x

            // Timing
            preferred_roll_hour: 14, // 2 PM ET
            avoid_itm_overnight: true,

            // Partial fills
            partial_fill_timeout_secs: 30,
            assignment_check_interval_secs: 5,

            // New position
            roll_target_dte_min: 7,
            roll_target_dte_max: 14,
        }
    }
}
