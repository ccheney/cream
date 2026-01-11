//! Performance calculator for backtest results.

use std::fmt::Write;

use rust_decimal::Decimal;

use super::constants::{DAYS_PER_YEAR, HOURS_PER_DAY, ONE, TRADING_DAYS};
use super::math::{downside_deviation, mean, std_dev};
use super::types::{EquityPoint, PerformanceSummary, TradeRecord};

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

        let (max_consecutive_wins, max_consecutive_losses) = self.calculate_consecutive_streaks();
        let (max_drawdown, max_drawdown_duration, avg_drawdown) = self.calculate_drawdown_metrics();

        let total_commission: Decimal = self.trades.iter().map(|t| t.commission).sum();

        let avg_holding_period = if total_trades > 0 {
            let total_hours: Decimal = self.trades.iter().map(|t| t.holding_period_hours).sum();
            total_hours / Decimal::from(total_trades)
        } else {
            Decimal::ZERO
        };

        let trading_period_days = self.calculate_trading_period_days();
        let annualized_return = Self::annualize_return(total_return, trading_period_days);

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
                if in_drawdown {
                    let duration = (idx - drawdown_start_idx) as u64;
                    max_duration = max_duration.max(Decimal::from(duration));
                    in_drawdown = false;
                }
                peak = point.equity;
            } else if peak > Decimal::ZERO {
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

    fn calculate_trading_period_days(&self) -> Decimal {
        if self.trades.len() < 2 {
            return ONE;
        }

        let total_hours: Decimal = self.trades.iter().map(|t| t.holding_period_hours).sum();

        if total_hours > Decimal::ZERO {
            total_hours / HOURS_PER_DAY
        } else {
            ONE
        }
    }

    fn annualize_return(total_return: Decimal, days: Decimal) -> Decimal {
        if days <= Decimal::ZERO {
            return Decimal::ZERO;
        }

        // Simple annualization: total_return * (365/days)
        let annual_factor = DAYS_PER_YEAR / days;
        total_return * annual_factor
    }

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

        let avg = mean(returns)?;
        let std = std_dev(returns)?;

        if std == Decimal::ZERO {
            return None;
        }

        let excess_return = avg - self.risk_free_rate / TRADING_DAYS;
        Some(excess_return / std)
    }

    /// Calculate Sortino ratio.
    /// Sortino = (Mean Return - Risk Free Rate) / Downside Deviation
    fn calculate_sortino(&self, returns: &[Decimal]) -> Option<Decimal> {
        if returns.len() < 2 {
            return None;
        }

        let avg = mean(returns)?;
        let downside_dev = downside_deviation(returns)?;

        if downside_dev == Decimal::ZERO {
            return None;
        }

        let excess_return = avg - self.risk_free_rate / TRADING_DAYS;
        Some(excess_return / downside_dev)
    }

    /// Export trades to CSV format.
    #[must_use]
    pub fn to_csv(&self) -> String {
        let mut csv = String::from(
            "trade_id,instrument_id,side,entry_time,entry_price,exit_time,exit_price,exit_reason,quantity,gross_pnl,commission,net_pnl,holding_period_hours\n",
        );

        for trade in &self.trades {
            let _ = writeln!(
                csv,
                "{},{},{},{},{},{},{},{:?},{},{},{},{},{}",
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
            );
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backtest::metrics::types::ExitReason;

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

        calc.add_trade(make_trade("1", "AAPL", "LONG", 10_000, 10_500, 100, 100));
        calc.add_trade(make_trade("2", "MSFT", "LONG", 10_000, 10_500, 100, 100));
        calc.add_trade(make_trade("3", "GOOG", "LONG", 10_000, 9700, 100, 100));
        calc.add_trade(make_trade("4", "AMZN", "LONG", 10_000, 9700, 100, 100));

        let summary = calc.calculate();
        assert_eq!(summary.gross_profit, Decimal::new(998, 0));
        assert_eq!(summary.gross_loss, Decimal::new(602, 0));
        let Some(pf) = summary.profit_factor else {
            panic!("profit factor should be calculated");
        };
        assert!(pf > Decimal::new(165, 2) && pf < Decimal::new(166, 2));
    }

    #[test]
    fn test_consecutive_streaks() {
        let mut calc = PerformanceCalculator::new(Decimal::new(100_000, 0));

        // W W W L L W L W W
        calc.add_trade(make_trade("1", "AAPL", "LONG", 10_000, 10_500, 100, 100));
        calc.add_trade(make_trade("2", "AAPL", "LONG", 10_000, 10_500, 100, 100));
        calc.add_trade(make_trade("3", "AAPL", "LONG", 10_000, 10_500, 100, 100));
        calc.add_trade(make_trade("4", "AAPL", "LONG", 10_000, 9500, 100, 100));
        calc.add_trade(make_trade("5", "AAPL", "LONG", 10_000, 9500, 100, 100));
        calc.add_trade(make_trade("6", "AAPL", "LONG", 10_000, 10_500, 100, 100));
        calc.add_trade(make_trade("7", "AAPL", "LONG", 10_000, 9500, 100, 100));
        calc.add_trade(make_trade("8", "AAPL", "LONG", 10_000, 10_500, 100, 100));
        calc.add_trade(make_trade("9", "AAPL", "LONG", 10_000, 10_500, 100, 100));

        let summary = calc.calculate();
        assert_eq!(summary.max_consecutive_wins, 3);
        assert_eq!(summary.max_consecutive_losses, 2);
    }

    #[test]
    fn test_drawdown_calculation() {
        let mut calc = PerformanceCalculator::new(Decimal::new(100_000, 0));

        calc.add_equity_point("2024-01-01", Decimal::new(100_000, 0));
        calc.add_equity_point("2024-01-02", Decimal::new(110_000, 0));
        calc.add_equity_point("2024-01-03", Decimal::new(105_000, 0));
        calc.add_equity_point("2024-01-04", Decimal::new(108_000, 0));
        calc.add_equity_point("2024-01-05", Decimal::new(95_000, 0));
        calc.add_equity_point("2024-01-06", Decimal::new(100_000, 0));

        let summary = calc.calculate();

        let expected_dd =
            (Decimal::new(110_000, 0) - Decimal::new(95_000, 0)) / Decimal::new(110_000, 0);
        assert_eq!(summary.max_drawdown, expected_dd);
    }

    #[test]
    fn test_expectancy() {
        let mut calc = PerformanceCalculator::new(Decimal::new(100_000, 0));

        calc.add_trade(make_trade("1", "AAPL", "LONG", 10_000, 10_500, 100, 100));
        calc.add_trade(make_trade("2", "AAPL", "LONG", 10_000, 10_500, 100, 100));
        calc.add_trade(make_trade("3", "AAPL", "LONG", 10_000, 10_500, 100, 100));
        calc.add_trade(make_trade("4", "AAPL", "LONG", 10_000, 9600, 100, 100));
        calc.add_trade(make_trade("5", "AAPL", "LONG", 10_000, 9600, 100, 100));

        let summary = calc.calculate();

        assert_eq!(summary.win_rate, Decimal::new(6, 1));
        assert_eq!(summary.avg_win, Decimal::new(499, 0));
        assert_eq!(summary.avg_loss, Decimal::new(401, 0));
        assert_eq!(summary.expectancy, Decimal::new(139, 0));
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
    fn test_payoff_ratio() {
        let mut calc = PerformanceCalculator::new(Decimal::new(100_000, 0));

        calc.add_trade(make_trade("1", "AAPL", "LONG", 10_000, 10_600, 100, 100));
        calc.add_trade(make_trade("2", "AAPL", "LONG", 10_000, 9700, 100, 100));

        let summary = calc.calculate();

        let Some(pr) = summary.payoff_ratio else {
            panic!("payoff ratio should be calculated");
        };
        assert!(pr > Decimal::new(198, 2) && pr < Decimal::new(200, 2));
    }
}
