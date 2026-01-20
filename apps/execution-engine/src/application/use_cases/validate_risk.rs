//! Validate Risk Use Case

use std::sync::Arc;

use crate::application::dto::{
    ConstraintCheckRequestDto, ConstraintCheckResponseDto, RiskValidationDto,
};
use crate::application::ports::RiskRepositoryPort;
use crate::domain::order_execution::aggregate::Order;
use crate::domain::order_execution::repository::OrderRepository;
use crate::domain::risk_management::services::RiskValidationService;
use crate::domain::shared::OrderId;

/// Use case for validating orders against risk limits.
pub struct ValidateRiskUseCase<R, O>
where
    R: RiskRepositoryPort,
    O: OrderRepository,
{
    risk_repo: Arc<R>,
    order_repo: Arc<O>,
}

impl<R, O> ValidateRiskUseCase<R, O>
where
    R: RiskRepositoryPort,
    O: OrderRepository,
{
    /// Create a new ValidateRiskUseCase.
    pub fn new(risk_repo: Arc<R>, order_repo: Arc<O>) -> Self {
        Self {
            risk_repo,
            order_repo,
        }
    }

    /// Execute the use case.
    pub async fn execute(
        &self,
        request: ConstraintCheckRequestDto,
    ) -> Result<ConstraintCheckResponseDto, String> {
        // 1. Load orders by ID
        let mut orders = Vec::new();
        for order_id in &request.order_ids {
            let id = OrderId::new(order_id);
            match self.order_repo.find_by_id(&id).await {
                Ok(Some(order)) => orders.push(order),
                Ok(None) => return Err(format!("Order not found: {}", order_id)),
                Err(e) => return Err(format!("Failed to load order {}: {}", order_id, e)),
            }
        }

        // 2. Get active risk policy
        let policy = match self.risk_repo.find_active_policy().await {
            Ok(Some(policy)) => policy,
            Ok(None) => {
                return Ok(ConstraintCheckResponseDto::overall(
                    RiskValidationDto::passed(),
                ));
            }
            Err(e) => return Err(format!("Failed to load risk policy: {}", e)),
        };

        // 3. Get risk context
        let context = self
            .risk_repo
            .build_risk_context()
            .await
            .map_err(|e| format!("Failed to build risk context: {}", e))?;

        // 4. Validate
        let service = RiskValidationService::new(policy);
        let overall_result = service.validate(&orders, &context);

        // 5. Build per-order results if requested
        let mut per_order_results = std::collections::HashMap::new();
        if request.include_portfolio_context {
            for order in &orders {
                let per_order_result = service.validate_per_instrument(order, &context);
                per_order_results.insert(
                    order.id().to_string(),
                    RiskValidationDto::from(per_order_result),
                );
            }
        }

        Ok(ConstraintCheckResponseDto::with_per_order(
            RiskValidationDto::from(overall_result),
            per_order_results,
        ))
    }

    /// Validate a single order.
    pub async fn validate_order(&self, order: &Order) -> Result<RiskValidationDto, String> {
        // Get active risk policy
        let policy = match self.risk_repo.find_active_policy().await {
            Ok(Some(policy)) => policy,
            Ok(None) => return Ok(RiskValidationDto::passed()),
            Err(e) => return Err(format!("Failed to load risk policy: {}", e)),
        };

        // Get risk context
        let context = self
            .risk_repo
            .build_risk_context()
            .await
            .map_err(|e| format!("Failed to build risk context: {}", e))?;

        // Validate
        let service = RiskValidationService::new(policy);
        let result = service.validate(&[order.clone()], &context);

        Ok(RiskValidationDto::from(result))
    }

    /// Validate multiple orders.
    pub async fn validate_orders(&self, orders: &[Order]) -> Result<RiskValidationDto, String> {
        // Get active risk policy
        let policy = match self.risk_repo.find_active_policy().await {
            Ok(Some(policy)) => policy,
            Ok(None) => return Ok(RiskValidationDto::passed()),
            Err(e) => return Err(format!("Failed to load risk policy: {}", e)),
        };

        // Get risk context
        let context = self
            .risk_repo
            .build_risk_context()
            .await
            .map_err(|e| format!("Failed to build risk context: {}", e))?;

        // Validate
        let service = RiskValidationService::new(policy);
        let result = service.validate(orders, &context);

        Ok(RiskValidationDto::from(result))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::ports::InMemoryRiskRepository;
    use crate::domain::order_execution::aggregate::CreateOrderCommand;
    use crate::domain::order_execution::errors::OrderError;
    use crate::domain::order_execution::value_objects::{
        OrderPurpose, OrderSide, OrderStatus, OrderType, TimeInForce,
    };
    use crate::domain::risk_management::aggregate::RiskPolicy;
    use crate::domain::shared::{BrokerId, Quantity, Symbol};
    use async_trait::async_trait;
    use rust_decimal::Decimal;
    use std::collections::HashMap;
    use std::sync::RwLock;

    // Mock order repository
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
            _broker_id: &BrokerId,
        ) -> Result<Option<Order>, OrderError> {
            Ok(None)
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
            Ok(orders.values().cloned().collect())
        }

        async fn exists(&self, id: &OrderId) -> Result<bool, OrderError> {
            let orders = self.orders.read().unwrap();
            Ok(orders.contains_key(id.as_str()))
        }

        async fn delete(&self, id: &OrderId) -> Result<(), OrderError> {
            let mut orders = self.orders.write().unwrap();
            orders.remove(id.as_str());
            Ok(())
        }
    }

    fn create_test_order(_id: &str) -> Order {
        let command = CreateOrderCommand {
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Buy,
            order_type: OrderType::Market,
            quantity: Quantity::new(Decimal::new(100, 0)),
            limit_price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
            legs: vec![],
        };
        Order::new(command).unwrap()
    }

    #[tokio::test]
    async fn validate_risk_no_policy() {
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());

        let order = create_test_order("order-1");
        let order_id = order.id().to_string();
        order_repo.add_order(order);

        let use_case = ValidateRiskUseCase::new(risk_repo, order_repo);

        let request = ConstraintCheckRequestDto {
            order_ids: vec![order_id],
            include_portfolio_context: false,
        };

        let response = use_case.execute(request).await.unwrap();
        assert!(response.result.passed);
    }

    #[tokio::test]
    async fn validate_risk_with_policy() {
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());

        // Add active policy
        let mut policy = RiskPolicy::default();
        policy.activate();
        risk_repo.save_policy(&policy).await.unwrap();

        let order = create_test_order("order-1");
        let order_id = order.id().to_string();
        order_repo.add_order(order);

        let use_case = ValidateRiskUseCase::new(risk_repo, order_repo);

        let request = ConstraintCheckRequestDto {
            order_ids: vec![order_id],
            include_portfolio_context: false,
        };

        let response = use_case.execute(request).await.unwrap();
        // Should pass with default limits
        assert!(response.result.passed);
    }

    #[tokio::test]
    async fn validate_risk_order_not_found() {
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());

        let use_case = ValidateRiskUseCase::new(risk_repo, order_repo);

        let request = ConstraintCheckRequestDto {
            order_ids: vec!["nonexistent".to_string()],
            include_portfolio_context: false,
        };

        let result = use_case.execute(request).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn validate_single_order() {
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());

        let use_case = ValidateRiskUseCase::new(risk_repo, order_repo);

        let order = create_test_order("order-1");
        let result = use_case.validate_order(&order).await.unwrap();

        assert!(result.passed);
    }

    #[tokio::test]
    async fn validate_multiple_orders() {
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());

        let use_case = ValidateRiskUseCase::new(risk_repo, order_repo);

        let order1 = create_test_order("order-1");
        let order2 = create_test_order("order-2");
        let orders = vec![order1, order2];

        let result = use_case.validate_orders(&orders).await.unwrap();
        assert!(result.passed);
    }

    #[tokio::test]
    async fn validate_with_portfolio_context() {
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());

        // Add active policy
        let mut policy = RiskPolicy::default();
        policy.activate();
        risk_repo.save_policy(&policy).await.unwrap();

        let order = create_test_order("order-1");
        let order_id = order.id().to_string();
        order_repo.add_order(order);

        let use_case = ValidateRiskUseCase::new(risk_repo, order_repo);

        let request = ConstraintCheckRequestDto {
            order_ids: vec![order_id.clone()],
            include_portfolio_context: true,
        };

        let response = use_case.execute(request).await.unwrap();
        assert!(!response.per_order_results.is_empty());
        assert!(response.per_order_results.contains_key(&order_id));
    }

    #[tokio::test]
    async fn validate_orders_with_policy() {
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());

        // Add active policy
        let mut policy = RiskPolicy::default();
        policy.activate();
        risk_repo.save_policy(&policy).await.unwrap();

        let use_case = ValidateRiskUseCase::new(risk_repo, order_repo);

        let order = create_test_order("order-1");
        let result = use_case.validate_orders(&[order]).await.unwrap();
        assert!(result.passed);
    }

    use crate::domain::risk_management::errors::RiskError;
    use crate::domain::risk_management::value_objects::{Exposure, Greeks, RiskContext};
    use crate::domain::shared::InstrumentId;

    // Failing risk repo for error path testing
    struct FailingRiskRepo;

    #[async_trait]
    impl crate::application::ports::RiskRepositoryPort for FailingRiskRepo {
        async fn save_policy(&self, _policy: &RiskPolicy) -> Result<(), RiskError> {
            Ok(())
        }
        async fn find_policy_by_id(&self, _id: &str) -> Result<Option<RiskPolicy>, RiskError> {
            Ok(None)
        }
        async fn find_active_policy(&self) -> Result<Option<RiskPolicy>, RiskError> {
            Err(RiskError::PolicyNotFound {
                policy_id: "test".to_string(),
            })
        }
        async fn list_policies(&self) -> Result<Vec<RiskPolicy>, RiskError> {
            Ok(vec![])
        }
        async fn delete_policy(&self, _id: &str) -> Result<(), RiskError> {
            Ok(())
        }
        async fn get_portfolio_exposure(&self) -> Result<Exposure, RiskError> {
            Ok(Exposure::default())
        }
        async fn get_instrument_exposure(
            &self,
            _instrument_id: &InstrumentId,
        ) -> Result<Exposure, RiskError> {
            Ok(Exposure::default())
        }
        async fn get_portfolio_greeks(&self) -> Result<Greeks, RiskError> {
            Ok(Greeks::ZERO)
        }
        async fn get_buying_power(&self) -> Result<Decimal, RiskError> {
            Ok(Decimal::new(100_000, 0))
        }
        async fn get_day_trade_count(&self) -> Result<u32, RiskError> {
            Ok(0)
        }
        async fn build_risk_context(&self) -> Result<RiskContext, RiskError> {
            Err(RiskError::PolicyNotFound {
                policy_id: "context".to_string(),
            })
        }
    }

    #[tokio::test]
    async fn validate_risk_policy_load_error() {
        let risk_repo = Arc::new(FailingRiskRepo);
        let order_repo = Arc::new(MockOrderRepo::new());

        let order = create_test_order("order-1");
        let order_id = order.id().to_string();
        order_repo.add_order(order);

        let use_case = ValidateRiskUseCase::new(risk_repo, order_repo);

        let request = ConstraintCheckRequestDto {
            order_ids: vec![order_id],
            include_portfolio_context: false,
        };

        let result = use_case.execute(request).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to load risk policy"));
    }

    #[tokio::test]
    async fn validate_order_policy_load_error() {
        let risk_repo = Arc::new(FailingRiskRepo);
        let order_repo = Arc::new(MockOrderRepo::new());

        let use_case = ValidateRiskUseCase::new(risk_repo, order_repo);

        let order = create_test_order("order-1");
        let result = use_case.validate_order(&order).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to load risk policy"));
    }

    #[tokio::test]
    async fn validate_orders_policy_load_error() {
        let risk_repo = Arc::new(FailingRiskRepo);
        let order_repo = Arc::new(MockOrderRepo::new());

        let use_case = ValidateRiskUseCase::new(risk_repo, order_repo);

        let order = create_test_order("order-1");
        let result = use_case.validate_orders(&[order]).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to load risk policy"));
    }

    // Risk repo with policy but failing context build
    struct PolicyOkContextFailRepo;

    #[async_trait]
    impl crate::application::ports::RiskRepositoryPort for PolicyOkContextFailRepo {
        async fn save_policy(&self, _policy: &RiskPolicy) -> Result<(), RiskError> {
            Ok(())
        }
        async fn find_policy_by_id(&self, _id: &str) -> Result<Option<RiskPolicy>, RiskError> {
            Ok(None)
        }
        async fn find_active_policy(&self) -> Result<Option<RiskPolicy>, RiskError> {
            Ok(Some(RiskPolicy::default()))
        }
        async fn list_policies(&self) -> Result<Vec<RiskPolicy>, RiskError> {
            Ok(vec![])
        }
        async fn delete_policy(&self, _id: &str) -> Result<(), RiskError> {
            Ok(())
        }
        async fn get_portfolio_exposure(&self) -> Result<Exposure, RiskError> {
            Ok(Exposure::default())
        }
        async fn get_instrument_exposure(
            &self,
            _instrument_id: &InstrumentId,
        ) -> Result<Exposure, RiskError> {
            Ok(Exposure::default())
        }
        async fn get_portfolio_greeks(&self) -> Result<Greeks, RiskError> {
            Ok(Greeks::ZERO)
        }
        async fn get_buying_power(&self) -> Result<Decimal, RiskError> {
            Ok(Decimal::new(100_000, 0))
        }
        async fn get_day_trade_count(&self) -> Result<u32, RiskError> {
            Ok(0)
        }
        async fn build_risk_context(&self) -> Result<RiskContext, RiskError> {
            Err(RiskError::PolicyNotFound {
                policy_id: "context".to_string(),
            })
        }
    }

    #[tokio::test]
    async fn validate_risk_context_build_error() {
        let risk_repo = Arc::new(PolicyOkContextFailRepo);
        let order_repo = Arc::new(MockOrderRepo::new());

        let order = create_test_order("order-1");
        let order_id = order.id().to_string();
        order_repo.add_order(order);

        let use_case = ValidateRiskUseCase::new(risk_repo, order_repo);

        let request = ConstraintCheckRequestDto {
            order_ids: vec![order_id],
            include_portfolio_context: false,
        };

        let result = use_case.execute(request).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to build risk context"));
    }

    #[tokio::test]
    async fn validate_order_context_build_error() {
        let risk_repo = Arc::new(PolicyOkContextFailRepo);
        let order_repo = Arc::new(MockOrderRepo::new());

        let use_case = ValidateRiskUseCase::new(risk_repo, order_repo);

        let order = create_test_order("order-1");
        let result = use_case.validate_order(&order).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to build risk context"));
    }

    #[tokio::test]
    async fn validate_orders_context_build_error() {
        let risk_repo = Arc::new(PolicyOkContextFailRepo);
        let order_repo = Arc::new(MockOrderRepo::new());

        let use_case = ValidateRiskUseCase::new(risk_repo, order_repo);

        let order = create_test_order("order-1");
        let result = use_case.validate_orders(&[order]).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to build risk context"));
    }

    // Failing order repo for error path testing
    struct FailingOrderRepo;

    #[async_trait]
    impl OrderRepository for FailingOrderRepo {
        async fn save(&self, _order: &Order) -> Result<(), OrderError> {
            Ok(())
        }
        async fn find_by_id(&self, _id: &OrderId) -> Result<Option<Order>, OrderError> {
            Err(OrderError::NotFound {
                order_id: "find-failed".to_string(),
            })
        }
        async fn find_by_broker_id(
            &self,
            _broker_id: &BrokerId,
        ) -> Result<Option<Order>, OrderError> {
            Ok(None)
        }
        async fn find_by_status(&self, _status: OrderStatus) -> Result<Vec<Order>, OrderError> {
            Ok(vec![])
        }
        async fn find_active(&self) -> Result<Vec<Order>, OrderError> {
            Ok(vec![])
        }
        async fn exists(&self, _id: &OrderId) -> Result<bool, OrderError> {
            Ok(false)
        }
        async fn delete(&self, _id: &OrderId) -> Result<(), OrderError> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn validate_risk_order_load_error() {
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(FailingOrderRepo);

        let use_case = ValidateRiskUseCase::new(risk_repo, order_repo);

        let request = ConstraintCheckRequestDto {
            order_ids: vec!["order-1".to_string()],
            include_portfolio_context: false,
        };

        let result = use_case.execute(request).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to load order"));
    }
}
