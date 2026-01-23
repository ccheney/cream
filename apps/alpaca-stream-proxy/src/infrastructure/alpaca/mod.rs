//! Alpaca WebSocket Adapters
//!
//! Implements WebSocket clients for Alpaca's market data streams:
//!
//! - **SIP**: Stock quotes, trades, bars (JSON codec)
//! - **OPRA**: Options quotes, trades (MessagePack codec)
//! - **Trade Updates**: Order fills and updates (JSON codec)

pub mod auth;
pub mod codec;
pub mod heartbeat;
pub mod messages;
pub mod opra;
pub mod reconnect;
pub mod sip;
pub mod trading;

pub use auth::{AuthError, AuthHandler, AuthMessage, AuthState, Credentials, StreamType};
pub use codec::{CodecError, JsonCodec, MsgPackCodec};
pub use heartbeat::{
    HeartbeatConfig, HeartbeatError, HeartbeatEvent, HeartbeatManager, HeartbeatState,
};
pub use messages::*;
pub use opra::{OpraClient, OpraClientConfig, OpraClientError, OpraEvent, OptionSubscriptionState};
pub use reconnect::{ReconnectConfig, ReconnectError, ReconnectPolicy};
pub use sip::{SipClient, SipClientConfig, SipClientError, SipEvent, SubscriptionState};
pub use trading::{TradingClient, TradingClientConfig, TradingClientError, TradingEvent};
