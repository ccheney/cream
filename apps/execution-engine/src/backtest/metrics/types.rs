//! Core types for backtest performance metrics.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::constants::HUNDRED;

/// Exit reason for a trade.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExitReason {
    /// Take-profit target reached.
    Target,
    /// Stop-loss triggered.
    Stop,
    /// Signal from strategy.
    Signal,
    /// Option expiry.
    Expiry,
    /// Manual or forced close.
    Manual,
}

/// A completed trade record for backtest logging.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeRecord {
    /// Unique trade identifier.
    pub trade_id: String,
    /// Instrument identifier.
    pub instrument_id: String,
    /// Position side (LONG/SHORT).
    pub side: String,
    /// Entry timestamp (ISO 8601).
    pub entry_time: String,
    /// Entry price.
    pub entry_price: Decimal,
    /// Entry slippage (bps).
    pub entry_slippage_bps: Decimal,
    /// Exit timestamp (ISO 8601).
    pub exit_time: String,
    /// Exit price.
    pub exit_price: Decimal,
    /// Exit slippage (bps).
    pub exit_slippage_bps: Decimal,
    /// Reason for exit.
    pub exit_reason: ExitReason,
    /// Quantity traded.
    pub quantity: Decimal,
    /// Gross P&L (before commission).
    pub gross_pnl: Decimal,
    /// Total commission paid.
    pub commission: Decimal,
    /// Net P&L (after commission).
    pub net_pnl: Decimal,
    /// Holding period in hours.
    pub holding_period_hours: Decimal,
}

impl TradeRecord {
    /// Check if this trade was profitable.
    #[must_use]
    pub fn is_winner(&self) -> bool {
        self.net_pnl > Decimal::ZERO
    }

    /// Get the return percentage.
    #[must_use]
    pub fn return_pct(&self) -> Decimal {
        if self.entry_price == Decimal::ZERO {
            return Decimal::ZERO;
        }
        let cost = self.entry_price * self.quantity;
        if cost == Decimal::ZERO {
            return Decimal::ZERO;
        }
        (self.net_pnl / cost) * HUNDRED
    }
}

/// Drawdown tracking point.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrawdownPoint {
    /// Timestamp.
    pub timestamp: String,
    /// Equity value.
    pub equity: Decimal,
    /// Peak equity so far.
    pub peak: Decimal,
    /// Current drawdown (as positive decimal, e.g., 0.10 = 10%).
    pub drawdown: Decimal,
}

/// Equity curve point for tracking cumulative P&L.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EquityPoint {
    /// Timestamp.
    pub timestamp: String,
    /// Cumulative equity.
    pub equity: Decimal,
}

/// Performance summary with all calculated metrics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceSummary {
    // Basic metrics
    /// Total return (decimal, e.g., 0.15 = 15%).
    pub total_return: Decimal,
    /// Annualized return (decimal).
    pub annualized_return: Decimal,
    /// Initial equity.
    pub initial_equity: Decimal,
    /// Final equity.
    pub final_equity: Decimal,

    // Risk-adjusted metrics
    /// Sharpe ratio (>1 good, >2 excellent).
    pub sharpe_ratio: Option<Decimal>,
    /// Sortino ratio (>1 acceptable).
    pub sortino_ratio: Option<Decimal>,
    /// Calmar ratio (>3 good).
    pub calmar_ratio: Option<Decimal>,

    // Drawdown metrics
    /// Maximum drawdown (positive decimal, e.g., 0.20 = 20%).
    pub max_drawdown: Decimal,
    /// Maximum drawdown duration in hours.
    pub max_drawdown_duration_hours: Decimal,
    /// Average drawdown.
    pub avg_drawdown: Decimal,

    // Trade statistics
    /// Total number of trades.
    pub total_trades: u64,
    /// Number of winning trades.
    pub winning_trades: u64,
    /// Number of losing trades.
    pub losing_trades: u64,
    /// Win rate (decimal, e.g., 0.55 = 55%).
    pub win_rate: Decimal,
    /// Profit factor (gross profit / gross loss, >1.5 good).
    pub profit_factor: Option<Decimal>,
    /// Average winning trade.
    pub avg_win: Decimal,
    /// Average losing trade (positive value).
    pub avg_loss: Decimal,
    /// Expectancy per trade.
    pub expectancy: Decimal,
    /// Payoff ratio (avg win / avg loss).
    pub payoff_ratio: Option<Decimal>,
    /// Maximum consecutive wins.
    pub max_consecutive_wins: u64,
    /// Maximum consecutive losses.
    pub max_consecutive_losses: u64,

    // Additional stats
    /// Gross profit.
    pub gross_profit: Decimal,
    /// Gross loss (positive value).
    pub gross_loss: Decimal,
    /// Total commission paid.
    pub total_commission: Decimal,
    /// Average holding period in hours.
    pub avg_holding_period_hours: Decimal,
    /// Total trading period in days.
    pub trading_period_days: Decimal,
}

impl Default for PerformanceSummary {
    fn default() -> Self {
        Self {
            total_return: Decimal::ZERO,
            annualized_return: Decimal::ZERO,
            initial_equity: Decimal::ZERO,
            final_equity: Decimal::ZERO,
            sharpe_ratio: None,
            sortino_ratio: None,
            calmar_ratio: None,
            max_drawdown: Decimal::ZERO,
            max_drawdown_duration_hours: Decimal::ZERO,
            avg_drawdown: Decimal::ZERO,
            total_trades: 0,
            winning_trades: 0,
            losing_trades: 0,
            win_rate: Decimal::ZERO,
            profit_factor: None,
            avg_win: Decimal::ZERO,
            avg_loss: Decimal::ZERO,
            expectancy: Decimal::ZERO,
            payoff_ratio: None,
            max_consecutive_wins: 0,
            max_consecutive_losses: 0,
            gross_profit: Decimal::ZERO,
            gross_loss: Decimal::ZERO,
            total_commission: Decimal::ZERO,
            avg_holding_period_hours: Decimal::ZERO,
            trading_period_days: Decimal::ZERO,
        }
    }
}
