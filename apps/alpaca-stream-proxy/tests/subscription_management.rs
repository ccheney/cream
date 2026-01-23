//! Subscription Management Integration Tests
//!
//! Tests subscription tracking, cleanup, and reference counting.

#![allow(clippy::unwrap_used, clippy::expect_used)]

use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use rust_decimal::Decimal;
use tokio::time::timeout;
use tonic::Request;
use tonic::transport::{Channel, Server};

use alpaca_stream_proxy::{
    BroadcastConfig, BroadcastHub, StockQuoteMessage, StreamProxyServer, StreamProxyServerConfig,
    SubscriptionManager,
    proto::{
        Environment, StreamQuotesRequest, stream_proxy_service_client::StreamProxyServiceClient,
        stream_proxy_service_server::StreamProxyServiceServer,
    },
};

async fn setup_test_server() -> (
    StreamProxyServiceClient<Channel>,
    Arc<BroadcastHub>,
    Arc<SubscriptionManager>,
    tokio::task::JoinHandle<()>,
) {
    let broadcast_hub = Arc::new(BroadcastHub::new(BroadcastConfig::default()));
    let subscription_manager = Arc::new(SubscriptionManager::new());

    let config = StreamProxyServerConfig {
        version: "test-0.0.1".to_string(),
        environment: Environment::Paper,
    };

    let server = StreamProxyServer::new(
        config,
        Arc::clone(&broadcast_hub),
        Arc::clone(&subscription_manager),
    );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    let server_handle = tokio::spawn(async move {
        Server::builder()
            .add_service(StreamProxyServiceServer::new(server))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });

    tokio::time::sleep(Duration::from_millis(50)).await;

    let client = StreamProxyServiceClient::connect(format!("http://{addr}"))
        .await
        .unwrap();

    (client, broadcast_hub, subscription_manager, server_handle)
}

fn make_test_quote(symbol: &str) -> StockQuoteMessage {
    StockQuoteMessage {
        msg_type: "q".to_string(),
        symbol: symbol.to_string(),
        bid_exchange: "V".to_string(),
        bid_price: Decimal::try_from(150.0).unwrap(),
        bid_size: 100,
        ask_exchange: "V".to_string(),
        ask_price: Decimal::try_from(150.05).unwrap(),
        ask_size: 200,
        timestamp: Utc::now(),
        conditions: vec![],
        tape: "A".to_string(),
    }
}

// =============================================================================
// Broadcast Receiver Count Tests
// =============================================================================

#[tokio::test]
async fn test_client_connection_increases_receiver_count() {
    let (mut client, hub, _sub_mgr, handle) = setup_test_server().await;

    // Initially no receivers
    assert_eq!(hub.stock_quotes_receiver_count(), 0);

    // Connect a streaming client
    let _stream = client
        .stream_quotes(Request::new(StreamQuotesRequest { symbols: vec![] }))
        .await
        .unwrap();

    tokio::time::sleep(Duration::from_millis(20)).await;

    // Should have one receiver
    assert_eq!(hub.stock_quotes_receiver_count(), 1);

    handle.abort();
}

#[tokio::test]
async fn test_multiple_clients_tracked_independently() {
    let (mut client1, hub, _sub_mgr, handle) = setup_test_server().await;
    let mut client2 = client1.clone();
    let mut client3 = client1.clone();

    // Connect three streaming clients
    let _stream1 = client1
        .stream_quotes(Request::new(StreamQuotesRequest { symbols: vec![] }))
        .await
        .unwrap();

    let _stream2 = client2
        .stream_quotes(Request::new(StreamQuotesRequest { symbols: vec![] }))
        .await
        .unwrap();

    let _stream3 = client3
        .stream_quotes(Request::new(StreamQuotesRequest { symbols: vec![] }))
        .await
        .unwrap();

    tokio::time::sleep(Duration::from_millis(50)).await;

    // Should have three receivers
    assert_eq!(hub.stock_quotes_receiver_count(), 3);

    handle.abort();
}

