//! Iceberg Tactic Configuration

use serde::{Deserialize, Serialize};

/// Configuration for ICEBERG tactic.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IcebergConfig {
    /// Visible quantity per slice.
    pub display_size: u32,
    /// Apply ±30% variance to display size.
    pub randomize_size: bool,
    /// Apply ±20% variance to interval.
    pub randomize_time: bool,
    /// Minimum time between slices (milliseconds).
    pub min_interval_ms: u32,
}

impl Default for IcebergConfig {
    fn default() -> Self {
        Self {
            display_size: 100,
            randomize_size: true,
            randomize_time: true,
            min_interval_ms: 500,
        }
    }
}

impl IcebergConfig {
    /// Create a new iceberg configuration.
    #[must_use]
    pub const fn new(
        display_size: u32,
        randomize_size: bool,
        randomize_time: bool,
        min_interval_ms: u32,
    ) -> Self {
        Self {
            display_size,
            randomize_size,
            randomize_time,
            min_interval_ms,
        }
    }

    /// Create an iceberg configuration with no randomization.
    #[must_use]
    pub const fn deterministic(display_size: u32, min_interval_ms: u32) -> Self {
        Self {
            display_size,
            randomize_size: false,
            randomize_time: false,
            min_interval_ms,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iceberg_config_default() {
        let config = IcebergConfig::default();
        assert_eq!(config.display_size, 100);
        assert!(config.randomize_size);
        assert!(config.randomize_time);
        assert_eq!(config.min_interval_ms, 500);
    }

    #[test]
    fn iceberg_config_new() {
        let config = IcebergConfig::new(50, false, true, 1000);
        assert_eq!(config.display_size, 50);
        assert!(!config.randomize_size);
        assert!(config.randomize_time);
        assert_eq!(config.min_interval_ms, 1000);
    }

    #[test]
    fn iceberg_config_deterministic() {
        let config = IcebergConfig::deterministic(200, 250);
        assert_eq!(config.display_size, 200);
        assert!(!config.randomize_size);
        assert!(!config.randomize_time);
        assert_eq!(config.min_interval_ms, 250);
    }

    #[test]
    fn iceberg_config_serde() {
        let config = IcebergConfig::new(75, true, false, 750);
        let json = serde_json::to_string(&config).unwrap();
        let parsed: IcebergConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, config);
    }
}
