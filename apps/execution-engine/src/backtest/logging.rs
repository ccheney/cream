//! Backtest simulation logging and observability.
//!
//! Provides structured logging for all backtest simulation steps:
//! - Simulation start/end with date range and config
//! - Order submission and fill events
//! - Slippage and commission calculations
//! - Stop/target trigger events
//! - Data gaps and warnings
//! - Performance summary
//!
//! # Log Levels
//!
//! - **INFO**: Normal operations (simulation start/end, fills, triggers)
//! - **WARN**: Suspicious patterns (high slippage, data gaps, rejected orders)
//! - **ERROR**: Simulation failures
//! - **DEBUG**: Detailed calculation steps

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

use super::config::BacktestConfig;
use super::data_gaps::DataGapType;
use crate::models::{OrderSide, OrderType};

// ============================================
// Event Types
// ============================================

/// Backtest simulation event for structured logging.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event_type", rename_all = "snake_case")]
pub enum BacktestEvent {
    /// Simulation started.
    SimulationStart(SimulationStartEvent),
    /// Simulation ended.
    SimulationEnd(SimulationEndEvent),
    /// Order submitted.
    OrderSubmitted(OrderSubmittedEvent),
    /// Order filled.
    OrderFilled(OrderFilledEvent),
    /// Order rejected.
    OrderRejected(OrderRejectedEvent),
    /// Slippage applied.
    SlippageApplied(SlippageAppliedEvent),
    /// Commission calculated.
    CommissionCalculated(CommissionCalculatedEvent),
    /// Stop/target triggered.
    TriggerActivated(TriggerActivatedEvent),
    /// Data gap detected.
    DataGapDetected(DataGapDetectedEvent),
    /// Performance summary.
    PerformanceSummary(PerformanceSummaryEvent),
}

/// Simulation start event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationStartEvent {
    /// Simulation ID.
    pub simulation_id: String,
    /// Start date (ISO 8601).
    pub start_date: String,
    /// End date (ISO 8601).
    pub end_date: String,
    /// Initial equity.
    pub initial_equity: Decimal,
    /// Slippage model.
    pub slippage_model: String,
    /// Commission model.
    pub commission_model: String,
    /// Number of symbols.
    pub symbol_count: usize,
}

/// Simulation end event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationEndEvent {
    /// Simulation ID.
    pub simulation_id: String,
    /// Final equity.
    pub final_equity: Decimal,
    /// Total return percentage.
    pub total_return_pct: Decimal,
    /// Total trades executed.
    pub total_trades: u64,
    /// Winning trades.
    pub winning_trades: u64,
    /// Duration in milliseconds.
    pub duration_ms: u64,
    /// Candles processed.
    pub candles_processed: u64,
}

/// Order submitted event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderSubmittedEvent {
    /// Order ID.
    pub order_id: String,
    /// Symbol.
    pub symbol: String,
    /// Order side.
    pub side: String,
    /// Order type.
    pub order_type: String,
    /// Quantity.
    pub quantity: Decimal,
    /// Limit price (if applicable).
    pub limit_price: Option<Decimal>,
    /// Stop price (if applicable).
    pub stop_price: Option<Decimal>,
    /// Timestamp.
    pub timestamp: String,
}

/// Order filled event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderFilledEvent {
    /// Order ID.
    pub order_id: String,
    /// Symbol.
    pub symbol: String,
    /// Fill price.
    pub fill_price: Decimal,
    /// Fill quantity.
    pub fill_quantity: Decimal,
    /// Slippage amount.
    pub slippage: Decimal,
    /// Commission.
    pub commission: Decimal,
    /// Is partial fill.
    pub is_partial: bool,
    /// Timestamp.
    pub timestamp: String,
}

/// Order rejected event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderRejectedEvent {
    /// Order ID.
    pub order_id: String,
    /// Symbol.
    pub symbol: String,
    /// Rejection reason.
    pub reason: String,
    /// Timestamp.
    pub timestamp: String,
}

/// Slippage applied event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlippageAppliedEvent {
    /// Order ID.
    pub order_id: String,
    /// Symbol.
    pub symbol: String,
    /// Slippage model used.
    pub model: String,
    /// Base price before slippage.
    pub base_price: Decimal,
    /// Fill price after slippage.
    pub fill_price: Decimal,
    /// Slippage in basis points.
    pub slippage_bps: Decimal,
    /// Is adverse (worse than expected).
    pub is_adverse: bool,
}

