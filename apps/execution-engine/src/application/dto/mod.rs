//! Data Transfer Objects (DTOs)
//!
//! DTOs are used for API boundaries and use case inputs/outputs.

mod order_dto;
mod risk_dto;

pub use order_dto::{
    CreateOrderDto, OrderDto, OrderResponseDto, SubmitOrdersRequestDto, SubmitOrdersResponseDto,
};
pub use risk_dto::{
    ConstraintCheckRequestDto, ConstraintCheckResponseDto, RiskValidationDto, ViolationDto,
};
