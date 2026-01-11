//! Core types for parallel backtest jobs and strategies.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::backtest::config::BacktestConfig;
use crate::backtest::metrics::PerformanceSummary;

/// A strategy configuration to backtest.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyConfig {
    /// Unique strategy identifier.
    pub strategy_id: String,

    /// Strategy name/description.
    pub name: String,

    /// Strategy parameters.
    pub parameters: HashMap<String, ParamValue>,

    /// Symbols/instruments to trade.
    pub symbols: Vec<String>,

    /// Start date (ISO 8601).
    pub start_date: String,

    /// End date (ISO 8601).
    pub end_date: String,
}

/// Parameter value that can be numeric or string.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum ParamValue {
    /// Integer parameter.
    Int(i64),
    /// Decimal parameter.
    Float(f64),
    /// String parameter.
    String(String),
    /// Boolean parameter.
    Bool(bool),
}

impl ParamValue {
    /// Get as integer if applicable.
    #[must_use]
    #[allow(clippy::cast_possible_truncation)]
    pub const fn as_int(&self) -> Option<i64> {
        match self {
            Self::Int(v) => Some(*v),
            Self::Float(v) => Some(*v as i64),
            _ => None,
        }
    }

    /// Get as float if applicable.
    #[must_use]
    #[allow(clippy::cast_precision_loss)]
    pub const fn as_float(&self) -> Option<f64> {
        match self {
            Self::Int(v) => Some(*v as f64),
            Self::Float(v) => Some(*v),
            _ => None,
        }
    }

    /// Get as string.
    #[must_use]
    pub fn as_str(&self) -> String {
        match self {
            Self::Int(v) => v.to_string(),
            Self::Float(v) => v.to_string(),
            Self::String(v) => v.clone(),
            Self::Bool(v) => v.to_string(),
        }
    }
}

/// A single backtest job to execute.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestJob {
    /// Unique job identifier.
    pub job_id: String,

    /// Strategy configuration.
    pub strategy: StrategyConfig,

    /// Backtest configuration.
    pub backtest_config: BacktestConfig,

    /// Job priority (higher = run first).
    pub priority: u32,
}

/// Result from a single backtest job.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestJobResult {
    /// Job identifier.
    pub job_id: String,

    /// Strategy identifier.
    pub strategy_id: String,

    /// Parameters used.
    pub parameters: HashMap<String, ParamValue>,

    /// Performance summary.
    pub performance: Option<PerformanceSummary>,

    /// Execution time in milliseconds.
    pub execution_time_ms: u64,

    /// Error message if failed.
    pub error: Option<String>,

    /// Whether job completed successfully.
    pub success: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_param_value_conversions() {
        let int_val = ParamValue::Int(42);
        assert_eq!(int_val.as_int(), Some(42));
        assert_eq!(int_val.as_float(), Some(42.0));
        assert_eq!(int_val.as_str(), "42");

        let float_val = ParamValue::Float(3.5);
        assert_eq!(float_val.as_int(), Some(3));
        assert_eq!(float_val.as_float(), Some(3.5));

        let string_val = ParamValue::String("test".to_string());
        assert_eq!(string_val.as_int(), None);
        assert_eq!(string_val.as_str(), "test");
    }

    #[test]
    fn test_strategy_config_creation() {
        let strategy = StrategyConfig {
            strategy_id: "test_strategy".to_string(),
            name: "Test Strategy".to_string(),
            parameters: HashMap::new(),
            symbols: vec!["AAPL".to_string(), "GOOGL".to_string()],
            start_date: "2024-01-01".to_string(),
            end_date: "2024-12-31".to_string(),
        };

        assert_eq!(strategy.symbols.len(), 2);
    }

    #[test]
    fn test_backtest_job_result_serialization() {
        let result = BacktestJobResult {
            job_id: "job_1".to_string(),
            strategy_id: "strat_1".to_string(),
            parameters: HashMap::new(),
            performance: None,
            execution_time_ms: 500,
            error: Some("Test error".to_string()),
            success: false,
        };

        let json = match serde_json::to_string(&result) {
            Ok(j) => j,
            Err(e) => panic!("Serialization failed: {e}"),
        };
        assert!(json.contains("job_1"));
        assert!(json.contains("Test error"));
    }
}