/// Commission calculated event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommissionCalculatedEvent {
    /// Order ID.
    pub order_id: String,
    /// Symbol.
    pub symbol: String,
    /// Base commission.
    pub base_commission: Decimal,
    /// SEC fee.
    pub sec_fee: Decimal,
    /// TAF fee.
    pub taf_fee: Decimal,
    /// ORF fee (options).
    pub orf_fee: Decimal,
    /// Total commission.
    pub total_commission: Decimal,
}

/// Stop/target trigger event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerActivatedEvent {
    /// Position ID.
    pub position_id: String,
    /// Symbol.
    pub symbol: String,
    /// Trigger type (stop or target).
    pub trigger_type: String,
    /// Trigger price.
    pub trigger_price: Decimal,
    /// Current price.
    pub current_price: Decimal,
    /// Timestamp.
    pub timestamp: String,
}

/// Data gap detected event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataGapDetectedEvent {
    /// Symbol.
    pub symbol: String,
    /// Gap type.
    pub gap_type: String,
    /// Timestamp of gap.
    pub timestamp: String,
    /// Details.
    pub details: Option<String>,
    /// Action taken.
    pub action: String,
}

/// Performance summary event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceSummaryEvent {
    /// Simulation ID.
    pub simulation_id: String,
    /// Sharpe ratio.
    pub sharpe_ratio: Option<Decimal>,
    /// Sortino ratio.
    pub sortino_ratio: Option<Decimal>,
    /// Calmar ratio.
    pub calmar_ratio: Option<Decimal>,
    /// Maximum drawdown percentage.
    pub max_drawdown_pct: Decimal,
    /// Win rate percentage.
    pub win_rate_pct: Decimal,
    /// Profit factor.
    pub profit_factor: Option<Decimal>,
    /// Average trade return.
    pub avg_trade_return: Decimal,
}

// ============================================
// Logging Functions
// ============================================

/// Log simulation start.
pub fn log_simulation_start(event: &SimulationStartEvent) {
    info!(
        simulation_id = %event.simulation_id,
        start_date = %event.start_date,
        end_date = %event.end_date,
        initial_equity = %event.initial_equity,
        slippage_model = %event.slippage_model,
        commission_model = %event.commission_model,
        symbol_count = event.symbol_count,
        "Backtest simulation started"
    );
}

/// Log simulation end.
pub fn log_simulation_end(event: &SimulationEndEvent) {
    info!(
        simulation_id = %event.simulation_id,
        final_equity = %event.final_equity,
        total_return_pct = %event.total_return_pct,
        total_trades = event.total_trades,
        winning_trades = event.winning_trades,
        duration_ms = event.duration_ms,
        candles_processed = event.candles_processed,
        "Backtest simulation completed"
    );
}

/// Log order submission.
pub fn log_order_submitted(event: &OrderSubmittedEvent) {
    debug!(
        order_id = %event.order_id,
        symbol = %event.symbol,
        side = %event.side,
        order_type = %event.order_type,
        quantity = %event.quantity,
        limit_price = ?event.limit_price,
        stop_price = ?event.stop_price,
        timestamp = %event.timestamp,
        "Order submitted"
    );
}

/// Log order fill.
pub fn log_order_filled(event: &OrderFilledEvent) {
    info!(
        order_id = %event.order_id,
        symbol = %event.symbol,
        fill_price = %event.fill_price,
        fill_quantity = %event.fill_quantity,
        slippage = %event.slippage,
        commission = %event.commission,
        is_partial = event.is_partial,
        timestamp = %event.timestamp,
        "Order filled"
    );
}

/// Log order rejection.
pub fn log_order_rejected(event: &OrderRejectedEvent) {
    warn!(
        order_id = %event.order_id,
        symbol = %event.symbol,
        reason = %event.reason,
        timestamp = %event.timestamp,
        "Order rejected"
    );
}

/// Log slippage application.
pub fn log_slippage_applied(event: &SlippageAppliedEvent) {
    // High adverse slippage (>20 bps) gets a warning
    if event.is_adverse && event.slippage_bps > Decimal::new(20, 0) {
        warn!(
            order_id = %event.order_id,
            symbol = %event.symbol,
            model = %event.model,
            base_price = %event.base_price,
            fill_price = %event.fill_price,
            slippage_bps = %event.slippage_bps,
            is_adverse = event.is_adverse,
            "Slippage applied"
        );
    } else {
        debug!(
            order_id = %event.order_id,
            symbol = %event.symbol,
            model = %event.model,
            base_price = %event.base_price,
            fill_price = %event.fill_price,
            slippage_bps = %event.slippage_bps,
            is_adverse = event.is_adverse,
            "Slippage applied"
        );
    }
}

