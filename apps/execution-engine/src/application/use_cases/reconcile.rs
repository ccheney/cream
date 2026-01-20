//! Reconcile Use Case

use std::sync::Arc;

use rust_decimal::Decimal;

use crate::application::ports::BrokerPort;
use crate::domain::order_execution::repository::OrderRepository;
use crate::domain::order_execution::value_objects::{FillReport, OrderStatus};
use crate::domain::shared::{BrokerId, Money, Quantity, Timestamp};

/// Reconciliation result for a single order.
#[derive(Debug, Clone)]
pub struct OrderReconciliation {
    /// Order ID.
    pub order_id: String,
    /// Broker order ID.
    pub broker_order_id: String,
    /// Local status.
    pub local_status: OrderStatus,
    /// Broker status.
    pub broker_status: OrderStatus,
    /// Whether statuses match.
    pub status_match: bool,
    /// Local filled quantity.
    pub local_filled_qty: Decimal,
    /// Broker filled quantity.
    pub broker_filled_qty: Decimal,
    /// Whether filled quantities match.
    pub qty_match: bool,
    /// Actions taken.
    pub actions: Vec<String>,
}

/// Overall reconciliation result.
#[derive(Debug, Clone)]
pub struct ReconciliationResult {
    /// Total orders checked.
    pub total_checked: usize,
    /// Orders with mismatches.
    pub mismatches: usize,
    /// Orders successfully reconciled.
    pub reconciled: usize,
    /// Per-order results.
    pub order_results: Vec<OrderReconciliation>,
    /// Any errors that occurred.
    pub errors: Vec<String>,
}

impl ReconciliationResult {
    /// Check if reconciliation was fully successful.
    #[must_use]
    pub fn is_success(&self) -> bool {
        self.mismatches == 0 && self.errors.is_empty()
    }
}

/// Use case for reconciling local order state with broker.
pub struct ReconcileUseCase<B, O>
where
    B: BrokerPort,
    O: OrderRepository,
{
    broker: Arc<B>,
    order_repo: Arc<O>,
}

