//! Performance metrics calculation for backtest evaluation.
//!
//! Implements standard trading performance metrics:
//! - Sharpe ratio (risk-adjusted returns)
//! - Sortino ratio (downside risk-adjusted returns)
//! - Calmar ratio (drawdown-adjusted returns)
//! - Maximum drawdown (peak-to-trough decline)
//! - Profit factor (gross profit / gross loss)
//! - Win rate, expectancy, and trade statistics

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

// Decimal constants
#[allow(dead_code)]
const ZERO: Decimal = Decimal::ZERO;
const ONE: Decimal = Decimal::ONE;
const TWO: Decimal = Decimal::TWO;
const HUNDRED: Decimal = Decimal::ONE_HUNDRED;
const DAYS_PER_YEAR: Decimal = Decimal::from_parts(365, 0, 0, false, 0);
const TRADING_DAYS: Decimal = Decimal::from_parts(252, 0, 0, false, 0);
const HOURS_PER_DAY: Decimal = Decimal::from_parts(24, 0, 0, false, 0);
const TOLERANCE: Decimal = Decimal::from_parts(1, 0, 0, false, 7); // 0.0000001

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

/// Performance calculator for backtest results.
#[derive(Debug, Default)]
pub struct PerformanceCalculator {
    trades: Vec<TradeRecord>,
    equity_curve: Vec<EquityPoint>,
    initial_equity: Decimal,
    risk_free_rate: Decimal,
}

impl PerformanceCalculator {
    /// Create a new performance calculator.
    #[must_use]
    pub fn new(initial_equity: Decimal) -> Self {
        Self {
            trades: Vec::new(),
            equity_curve: Vec::new(),
            initial_equity,
            risk_free_rate: Decimal::new(5, 2), // 5% default risk-free rate
        }
    }

    /// Set the risk-free rate for Sharpe/Sortino calculations.
    pub const fn set_risk_free_rate(&mut self, rate: Decimal) {
        self.risk_free_rate = rate;
    }

    /// Add a completed trade.
    pub fn add_trade(&mut self, trade: TradeRecord) {
        self.trades.push(trade);
    }

    /// Add an equity point to the curve.
    pub fn add_equity_point(&mut self, timestamp: &str, equity: Decimal) {
        self.equity_curve.push(EquityPoint {
            timestamp: timestamp.to_string(),
            equity,
        });
    }

    /// Get all trades.
    #[must_use]
    pub fn trades(&self) -> &[TradeRecord] {
        &self.trades
    }

    /// Get the equity curve.
    #[must_use]
    pub fn equity_curve(&self) -> &[EquityPoint] {
        &self.equity_curve
    }