/// Log commission calculation.
pub fn log_commission_calculated(event: &CommissionCalculatedEvent) {
    debug!(
        order_id = %event.order_id,
        symbol = %event.symbol,
        base_commission = %event.base_commission,
        sec_fee = %event.sec_fee,
        taf_fee = %event.taf_fee,
        orf_fee = %event.orf_fee,
        total_commission = %event.total_commission,
        "Commission calculated"
    );
}

/// Log trigger activation.
pub fn log_trigger_activated(event: &TriggerActivatedEvent) {
    info!(
        position_id = %event.position_id,
        symbol = %event.symbol,
        trigger_type = %event.trigger_type,
        trigger_price = %event.trigger_price,
        current_price = %event.current_price,
        timestamp = %event.timestamp,
        "Trigger activated"
    );
}

/// Log data gap detection.
pub fn log_data_gap_detected(event: &DataGapDetectedEvent) {
    warn!(
        symbol = %event.symbol,
        gap_type = %event.gap_type,
        timestamp = %event.timestamp,
        details = ?event.details,
        action = %event.action,
        "Data gap detected"
    );
}

/// Log performance summary.
pub fn log_performance_summary(event: &PerformanceSummaryEvent) {
    info!(
        simulation_id = %event.simulation_id,
        sharpe_ratio = ?event.sharpe_ratio,
        sortino_ratio = ?event.sortino_ratio,
        calmar_ratio = ?event.calmar_ratio,
        max_drawdown_pct = %event.max_drawdown_pct,
        win_rate_pct = %event.win_rate_pct,
        profit_factor = ?event.profit_factor,
        avg_trade_return = %event.avg_trade_return,
        "Performance summary"
    );
}

// ============================================
// Helper Functions
// ============================================

/// Create a simulation start event.
pub fn create_simulation_start_event(
    simulation_id: impl Into<String>,
    start_date: impl Into<String>,
    end_date: impl Into<String>,
    initial_equity: Decimal,
    config: &BacktestConfig,
    symbol_count: usize,
) -> SimulationStartEvent {
    SimulationStartEvent {
        simulation_id: simulation_id.into(),
        start_date: start_date.into(),
        end_date: end_date.into(),
        initial_equity,
        slippage_model: format!("{:?}", config.fill_model.slippage.model),
        commission_model: format!("{:?}", config.commission.model),
        symbol_count,
    }
}

/// Create an order submitted event.
pub fn create_order_submitted_event(
    order_id: impl Into<String>,
    symbol: impl Into<String>,
    side: OrderSide,
    order_type: OrderType,
    quantity: Decimal,
    limit_price: Option<Decimal>,
    stop_price: Option<Decimal>,
    timestamp: impl Into<String>,
) -> OrderSubmittedEvent {
    OrderSubmittedEvent {
        order_id: order_id.into(),
        symbol: symbol.into(),
        side: format!("{:?}", side),
        order_type: format!("{:?}", order_type),
        quantity,
        limit_price,
        stop_price,
        timestamp: timestamp.into(),
    }
}

/// Create a data gap event.
pub fn create_data_gap_event(
    symbol: impl Into<String>,
    gap_type: DataGapType,
    timestamp: impl Into<String>,
    details: Option<String>,
    action: impl Into<String>,
) -> DataGapDetectedEvent {
    DataGapDetectedEvent {
        symbol: symbol.into(),
        gap_type: format!("{}", gap_type),
        timestamp: timestamp.into(),
        details,
        action: action.into(),
    }
}

/// Calculate slippage in basis points.
pub fn calculate_slippage_bps(base_price: Decimal, fill_price: Decimal) -> Decimal {
    if base_price == Decimal::ZERO {
        return Decimal::ZERO;
    }
    let diff = (fill_price - base_price).abs();
    (diff / base_price) * Decimal::new(10000, 0)
}

/// Check if slippage is adverse (worse for the trader).
pub fn is_adverse_slippage(side: OrderSide, base_price: Decimal, fill_price: Decimal) -> bool {
    match side {
        OrderSide::Buy => fill_price > base_price,
        OrderSide::Sell => fill_price < base_price,
    }
}

// ============================================
// Backtest Logger
// ============================================

/// Backtest logger for collecting events.
#[derive(Debug, Default)]
pub struct BacktestLogger {
    events: Vec<BacktestEvent>,
    log_to_tracing: bool,
}

