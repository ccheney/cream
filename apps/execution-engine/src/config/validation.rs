//! Environment validation at startup.

use crate::models::Environment;

use super::Config;

/// Errors from environment validation at startup.
#[derive(Debug, thiserror::Error)]
pub enum StartupValidationError {
    /// Missing required credentials for the environment.
    #[error("Missing required credentials for {environment} mode: {details}")]
    MissingCredentials {
        /// The trading environment.
        environment: String,
        /// Details about which credentials are missing.
        details: String,
    },

    /// Invalid environment configuration.
    #[error("Invalid environment configuration: {0}")]
    InvalidConfiguration(String),
}

/// Result of startup environment validation.
#[derive(Debug)]
pub struct StartupValidation {
    /// Whether validation passed.
    pub valid: bool,
    /// Warning messages (non-fatal).
    pub warnings: Vec<String>,
}

impl StartupValidation {
    /// Create a successful validation result.
    #[must_use]
    pub const fn ok() -> Self {
        Self {
            valid: true,
            warnings: Vec::new(),
        }
    }

    /// Create a successful validation with warnings.
    #[must_use]
    pub const fn ok_with_warnings(warnings: Vec<String>) -> Self {
        Self {
            valid: true,
            warnings,
        }
    }
}

/// Validate environment configuration at startup.
///
/// This function performs environment-aware validation of credentials and
/// configuration. It ensures that:
///
/// - PAPER and LIVE modes have required broker credentials
/// - BACKTEST mode can run without credentials
/// - Clear error messages are provided for missing configuration
///
/// # Arguments
///
/// * `config` - The loaded configuration
/// * `environment` - The trading environment
///
/// # Errors
///
/// Returns `StartupValidationError` if required credentials are missing
/// for the given environment.
///
/// # Example
///
/// ```rust,ignore
/// use execution_engine::config::{Config, validate_startup_environment};
/// use execution_engine::models::Environment;
///
/// let config = load_config(None)?;
/// let env = Environment::Paper;
///
/// validate_startup_environment(&config, env)?;
/// ```
pub fn validate_startup_environment(
    config: &Config,
    environment: Environment,
) -> Result<StartupValidation, StartupValidationError> {
    match environment {
        Environment::Backtest => {
            // Backtest mode requires no credentials
            let mut warnings = Vec::new();

            if !config.brokers.alpaca.api_key.is_empty() {
                warnings.push(
                    "Alpaca credentials configured but not used in BACKTEST mode".to_string(),
                );
            }

            Ok(StartupValidation::ok_with_warnings(warnings))
        }

        Environment::Paper | Environment::Live => {
            // Paper and Live modes require Alpaca credentials
            let mut missing = Vec::new();

            if config.brokers.alpaca.api_key.is_empty() {
                missing.push("ALPACA_KEY");
            }

            if config.brokers.alpaca.api_secret.is_empty() {
                missing.push("ALPACA_SECRET");
            }

            if !missing.is_empty() {
                let env_name = if environment.is_live() {
                    "LIVE"
                } else {
                    "PAPER"
                };
                return Err(StartupValidationError::MissingCredentials {
                    environment: env_name.to_string(),
                    details: format!(
                        "Required environment variables not set: {}. \
                         Set these in your environment or config.yaml.",
                        missing.join(", ")
                    ),
                });
            }

            // Additional validation for LIVE mode
            if environment.is_live() {
                let mut warnings = Vec::new();

                // Warn if using paper API URL in live mode
                if config.brokers.alpaca.base_url.contains("paper") {
                    warnings.push(
                        "LIVE mode configured but using paper API URL. \
                         This may indicate misconfiguration."
                            .to_string(),
                    );
                }

                return Ok(StartupValidation::ok_with_warnings(warnings));
            }

            Ok(StartupValidation::ok())
        }
    }
}

