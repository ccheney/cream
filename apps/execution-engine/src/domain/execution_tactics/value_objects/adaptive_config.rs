//! Adaptive Tactic Configuration

use serde::{Deserialize, Serialize};

/// Urgency level for adaptive tactics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum Urgency {
    /// Start passive, only cross after extended time.
    Patient,
    /// Passive initially, cross if spread narrows or time elapses.
    #[default]
    Normal,
    /// Aggressive from start, re-price frequently.
    Urgent,
}

/// Configuration for ADAPTIVE tactic.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AdaptiveConfig {
    /// Priority level.
    pub urgency: Urgency,
    /// Cross spread if below threshold (BPS).
    pub spread_threshold_bps: u32,
}

impl Default for AdaptiveConfig {
    fn default() -> Self {
        Self {
            urgency: Urgency::Normal,
            spread_threshold_bps: 10,
        }
    }
}

impl AdaptiveConfig {
    /// Create a new adaptive configuration.
    #[must_use]
    pub const fn new(urgency: Urgency, spread_threshold_bps: u32) -> Self {
        Self {
            urgency,
            spread_threshold_bps,
        }
    }

    /// Create a patient adaptive configuration.
    #[must_use]
    pub const fn patient(spread_threshold_bps: u32) -> Self {
        Self {
            urgency: Urgency::Patient,
            spread_threshold_bps,
        }
    }

    /// Create an urgent adaptive configuration.
    #[must_use]
    pub const fn urgent(spread_threshold_bps: u32) -> Self {
        Self {
            urgency: Urgency::Urgent,
            spread_threshold_bps,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urgency_default() {
        assert_eq!(Urgency::default(), Urgency::Normal);
    }

    #[test]
    fn urgency_serde() {
        let urgency = Urgency::Patient;
        let json = serde_json::to_string(&urgency).unwrap();
        assert_eq!(json, "\"patient\"");

        let parsed: Urgency = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, Urgency::Patient);
    }

    #[test]
    fn adaptive_config_default() {
        let config = AdaptiveConfig::default();
        assert_eq!(config.urgency, Urgency::Normal);
        assert_eq!(config.spread_threshold_bps, 10);
    }

    #[test]
    fn adaptive_config_new() {
        let config = AdaptiveConfig::new(Urgency::Urgent, 20);
        assert_eq!(config.urgency, Urgency::Urgent);
        assert_eq!(config.spread_threshold_bps, 20);
    }

    #[test]
    fn adaptive_config_patient() {
        let config = AdaptiveConfig::patient(5);
        assert_eq!(config.urgency, Urgency::Patient);
        assert_eq!(config.spread_threshold_bps, 5);
    }

    #[test]
    fn adaptive_config_urgent() {
        let config = AdaptiveConfig::urgent(15);
        assert_eq!(config.urgency, Urgency::Urgent);
        assert_eq!(config.spread_threshold_bps, 15);
    }

    #[test]
    fn adaptive_config_serde() {
        let config = AdaptiveConfig::new(Urgency::Patient, 8);
        let json = serde_json::to_string(&config).unwrap();
        let parsed: AdaptiveConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, config);
    }
}