    /// Calculate all performance metrics.
    #[must_use]
    pub fn calculate(&self) -> PerformanceSummary {
        if self.trades.is_empty() && self.equity_curve.is_empty() {
            return PerformanceSummary {
                initial_equity: self.initial_equity,
                final_equity: self.initial_equity,
                ..Default::default()
            };
        }

        let final_equity = self
            .equity_curve
            .last()
            .map_or(self.initial_equity, |e| e.equity);

        let total_return = if self.initial_equity > Decimal::ZERO {
            (final_equity - self.initial_equity) / self.initial_equity
        } else {
            Decimal::ZERO
        };

        // Calculate trade statistics
        let (gross_profit, gross_loss, winning_trades, losing_trades) =
            self.calculate_trade_stats();
        let total_trades = self.trades.len() as u64;

        let win_rate = if total_trades > 0 {
            Decimal::from(winning_trades) / Decimal::from(total_trades)
        } else {
            Decimal::ZERO
        };

        let avg_win = if winning_trades > 0 {
            gross_profit / Decimal::from(winning_trades)
        } else {
            Decimal::ZERO
        };

        let avg_loss = if losing_trades > 0 {
            gross_loss / Decimal::from(losing_trades)
        } else {
            Decimal::ZERO
        };

        let profit_factor = if gross_loss > Decimal::ZERO {
            Some(gross_profit / gross_loss)
        } else if gross_profit > Decimal::ZERO {
            None // Infinite (no losses)
        } else {
            None
        };

        let payoff_ratio = if avg_loss > Decimal::ZERO {
            Some(avg_win / avg_loss)
        } else {
            None
        };

        // Expectancy = (WinRate * AvgWin) - (LossRate * AvgLoss)
        let loss_rate = Decimal::ONE - win_rate;
        let expectancy = (win_rate * avg_win) - (loss_rate * avg_loss);

        // Calculate consecutive wins/losses
        let (max_consecutive_wins, max_consecutive_losses) = self.calculate_consecutive_streaks();

        // Calculate drawdown metrics
        let (max_drawdown, max_drawdown_duration, avg_drawdown) = self.calculate_drawdown_metrics();

        // Calculate total commission
        let total_commission: Decimal = self.trades.iter().map(|t| t.commission).sum();

        // Calculate average holding period
        let avg_holding_period = if total_trades > 0 {
            let total_hours: Decimal = self.trades.iter().map(|t| t.holding_period_hours).sum();
            total_hours / Decimal::from(total_trades)
        } else {
            Decimal::ZERO
        };

        // Calculate trading period in days
        let trading_period_days = self.calculate_trading_period_days();

        // Calculate annualized return
        let annualized_return = Self::annualize_return(total_return, trading_period_days);

        // Calculate risk-adjusted metrics
        let returns = self.calculate_period_returns();
        let sharpe_ratio = self.calculate_sharpe(&returns);
        let sortino_ratio = self.calculate_sortino(&returns);
        let calmar_ratio = if max_drawdown > Decimal::ZERO {
            Some(annualized_return / max_drawdown)
        } else {
            None
        };

        PerformanceSummary {
            total_return,
            annualized_return,
            initial_equity: self.initial_equity,
            final_equity,
            sharpe_ratio,
            sortino_ratio,
            calmar_ratio,
            max_drawdown,
            max_drawdown_duration_hours: max_drawdown_duration,
            avg_drawdown,
            total_trades,
            winning_trades,
            losing_trades,
            win_rate,
            profit_factor,
            avg_win,
            avg_loss,
            expectancy,
            payoff_ratio,
            max_consecutive_wins,
            max_consecutive_losses,
            gross_profit,
            gross_loss,
            total_commission,
            avg_holding_period_hours: avg_holding_period,
            trading_period_days,
        }
    }

    /// Calculate basic trade statistics.
    fn calculate_trade_stats(&self) -> (Decimal, Decimal, u64, u64) {
        let mut gross_profit = Decimal::ZERO;
        let mut gross_loss = Decimal::ZERO;
        let mut winning = 0u64;
        let mut losing = 0u64;

        for trade in &self.trades {
            if trade.net_pnl > Decimal::ZERO {
                gross_profit += trade.net_pnl;
                winning += 1;
            } else if trade.net_pnl < Decimal::ZERO {
                gross_loss += trade.net_pnl.abs();
                losing += 1;
            }
        }

        (gross_profit, gross_loss, winning, losing)
    }

    /// Calculate consecutive win/loss streaks.
    fn calculate_consecutive_streaks(&self) -> (u64, u64) {
        let mut max_wins = 0u64;
        let mut max_losses = 0u64;
        let mut current_wins = 0u64;
        let mut current_losses = 0u64;

        for trade in &self.trades {
            if trade.is_winner() {
                current_wins += 1;
                current_losses = 0;
                max_wins = max_wins.max(current_wins);
            } else if trade.net_pnl < Decimal::ZERO {
                current_losses += 1;
                current_wins = 0;
                max_losses = max_losses.max(current_losses);
            }
        }

        (max_wins, max_losses)
    }

    /// Calculate drawdown metrics from equity curve.
    fn calculate_drawdown_metrics(&self) -> (Decimal, Decimal, Decimal) {
        if self.equity_curve.is_empty() {
            return (Decimal::ZERO, Decimal::ZERO, Decimal::ZERO);
        }

        let mut peak = self.initial_equity;
        let mut max_drawdown = Decimal::ZERO;
        let mut max_duration = Decimal::ZERO;
        let mut drawdown_sum = Decimal::ZERO;
        let mut drawdown_count = 0u64;

        let mut in_drawdown = false;
        let mut drawdown_start_idx = 0usize;

        for (idx, point) in self.equity_curve.iter().enumerate() {
            if point.equity > peak {
                // New peak
                if in_drawdown {
                    // End of drawdown - calculate duration
                    let duration = (idx - drawdown_start_idx) as u64;
                    max_duration = max_duration.max(Decimal::from(duration));
                    in_drawdown = false;
                }
                peak = point.equity;
            } else if peak > Decimal::ZERO {
                // In drawdown
                let drawdown = (peak - point.equity) / peak;
                max_drawdown = max_drawdown.max(drawdown);
                drawdown_sum += drawdown;
                drawdown_count += 1;

                if !in_drawdown {
                    in_drawdown = true;
                    drawdown_start_idx = idx;
                }
            }
        }

        // If still in drawdown at end
        if in_drawdown {
            let duration = (self.equity_curve.len() - drawdown_start_idx) as u64;
            max_duration = max_duration.max(Decimal::from(duration));
        }

        let avg_drawdown = if drawdown_count > 0 {
            drawdown_sum / Decimal::from(drawdown_count)
        } else {
            Decimal::ZERO
        };

        (max_drawdown, max_duration, avg_drawdown)
    }