#[tokio::test]
async fn test_client_disconnect_decreases_receiver_count() {
    let (mut client, hub, _sub_mgr, handle) = setup_test_server().await;

    // Connect a streaming client
    let stream = client
        .stream_quotes(Request::new(StreamQuotesRequest { symbols: vec![] }))
        .await
        .unwrap()
        .into_inner();

    tokio::time::sleep(Duration::from_millis(20)).await;
    assert_eq!(hub.stock_quotes_receiver_count(), 1);

    // Drop the stream to simulate disconnect
    drop(stream);

    // Give time for cleanup
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Receiver count should decrease eventually (when internal task detects send failure)
    // So we send a message to trigger the cleanup
    let _ = hub.send_stock_quote(make_test_quote("AAPL"));

    tokio::time::sleep(Duration::from_millis(50)).await;

    // The receiver should be cleaned up after failed send
    assert_eq!(hub.stock_quotes_receiver_count(), 0);

    handle.abort();
}

// =============================================================================
// Broadcast Stats Tests
// =============================================================================

#[tokio::test]
async fn test_broadcast_stats_reflects_all_streams() {
    let (mut client, hub, _sub_mgr, handle) = setup_test_server().await;

    // Initially all zeros
    let stats = hub.stats();
    assert_eq!(stats.total_receivers(), 0);

    // Subscribe to quotes
    let _quote_stream = client
        .stream_quotes(Request::new(StreamQuotesRequest { symbols: vec![] }))
        .await
        .unwrap();

    tokio::time::sleep(Duration::from_millis(20)).await;

    let stats = hub.stats();
    assert_eq!(stats.stock_quotes_receivers, 1);
    assert_eq!(stats.stock_trades_receivers, 0);
    assert_eq!(stats.total_receivers(), 1);

    handle.abort();
}

// =============================================================================
// Client Recovery Tests
// =============================================================================

#[tokio::test]
async fn test_client_can_reconnect_after_disconnect() {
    let (mut client, hub, _sub_mgr, handle) = setup_test_server().await;

    // First connection
    {
        let mut stream = client
            .stream_quotes(Request::new(StreamQuotesRequest { symbols: vec![] }))
            .await
            .unwrap()
            .into_inner();

        tokio::time::sleep(Duration::from_millis(20)).await;

        let _ = hub.send_stock_quote(make_test_quote("AAPL"));
        let msg = timeout(Duration::from_secs(2), stream.message())
            .await
            .expect("timeout")
            .expect("error")
            .expect("no message");

        assert_eq!(msg.quote.unwrap().symbol, "AAPL");
    }

    // Disconnect (stream dropped)
    tokio::time::sleep(Duration::from_millis(50)).await;

    // Reconnect with new stream
    let mut stream = client
        .stream_quotes(Request::new(StreamQuotesRequest { symbols: vec![] }))
        .await
        .unwrap()
        .into_inner();

    tokio::time::sleep(Duration::from_millis(20)).await;

    // Should still be able to receive messages
    let _ = hub.send_stock_quote(make_test_quote("MSFT"));
    let msg = timeout(Duration::from_secs(2), stream.message())
        .await
        .expect("timeout")
        .expect("error")
        .expect("no message");

    assert_eq!(msg.quote.unwrap().symbol, "MSFT");

    handle.abort();
}

// =============================================================================
// Concurrent Operations Tests
// =============================================================================

#[tokio::test]
async fn test_concurrent_subscribe_unsubscribe() {
    let (client, hub, _sub_mgr, handle) = setup_test_server().await;

    // Spawn multiple concurrent connections
    let mut handles = vec![];

    for _ in 0..5 {
        let mut c = client.clone();
        handles.push(tokio::spawn(async move {
            let _stream = c
                .stream_quotes(Request::new(StreamQuotesRequest { symbols: vec![] }))
                .await
                .unwrap();
            tokio::time::sleep(Duration::from_millis(100)).await;
            // Stream dropped, disconnect
        }));
    }

    // Wait for all to complete
    for h in handles {
        let _ = h.await;
    }

    // Give time for cleanup
    tokio::time::sleep(Duration::from_millis(200)).await;

    // Trigger cleanup with a send
    let _ = hub.send_stock_quote(make_test_quote("AAPL"));

    tokio::time::sleep(Duration::from_millis(50)).await;

    // All should be cleaned up
    assert_eq!(hub.stock_quotes_receiver_count(), 0);

    handle.abort();
}
