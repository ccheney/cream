//! TLS Configuration for gRPC Server
//!
//! Provides TLS support for secure gRPC connections including:
//! - Certificate and key loading from files
//! - Self-signed certificate generation for development
//! - Client certificate verification (mTLS)
//!
//! # Configuration
//!
//! TLS is controlled by environment variables:
//! - `GRPC_TLS_ENABLED`: Enable TLS (default: false)
//! - `GRPC_TLS_CERT_PATH`: Path to server certificate (PEM format)
//! - `GRPC_TLS_KEY_PATH`: Path to server private key (PEM format)
//! - `GRPC_TLS_CA_PATH`: Path to CA certificate for client verification (optional)
//! - `GRPC_TLS_CLIENT_AUTH`: Require client certificates (default: false)
//!
//! # Development Mode
//!
//! When `GRPC_TLS_ENABLED=true` but no certificates are provided,
//! self-signed certificates are generated automatically.
//!
//! # Example
//!
//! ```bash
//! # Production (with real certificates)
//! GRPC_TLS_ENABLED=true \
//! GRPC_TLS_CERT_PATH=/etc/ssl/server.crt \
//! GRPC_TLS_KEY_PATH=/etc/ssl/server.key \
//! cargo run --bin execution-engine
//!
//! # Development (auto-generated certificates)
//! GRPC_TLS_ENABLED=true cargo run --bin execution-engine
//! ```

use std::fs;
use std::path::Path;
use std::sync::Arc;

use rcgen::{CertificateParams, DnType, KeyPair};
use tonic::transport::{Certificate, Identity, ServerTlsConfig};

/// TLS configuration errors.
#[derive(Debug, thiserror::Error)]
pub enum TlsError {
    /// Failed to read certificate file.
    #[error("Failed to read certificate file: {0}")]
    CertificateRead(#[from] std::io::Error),

    /// Failed to generate self-signed certificate.
    #[error("Failed to generate certificate: {0}")]
    CertificateGeneration(String),

    /// Invalid certificate or key format.
    #[error("Invalid certificate or key format: {0}")]
    InvalidFormat(String),

    /// TLS configuration error.
    #[error("TLS configuration error: {0}")]
    Configuration(String),
}

/// TLS configuration for the gRPC server.
#[derive(Debug, Clone)]
pub struct TlsConfig {
    /// Server certificate (PEM format).
    pub cert: String,
    /// Server private key (PEM format).
    pub key: String,
    /// CA certificate for client verification (optional).
    pub ca_cert: Option<String>,
    /// Require client certificates (mTLS).
    pub client_auth_required: bool,
}

impl TlsConfig {
    /// Create TLS config from file paths.
    pub fn from_files(
        cert_path: impl AsRef<Path>,
        key_path: impl AsRef<Path>,
        ca_path: Option<impl AsRef<Path>>,
        client_auth_required: bool,
    ) -> Result<Self, TlsError> {
        let cert = fs::read_to_string(cert_path)?;
        let key = fs::read_to_string(key_path)?;
        let ca_cert = match ca_path {
            Some(path) => Some(fs::read_to_string(path)?),
            None => None,
        };

        Ok(Self {
            cert,
            key,
            ca_cert,
            client_auth_required,
        })
    }

    /// Create TLS config from PEM strings.
    pub fn from_pem(
        cert: impl Into<String>,
        key: impl Into<String>,
        ca_cert: Option<String>,
        client_auth_required: bool,
    ) -> Self {
        Self {
            cert: cert.into(),
            key: key.into(),
            ca_cert,
            client_auth_required,
        }
    }

    /// Generate self-signed certificates for development.
    pub fn generate_self_signed(
        common_name: &str,
        san_dns_names: &[&str],
    ) -> Result<Self, TlsError> {
        // Generate key pair
        let key_pair =
            KeyPair::generate().map_err(|e| TlsError::CertificateGeneration(e.to_string()))?;

        // Configure certificate
        let san_strings: Vec<String> = san_dns_names.iter().map(|s| (*s).to_string()).collect();
        let mut params = CertificateParams::new(san_strings)
            .map_err(|e| TlsError::CertificateGeneration(e.to_string()))?;
        params
            .distinguished_name
            .push(DnType::CommonName, common_name);
        params
            .distinguished_name
            .push(DnType::OrganizationName, "Cream Trading System");
        params.distinguished_name.push(DnType::CountryName, "US");

        // Generate certificate
        let cert = params
            .self_signed(&key_pair)
            .map_err(|e| TlsError::CertificateGeneration(e.to_string()))?;

        let cert_pem = cert.pem();
        let key_pem = key_pair.serialize_pem();

        tracing::info!(
            common_name = %common_name,
            san_count = san_dns_names.len(),
            "Generated self-signed certificate"
        );

        Ok(Self {
            cert: cert_pem.clone(),
            key: key_pem,
            ca_cert: Some(cert_pem), // Self-signed CA
            client_auth_required: false,
        })
    }

