//! Order execution and broker integration.
//!
//! This module handles order routing, state management, broker adapters,
//! and reconciliation with broker state.

mod alpaca;
mod gateway;
pub mod reconciliation;
mod state;
pub mod stops;
pub mod tactics;

pub use alpaca::{AlpacaAdapter, FeeBreakdown, OptionsOrderValidator, RegulatoryFeeCalculator};
pub use gateway::{
    BrokerAdapter, BrokerError, CancelOrderError, ExecutionGateway, SubmitOrdersError,
};
pub use reconciliation::{
    fetch_broker_state, BrokerAccountSnapshot, BrokerOrderSnapshot, BrokerPositionSnapshot,
    BrokerStateSnapshot, CriticalDiscrepancyAction, Discrepancy, DiscrepancySeverity,
    DiscrepancyType, LocalPositionSnapshot, OrphanResolution, OrphanType, OrphanedOrder,
    ReconciliationConfig, ReconciliationError, ReconciliationManager, ReconciliationReport,
};
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
