//! Account and position types for Alpaca.

use rust_decimal::Decimal;

use super::api_types::AlpacaPositionResponse;

/// Account information from Alpaca.
#[derive(Debug, Clone)]
pub struct AccountInfo {
    /// Account ID.
    pub account_id: String,
    /// Total equity.
    pub equity: Decimal,
    /// Buying power (with margin).
    pub buying_power: Decimal,
    /// Cash balance.
    pub cash: Decimal,
    /// Maintenance margin used.
    pub margin_used: Decimal,
    /// Day trade count (for PDT rule).
    pub daytrade_count: i32,
    /// Whether account is flagged as pattern day trader.
    pub pattern_day_trader: bool,
    /// Previous day's closing equity (for PDT $25k threshold check).
    pub last_equity: Decimal,
    /// Day trading buying power (4x equity for PDT accounts, Reg T otherwise).
    pub daytrading_buying_power: Decimal,
}

/// Position information.
#[derive(Debug, Clone)]
pub struct Position {
    /// Symbol.
    pub symbol: String,
    /// Quantity (signed: positive for long, negative for short).
    pub qty: Decimal,
    /// Average entry price.
    pub avg_entry_price: Decimal,
    /// Current market value.
    pub market_value: Decimal,
    /// Current price.
    pub current_price: Decimal,
    /// Unrealized profit/loss.
    pub unrealized_pl: Decimal,
    /// Unrealized P&L percentage.
    pub unrealized_pl_pct: Decimal,
    /// Cost basis.
    pub cost_basis: Decimal,
}

impl Position {
    pub(super) fn from_alpaca(response: &AlpacaPositionResponse) -> Self {
        let qty: Decimal = response.qty.parse().unwrap_or(Decimal::ZERO);
        let avg_entry_price: Decimal = response.avg_entry_price.parse().unwrap_or(Decimal::ZERO);

        // Calculate cost basis if not provided (qty * avg_entry_price)
        let cost_basis = response
            .cost_basis
            .as_ref()
            .and_then(|c| c.parse().ok())
            .unwrap_or_else(|| qty.abs() * avg_entry_price);

        Self {
            symbol: response.symbol.clone(),
            qty,
            avg_entry_price,
            market_value: response.market_value.parse().unwrap_or(Decimal::ZERO),
            current_price: response.current_price.parse().unwrap_or(Decimal::ZERO),
            unrealized_pl: response.unrealized_pl.parse().unwrap_or(Decimal::ZERO),
            unrealized_pl_pct: response
                .unrealized_plpc
                .as_ref()
                .and_then(|p| p.parse().ok())
                .unwrap_or(Decimal::ZERO),
            cost_basis,
        }
    }
}