impl BacktestLogger {
    /// Create a new backtest logger.
    pub fn new(log_to_tracing: bool) -> Self {
        Self {
            events: Vec::new(),
            log_to_tracing,
        }
    }

    /// Log an event.
    pub fn log(&mut self, event: BacktestEvent) {
        if self.log_to_tracing {
            self.emit_to_tracing(&event);
        }
        self.events.push(event);
    }

    /// Emit event to tracing.
    fn emit_to_tracing(&self, event: &BacktestEvent) {
        match event {
            BacktestEvent::SimulationStart(e) => log_simulation_start(e),
            BacktestEvent::SimulationEnd(e) => log_simulation_end(e),
            BacktestEvent::OrderSubmitted(e) => log_order_submitted(e),
            BacktestEvent::OrderFilled(e) => log_order_filled(e),
            BacktestEvent::OrderRejected(e) => log_order_rejected(e),
            BacktestEvent::SlippageApplied(e) => log_slippage_applied(e),
            BacktestEvent::CommissionCalculated(e) => log_commission_calculated(e),
            BacktestEvent::TriggerActivated(e) => log_trigger_activated(e),
            BacktestEvent::DataGapDetected(e) => log_data_gap_detected(e),
            BacktestEvent::PerformanceSummary(e) => log_performance_summary(e),
        }
    }

    /// Get all logged events.
    pub fn events(&self) -> &[BacktestEvent] {
        &self.events
    }

    /// Get event count.
    pub fn event_count(&self) -> usize {
        self.events.len()
    }

    /// Get events by type.
    pub fn events_of_type<F>(&self, filter: F) -> Vec<&BacktestEvent>
    where
        F: Fn(&BacktestEvent) -> bool,
    {
        self.events.iter().filter(|e| filter(e)).collect()
    }

    /// Clear all events.
    pub fn clear(&mut self) {
        self.events.clear();
    }

    /// Export events as JSON.
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(&self.events)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simulation_start_event() {
        let event = SimulationStartEvent {
            simulation_id: "test-123".to_string(),
            start_date: "2025-01-01".to_string(),
            end_date: "2025-12-31".to_string(),
            initial_equity: Decimal::new(100000, 0),
            slippage_model: "FixedBps".to_string(),
            commission_model: "PerUnit".to_string(),
            symbol_count: 10,
        };

        assert_eq!(event.simulation_id, "test-123");
        assert_eq!(event.symbol_count, 10);
    }

    #[test]
    fn test_calculate_slippage_bps() {
        let base = Decimal::new(10000, 2); // $100.00
        let fill = Decimal::new(10005, 2); // $100.05

        let bps = calculate_slippage_bps(base, fill);
        assert!(bps > Decimal::new(4, 0) && bps < Decimal::new(6, 0)); // ~5 bps
    }

    #[test]
    fn test_calculate_slippage_bps_zero_base() {
        let bps = calculate_slippage_bps(Decimal::ZERO, Decimal::new(100, 0));
        assert_eq!(bps, Decimal::ZERO);
    }

    #[test]
    fn test_is_adverse_slippage_buy() {
        let base = Decimal::new(100, 0);

        // Paying more for a buy is adverse
        assert!(is_adverse_slippage(
            OrderSide::Buy,
            base,
            Decimal::new(101, 0)
        ));
        // Paying less for a buy is favorable
        assert!(!is_adverse_slippage(
            OrderSide::Buy,
            base,
            Decimal::new(99, 0)
        ));
    }

    #[test]
    fn test_is_adverse_slippage_sell() {
        let base = Decimal::new(100, 0);

        // Receiving less for a sell is adverse
        assert!(is_adverse_slippage(
            OrderSide::Sell,
            base,
            Decimal::new(99, 0)
        ));
        // Receiving more for a sell is favorable
        assert!(!is_adverse_slippage(
            OrderSide::Sell,
            base,
            Decimal::new(101, 0)
        ));
    }

    #[test]
    fn test_backtest_logger() {
        let mut logger = BacktestLogger::new(false);

        let event = BacktestEvent::SimulationStart(SimulationStartEvent {
            simulation_id: "test-123".to_string(),
            start_date: "2025-01-01".to_string(),
            end_date: "2025-12-31".to_string(),
            initial_equity: Decimal::new(100000, 0),
            slippage_model: "FixedBps".to_string(),
            commission_model: "PerUnit".to_string(),
            symbol_count: 5,
        });

        logger.log(event);
        assert_eq!(logger.event_count(), 1);
    }

