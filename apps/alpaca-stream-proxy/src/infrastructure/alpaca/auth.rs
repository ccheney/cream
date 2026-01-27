//! Alpaca WebSocket Authentication
//!
//! Handles authentication with Alpaca's WebSocket streams. Alpaca requires
//! authentication within 10 seconds of connection establishment.
//!
//! # Authentication Flow
//!
//! ## Market Data Streams (SIP, OPRA)
//! 1. Connect to WebSocket endpoint
//! 2. Receive `{"T":"success","msg":"connected"}` from server
//! 3. Send `{"action":"auth","key":"...","secret":"..."}`
//! 4. Receive `{"T":"success","msg":"authenticated"}` or error
//!
//! ## Trade Updates Stream
//! 1. Connect to WebSocket endpoint
//! 2. Send `{"action":"authenticate","data":{"key_id":"...","secret_key":"..."}}`
//! 3. Receive `{"stream":"authorization","data":{"status":"authorized",...}}`
//!
//! # Error Codes
//!
//! - 401: Not authenticated
//! - 402: Authentication failed (invalid credentials)
//! - 403: Already authenticated
//! - 404: Authentication timeout (>10 seconds)
//!
//! # References
//!
//! - [Stock Streaming Auth](https://docs.alpaca.markets/docs/streaming-market-data)
//! - [Trade Updates Auth](https://docs.alpaca.markets/docs/websocket-streaming)

use std::time::Duration;

use thiserror::Error;

use super::messages::{
    AuthRequest, AuthorizationMessage, ErrorMessage, ListenRequest, SuccessKind, SuccessMessage,
    TradeAuthRequest,
};

// =============================================================================
// Constants
// =============================================================================

/// Maximum time allowed for authentication after connection.
/// Alpaca terminates connections that don't authenticate within 10 seconds.
pub const AUTH_TIMEOUT: Duration = Duration::from_secs(10);

/// Recommended time to complete authentication (with safety margin).
pub const AUTH_TIMEOUT_SAFE: Duration = Duration::from_secs(8);

// =============================================================================
// Error Types
// =============================================================================

/// Errors that can occur during authentication.
#[derive(Debug, Clone, Error)]
pub enum AuthError {
    /// Not authenticated (must authenticate before subscribing).
    #[error("not authenticated: must authenticate before making requests")]
    NotAuthenticated,

    /// Authentication failed (invalid credentials).
    #[error("authentication failed: invalid API key or secret")]
    InvalidCredentials,

    /// Already authenticated (connection was already authenticated).
    #[error("already authenticated: connection is already authenticated")]
    AlreadyAuthenticated,

    /// Authentication timeout (took longer than 10 seconds).
    #[error("authentication timeout: must authenticate within 10 seconds")]
    Timeout,

    /// Connection limit exceeded.
    #[error("connection limit exceeded: too many concurrent connections")]
    ConnectionLimitExceeded,

    /// Invalid message format received.
    #[error("invalid message: {0}")]
    InvalidMessage(String),

    /// Unexpected error from server.
    #[error("server error ({code}): {message}")]
    ServerError {
        /// Error code from server
        code: i32,
        /// Error message from server
        message: String,
    },
}

impl From<&ErrorMessage> for AuthError {
    fn from(err: &ErrorMessage) -> Self {
        match err.code {
            401 => Self::NotAuthenticated,
            402 => Self::InvalidCredentials,
            403 => Self::AlreadyAuthenticated,
            404 => Self::Timeout,
            406 => Self::ConnectionLimitExceeded,
            code => Self::ServerError {
                code,
                message: err.msg.clone(),
            },
        }
    }
}

// =============================================================================
// Authentication State
// =============================================================================

/// Current state of authentication.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AuthState {
    /// Not yet connected or authentication not started.
    #[default]
    Disconnected,

    /// Connected but not authenticated.
    Connected,

    /// Authentication request sent, awaiting response.
    Authenticating,

    /// Successfully authenticated.
    Authenticated,

    /// Authentication failed.
    Failed,
}

impl AuthState {
    /// Check if currently authenticated.
    #[must_use]
    pub const fn is_authenticated(&self) -> bool {
        matches!(self, Self::Authenticated)
    }

    /// Check if authentication is in progress.
    #[must_use]
    pub const fn is_authenticating(&self) -> bool {
        matches!(self, Self::Authenticating)
    }

    /// Check if ready to authenticate (connected but not yet authenticated).
    #[must_use]
    pub const fn can_authenticate(&self) -> bool {
        matches!(self, Self::Connected)
    }
}

// =============================================================================
// Credentials
// =============================================================================

/// Alpaca API credentials.
///
/// Stores the API key and secret needed for authentication.
/// The `Display` implementation redacts the secret for safe logging.
#[derive(Clone)]
pub struct Credentials {
    key: String,
    secret: String,
}