impl<B, O> ReconcileUseCase<B, O>
where
    B: BrokerPort,
    O: OrderRepository,
{
    /// Create a new ReconcileUseCase.
    pub fn new(broker: Arc<B>, order_repo: Arc<O>) -> Self {
        Self { broker, order_repo }
    }

    /// Execute full reconciliation.
    pub async fn execute(&self) -> ReconciliationResult {
        let mut result = ReconciliationResult {
            total_checked: 0,
            mismatches: 0,
            reconciled: 0,
            order_results: vec![],
            errors: vec![],
        };

        // 1. Get all open orders from local repo
        let local_orders = match self.order_repo.find_active().await {
            Ok(orders) => orders,
            Err(e) => {
                result
                    .errors
                    .push(format!("Failed to load local orders: {}", e));
                return result;
            }
        };

        // 2. Get all open orders from broker
        let broker_orders = match self.broker.get_open_orders().await {
            Ok(orders) => orders,
            Err(e) => {
                result
                    .errors
                    .push(format!("Failed to load broker orders: {}", e));
                return result;
            }
        };

        // 3. Build broker order lookup
        let broker_map: std::collections::HashMap<String, _> = broker_orders
            .into_iter()
            .map(|o| (o.client_order_id.to_string(), o))
            .collect();

        // 4. Reconcile each local order
        for mut order in local_orders {
            result.total_checked += 1;

            let broker_id = match order.broker_order_id() {
                Some(id) => id.clone(),
                None => {
                    // Order was never submitted to broker
                    continue;
                }
            };

            // Find matching broker order
            let broker_order = broker_map.get(order.id().as_str());

            let local_filled = order.partial_fill().cum_qty().amount();
            let broker_filled = broker_order.map(|o| o.filled_qty).unwrap_or(Decimal::ZERO);

            let mut reconciliation = OrderReconciliation {
                order_id: order.id().to_string(),
                broker_order_id: broker_id.to_string(),
                local_status: order.status(),
                broker_status: broker_order
                    .map(|o| o.status)
                    .unwrap_or(OrderStatus::Canceled),
                status_match: false,
                local_filled_qty: local_filled,
                broker_filled_qty: broker_filled,
                qty_match: false,
                actions: vec![],
            };

            // Check status match
            reconciliation.status_match = broker_order
                .map(|o| o.status == order.status())
                .unwrap_or(false);

            // Check quantity match
            reconciliation.qty_match = broker_filled == local_filled;

            // Apply corrections
            if let Some(broker_ack) = broker_order {
                // Update filled quantity if different
                if !reconciliation.qty_match && broker_ack.filled_qty > local_filled {
                    let fill_qty = broker_ack.filled_qty - local_filled;
                    let fill_price = broker_ack.avg_fill_price.unwrap_or(Decimal::ZERO);

                    let fill_report = FillReport::new(
                        format!("reconcile-{}", order.id()),
                        Quantity::new(fill_qty),
                        Money::new(fill_price),
                        Timestamp::now(),
                        "RECONCILE",
                    );

                    if let Err(e) = order.apply_fill(fill_report) {
                        result.errors.push(format!(
                            "Failed to apply fill to {}: {}",
                            order.id(),
                            e
                        ));
                    } else {
                        reconciliation
                            .actions
                            .push(format!("Applied fill: {} @ {}", fill_qty, fill_price));
                    }
                }

                // Save updated order
                if !reconciliation.actions.is_empty() {
                    if let Err(e) = self.order_repo.save(&order).await {
                        result.errors.push(format!(
                            "Failed to save reconciled order {}: {}",
                            order.id(),
                            e
                        ));
                    } else {
                        result.reconciled += 1;
                    }
                }
            }

            if !reconciliation.status_match || !reconciliation.qty_match {
                result.mismatches += 1;
            }

            result.order_results.push(reconciliation);
        }

        result
    }

    /// Reconcile a single order by ID.
    pub async fn reconcile_order(
        &self,
        broker_order_id: &BrokerId,
    ) -> Result<OrderReconciliation, String> {
        // Get broker order state
        let broker_ack = self
            .broker
            .get_order(broker_order_id)
            .await
            .map_err(|e| format!("Failed to get broker order: {}", e))?;

        // Find local order
        let mut order = self
            .order_repo
            .find_by_broker_id(broker_order_id)
            .await
            .map_err(|e| format!("Failed to find local order: {}", e))?
            .ok_or_else(|| "Order not found locally".to_string())?;

        let local_filled = order.partial_fill().cum_qty().amount();

        let mut reconciliation = OrderReconciliation {
            order_id: order.id().to_string(),
            broker_order_id: broker_order_id.to_string(),
            local_status: order.status(),
            broker_status: broker_ack.status,
            status_match: broker_ack.status == order.status(),
            local_filled_qty: local_filled,
            broker_filled_qty: broker_ack.filled_qty,
            qty_match: broker_ack.filled_qty == local_filled,
            actions: vec![],
        };

        // Apply fill correction if needed
        if !reconciliation.qty_match && broker_ack.filled_qty > local_filled {
            let fill_qty = broker_ack.filled_qty - local_filled;
            let fill_price = broker_ack.avg_fill_price.unwrap_or(Decimal::ZERO);

            let fill_report = FillReport::new(
                format!("reconcile-{}", order.id()),
                Quantity::new(fill_qty),
                Money::new(fill_price),
                Timestamp::now(),
                "RECONCILE",
            );

            order
                .apply_fill(fill_report)
                .map_err(|e| format!("Failed to apply fill: {}", e))?;

            reconciliation
                .actions
                .push(format!("Applied fill: {} @ {}", fill_qty, fill_price));

            // Save
            self.order_repo
                .save(&order)
                .await
                .map_err(|e| format!("Failed to save order: {}", e))?;
        }

        Ok(reconciliation)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::ports::{BrokerError, OrderAck};
    use crate::domain::order_execution::aggregate::{CreateOrderCommand, Order};
    use crate::domain::order_execution::errors::OrderError;
    use crate::domain::order_execution::value_objects::{
        OrderPurpose, OrderSide, OrderType, TimeInForce,
    };
    use crate::domain::shared::{InstrumentId, OrderId, Symbol};
    use async_trait::async_trait;
    use std::collections::HashMap;
    use std::sync::RwLock;

    struct MockBroker {
        orders: RwLock<Vec<OrderAck>>,
    }

    impl MockBroker {
        fn new(orders: Vec<OrderAck>) -> Self {
            Self {
                orders: RwLock::new(orders),
            }
        }
    }

    #[async_trait]
    impl BrokerPort for MockBroker {
        async fn submit_order(
            &self,
            _request: crate::application::ports::SubmitOrderRequest,
        ) -> Result<OrderAck, BrokerError> {
            Err(BrokerError::Unknown {
                message: "Not implemented".to_string(),
            })
        }

        async fn cancel_order(
            &self,
            _request: crate::application::ports::CancelOrderRequest,
        ) -> Result<(), BrokerError> {
            Ok(())
        }

        async fn get_order(&self, broker_order_id: &BrokerId) -> Result<OrderAck, BrokerError> {
            let orders = self.orders.read().unwrap();
            orders
                .iter()
                .find(|o| &o.broker_order_id == broker_order_id)
                .cloned()
                .ok_or(BrokerError::OrderNotFound {
                    order_id: broker_order_id.to_string(),
                })
        }

        async fn get_open_orders(&self) -> Result<Vec<OrderAck>, BrokerError> {
            let orders = self.orders.read().unwrap();
            Ok(orders.clone())
        }

        async fn get_buying_power(&self) -> Result<Decimal, BrokerError> {
            Ok(Decimal::new(100_000, 0))
        }

        async fn get_position(
            &self,
            _instrument_id: &InstrumentId,
        ) -> Result<Option<Decimal>, BrokerError> {
            Ok(None)
        }
    }

    struct MockOrderRepo {
        orders: RwLock<HashMap<String, Order>>,
    }

    impl MockOrderRepo {
        fn new() -> Self {
            Self {
                orders: RwLock::new(HashMap::new()),
            }
        }

        fn add_order(&self, order: Order) {
            let mut orders = self.orders.write().unwrap();
            orders.insert(order.id().to_string(), order);
        }
    }

    #[async_trait]
    impl OrderRepository for MockOrderRepo {
        async fn save(&self, order: &Order) -> Result<(), OrderError> {
            let mut orders = self.orders.write().unwrap();
            orders.insert(order.id().to_string(), order.clone());
            Ok(())
        }

        async fn find_by_id(&self, id: &OrderId) -> Result<Option<Order>, OrderError> {
            let orders = self.orders.read().unwrap();
            Ok(orders.get(id.as_str()).cloned())
        }

        async fn find_by_broker_id(
            &self,
            broker_id: &BrokerId,
        ) -> Result<Option<Order>, OrderError> {
            let orders = self.orders.read().unwrap();
            Ok(orders
                .values()
                .find(|o| o.broker_order_id().map(|b| b == broker_id).unwrap_or(false))
                .cloned())
        }

        async fn find_by_status(&self, status: OrderStatus) -> Result<Vec<Order>, OrderError> {
            let orders = self.orders.read().unwrap();
            Ok(orders
                .values()
                .filter(|o| o.status() == status)
                .cloned()
                .collect())
        }

        async fn find_active(&self) -> Result<Vec<Order>, OrderError> {
            let orders = self.orders.read().unwrap();
            Ok(orders
                .values()
                .filter(|o| !o.status().is_terminal())
                .cloned()
                .collect())
        }

        async fn delete(&self, id: &OrderId) -> Result<(), OrderError> {
            let mut orders = self.orders.write().unwrap();
            orders.remove(id.as_str());
            Ok(())
        }

        async fn exists(&self, id: &OrderId) -> Result<bool, OrderError> {
            let orders = self.orders.read().unwrap();
            Ok(orders.contains_key(id.as_str()))
        }
    }

    fn create_order_with_broker(broker_id: &str) -> Order {
        let command = CreateOrderCommand {
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Buy,
            order_type: OrderType::Market,
            quantity: Quantity::from_i64(100),
            limit_price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
            legs: vec![],
        };
        let mut order = Order::new(command).unwrap();
        order.accept(BrokerId::new(broker_id)).unwrap();
        order
    }

    #[tokio::test]
    async fn reconcile_no_mismatches() {
        let order = create_order_with_broker("broker-1");
        let order_id = order.id().clone();

        let broker_orders = vec![OrderAck {
            broker_order_id: BrokerId::new("broker-1"),
            client_order_id: order_id,
            status: OrderStatus::Accepted,
            filled_qty: Decimal::ZERO,
            avg_fill_price: None,
        }];

        let broker = Arc::new(MockBroker::new(broker_orders));
        let order_repo = Arc::new(MockOrderRepo::new());
        order_repo.add_order(order);

        let use_case = ReconcileUseCase::new(broker, order_repo);
        let result = use_case.execute().await;

        assert_eq!(result.total_checked, 1);
        assert_eq!(result.mismatches, 0);
        assert!(result.is_success());
    }

    #[tokio::test]
    async fn reconcile_with_fill_mismatch() {
        let order = create_order_with_broker("broker-1");
        let order_id = order.id().clone();

        let broker_orders = vec![OrderAck {
            broker_order_id: BrokerId::new("broker-1"),
            client_order_id: order_id,
            status: OrderStatus::Filled,
            filled_qty: Decimal::new(100, 0),
            avg_fill_price: Some(Decimal::new(150, 0)),
        }];

        let broker = Arc::new(MockBroker::new(broker_orders));
        let order_repo = Arc::new(MockOrderRepo::new());
        order_repo.add_order(order);

        let use_case = ReconcileUseCase::new(broker, order_repo);
        let result = use_case.execute().await;

        assert_eq!(result.total_checked, 1);
        assert_eq!(result.reconciled, 1);
        assert!(!result.order_results[0].actions.is_empty());
    }

    #[tokio::test]
    async fn reconcile_empty_orders() {
        let broker = Arc::new(MockBroker::new(vec![]));
        let order_repo = Arc::new(MockOrderRepo::new());

        let use_case = ReconcileUseCase::new(broker, order_repo);
        let result = use_case.execute().await;

        assert_eq!(result.total_checked, 0);
        assert!(result.is_success());
    }

    #[tokio::test]
    async fn reconcile_order_without_broker_id_skipped() {
        let command = CreateOrderCommand {
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Buy,
            order_type: OrderType::Market,
            quantity: Quantity::from_i64(100),
            limit_price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
            legs: vec![],
        };
        let order = Order::new(command).unwrap();

        let broker = Arc::new(MockBroker::new(vec![]));
        let order_repo = Arc::new(MockOrderRepo::new());
        order_repo.add_order(order);

        let use_case = ReconcileUseCase::new(broker, order_repo);
        let result = use_case.execute().await;

        // Order without broker_id is skipped (total_checked is 1 but no results)
        assert_eq!(result.total_checked, 1);
        assert!(result.order_results.is_empty());
    }

    #[tokio::test]
    async fn reconcile_with_status_mismatch() {
        let order = create_order_with_broker("broker-1");
        let order_id = order.id().clone();

        let broker_orders = vec![OrderAck {
            broker_order_id: BrokerId::new("broker-1"),
            client_order_id: order_id,
            status: OrderStatus::Canceled, // Different from local Accepted
            filled_qty: Decimal::ZERO,
            avg_fill_price: None,
        }];

        let broker = Arc::new(MockBroker::new(broker_orders));
        let order_repo = Arc::new(MockOrderRepo::new());
        order_repo.add_order(order);

        let use_case = ReconcileUseCase::new(broker, order_repo);
        let result = use_case.execute().await;

        assert_eq!(result.mismatches, 1);
        assert!(!result.order_results[0].status_match);
    }

    #[test]
    fn reconciliation_result_is_success() {
        let result = ReconciliationResult {
            total_checked: 5,
            mismatches: 0,
            reconciled: 0,
            order_results: vec![],
            errors: vec![],
        };
        assert!(result.is_success());

        let result_with_mismatches = ReconciliationResult {
            total_checked: 5,
            mismatches: 1,
            reconciled: 0,
            order_results: vec![],
            errors: vec![],
        };
        assert!(!result_with_mismatches.is_success());

        let result_with_errors = ReconciliationResult {
            total_checked: 5,
            mismatches: 0,
            reconciled: 0,
            order_results: vec![],
            errors: vec!["error".to_string()],
        };
        assert!(!result_with_errors.is_success());
    }

    #[tokio::test]
    async fn reconcile_single_order_success() {
        let order = create_order_with_broker("broker-1");
        let broker_id = BrokerId::new("broker-1");
        let order_id = order.id().clone();

        let broker_orders = vec![OrderAck {
            broker_order_id: broker_id.clone(),
            client_order_id: order_id,
            status: OrderStatus::Accepted,
            filled_qty: Decimal::ZERO,
            avg_fill_price: None,
        }];

        let broker = Arc::new(MockBroker::new(broker_orders));
        let order_repo = Arc::new(MockOrderRepo::new());
        order_repo.add_order(order);

        let use_case = ReconcileUseCase::new(broker, order_repo);
        let result = use_case.reconcile_order(&broker_id).await;

        assert!(result.is_ok());
        let reconciliation = result.unwrap();
        assert!(reconciliation.status_match);
        assert!(reconciliation.qty_match);
        assert!(reconciliation.actions.is_empty());
    }

    #[tokio::test]
    async fn reconcile_single_order_with_fill_correction() {
        let order = create_order_with_broker("broker-1");
        let broker_id = BrokerId::new("broker-1");
        let order_id = order.id().clone();

        let broker_orders = vec![OrderAck {
            broker_order_id: broker_id.clone(),
            client_order_id: order_id,
            status: OrderStatus::PartiallyFilled,
            filled_qty: Decimal::new(50, 0), // Broker shows 50 filled
            avg_fill_price: Some(Decimal::new(150, 0)),
        }];

        let broker = Arc::new(MockBroker::new(broker_orders));
        let order_repo = Arc::new(MockOrderRepo::new());
        order_repo.add_order(order);

        let use_case = ReconcileUseCase::new(broker, order_repo);
        let result = use_case.reconcile_order(&broker_id).await;

        assert!(result.is_ok());
        let reconciliation = result.unwrap();
        assert!(!reconciliation.actions.is_empty());
        assert!(reconciliation.actions[0].contains("Applied fill: 50"));
    }

    #[tokio::test]
    async fn reconcile_single_order_not_found_locally() {
        let broker_id = BrokerId::new("broker-1");

        let broker_orders = vec![OrderAck {
            broker_order_id: broker_id.clone(),
            client_order_id: OrderId::new("ord-1"),
            status: OrderStatus::Accepted,
            filled_qty: Decimal::ZERO,
            avg_fill_price: None,
        }];

        let broker = Arc::new(MockBroker::new(broker_orders));
        let order_repo = Arc::new(MockOrderRepo::new()); // Empty

        let use_case = ReconcileUseCase::new(broker, order_repo);
        let result = use_case.reconcile_order(&broker_id).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Order not found locally"));
    }

    #[tokio::test]
    async fn reconcile_single_order_not_found_at_broker() {
        let order = create_order_with_broker("broker-1");
        let broker_id = BrokerId::new("broker-unknown");

        let broker = Arc::new(MockBroker::new(vec![])); // Empty
        let order_repo = Arc::new(MockOrderRepo::new());
        order_repo.add_order(order);

        let use_case = ReconcileUseCase::new(broker, order_repo);
        let result = use_case.reconcile_order(&broker_id).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to get broker order"));
    }

    struct FailingBroker;

    #[async_trait]
    impl BrokerPort for FailingBroker {
        async fn submit_order(
            &self,
            _request: crate::application::ports::SubmitOrderRequest,
        ) -> Result<OrderAck, BrokerError> {
            Err(BrokerError::Unknown {
                message: "Failed".to_string(),
            })
        }

        async fn cancel_order(
            &self,
            _request: crate::application::ports::CancelOrderRequest,
        ) -> Result<(), BrokerError> {
            Err(BrokerError::Unknown {
                message: "Failed".to_string(),
            })
        }

        async fn get_order(&self, _broker_order_id: &BrokerId) -> Result<OrderAck, BrokerError> {
            Err(BrokerError::Unknown {
                message: "Failed".to_string(),
            })
        }

        async fn get_open_orders(&self) -> Result<Vec<OrderAck>, BrokerError> {
            Err(BrokerError::Unknown {
                message: "Broker unavailable".to_string(),
            })
        }

        async fn get_buying_power(&self) -> Result<Decimal, BrokerError> {
            Err(BrokerError::Unknown {
                message: "Failed".to_string(),
            })
        }

        async fn get_position(
            &self,
            _instrument_id: &InstrumentId,
        ) -> Result<Option<Decimal>, BrokerError> {
            Err(BrokerError::Unknown {
                message: "Failed".to_string(),
            })
        }
    }

    #[tokio::test]
    async fn reconcile_execute_broker_error() {
        let broker = Arc::new(FailingBroker);
        let order_repo = Arc::new(MockOrderRepo::new());

        let use_case = ReconcileUseCase::new(broker, order_repo);
        let result = use_case.execute().await;

        assert!(!result.errors.is_empty());
        assert!(result.errors[0].contains("Failed to load broker orders"));
    }

    struct FailingOrderRepo;

    #[async_trait]
    impl OrderRepository for FailingOrderRepo {
        async fn save(&self, _order: &Order) -> Result<(), OrderError> {
            Err(OrderError::NotFound {
                order_id: "Failed".to_string(),
            })
        }

        async fn find_by_id(&self, _id: &OrderId) -> Result<Option<Order>, OrderError> {
            Err(OrderError::NotFound {
                order_id: "Failed".to_string(),
            })
        }

        async fn find_by_broker_id(
            &self,
            _broker_id: &BrokerId,
        ) -> Result<Option<Order>, OrderError> {
            Err(OrderError::NotFound {
                order_id: "Failed".to_string(),
            })
        }

        async fn find_by_status(&self, _status: OrderStatus) -> Result<Vec<Order>, OrderError> {
            Err(OrderError::NotFound {
                order_id: "Failed".to_string(),
            })
        }

        async fn find_active(&self) -> Result<Vec<Order>, OrderError> {
            Err(OrderError::NotFound {
                order_id: "Repo unavailable".to_string(),
            })
        }

        async fn delete(&self, _id: &OrderId) -> Result<(), OrderError> {
            Err(OrderError::NotFound {
                order_id: "Failed".to_string(),
            })
        }

        async fn exists(&self, _id: &OrderId) -> Result<bool, OrderError> {
            Err(OrderError::NotFound {
                order_id: "Failed".to_string(),
            })
        }
    }

    #[tokio::test]
    async fn reconcile_execute_repo_error() {
        let broker = Arc::new(MockBroker::new(vec![]));
        let order_repo = Arc::new(FailingOrderRepo);

        let use_case = ReconcileUseCase::new(broker, order_repo);
        let result = use_case.execute().await;

        assert!(!result.errors.is_empty());
        assert!(result.errors[0].contains("Failed to load local orders"));
    }
}
