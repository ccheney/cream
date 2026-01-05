//! Environment configuration for trading.

use serde::{Deserialize, Serialize};

/// Trading environment (BACKTEST, PAPER, or LIVE).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Environment {
    /// Historical simulation mode - no real orders.
    Backtest,
    /// Paper trading mode - simulated orders with live data.
    Paper,
    /// Live trading mode - real orders with real money.
    Live,
}

impl Environment {
    /// Returns true if this is a live trading environment.
    #[must_use]
    pub const fn is_live(&self) -> bool {
        matches!(self, Self::Live)
    }

    /// Returns true if this is a paper trading environment.
    #[must_use]
    pub const fn is_paper(&self) -> bool {
        matches!(self, Self::Paper)
    }

    /// Returns true if this is a backtest environment.
    #[must_use]
    pub const fn is_backtest(&self) -> bool {
        matches!(self, Self::Backtest)
    }

    /// Returns the Alpaca base URL for this environment.
    #[must_use]
    pub const fn alpaca_base_url(&self) -> &'static str {
        match self {
            Self::Live => "https://api.alpaca.markets",
            Self::Paper | Self::Backtest => "https://paper-api.alpaca.markets",
        }
    }
}

impl std::fmt::Display for Environment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Backtest => write!(f, "BACKTEST"),
            Self::Paper => write!(f, "PAPER"),
            Self::Live => write!(f, "LIVE"),
        }
    }
}

impl std::str::FromStr for Environment {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().as_str() {
            "BACKTEST" => Ok(Self::Backtest),
            "PAPER" => Ok(Self::Paper),
            "LIVE" => Ok(Self::Live),
            _ => Err(format!("Invalid environment: {s}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_environment_is_live() {
        assert!(Environment::Live.is_live());
        assert!(!Environment::Paper.is_live());
        assert!(!Environment::Backtest.is_live());
    }

    #[test]
    fn test_environment_alpaca_url() {
        assert_eq!(
            Environment::Live.alpaca_base_url(),
            "https://api.alpaca.markets"
        );
        assert_eq!(
            Environment::Paper.alpaca_base_url(),
            "https://paper-api.alpaca.markets"
        );
    }

    #[test]
    fn test_environment_from_str() {
        assert_eq!("LIVE".parse::<Environment>().unwrap(), Environment::Live);
        assert_eq!("paper".parse::<Environment>().unwrap(), Environment::Paper);
        assert!("invalid".parse::<Environment>().is_err());
    }
}
