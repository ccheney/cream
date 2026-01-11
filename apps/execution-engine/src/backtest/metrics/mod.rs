//! Performance metrics calculation for backtest evaluation.
//!
//! Implements standard trading performance metrics:
//! - Sharpe ratio (risk-adjusted returns)
//! - Sortino ratio (downside risk-adjusted returns)
//! - Calmar ratio (drawdown-adjusted returns)
//! - Maximum drawdown (peak-to-trough decline)
//! - Profit factor (gross profit / gross loss)
//! - Win rate, expectancy, and trade statistics

mod calculator;
mod constants;
mod format;
mod math;
mod types;

pub use calculator::PerformanceCalculator;
pub use format::{format_decimal, format_pct, format_ratio};
pub use types::{DrawdownPoint, EquityPoint, ExitReason, PerformanceSummary, TradeRecord};