/// Validate that required credentials are present, returning a detailed error message.
///
/// This is a convenience function for quick credential checks.
///
/// # Arguments
///
/// * `api_key` - The Alpaca API key
/// * `api_secret` - The Alpaca API secret
/// * `environment` - The trading environment
///
/// # Errors
///
/// Returns an error string if credentials are missing and required.
pub fn require_credentials(
    api_key: &str,
    api_secret: &str,
    environment: Environment,
) -> Result<(), String> {
    if environment.is_backtest() {
        return Ok(());
    }

    if api_key.is_empty() || api_secret.is_empty() {
        let env_name = if environment.is_live() {
            "LIVE"
        } else {
            "PAPER"
        };
        return Err(format!(
            "Alpaca credentials required for {env_name} mode.\n\n\
             Missing:\n\
             {}{}
             \n\
             To fix:\n\
             1. Set ALPACA_KEY and ALPACA_SECRET environment variables, or\n\
             2. Configure credentials in config.yaml under brokers.alpaca",
            if api_key.is_empty() {
                "  - ALPACA_KEY\n"
            } else {
                ""
            },
            if api_secret.is_empty() {
                "  - ALPACA_SECRET\n"
            } else {
                ""
            }
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{
        AlpacaConfig, BrokersConfig, CircuitBreakerConfig, ConstraintsConfig, EnvironmentConfig,
        FeedsConfig, ObservabilityConfig, PersistenceConfig, PricingConfig, ReconciliationConfig,
        RecoveryConfig, SafetyConfig, ServerConfig, StopsConfigExternal,
    };

    fn make_config_with_credentials(key: &str, secret: &str) -> Config {
        Config {
            server: ServerConfig::default(),
            feeds: FeedsConfig::default(),
            brokers: BrokersConfig {
                alpaca: AlpacaConfig {
                    api_key: key.to_string(),
                    api_secret: secret.to_string(),
                    ..Default::default()
                },
            },
            pricing: PricingConfig::default(),
            constraints: ConstraintsConfig::default(),
            observability: ObservabilityConfig::default(),
            circuit_breaker: CircuitBreakerConfig::default(),
            persistence: PersistenceConfig::default(),
            recovery: RecoveryConfig::default(),
            reconciliation: ReconciliationConfig::default(),
            safety: SafetyConfig::default(),
            stops: StopsConfigExternal::default(),
            environment: EnvironmentConfig::default(),
        }
    }

    #[test]
    fn test_backtest_no_credentials_required() {
        let config = make_config_with_credentials("", "");
        let result = validate_startup_environment(&config, Environment::Backtest);

        assert!(result.is_ok());
        let validation = match result {
            Ok(v) => v,
            Err(e) => panic!("backtest should validate without credentials: {e}"),
        };
        assert!(validation.valid);
    }

    #[test]
    fn test_backtest_with_credentials_warns() {
        let config = make_config_with_credentials("key", "secret");
        let result = validate_startup_environment(&config, Environment::Backtest);

        assert!(result.is_ok());
        let validation = match result {
            Ok(v) => v,
            Err(e) => panic!("backtest with credentials should validate: {e}"),
        };
        assert!(validation.valid);
        assert!(!validation.warnings.is_empty());
    }

    #[test]
    fn test_paper_requires_credentials() {
        let config = make_config_with_credentials("", "");
        let result = validate_startup_environment(&config, Environment::Paper);

        let Err(err) = result else {
            panic!("expected error for paper without credentials");
        };
        assert!(err.to_string().contains("PAPER"));
        assert!(err.to_string().contains("ALPACA_KEY"));
    }

    #[test]
    fn test_paper_with_credentials_ok() {
        let config = make_config_with_credentials("key", "secret");
        let result = validate_startup_environment(&config, Environment::Paper);

        assert!(result.is_ok());
    }

    #[test]
    fn test_live_requires_credentials() {
        let config = make_config_with_credentials("", "");
        let result = validate_startup_environment(&config, Environment::Live);

        let Err(err) = result else {
            panic!("expected error for live without credentials");
        };
        assert!(err.to_string().contains("LIVE"));
    }

    #[test]
    fn test_live_with_paper_url_warns() {
        let config = Config {
            brokers: BrokersConfig {
                alpaca: AlpacaConfig {
                    api_key: "key".to_string(),
                    api_secret: "secret".to_string(),
                    base_url: "https://paper-api.alpaca.markets".to_string(),
                    ..Default::default()
                },
            },
            ..make_config_with_credentials("key", "secret")
        };

        let result = validate_startup_environment(&config, Environment::Live);

        assert!(result.is_ok());
        let validation = match result {
            Ok(v) => v,
            Err(e) => panic!("live with paper URL should validate with warning: {e}"),
        };
        assert!(!validation.warnings.is_empty());
        assert!(validation.warnings[0].contains("paper"));
    }

    #[test]
    fn test_require_credentials_backtest_ok() {
        let result = require_credentials("", "", Environment::Backtest);
        assert!(result.is_ok());
    }

    #[test]
    fn test_require_credentials_paper_missing() {
        let result = require_credentials("", "", Environment::Paper);
        let Err(err) = result else {
            panic!("expected error for paper missing credentials");
        };
        assert!(err.contains("PAPER"));
        assert!(err.contains("ALPACA_KEY"));
        assert!(err.contains("ALPACA_SECRET"));
    }

    #[test]
    fn test_require_credentials_paper_partial() {
        let result = require_credentials("key", "", Environment::Paper);
        let Err(err) = result else {
            panic!("expected error for paper with partial credentials");
        };
        assert!(err.contains("ALPACA_SECRET"));
        assert!(!err.contains("ALPACA_KEY\n")); // Key should not be listed as missing
    }

    #[test]
    fn test_require_credentials_live_ok() {
        let result = require_credentials("key", "secret", Environment::Live);
        assert!(result.is_ok());
    }
}
