//! Scanner gRPC Server
//!
//! Exposes scanner alert streaming and scanner status/config operations.

use std::pin::Pin;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use prost_types::Timestamp;
use tokio::sync::broadcast;
use tokio_stream::Stream;
use tokio_stream::wrappers::ReceiverStream;
use tonic::{Request, Response, Status};

use super::proto::cream::v1::{
    GetScannerStatusRequest, GetScannerStatusResponse, ReloadScannerConfigRequest,
    ReloadScannerConfigResponse, ScannerAlert, ScannerConfig, ScannerSignalType,
    StreamScannerAlertsRequest, StreamScannerAlertsResponse,
    scanner_service_server::ScannerService,
};
use crate::application::services::scanner::ScannerService as ScannerAppService;
use crate::domain::scanner::{ScannerAlertDomain, ScannerParams, SignalType};
use crate::infrastructure::broadcast::SharedBroadcastHub;

type StreamResult<T> = Result<Response<T>, Status>;
type BoxedStream<T> = Pin<Box<dyn Stream<Item = Result<T, Status>> + Send>>;

/// gRPC server for scanner service methods.
pub struct ScannerGrpcServer {
    scanner_service: Arc<ScannerAppService>,
    broadcast_hub: SharedBroadcastHub,
}

impl ScannerGrpcServer {
    /// Create scanner gRPC server.
    #[must_use]
    pub fn new(scanner_service: Arc<ScannerAppService>, broadcast_hub: SharedBroadcastHub) -> Self {
        Self {
            scanner_service,
            broadcast_hub,
        }
    }
}

#[tonic::async_trait]
impl ScannerService for ScannerGrpcServer {
    type StreamScannerAlertsStream = BoxedStream<StreamScannerAlertsResponse>;

    async fn stream_scanner_alerts(
        &self,
        _request: Request<StreamScannerAlertsRequest>,
    ) -> StreamResult<Self::StreamScannerAlertsStream> {
        let mut rx = self.broadcast_hub.scanner_alerts_rx();
        let (tx, grpc_rx) = tokio::sync::mpsc::channel(256);

        tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(alert_broadcast) => {
                        let response = StreamScannerAlertsResponse {
                            alert: Some(scanner_alert_to_proto(&alert_broadcast.alert)),
                        };

                        if tx.send(Ok(response)).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(lagged)) => {
                        tracing::warn!(lagged, "Scanner alert receiver lagged");
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
        });

        let stream = ReceiverStream::new(grpc_rx);
        Ok(Response::new(
            Box::pin(stream) as Self::StreamScannerAlertsStream
        ))
    }

    async fn get_scanner_status(
        &self,
        _request: Request<GetScannerStatusRequest>,
    ) -> StreamResult<GetScannerStatusResponse> {
        let status = self.scanner_service.status().await;
        Ok(Response::new(GetScannerStatusResponse {
            active: status.active,
            symbols_tracked: i32::try_from(status.symbols_tracked).unwrap_or(i32::MAX),
            total_alerts: i64::try_from(status.total_alerts).unwrap_or(i64::MAX),
            alerts_last_hour: i64::try_from(status.alerts_last_hour).unwrap_or(i64::MAX),
            config: Some(scanner_config_to_proto(&status.config)),
        }))
    }

    async fn reload_scanner_config(
        &self,
        _request: Request<ReloadScannerConfigRequest>,
    ) -> StreamResult<ReloadScannerConfigResponse> {
        match self.scanner_service.reload_config().await {
            Ok(config) => Ok(Response::new(ReloadScannerConfigResponse {
                success: true,
                message: "Scanner config reloaded".to_string(),
                config: Some(scanner_config_to_proto(&config)),
            })),
            Err(message) => Ok(Response::new(ReloadScannerConfigResponse {
                success: false,
                message,
                config: None,
            })),
        }
    }
}

fn datetime_to_timestamp(dt: DateTime<Utc>) -> Timestamp {
    Timestamp {
        seconds: dt.timestamp(),
        nanos: i32::try_from(dt.timestamp_subsec_nanos()).unwrap_or(i32::MAX),
    }
}

fn signal_to_proto(signal: &SignalType) -> i32 {
    match signal {
        SignalType::VolumeSpike { .. } => ScannerSignalType::VolumeSpike.into(),
        SignalType::PriceMove { .. } => ScannerSignalType::PriceMove.into(),
        SignalType::Gap { .. } => ScannerSignalType::Gap.into(),
    }
}

fn scanner_alert_to_proto(alert: &ScannerAlertDomain) -> ScannerAlert {
    ScannerAlert {
        symbol: alert.symbol.clone(),
        timestamp: Some(datetime_to_timestamp(alert.timestamp)),
        signals: alert.signals.iter().map(signal_to_proto).collect(),
        price: alert.price,
        volume: alert.volume,
        avg_volume: alert.avg_volume,
        volume_ratio: alert.volume_ratio,
        price_change_pct: alert.price_change_pct,
        gap_pct: alert.gap_pct,
        approx_atr: alert.approx_atr,
    }
}

fn scanner_config_to_proto(config: &ScannerParams) -> ScannerConfig {
    ScannerConfig {
        min_price: config.min_price,
        min_avg_volume: config.min_avg_volume,
        volume_spike_threshold: config.volume_spike_threshold,
        price_move_threshold: config.price_move_threshold,
        gap_threshold: config.gap_threshold,
        max_candidates: i32::try_from(config.max_candidates).unwrap_or(i32::MAX),
        cooldown_seconds: config.cooldown_seconds,
        enabled: config.enabled,
    }
}