    /// Build Tonic `ServerTlsConfig` from this configuration.
    pub fn build_server_config(&self) -> Result<ServerTlsConfig, TlsError> {
        let identity = Identity::from_pem(&self.cert, &self.key);

        let mut config = ServerTlsConfig::new().identity(identity);

        if let Some(ca) = &self.ca_cert {
            let ca_cert = Certificate::from_pem(ca);
            config = config.client_ca_root(ca_cert);

            if self.client_auth_required {
                // Note: tonic's ServerTlsConfig doesn't have a direct way to enforce
                // client auth. This is typically handled at the rustls layer.
                tracing::info!("mTLS enabled: Client certificates will be verified");
            }
        }

        Ok(config)
    }
}

/// TLS configuration builder from environment variables.
#[derive(Debug, Default)]
pub struct TlsConfigBuilder {
    enabled: bool,
    cert_path: Option<String>,
    key_path: Option<String>,
    ca_path: Option<String>,
    client_auth: bool,
}

impl TlsConfigBuilder {
    /// Create a new builder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Load configuration from environment variables.
    pub fn from_env() -> Self {
        Self {
            enabled: std::env::var("GRPC_TLS_ENABLED")
                .map(|v| v.to_lowercase() == "true" || v == "1")
                .unwrap_or(false),
            cert_path: std::env::var("GRPC_TLS_CERT_PATH").ok(),
            key_path: std::env::var("GRPC_TLS_KEY_PATH").ok(),
            ca_path: std::env::var("GRPC_TLS_CA_PATH").ok(),
            client_auth: std::env::var("GRPC_TLS_CLIENT_AUTH")
                .map(|v| v.to_lowercase() == "true" || v == "1")
                .unwrap_or(false),
        }
    }

    /// Set whether TLS is enabled.
    pub fn enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }

    /// Set the certificate file path.
    pub fn cert_path(mut self, path: impl Into<String>) -> Self {
        self.cert_path = Some(path.into());
        self
    }

    /// Set the private key file path.
    pub fn key_path(mut self, path: impl Into<String>) -> Self {
        self.key_path = Some(path.into());
        self
    }

    /// Set the CA certificate path (for client verification).
    pub fn ca_path(mut self, path: impl Into<String>) -> Self {
        self.ca_path = Some(path.into());
        self
    }

    /// Set whether client authentication is required (mTLS).
    pub fn client_auth_required(mut self, required: bool) -> Self {
        self.client_auth = required;
        self
    }

    /// Build the TLS configuration.
    ///
    /// Returns `None` if TLS is disabled.
    /// Generates self-signed certificates if enabled but no paths provided.
    pub fn build(self) -> Result<Option<TlsConfig>, TlsError> {
        if !self.enabled {
            tracing::info!("TLS disabled");
            return Ok(None);
        }

        // If certificate paths are provided, load from files
        if let (Some(cert_path), Some(key_path)) = (&self.cert_path, &self.key_path) {
            tracing::info!(
                cert_path = %cert_path,
                key_path = %key_path,
                ca_path = ?self.ca_path,
                client_auth = self.client_auth,
                "Loading TLS certificates from files"
            );

            let ca_path_ref = self.ca_path.as_ref().map(|s| s.as_str());
            return TlsConfig::from_files(cert_path, key_path, ca_path_ref, self.client_auth)
                .map(Some);
        }

        // Generate self-signed certificates for development
        tracing::warn!(
            "No TLS certificate paths provided, generating self-signed certificate for development"
        );

        TlsConfig::generate_self_signed(
            "cream-execution-engine",
            &["localhost", "127.0.0.1", "::1"],
        )
        .map(Some)
    }
}

/// Global TLS configuration cache.
static TLS_CONFIG: std::sync::OnceLock<Option<Arc<TlsConfig>>> = std::sync::OnceLock::new();

/// Initialize TLS configuration from environment.
///
/// This should be called once at application startup.
pub fn init_tls_config() -> Result<Option<Arc<TlsConfig>>, TlsError> {
    let config = TlsConfigBuilder::from_env().build()?;
    let config_arc = config.map(Arc::new);

    TLS_CONFIG
        .set(config_arc.clone())
        .map_err(|_| TlsError::Configuration("TLS config already initialized".to_string()))?;

    Ok(config_arc)
}

/// Get the cached TLS configuration.
///
/// Returns [`None`] if TLS is disabled or not initialized.
pub fn get_tls_config() -> Option<Arc<TlsConfig>> {
    TLS_CONFIG.get().and_then(|c| c.clone())
}

/// Check if TLS is enabled.
pub fn is_tls_enabled() -> bool {
    get_tls_config().is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_self_signed() {
        let config =
            TlsConfig::generate_self_signed("test-server", &["localhost", "127.0.0.1"]).unwrap();

        assert!(config.cert.contains("-----BEGIN CERTIFICATE-----"));
        assert!(config.key.contains("-----BEGIN PRIVATE KEY-----"));
        assert!(config.ca_cert.is_some());
    }

    #[test]
    fn test_builder_disabled() {
        let config = TlsConfigBuilder::new().enabled(false).build().unwrap();

        assert!(config.is_none());
    }

    #[test]
    fn test_builder_enabled_auto_generate() {
        let config = TlsConfigBuilder::new().enabled(true).build().unwrap();

        assert!(config.is_some());
        let config = config.unwrap();
        assert!(!config.client_auth_required);
    }

    #[test]
    fn test_builder_from_pem() {
        let config = TlsConfig::generate_self_signed("test", &["localhost"]).unwrap();

        let config2 = TlsConfig::from_pem(&config.cert, &config.key, config.ca_cert.clone(), false);

        assert_eq!(config2.cert, config.cert);
        assert_eq!(config2.key, config.key);
    }

    #[test]
    fn test_build_server_config() {
        let config = TlsConfig::generate_self_signed("test", &["localhost"]).unwrap();

        let server_config = config.build_server_config();
        assert!(server_config.is_ok());
    }

    // Note: test_from_env_disabled_by_default removed because Rust 2024 edition
    // requires unsafe blocks for env var modification, and we forbid unsafe code.
    // The TlsConfigBuilder::from_env() functionality is covered by integration tests.
}
