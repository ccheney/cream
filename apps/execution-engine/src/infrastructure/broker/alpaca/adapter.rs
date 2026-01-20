//! Alpaca broker adapter implementing BrokerPort.

use async_trait::async_trait;
use rust_decimal::Decimal;

use crate::application::ports::{
    BrokerError, BrokerPort, CancelOrderRequest, OrderAck, SubmitOrderRequest,
};
use crate::domain::order_execution::value_objects::{OrderSide, OrderType, TimeInForce};
use crate::domain::shared::{BrokerId, InstrumentId};

use super::api_types::{
    AlpacaAccountResponse, AlpacaOrderRequest, AlpacaOrderResponse, AlpacaPositionResponse,
};
use super::config::{AlpacaConfig, AlpacaEnvironment};
use super::error::AlpacaError;
use super::http_client::AlpacaHttpClient;

/// Alpaca Markets broker adapter.
///
/// Implements `BrokerPort` for the Alpaca Markets API.
#[derive(Debug, Clone)]
pub struct AlpacaBrokerAdapter {
    client: AlpacaHttpClient,
    environment: AlpacaEnvironment,
}

impl AlpacaBrokerAdapter {
    /// Create a new Alpaca broker adapter.
    pub fn new(config: AlpacaConfig) -> Result<Self, AlpacaError> {
        let client = AlpacaHttpClient::new(&config)?;
        Ok(Self {
            client,
            environment: config.environment,
        })
    }

    /// Check if we're in live trading mode.
    #[must_use]
    pub const fn is_live(&self) -> bool {
        self.environment.is_live()
    }

    /// Convert `SubmitOrderRequest` to Alpaca API format.
    fn to_alpaca_order_request(request: &SubmitOrderRequest) -> AlpacaOrderRequest {
        let side = match request.side {
            OrderSide::Buy => "buy",
            OrderSide::Sell => "sell",
        };

        let order_type = match request.order_type {
            OrderType::Market => "market",
            OrderType::Limit => "limit",
            OrderType::Stop => "stop",
            OrderType::StopLimit => "stop_limit",
        };

        let time_in_force = match request.time_in_force {
            TimeInForce::Day => "day",
            TimeInForce::Gtc => "gtc",
            TimeInForce::Ioc => "ioc",
            TimeInForce::Fok => "fok",
            TimeInForce::Opg => "opg",
            TimeInForce::Cls => "cls",
        };

        AlpacaOrderRequest {
            symbol: request.symbol.as_str().to_string(),
            qty: Some(request.quantity.to_string()),
            notional: None,
            side: side.to_string(),
            order_type: order_type.to_string(),
            time_in_force: time_in_force.to_string(),
            limit_price: request.limit_price.map(|p| p.to_string()),
            stop_price: request.stop_price.map(|p| p.to_string()),
            client_order_id: Some(request.client_order_id.as_str().to_string()),
            extended_hours: if request.extended_hours {
                Some(true)
            } else {
                None
            },
        }
    }
}

#[async_trait]
impl BrokerPort for AlpacaBrokerAdapter {
    async fn submit_order(&self, request: SubmitOrderRequest) -> Result<OrderAck, BrokerError> {
        if self.is_live() {
            tracing::warn!(
                client_order_id = %request.client_order_id,
                symbol = %request.symbol,
                "Submitting LIVE order - this will execute real trades"
            );
        }

        let alpaca_request = Self::to_alpaca_order_request(&request);

        tracing::info!(
            client_order_id = %request.client_order_id,
            symbol = %request.symbol,
            side = %alpaca_request.side,
            order_type = %alpaca_request.order_type,
            qty = ?alpaca_request.qty,
            limit_price = ?alpaca_request.limit_price,
            "Submitting order to Alpaca"
        );

        let response: AlpacaOrderResponse = self
            .client
            .post("/v2/orders", &alpaca_request)
            .await
            .map_err(BrokerError::from)?;

        tracing::info!(
            client_order_id = %request.client_order_id,
            broker_order_id = %response.id,
            status = %response.status,
            "Order submitted successfully"
        );

        Ok(response.to_order_ack())
    }

    async fn cancel_order(&self, request: CancelOrderRequest) -> Result<(), BrokerError> {
        // Prefer broker order ID if available, otherwise use client order ID
        if let Some(broker_id) = &request.broker_order_id {
            tracing::info!(broker_order_id = %broker_id, "Canceling order by broker ID");
            self.client
                .delete(&format!("/v2/orders/{}", broker_id.as_str()))
                .await
                .map_err(BrokerError::from)
        } else if let Some(client_id) = &request.client_order_id {
            tracing::info!(client_order_id = %client_id, "Canceling order by client ID");
            self.client
                .delete(&format!(
                    "/v2/orders:by_client_order_id?client_order_id={}",
                    client_id.as_str()
                ))
                .await
                .map_err(BrokerError::from)
        } else {
            Err(BrokerError::Unknown {
                message: "CancelOrderRequest must have either broker_order_id or client_order_id"
                    .to_string(),
            })
        }
    }