    /// Calculate trading period in days.
    fn calculate_trading_period_days(&self) -> Decimal {
        if self.trades.len() < 2 {
            return ONE;
        }

        // Sum up all holding periods and convert to days
        let total_hours: Decimal = self.trades.iter().map(|t| t.holding_period_hours).sum();

        if total_hours > Decimal::ZERO {
            total_hours / HOURS_PER_DAY
        } else {
            ONE
        }
    }

    /// Annualize a return given the trading period.
    fn annualize_return(total_return: Decimal, days: Decimal) -> Decimal {
        if days <= Decimal::ZERO {
            return Decimal::ZERO;
        }

        // Simple annualization: (1 + total_return)^(365/days) - 1
        // Using approximation: total_return * (365/days) for small returns
        let annual_factor = DAYS_PER_YEAR / days;

        // For more accurate calculation with compounding
        // We'll use the approximation for simplicity
        total_return * annual_factor
    }

    /// Calculate period returns from equity curve.
    fn calculate_period_returns(&self) -> Vec<Decimal> {
        if self.equity_curve.len() < 2 {
            return Vec::new();
        }

        let mut returns = Vec::new();
        for i in 1..self.equity_curve.len() {
            let prev = self.equity_curve[i - 1].equity;
            let curr = self.equity_curve[i].equity;

            if prev > Decimal::ZERO {
                returns.push((curr - prev) / prev);
            }
        }

        returns
    }

    /// Calculate Sharpe ratio.
    /// Sharpe = (Mean Return - Risk Free Rate) / StdDev(Returns)
    fn calculate_sharpe(&self, returns: &[Decimal]) -> Option<Decimal> {
        if returns.len() < 2 {
            return None;
        }

        let mean = mean(returns)?;
        let std = std_dev(returns)?;

        if std == Decimal::ZERO {
            return None;
        }

        // Annualize: assuming returns are per-period (e.g., hourly)
        // For simplicity, return the ratio without annualization adjustment
        let excess_return = mean - self.risk_free_rate / TRADING_DAYS; // Daily risk-free rate
        Some(excess_return / std)
    }

    /// Calculate Sortino ratio.
    /// Sortino = (Mean Return - Risk Free Rate) / Downside Deviation
    fn calculate_sortino(&self, returns: &[Decimal]) -> Option<Decimal> {
        if returns.len() < 2 {
            return None;
        }

        let mean = mean(returns)?;
        let downside_dev = downside_deviation(returns)?;

        if downside_dev == Decimal::ZERO {
            return None;
        }

        let excess_return = mean - self.risk_free_rate / TRADING_DAYS;
        Some(excess_return / downside_dev)
    }

    /// Export trades to CSV format.
    #[must_use]
    pub fn to_csv(&self) -> String {
        let mut csv = String::from(
            "trade_id,instrument_id,side,entry_time,entry_price,exit_time,exit_price,exit_reason,quantity,gross_pnl,commission,net_pnl,holding_period_hours\n",
        );

        for trade in &self.trades {
            csv.push_str(&format!(
                "{},{},{},{},{},{},{},{:?},{},{},{},{},{}\n",
                trade.trade_id,
                trade.instrument_id,
                trade.side,
                trade.entry_time,
                trade.entry_price,
                trade.exit_time,
                trade.exit_price,
                trade.exit_reason,
                trade.quantity,
                trade.gross_pnl,
                trade.commission,
                trade.net_pnl,
                trade.holding_period_hours,
            ));
        }

        csv
    }

    /// Export summary to JSON.
    #[must_use]
    pub fn summary_to_json(&self) -> String {
        let summary = self.calculate();
        serde_json::to_string_pretty(&summary).unwrap_or_default()
    }
}

/// Calculate mean of a slice of decimals.
fn mean(values: &[Decimal]) -> Option<Decimal> {
    if values.is_empty() {
        return None;
    }
    let sum: Decimal = values.iter().sum();
    Some(sum / Decimal::from(values.len() as u64))
}