impl Credentials {
    /// Create new credentials.
    ///
    /// # Arguments
    ///
    /// * `key` - Alpaca API key
    /// * `secret` - Alpaca API secret
    ///
    /// # Errors
    ///
    /// Returns an error if either key or secret is empty.
    pub fn new(key: impl Into<String>, secret: impl Into<String>) -> Result<Self, AuthError> {
        let key = key.into();
        let secret = secret.into();

        if key.is_empty() {
            return Err(AuthError::InvalidMessage(
                "API key cannot be empty".to_string(),
            ));
        }
        if secret.is_empty() {
            return Err(AuthError::InvalidMessage(
                "API secret cannot be empty".to_string(),
            ));
        }

        Ok(Self { key, secret })
    }

    /// Create credentials from environment variables.
    ///
    /// Reads `ALPACA_KEY` and `ALPACA_SECRET` from environment.
    ///
    /// # Errors
    ///
    /// Returns an error if environment variables are not set or empty.
    pub fn from_env() -> Result<Self, AuthError> {
        let key = std::env::var("ALPACA_KEY").map_err(|_| {
            AuthError::InvalidMessage("ALPACA_KEY environment variable not set".to_string())
        })?;
        let secret = std::env::var("ALPACA_SECRET").map_err(|_| {
            AuthError::InvalidMessage("ALPACA_SECRET environment variable not set".to_string())
        })?;

        Self::new(key, secret)
    }

    /// Get the API key.
    #[must_use]
    pub fn key(&self) -> &str {
        &self.key
    }

    /// Get the API secret.
    #[must_use]
    pub fn secret(&self) -> &str {
        &self.secret
    }

    /// Create an authentication request for market data streams.
    #[must_use]
    pub fn to_market_data_auth(&self) -> AuthRequest {
        AuthRequest::new(self.key.clone(), self.secret.clone())
    }

    /// Create an authentication request for trade updates stream.
    #[must_use]
    pub fn to_trade_updates_auth(&self) -> TradeAuthRequest {
        TradeAuthRequest::new(self.key.clone(), self.secret.clone())
    }
}

impl std::fmt::Debug for Credentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Credentials")
            .field("key", &self.key)
            .field("secret", &"[REDACTED]")
            .finish()
    }
}

impl std::fmt::Display for Credentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Credentials(key={})", self.key)
    }
}

// =============================================================================
// Authentication Handler
// =============================================================================

/// Handles authentication state machine for Alpaca WebSocket connections.
///
/// This struct tracks the current authentication state and processes
/// incoming messages to update the state accordingly.
///
/// # Example
///
/// ```ignore
/// use alpaca_stream_proxy::infrastructure::alpaca::auth::{AuthHandler, Credentials};
///
/// let creds = Credentials::new("api_key", "api_secret")?;
/// let mut handler = AuthHandler::new(creds);
///
/// // On WebSocket connection
/// handler.on_connected();
/// let auth_msg = handler.create_auth_request();
/// // Send auth_msg over WebSocket...
///
/// // On receiving success message
/// handler.on_success(&success_msg)?;
/// assert!(handler.is_authenticated());
/// ```
#[derive(Debug)]
pub struct AuthHandler {
    credentials: Credentials,
    state: AuthState,
    stream_type: StreamType,
}

/// Type of Alpaca WebSocket stream.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum StreamType {
    /// Market data stream (SIP, OPRA, etc.) - uses JSON auth format
    #[default]
    MarketData,
    /// Trade updates stream - uses different auth format
    TradeUpdates,
}

impl AuthHandler {
    /// Create a new authentication handler for market data streams.
    #[must_use]
    pub const fn new(credentials: Credentials) -> Self {
        Self {
            credentials,
            state: AuthState::Disconnected,
            stream_type: StreamType::MarketData,
        }
    }

    /// Create a new authentication handler for trade updates stream.
    #[must_use]
    pub const fn for_trade_updates(credentials: Credentials) -> Self {
        Self {
            credentials,
            state: AuthState::Disconnected,
            stream_type: StreamType::TradeUpdates,
        }
    }

    /// Get the current authentication state.
    #[must_use]
    pub const fn state(&self) -> AuthState {
        self.state
    }

    /// Check if currently authenticated.
    #[must_use]
    pub const fn is_authenticated(&self) -> bool {
        self.state.is_authenticated()
    }

    /// Get the stream type this handler is configured for.
    #[must_use]
    pub const fn stream_type(&self) -> StreamType {
        self.stream_type
    }

    /// Called when WebSocket connection is established.
    ///
    /// For market data streams, this should be called after receiving
    /// the initial "connected" success message.
    pub const fn on_connected(&mut self) {
        self.state = AuthState::Connected;
    }