    #[test]
    fn test_backtest_logger_multiple_events() {
        let mut logger = BacktestLogger::new(false);

        logger.log(BacktestEvent::SimulationStart(SimulationStartEvent {
            simulation_id: "test".to_string(),
            start_date: "2025-01-01".to_string(),
            end_date: "2025-12-31".to_string(),
            initial_equity: Decimal::new(100000, 0),
            slippage_model: "FixedBps".to_string(),
            commission_model: "PerUnit".to_string(),
            symbol_count: 1,
        }));

        logger.log(BacktestEvent::OrderFilled(OrderFilledEvent {
            order_id: "order-1".to_string(),
            symbol: "AAPL".to_string(),
            fill_price: Decimal::new(15000, 2),
            fill_quantity: Decimal::new(100, 0),
            slippage: Decimal::new(5, 2),
            commission: Decimal::new(0, 0),
            is_partial: false,
            timestamp: "2025-06-01T10:00:00Z".to_string(),
        }));

        assert_eq!(logger.event_count(), 2);
    }

    #[test]
    fn test_backtest_logger_clear() {
        let mut logger = BacktestLogger::new(false);

        logger.log(BacktestEvent::SimulationStart(SimulationStartEvent {
            simulation_id: "test".to_string(),
            start_date: "2025-01-01".to_string(),
            end_date: "2025-12-31".to_string(),
            initial_equity: Decimal::new(100000, 0),
            slippage_model: "FixedBps".to_string(),
            commission_model: "PerUnit".to_string(),
            symbol_count: 1,
        }));

        assert_eq!(logger.event_count(), 1);
        logger.clear();
        assert_eq!(logger.event_count(), 0);
    }

    #[test]
    fn test_backtest_logger_to_json() {
        let mut logger = BacktestLogger::new(false);

        logger.log(BacktestEvent::OrderRejected(OrderRejectedEvent {
            order_id: "order-1".to_string(),
            symbol: "AAPL".to_string(),
            reason: "Insufficient funds".to_string(),
            timestamp: "2025-06-01T10:00:00Z".to_string(),
        }));

        let json = logger.to_json().unwrap();
        assert!(json.contains("order_rejected"));
        assert!(json.contains("AAPL"));
        assert!(json.contains("Insufficient funds"));
    }

    #[test]
    fn test_create_data_gap_event() {
        let event = create_data_gap_event(
            "AAPL",
            DataGapType::MissingCandle,
            "2025-06-01T10:00:00Z",
            Some("No data available".to_string()),
            "skip",
        );

        assert_eq!(event.symbol, "AAPL");
        assert_eq!(event.gap_type, "MISSING_CANDLE");
        assert_eq!(event.action, "skip");
    }

    #[test]
    fn test_create_order_submitted_event() {
        let event = create_order_submitted_event(
            "order-1",
            "AAPL",
            OrderSide::Buy,
            OrderType::Limit,
            Decimal::new(100, 0),
            Some(Decimal::new(15000, 2)),
            None,
            "2025-06-01T10:00:00Z",
        );

        assert_eq!(event.order_id, "order-1");
        assert_eq!(event.symbol, "AAPL");
        assert_eq!(event.quantity, Decimal::new(100, 0));
    }

    #[test]
    fn test_data_gap_detected_event() {
        let event = DataGapDetectedEvent {
            symbol: "AAPL".to_string(),
            gap_type: "MISSING_VOLUME".to_string(),
            timestamp: "2025-06-01T10:00:00Z".to_string(),
            details: Some("Volume is zero".to_string()),
            action: "reject".to_string(),
        };

        assert_eq!(event.gap_type, "MISSING_VOLUME");
        assert_eq!(event.action, "reject");
    }

    #[test]
    fn test_performance_summary_event() {
        let event = PerformanceSummaryEvent {
            simulation_id: "test-123".to_string(),
            sharpe_ratio: Some(Decimal::new(15, 1)),  // 1.5
            sortino_ratio: Some(Decimal::new(20, 1)), // 2.0
            calmar_ratio: Some(Decimal::new(12, 1)),  // 1.2
            max_drawdown_pct: Decimal::new(10, 0),    // 10%
            win_rate_pct: Decimal::new(55, 0),        // 55%
            profit_factor: Some(Decimal::new(18, 1)), // 1.8
            avg_trade_return: Decimal::new(5, 1),     // 0.5%
        };

        assert_eq!(event.win_rate_pct, Decimal::new(55, 0));
    }
}