/// Calculate standard deviation of a slice of decimals.
fn std_dev(values: &[Decimal]) -> Option<Decimal> {
    if values.len() < 2 {
        return None;
    }

    let avg = mean(values)?;
    let variance_sum: Decimal = values.iter().map(|v| (*v - avg) * (*v - avg)).sum();

    let variance = variance_sum / Decimal::from((values.len() - 1) as u64);

    // Approximate square root using Newton's method
    sqrt_decimal(variance)
}

/// Calculate downside deviation (only negative returns).
fn downside_deviation(values: &[Decimal]) -> Option<Decimal> {
    if values.len() < 2 {
        return None;
    }

    let negative_returns: Vec<Decimal> = values
        .iter()
        .filter(|v| **v < Decimal::ZERO)
        .copied()
        .collect();

    if negative_returns.is_empty() {
        return Some(Decimal::ZERO);
    }

    let variance_sum: Decimal = negative_returns.iter().map(|v| *v * *v).sum();
    let variance = variance_sum / Decimal::from(values.len() as u64); // Use total count

    sqrt_decimal(variance)
}

/// Approximate square root using Newton's method.
fn sqrt_decimal(value: Decimal) -> Option<Decimal> {
    if value < Decimal::ZERO {
        return None;
    }
    if value == Decimal::ZERO {
        return Some(Decimal::ZERO);
    }

    // Newton's method for square root
    let mut guess = value / TWO;

    for _ in 0..50 {
        let next = (guess + value / guess) / TWO;
        if (next - guess).abs() < TOLERANCE {
            return Some(next);
        }
        guess = next;
    }

    Some(guess)
}

/// Format a decimal as percentage string.
#[must_use]
pub fn format_pct(value: Decimal) -> String {
    format!("{:.2}%", value * HUNDRED)
}

/// Format a decimal with 2 decimal places.
#[must_use]
pub fn format_decimal(value: Decimal) -> String {
    format!("{value:.2}")
}

