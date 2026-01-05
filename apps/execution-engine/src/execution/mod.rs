//! Order execution and broker integration.
//!
//! This module handles order routing, state management, and broker adapters.

mod alpaca;
mod gateway;
mod state;
pub mod stops;
pub mod tactics;

pub use alpaca::AlpacaAdapter;
pub use gateway::{BrokerAdapter, BrokerError, CancelOrderError, ExecutionGateway, SubmitOrdersError};
pub use state::{OrderStateManager, TimeoutResult};
pub use stops::{
    BacktestStopsSimulator, BracketOrder, BracketOrderBuilder, Candle, EnforcementMethod,
    MonitoredPosition, PriceMonitor, RiskLevelDenomination, SameBarPriority, StopOrderSpec,
    StopTargetLevels, StopTargetValidator, StopsConfig, StopsEnforcer, StopsError,
    TakeProfitOrderSpec, TriggerResult,
};
pub use tactics::{
    AdaptiveConfig, AggressiveLimitConfig, IcebergConfig, MarketState, OrderPurpose,
    PassiveLimitConfig, SliceType, TacticConfig, TacticSelector, TacticSelectionContext,
    TacticType, TacticUrgency, TwapConfig, Urgency, VwapConfig,
};
