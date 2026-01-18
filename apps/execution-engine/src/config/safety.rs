//! Safety configuration for mass cancel on broker disconnect.

use serde::{Deserialize, Serialize};

/// Safety configuration for mass cancel on broker disconnect.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyConfig {
    /// Enable mass cancel on disconnect.
    #[serde(default = "default_safety_enabled")]
    pub enabled: bool,
    /// Grace period in seconds before triggering mass cancel.
    #[serde(default = "default_grace_period")]
    pub grace_period_seconds: u64,
    /// Heartbeat interval in milliseconds.
    #[serde(default = "default_heartbeat_interval")]
    pub heartbeat_interval_ms: u64,
    /// Heartbeat timeout in seconds.
    #[serde(default = "default_heartbeat_timeout")]
    pub heartbeat_timeout_seconds: u64,
    /// Policy for GTC order handling: "include" or "exclude".
    #[serde(default = "default_gtc_policy")]
    pub gtc_policy: String,
}

impl Default for SafetyConfig {
    fn default() -> Self {
        Self {
            enabled: default_safety_enabled(),
            grace_period_seconds: default_grace_period(),
            heartbeat_interval_ms: default_heartbeat_interval(),
            heartbeat_timeout_seconds: default_heartbeat_timeout(),
            gtc_policy: default_gtc_policy(),
        }
    }
}

impl SafetyConfig {
    /// Check if safety features are enabled based on environment.
    ///
    /// Safety features are enabled by default in PAPER/LIVE modes.
    #[must_use]
    pub const fn is_enabled_for_env(&self, _env: &crate::models::Environment) -> bool {
        self.enabled
    }

    /// Convert to the internal `MassCancelConfig` type used by the safety module.
    #[must_use]
    pub fn to_mass_cancel_config(&self) -> crate::safety::MassCancelConfig {
        use crate::safety::GtcOrderPolicy;

        let gtc_policy = match self.gtc_policy.to_lowercase().as_str() {
            "exclude" => GtcOrderPolicy::Exclude,
            _ => GtcOrderPolicy::Include, // Default to include for safety
        };

        crate::safety::MassCancelConfig {
            enabled: self.enabled,
            grace_period_seconds: self.grace_period_seconds,
            gtc_policy,
            heartbeat_interval_ms: self.heartbeat_interval_ms,
            heartbeat_timeout_seconds: self.heartbeat_timeout_seconds,
        }
    }
}

const fn default_safety_enabled() -> bool {
    true
}

const fn default_grace_period() -> u64 {
    30 // 30 seconds
}

const fn default_heartbeat_interval() -> u64 {
    30_000 // 30 seconds
}

const fn default_heartbeat_timeout() -> u64 {
    10 // 10 seconds
}

fn default_gtc_policy() -> String {
    "include".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Environment;
    use crate::safety::GtcOrderPolicy;

    #[test]
    fn test_safety_config_defaults() {
        let config = SafetyConfig::default();
        assert!(config.enabled);
        assert_eq!(config.grace_period_seconds, 30);
        assert_eq!(config.heartbeat_interval_ms, 30_000);
        assert_eq!(config.heartbeat_timeout_seconds, 10);
        assert_eq!(config.gtc_policy, "include");
    }

    #[test]
    fn test_safety_config_to_mass_cancel_config() {
        let config = SafetyConfig::default();
        let mass_cancel_config = config.to_mass_cancel_config();

        assert!(mass_cancel_config.enabled);
        assert_eq!(mass_cancel_config.grace_period_seconds, 30);
        assert_eq!(mass_cancel_config.gtc_policy, GtcOrderPolicy::Include);
    }

    #[test]
    fn test_safety_config_gtc_policy_parsing() {
        // Test include
        let config = SafetyConfig {
            gtc_policy: "include".to_string(),
            ..Default::default()
        };
        let mass_cancel_config = config.to_mass_cancel_config();
        assert_eq!(mass_cancel_config.gtc_policy, GtcOrderPolicy::Include);

        // Test exclude
        let config = SafetyConfig {
            gtc_policy: "exclude".to_string(),
            ..Default::default()
        };
        let mass_cancel_config = config.to_mass_cancel_config();
        assert_eq!(mass_cancel_config.gtc_policy, GtcOrderPolicy::Exclude);

        // Test default on unknown
        let config = SafetyConfig {
            gtc_policy: "unknown".to_string(),
            ..Default::default()
        };
        let mass_cancel_config = config.to_mass_cancel_config();
        assert_eq!(mass_cancel_config.gtc_policy, GtcOrderPolicy::Include);
    }

    #[test]
    fn test_safety_config_is_enabled_for_env() {
        let config = SafetyConfig::default();

        // Safety should be enabled for PAPER and LIVE
        assert!(config.is_enabled_for_env(&Environment::Paper));
        assert!(config.is_enabled_for_env(&Environment::Live));

        // Explicitly disabled config
        let disabled_config = SafetyConfig {
            enabled: false,
            ..Default::default()
        };
        assert!(!disabled_config.is_enabled_for_env(&Environment::Paper));
        assert!(!disabled_config.is_enabled_for_env(&Environment::Live));
    }
}