    async fn get_order(&self, broker_order_id: &BrokerId) -> Result<OrderAck, BrokerError> {
        let response: AlpacaOrderResponse = self
            .client
            .get(&format!("/v2/orders/{}", broker_order_id.as_str()))
            .await
            .map_err(BrokerError::from)?;

        Ok(response.to_order_ack())
    }

    async fn get_open_orders(&self) -> Result<Vec<OrderAck>, BrokerError> {
        let responses: Vec<AlpacaOrderResponse> = self
            .client
            .get("/v2/orders?status=open")
            .await
            .map_err(BrokerError::from)?;

        Ok(responses
            .iter()
            .map(AlpacaOrderResponse::to_order_ack)
            .collect())
    }

    async fn get_buying_power(&self) -> Result<Decimal, BrokerError> {
        let account: AlpacaAccountResponse = self
            .client
            .get("/v2/account")
            .await
            .map_err(BrokerError::from)?;

        account
            .buying_power
            .parse()
            .map_err(|_| BrokerError::Unknown {
                message: "Failed to parse buying power".to_string(),
            })
    }

    async fn get_position(
        &self,
        instrument_id: &InstrumentId,
    ) -> Result<Option<Decimal>, BrokerError> {
        let result: Result<AlpacaPositionResponse, AlpacaError> = self
            .client
            .get(&format!("/v2/positions/{}", instrument_id.as_str()))
            .await;

        match result {
            Ok(position) => {
                let qty: Decimal = position.qty.parse().map_err(|_| BrokerError::Unknown {
                    message: "Failed to parse position quantity".to_string(),
                })?;
                Ok(Some(qty))
            }
            Err(AlpacaError::OrderNotFound { .. }) => Ok(None),
            Err(e) => Err(BrokerError::from(e)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::shared::{OrderId, Symbol};

    #[test]
    fn to_alpaca_order_request_market_buy() {
        let request = SubmitOrderRequest::market(
            OrderId::new("test-order"),
            Symbol::new("AAPL"),
            OrderSide::Buy,
            Decimal::new(100, 0),
        );

        let alpaca_request = AlpacaBrokerAdapter::to_alpaca_order_request(&request);

        assert_eq!(alpaca_request.symbol, "AAPL");
        assert_eq!(alpaca_request.side, "buy");
        assert_eq!(alpaca_request.order_type, "market");
        assert_eq!(alpaca_request.time_in_force, "day");
        assert_eq!(alpaca_request.qty, Some("100".to_string()));
        assert!(alpaca_request.limit_price.is_none());
        assert!(alpaca_request.stop_price.is_none());
    }

    #[test]
    fn to_alpaca_order_request_limit_sell() {
        let request = SubmitOrderRequest::limit(
            OrderId::new("test-order"),
            Symbol::new("GOOGL"),
            OrderSide::Sell,
            Decimal::new(50, 0),
            Decimal::new(150, 0),
        );

        let alpaca_request = AlpacaBrokerAdapter::to_alpaca_order_request(&request);

        assert_eq!(alpaca_request.symbol, "GOOGL");
        assert_eq!(alpaca_request.side, "sell");
        assert_eq!(alpaca_request.order_type, "limit");
        assert_eq!(alpaca_request.qty, Some("50".to_string()));
        assert_eq!(alpaca_request.limit_price, Some("150".to_string()));
    }

    #[test]
    fn to_alpaca_order_request_with_extended_hours() {
        let mut request = SubmitOrderRequest::market(
            OrderId::new("test-order"),
            Symbol::new("AAPL"),
            OrderSide::Buy,
            Decimal::new(100, 0),
        );
        request.extended_hours = true;

        let alpaca_request = AlpacaBrokerAdapter::to_alpaca_order_request(&request);

        assert_eq!(alpaca_request.extended_hours, Some(true));
    }

    #[test]
    fn to_alpaca_order_request_gtc() {
        let mut request = SubmitOrderRequest::limit(
            OrderId::new("test-order"),
            Symbol::new("AAPL"),
            OrderSide::Buy,
            Decimal::new(100, 0),
            Decimal::new(150, 0),
        );
        request.time_in_force = TimeInForce::Gtc;

        let alpaca_request = AlpacaBrokerAdapter::to_alpaca_order_request(&request);

        assert_eq!(alpaca_request.time_in_force, "gtc");
    }
}
