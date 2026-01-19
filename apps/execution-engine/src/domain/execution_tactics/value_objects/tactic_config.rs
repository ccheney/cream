//! Unified Tactic Configuration

use serde::{Deserialize, Serialize};

use super::{
    AdaptiveConfig, AggressiveLimitConfig, IcebergConfig, PassiveLimitConfig, TacticType,
    TwapConfig, VwapConfig,
};

/// Unified tactic configuration.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TacticConfig {
    /// Tactic type.
    pub tactic: TacticType,
    /// `PASSIVE_LIMIT` configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub passive_limit: Option<PassiveLimitConfig>,
    /// `AGGRESSIVE_LIMIT` configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aggressive_limit: Option<AggressiveLimitConfig>,
    /// ICEBERG configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iceberg: Option<IcebergConfig>,
    /// TWAP configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub twap: Option<TwapConfig>,
    /// VWAP configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vwap: Option<VwapConfig>,
    /// ADAPTIVE configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub adaptive: Option<AdaptiveConfig>,
}

impl TacticConfig {
    /// Create a `PASSIVE_LIMIT` tactic configuration.
    #[must_use]
    pub const fn passive_limit(config: PassiveLimitConfig) -> Self {
        Self {
            tactic: TacticType::PassiveLimit,
            passive_limit: Some(config),
            aggressive_limit: None,
            iceberg: None,
            twap: None,
            vwap: None,
            adaptive: None,
        }
    }

    /// Create an `AGGRESSIVE_LIMIT` tactic configuration.
    #[must_use]
    pub const fn aggressive_limit(config: AggressiveLimitConfig) -> Self {
        Self {
            tactic: TacticType::AggressiveLimit,
            passive_limit: None,
            aggressive_limit: Some(config),
            iceberg: None,
            twap: None,
            vwap: None,
            adaptive: None,
        }
    }

    /// Create an ICEBERG tactic configuration.
    #[must_use]
    pub const fn iceberg(config: IcebergConfig) -> Self {
        Self {
            tactic: TacticType::Iceberg,
            passive_limit: None,
            aggressive_limit: None,
            iceberg: Some(config),
            twap: None,
            vwap: None,
            adaptive: None,
        }
    }

    /// Create a TWAP tactic configuration.
    #[must_use]
    pub const fn twap(config: TwapConfig) -> Self {
        Self {
            tactic: TacticType::Twap,
            passive_limit: None,
            aggressive_limit: None,
            iceberg: None,
            twap: Some(config),
            vwap: None,
            adaptive: None,
        }
    }

    /// Create a VWAP tactic configuration.
    #[must_use]
    pub const fn vwap(config: VwapConfig) -> Self {
        Self {
            tactic: TacticType::Vwap,
            passive_limit: None,
            aggressive_limit: None,
            iceberg: None,
            twap: None,
            vwap: Some(config),
            adaptive: None,
        }
    }

    /// Create an ADAPTIVE tactic configuration.
    #[must_use]
    pub const fn adaptive(config: AdaptiveConfig) -> Self {
        Self {
            tactic: TacticType::Adaptive,
            passive_limit: None,
            aggressive_limit: None,
            iceberg: None,
            twap: None,
            vwap: None,
            adaptive: Some(config),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tactic_config_passive_limit() {
        let config = TacticConfig::passive_limit(PassiveLimitConfig::default());
        assert_eq!(config.tactic, TacticType::PassiveLimit);
        assert!(config.passive_limit.is_some());
        assert!(config.aggressive_limit.is_none());
        assert!(config.iceberg.is_none());
        assert!(config.twap.is_none());
        assert!(config.vwap.is_none());
        assert!(config.adaptive.is_none());
    }

    #[test]
    fn tactic_config_aggressive_limit() {
        let config = TacticConfig::aggressive_limit(AggressiveLimitConfig::default());
        assert_eq!(config.tactic, TacticType::AggressiveLimit);
        assert!(config.aggressive_limit.is_some());
    }

    #[test]
    fn tactic_config_iceberg() {
        let config = TacticConfig::iceberg(IcebergConfig::default());
        assert_eq!(config.tactic, TacticType::Iceberg);
        assert!(config.iceberg.is_some());
    }

    #[test]
    fn tactic_config_twap() {
        let config = TacticConfig::twap(TwapConfig::default());
        assert_eq!(config.tactic, TacticType::Twap);
        assert!(config.twap.is_some());
    }

    #[test]
    fn tactic_config_vwap() {
        let config = TacticConfig::vwap(VwapConfig::default());
        assert_eq!(config.tactic, TacticType::Vwap);
        assert!(config.vwap.is_some());
    }

    #[test]
    fn tactic_config_adaptive() {
        let config = TacticConfig::adaptive(AdaptiveConfig::default());
        assert_eq!(config.tactic, TacticType::Adaptive);
        assert!(config.adaptive.is_some());
    }

    #[test]
    fn tactic_config_serde_skips_none_fields() {
        let config = TacticConfig::passive_limit(PassiveLimitConfig::default());
        let json = serde_json::to_string(&config).unwrap();

        // Should not contain null fields
        assert!(!json.contains("\"twap\":"));
        assert!(!json.contains("\"vwap\":"));
        assert!(!json.contains("\"iceberg\":"));
        assert!(json.contains("\"passive_limit\":"));
    }

    #[test]
    fn tactic_config_serde_roundtrip() {
        let config = TacticConfig::twap(TwapConfig::default());
        let json = serde_json::to_string(&config).unwrap();
        let parsed: TacticConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, config);
    }
}
