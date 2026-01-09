//! Order execution and broker integration.
//!
//! This module handles order routing, state management, broker adapters,
//! reconciliation with broker state, and crash recovery.
//!
//! # Adapters
//!
//! - [`AlpacaAdapter`]: Production adapter for Alpaca Markets (PAPER/LIVE)
//! - [`BacktestAdapter`]: Simulated adapter for backtesting (BACKTEST)

mod alpaca;
mod backtest;
mod gateway;
pub mod persistence;
pub mod reconciliation;
pub mod recovery;
mod state;
pub mod stops;
pub mod tactics;

pub use alpaca::{
    AccountInfo, AlpacaAdapter, AlpacaError, FeeBreakdown, OptionsOrderValidator,
    Position as AlpacaPosition, RegulatoryFeeCalculator,
};
pub use backtest::{BacktestAdapter, RecordedOrder};
pub use gateway::{
    BrokerAdapter, BrokerError, CancelOrderError, ExecutionGateway, SubmitOrdersError,
};
pub use persistence::{
    OrderSnapshot, PersistenceError, RecoveryState, StatePersistence, StateSnapshot,
};
pub use reconciliation::{
    BrokerAccountSnapshot, BrokerOrderSnapshot, BrokerPositionSnapshot, BrokerStateSnapshot,
    CriticalDiscrepancyAction, Discrepancy, DiscrepancySeverity, DiscrepancyType,
    LocalPositionSnapshot, OrphanResolution, OrphanType, OrphanedOrder, ReconciliationConfig,
    ReconciliationError, ReconciliationManager, ReconciliationReport, fetch_broker_state,
};
pub use recovery::{PortfolioRecovery, RecoveryConfig, RecoveryError, RecoveryResult};
pub use state::{OrderStateManager, TimeoutResult};
pub use stops::{
    BacktestStopsSimulator, BracketOrder, BracketOrderBuilder, Candle, EnforcementMethod,
    MonitoredPosition, PriceMonitor, RiskLevelDenomination, SameBarPriority, StopOrderSpec,
    StopTargetLevels, StopTargetValidator, StopsConfig, StopsEnforcer, StopsError,
    TakeProfitOrderSpec, TriggerResult,
};
pub use tactics::{
    AdaptiveConfig, AggressiveLimitConfig, IcebergConfig, MarketState, OrderPurpose,
    PassiveLimitConfig, SliceType, TacticConfig, TacticSelectionContext, TacticSelector,
    TacticType, TacticUrgency, TwapConfig, Urgency, VwapConfig,
};
