//! Configuration Module
//!
//! Configuration loading and dependency injection for the proxy service.

mod settings;

pub use settings::{
    BroadcastSettings, ConfigError, Credentials, DataFeed, Environment, ProxyConfig,
    ServerSettings, WebSocketSettings,
};