    /// Create the appropriate authentication request message.
    ///
    /// Returns a serializable message to send over the WebSocket.
    /// Call this after `on_connected()` and send the result.
    ///
    /// # Returns
    ///
    /// JSON-serializable authentication request.
    #[must_use]
    pub fn create_auth_request(&mut self) -> AuthMessage {
        self.state = AuthState::Authenticating;

        // Both market data and trade updates now use the same auth format:
        // {"action": "auth", "key": "...", "secret": "..."}
        AuthMessage::MarketData(self.credentials.to_market_data_auth())
    }

    /// Process a success message from the server.
    ///
    /// # Returns
    ///
    /// - `Ok(true)` if authentication is now complete
    /// - `Ok(false)` if this was just a connection success (need to send auth)
    /// - `Err(_)` if there was an error
    ///
    /// # Errors
    ///
    /// Returns `AuthError` if the message indicates authentication is required
    /// but we're in the wrong state.
    pub const fn on_success(&mut self, msg: &SuccessMessage) -> Result<bool, AuthError> {
        match msg.msg {
            SuccessKind::Connected => {
                self.on_connected();
                Ok(false)
            }
            SuccessKind::Authenticated => {
                self.state = AuthState::Authenticated;
                Ok(true)
            }
        }
    }

    /// Process an authorization response from trade updates stream.
    ///
    /// # Returns
    ///
    /// - `Ok(())` if authorization succeeded
    /// - `Err(_)` if authorization failed
    ///
    /// # Errors
    ///
    /// Returns `AuthError::InvalidCredentials` if authorization was rejected.
    pub fn on_authorization(&mut self, msg: &AuthorizationMessage) -> Result<(), AuthError> {
        if msg.is_authorized() {
            self.state = AuthState::Authenticated;
            Ok(())
        } else {
            self.state = AuthState::Failed;
            Err(AuthError::InvalidCredentials)
        }
    }

    /// Process an error message from the server.
    ///
    /// # Errors
    ///
    /// Always returns an `AuthError` corresponding to the error code.
    pub fn on_error(&mut self, msg: &ErrorMessage) -> AuthError {
        self.state = AuthState::Failed;
        AuthError::from(msg)
    }

    /// Reset to disconnected state (e.g., after connection close).
    pub const fn reset(&mut self) {
        self.state = AuthState::Disconnected;
    }

    /// Create a listen request for trade updates (post-authentication).
    ///
    /// This should only be called after successful authentication on
    /// a trade updates stream.
    #[must_use]
    pub fn create_listen_request(&self) -> Option<ListenRequest> {
        if self.stream_type == StreamType::TradeUpdates && self.is_authenticated() {
            Some(ListenRequest::trade_updates())
        } else {
            None
        }
    }
}

// =============================================================================
// Authentication Message Wrapper
// =============================================================================

/// Authentication message that can be serialized and sent over WebSocket.
///
/// This enum wraps the different authentication message types for
/// different stream types.
#[derive(Debug, Clone)]
pub enum AuthMessage {
    /// Authentication for market data streams (SIP, OPRA)
    MarketData(AuthRequest),
    /// Authentication for trade updates stream
    TradeUpdates(TradeAuthRequest),
}

