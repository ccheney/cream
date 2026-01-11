//! Broker adapter trait definition.
//!
//! This module defines the `BrokerAdapter` trait that all broker integrations
//! must implement. It follows FIX protocol semantics for order lifecycle management.

use async_trait::async_trait;

use crate::models::{ExecutionAck, OrderState, SubmitOrdersRequest};

use super::BrokerError;

/// Trait for broker adapters.
///
/// This trait defines the interface that all broker integrations must implement.
/// It follows FIX protocol semantics for order lifecycle management.
///
/// # FIX Protocol Order Lifecycle
///
/// 1. **New (39=0)**: Order created but not yet submitted to broker
/// 2. **`PendingNew` (39=A)**: Order submitted, awaiting broker acknowledgment
/// 3. **Accepted (39=1)**: Broker acknowledged order (equivalent to FIX "Filled" for acknowledgment)
/// 4. **`PartiallyFilled` (39=1)**: Order partially executed
/// 5. **Filled (39=2)**: Order completely executed
/// 6. **`PendingCancel` (39=6)**: Cancel request submitted, awaiting confirmation
/// 7. **Canceled (39=4)**: Order successfully canceled
/// 8. **Rejected (39=8)**: Order rejected by broker
/// 9. **Expired (39=C)**: Order expired (e.g., Day order at market close)
///
/// # Error Handling
///
/// Implementations should return specific errors for:
/// - Authentication failures
/// - Rate limiting (with retry-after information)
/// - Order rejections (with rejection reasons)
/// - Environment mismatches (PAPER vs LIVE)
#[async_trait]
pub trait BrokerAdapter: Send + Sync {
    /// Submit orders from a decision plan.
    ///
    /// This is the primary order routing method. It should:
    /// 1. Validate the request environment matches the adapter's environment
    /// 2. Convert decisions to broker-specific order format
    /// 3. Submit orders via broker API
    /// 4. Return execution acknowledgment with order states
    ///
    /// # Arguments
    ///
    /// * `request` - Order submission request containing decision plan
    ///
    /// # Returns
    ///
    /// * `Ok(ExecutionAck)` - Successfully submitted orders with their states
    /// * `Err(BrokerError)` - Failed to submit orders
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Environment mismatch detected
    /// - Authentication fails
    /// - Rate limit exceeded
    /// - Order validation fails at broker
    async fn submit_orders(
        &self,
        request: &SubmitOrdersRequest,
    ) -> Result<ExecutionAck, BrokerError>;

    /// Get current order status from broker.
    ///
    /// Queries the broker for the current state of an order identified by
    /// the broker's order ID.
    ///
    /// # Arguments
    ///
    /// * `broker_order_id` - Broker's unique identifier for the order
    ///
    /// # Returns
    ///
    /// * `Ok(OrderState)` - Current order state
    /// * `Err(BrokerError)` - Failed to retrieve order state
    async fn get_order_status(&self, broker_order_id: &str) -> Result<OrderState, BrokerError>;

    /// Cancel an order.
    ///
    /// Submits a cancel request for the specified order. Note that cancellation
    /// is not guaranteed - the order may already be filled or in a non-cancelable state.
    ///
    /// # Arguments
    ///
    /// * `broker_order_id` - Broker's unique identifier for the order
    ///
    /// # Returns
    ///
    /// * `Ok(())` - Cancel request accepted (order may transition to `PendingCancel` -> `Canceled`)
    /// * `Err(BrokerError)` - Failed to submit cancel request
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Order not found
    /// - Order already in terminal state (Filled, Canceled, Rejected, Expired)
    /// - Broker API error
    async fn cancel_order(&self, broker_order_id: &str) -> Result<(), BrokerError>;

    /// Get broker name for logging and metrics.
    fn broker_name(&self) -> &'static str;

    /// Check broker connection health.
    ///
    /// Performs a lightweight check to verify the broker connection is healthy.
    /// Used by the connection monitor for heartbeat checks.
    ///
    /// # Returns
    ///
    /// * `Ok(())` - Connection is healthy
    /// * `Err(BrokerError)` - Connection check failed
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Authentication fails
    /// - Network error
    /// - Broker API error
    async fn health_check(&self) -> Result<(), BrokerError>;
}