/// Format an optional decimal ratio.
#[must_use]
pub fn format_ratio(value: Option<Decimal>) -> String {
    match value {
        Some(v) => format!("{v:.2}"),
        None => "N/A".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_trade(
        id: &str,
        instrument: &str,
        side: &str,
        entry_price: i64,
        exit_price: i64,
        qty: i64,
        commission: i64,
    ) -> TradeRecord {
        let entry = Decimal::new(entry_price, 2);
        let exit = Decimal::new(exit_price, 2);
        let q = Decimal::new(qty, 0);
        let comm = Decimal::new(commission, 2);

        let pnl_per_share = if side == "LONG" {
            exit - entry
        } else {
            entry - exit
        };

        let gross_pnl = pnl_per_share * q;
        let net_pnl = gross_pnl - comm;

        TradeRecord {
            trade_id: id.to_string(),
            instrument_id: instrument.to_string(),
            side: side.to_string(),
            entry_time: "2024-01-01T10:00:00Z".to_string(),
            entry_price: entry,
            entry_slippage_bps: Decimal::ZERO,
            exit_time: "2024-01-01T14:00:00Z".to_string(),
            exit_price: exit,
            exit_slippage_bps: Decimal::ZERO,
            exit_reason: ExitReason::Target,
            quantity: q,
            gross_pnl,
            commission: comm,
            net_pnl,
            holding_period_hours: Decimal::new(4, 0),
        }
    }

    #[test]
    fn test_trade_is_winner() {
        let winner = make_trade("1", "AAPL", "LONG", 10_000, 10_500, 100, 200);
        assert!(winner.is_winner());

        let loser = make_trade("2", "AAPL", "LONG", 10_500, 10_000, 100, 200);
        assert!(!loser.is_winner());
    }

    #[test]
    fn test_win_rate() {
        let mut calc = PerformanceCalculator::new(Decimal::new(100_000, 0));

        // Add 3 winners and 2 losers
        calc.add_trade(make_trade("1", "AAPL", "LONG", 10_000, 10_500, 100, 100));
        calc.add_trade(make_trade("2", "MSFT", "LONG", 10_000, 10_300, 100, 100));
        calc.add_trade(make_trade("3", "GOOG", "LONG", 10_000, 10_200, 100, 100));
        calc.add_trade(make_trade("4", "AMZN", "LONG", 10_000, 9500, 100, 100));
        calc.add_trade(make_trade("5", "META", "LONG", 10_000, 9700, 100, 100));

        let summary = calc.calculate();
        assert_eq!(summary.total_trades, 5);
        assert_eq!(summary.winning_trades, 3);
        assert_eq!(summary.losing_trades, 2);
        assert_eq!(summary.win_rate, Decimal::new(6, 1)); // 0.6
    }

    #[test]
    fn test_profit_factor() {
        let mut calc = PerformanceCalculator::new(Decimal::new(100_000, 0));

        // Winners: entry $100, exit $105 = $5*100 - $1 comm = $499 net each
        // Losers: entry $100, exit $97 = -$3*100 - $1 comm = -$301 net each
        calc.add_trade(make_trade("1", "AAPL", "LONG", 10_000, 10_500, 100, 100));
        calc.add_trade(make_trade("2", "MSFT", "LONG", 10_000, 10_500, 100, 100));
        calc.add_trade(make_trade("3", "GOOG", "LONG", 10_000, 9700, 100, 100));
        calc.add_trade(make_trade("4", "AMZN", "LONG", 10_000, 9700, 100, 100));

        let summary = calc.calculate();
        // 2 winners * $499 = $998 total profit
        assert_eq!(summary.gross_profit, Decimal::new(998, 0));
        // 2 losers * $301 = $602 total loss
        assert_eq!(summary.gross_loss, Decimal::new(602, 0));
        // Profit factor = 998/602 ≈ 1.658
        let Some(pf) = summary.profit_factor else {
            panic!("profit factor should be calculated");
        };
        assert!(pf > Decimal::new(165, 2) && pf < Decimal::new(166, 2));
    }

    #[test]
    fn test_consecutive_streaks() {
        let mut calc = PerformanceCalculator::new(Decimal::new(100_000, 0));

        // W W W L L W L W W
        calc.add_trade(make_trade("1", "AAPL", "LONG", 10_000, 10_500, 100, 100)); // W
        calc.add_trade(make_trade("2", "AAPL", "LONG", 10_000, 10_500, 100, 100)); // W
        calc.add_trade(make_trade("3", "AAPL", "LONG", 10_000, 10_500, 100, 100)); // W
        calc.add_trade(make_trade("4", "AAPL", "LONG", 10_000, 9500, 100, 100)); // L
        calc.add_trade(make_trade("5", "AAPL", "LONG", 10_000, 9500, 100, 100)); // L
        calc.add_trade(make_trade("6", "AAPL", "LONG", 10_000, 10_500, 100, 100)); // W
        calc.add_trade(make_trade("7", "AAPL", "LONG", 10_000, 9500, 100, 100)); // L
        calc.add_trade(make_trade("8", "AAPL", "LONG", 10_000, 10_500, 100, 100)); // W
        calc.add_trade(make_trade("9", "AAPL", "LONG", 10_000, 10_500, 100, 100)); // W

        let summary = calc.calculate();
        assert_eq!(summary.max_consecutive_wins, 3);
        assert_eq!(summary.max_consecutive_losses, 2);
    }

    #[test]
    fn test_drawdown_calculation() {
        let mut calc = PerformanceCalculator::new(Decimal::new(100_000, 0));

        // Equity curve: 100k -> 110k -> 105k -> 108k -> 95k -> 100k
        calc.add_equity_point("2024-01-01", Decimal::new(100_000, 0));
        calc.add_equity_point("2024-01-02", Decimal::new(110_000, 0));
        calc.add_equity_point("2024-01-03", Decimal::new(105_000, 0)); // 4.5% dd from peak
        calc.add_equity_point("2024-01-04", Decimal::new(108_000, 0)); // 1.8% dd from peak
        calc.add_equity_point("2024-01-05", Decimal::new(95_000, 0)); // 13.6% dd from peak
        calc.add_equity_point("2024-01-06", Decimal::new(100_000, 0)); // 9% dd from peak

        let summary = calc.calculate();

        // Max drawdown should be ~13.6% (95_000 vs 110_000 peak)
        let expected_dd =
            (Decimal::new(110_000, 0) - Decimal::new(95_000, 0)) / Decimal::new(110_000, 0);
        assert_eq!(summary.max_drawdown, expected_dd);
    }

    #[test]
    fn test_expectancy() {
        let mut calc = PerformanceCalculator::new(Decimal::new(100_000, 0));

        // Winners: entry $100, exit $105 = $5*100 - $1 = $499 net each
        // Losers: entry $100, exit $96 = -$4*100 - $1 = -$401 net each
        calc.add_trade(make_trade("1", "AAPL", "LONG", 10_000, 10_500, 100, 100)); // +$499
        calc.add_trade(make_trade("2", "AAPL", "LONG", 10_000, 10_500, 100, 100)); // +$499
        calc.add_trade(make_trade("3", "AAPL", "LONG", 10_000, 10_500, 100, 100)); // +$499
        calc.add_trade(make_trade("4", "AAPL", "LONG", 10_000, 9600, 100, 100)); // -$401
        calc.add_trade(make_trade("5", "AAPL", "LONG", 10_000, 9600, 100, 100)); // -$401

        let summary = calc.calculate();

        // Win rate = 3/5 = 0.6
        assert_eq!(summary.win_rate, Decimal::new(6, 1));

        // Avg win = 1497 / 3 = 499
        assert_eq!(summary.avg_win, Decimal::new(499, 0));

        // Avg loss = 802 / 2 = 401
        assert_eq!(summary.avg_loss, Decimal::new(401, 0));

        // Expectancy = 0.6 * 499 - 0.4 * 401 = 299.4 - 160.4 = 139
        assert_eq!(summary.expectancy, Decimal::new(139, 0));
    }

    #[test]
    fn test_mean() {
        let values = vec![
            Decimal::new(10, 0),
            Decimal::new(20, 0),
            Decimal::new(30, 0),
            Decimal::new(40, 0),
        ];
        assert_eq!(mean(&values), Some(Decimal::new(25, 0)));
    }

    #[test]
    fn test_std_dev() {
        let values = vec![
            Decimal::new(10, 0),
            Decimal::new(20, 0),
            Decimal::new(30, 0),
            Decimal::new(40, 0),
        ];
        let Some(std) = std_dev(&values) else {
            panic!("std_dev should succeed for non-empty values");
        };
        // Expected std dev ~ 12.9
        assert!(std > Decimal::new(12, 0) && std < Decimal::new(14, 0));
    }

    #[test]
    fn test_sqrt() {
        let Some(sqrt4) = sqrt_decimal(Decimal::new(4, 0)) else {
            panic!("sqrt of 4 should succeed");
        };
        assert!((sqrt4 - Decimal::new(2, 0)).abs() < Decimal::new(1, 3));

        let Some(sqrt9) = sqrt_decimal(Decimal::new(9, 0)) else {
            panic!("sqrt of 9 should succeed");
        };
        assert!((sqrt9 - Decimal::new(3, 0)).abs() < Decimal::new(1, 3));
    }

    #[test]
    fn test_csv_export() {
        let mut calc = PerformanceCalculator::new(Decimal::new(100_000, 0));
        calc.add_trade(make_trade("1", "AAPL", "LONG", 10_000, 10_500, 100, 100));

        let csv = calc.to_csv();
        assert!(csv.contains("trade_id"));
        assert!(csv.contains("AAPL"));
        assert!(csv.contains("LONG"));
    }

    #[test]
    fn test_empty_trades() {
        let calc = PerformanceCalculator::new(Decimal::new(100_000, 0));
        let summary = calc.calculate();

        assert_eq!(summary.total_trades, 0);
        assert_eq!(summary.win_rate, Decimal::ZERO);
        assert_eq!(summary.initial_equity, Decimal::new(100_000, 0));
    }

    #[test]
    fn test_format_helpers() {
        assert_eq!(format_pct(Decimal::new(1523, 4)), "15.23%"); // 0.1523
        // Decimal::new(123_456, 3) = 123.456, formatted as 123.45 (truncation)
        assert_eq!(format_decimal(Decimal::new(123_456, 3)), "123.45");
        assert_eq!(format_ratio(Some(Decimal::new(235, 2))), "2.35"); // 2.35
        assert_eq!(format_ratio(None), "N/A");
    }

    #[test]
    fn test_payoff_ratio() {
        let mut calc = PerformanceCalculator::new(Decimal::new(100_000, 0));

        // Winner: entry $100, exit $106 = $6*100 - $1 = $599 net
        // Loser: entry $100, exit $97 = -$3*100 - $1 = -$301 net
        calc.add_trade(make_trade("1", "AAPL", "LONG", 10_000, 10_600, 100, 100)); // +$599
        calc.add_trade(make_trade("2", "AAPL", "LONG", 10_000, 9700, 100, 100)); // -$301

        let summary = calc.calculate();

        // Payoff ratio = avg_win / avg_loss = 599 / 301 ≈ 1.99
        let Some(pr) = summary.payoff_ratio else {
            panic!("payoff ratio should be calculated");
        };
        assert!(pr > Decimal::new(198, 2) && pr < Decimal::new(200, 2));
    }
}