impl AuthMessage {
    /// Serialize the message to JSON.
    ///
    /// # Errors
    ///
    /// Returns an error if serialization fails (should not happen with valid data).
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        match self {
            Self::MarketData(req) => serde_json::to_string(req),
            Self::TradeUpdates(req) => serde_json::to_string(req),
        }
    }

    /// Serialize the message to JSON bytes.
    ///
    /// # Errors
    ///
    /// Returns an error if serialization fails (should not happen with valid data).
    pub fn to_json_bytes(&self) -> Result<Vec<u8>, serde_json::Error> {
        match self {
            Self::MarketData(req) => serde_json::to_vec(req),
            Self::TradeUpdates(req) => serde_json::to_vec(req),
        }
    }

    /// Serialize the message to `MessagePack` bytes with named fields.
    ///
    /// This is used by OPRA which uses binary `MessagePack` encoding.
    ///
    /// # Errors
    ///
    /// Returns an error if serialization fails (should not happen with valid data).
    pub fn to_msgpack(&self) -> Result<Vec<u8>, rmp_serde::encode::Error> {
        match self {
            Self::MarketData(req) => rmp_serde::to_vec_named(req),
            Self::TradeUpdates(req) => rmp_serde::to_vec_named(req),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credentials_new() {
        let creds = Credentials::new("my_key", "my_secret").unwrap();
        assert_eq!(creds.key(), "my_key");
        assert_eq!(creds.secret(), "my_secret");
    }

    #[test]
    fn test_credentials_empty_key_fails() {
        let result = Credentials::new("", "secret");
        assert!(result.is_err());
    }

    #[test]
    fn test_credentials_empty_secret_fails() {
        let result = Credentials::new("key", "");
        assert!(result.is_err());
    }

    #[test]
    fn test_credentials_debug_redacts_secret() {
        let creds = Credentials::new("my_key", "super_secret").unwrap();
        let debug = format!("{creds:?}");
        assert!(debug.contains("my_key"));
        assert!(debug.contains("[REDACTED]"));
        assert!(!debug.contains("super_secret"));
    }

    #[test]
    fn test_auth_state_transitions() {
        let mut state = AuthState::Disconnected;
        assert!(!state.is_authenticated());
        assert!(!state.can_authenticate());

        state = AuthState::Connected;
        assert!(!state.is_authenticated());
        assert!(state.can_authenticate());

        state = AuthState::Authenticating;
        assert!(!state.is_authenticated());
        assert!(state.is_authenticating());

        state = AuthState::Authenticated;
        assert!(state.is_authenticated());
    }

    #[test]
    fn test_auth_handler_market_data_flow() {
        let creds = Credentials::new("key", "secret").unwrap();
        let mut handler = AuthHandler::new(creds);

        assert_eq!(handler.state(), AuthState::Disconnected);

        handler.on_connected();
        assert_eq!(handler.state(), AuthState::Connected);

        let msg = handler.create_auth_request();
        assert!(matches!(msg, AuthMessage::MarketData(_)));
        assert_eq!(handler.state(), AuthState::Authenticating);

        let success = SuccessMessage {
            msg_type: "success".to_string(),
            msg: SuccessKind::Authenticated,
        };
        let result = handler.on_success(&success).unwrap();
        assert!(result);
        assert!(handler.is_authenticated());
    }

    #[test]
    fn test_auth_handler_trade_updates_flow() {
        let creds = Credentials::new("key", "secret").unwrap();
        let mut handler = AuthHandler::for_trade_updates(creds);

        assert_eq!(handler.stream_type(), StreamType::TradeUpdates);

        let msg = handler.create_auth_request();
        // Trade updates now uses the same auth format as market data
        assert!(matches!(msg, AuthMessage::MarketData(_)));
    }

    #[test]
    fn test_auth_handler_on_error() {
        let creds = Credentials::new("key", "secret").unwrap();
        let mut handler = AuthHandler::new(creds);

        let error_msg = ErrorMessage {
            msg_type: "error".to_string(),
            code: 402,
            msg: "auth failed".to_string(),
        };

        let err = handler.on_error(&error_msg);
        assert!(matches!(err, AuthError::InvalidCredentials));
        assert_eq!(handler.state(), AuthState::Failed);
    }

    #[test]
    fn test_auth_error_from_error_message() {
        let test_cases = [
            (401, AuthError::NotAuthenticated),
            (402, AuthError::InvalidCredentials),
            (403, AuthError::AlreadyAuthenticated),
            (404, AuthError::Timeout),
            (406, AuthError::ConnectionLimitExceeded),
        ];

        for (code, expected) in test_cases {
            let msg = ErrorMessage {
                msg_type: "error".to_string(),
                code,
                msg: "test".to_string(),
            };
            let err = AuthError::from(&msg);
            assert_eq!(
                std::mem::discriminant(&err),
                std::mem::discriminant(&expected)
            );
        }
    }

    #[test]
    fn test_auth_message_to_json() {
        let creds = Credentials::new("test_key", "test_secret").unwrap();

        // Both market data and trade updates now use the same format
        let market_data_msg = AuthMessage::MarketData(creds.to_market_data_auth());
        let json = market_data_msg.to_json().unwrap();
        assert!(json.contains(r#""action":"auth""#));
        assert!(json.contains(r#""key":"test_key""#));
        assert!(json.contains(r#""secret":"test_secret""#));
    }

    #[test]
    fn test_auth_handler_reset() {
        let creds = Credentials::new("key", "secret").unwrap();
        let mut handler = AuthHandler::new(creds);

        handler.on_connected();
        let _ = handler.create_auth_request();

        handler.reset();
        assert_eq!(handler.state(), AuthState::Disconnected);
    }

    #[test]
    fn test_create_listen_request() {
        let creds = Credentials::new("key", "secret").unwrap();

        // Market data handler should not create listen request
        let mut market_handler = AuthHandler::new(creds.clone());
        market_handler.state = AuthState::Authenticated;
        assert!(market_handler.create_listen_request().is_none());

        // Trade updates handler should create listen request when authenticated
        let mut trade_handler = AuthHandler::for_trade_updates(creds);
        assert!(trade_handler.create_listen_request().is_none()); // Not authenticated yet

        trade_handler.state = AuthState::Authenticated;
        let listen_req = trade_handler.create_listen_request();
        assert!(listen_req.is_some());
    }
}
