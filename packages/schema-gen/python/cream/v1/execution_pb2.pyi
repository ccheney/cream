import datetime

from cream.v1 import common_pb2 as _common_pb2
from cream.v1 import decision_pb2 as _decision_pb2
from google.protobuf import timestamp_pb2 as _timestamp_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ConstraintResult(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    CONSTRAINT_RESULT_UNSPECIFIED: _ClassVar[ConstraintResult]
    CONSTRAINT_RESULT_PASS: _ClassVar[ConstraintResult]
    CONSTRAINT_RESULT_FAIL: _ClassVar[ConstraintResult]
    CONSTRAINT_RESULT_WARN: _ClassVar[ConstraintResult]

class ViolationSeverity(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    VIOLATION_SEVERITY_UNSPECIFIED: _ClassVar[ViolationSeverity]
    VIOLATION_SEVERITY_INFO: _ClassVar[ViolationSeverity]
    VIOLATION_SEVERITY_WARNING: _ClassVar[ViolationSeverity]
    VIOLATION_SEVERITY_ERROR: _ClassVar[ViolationSeverity]
    VIOLATION_SEVERITY_CRITICAL: _ClassVar[ViolationSeverity]

class OrderStatus(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    ORDER_STATUS_UNSPECIFIED: _ClassVar[OrderStatus]
    ORDER_STATUS_NEW: _ClassVar[OrderStatus]
    ORDER_STATUS_PENDING: _ClassVar[OrderStatus]
    ORDER_STATUS_ACCEPTED: _ClassVar[OrderStatus]
    ORDER_STATUS_PARTIAL_FILL: _ClassVar[OrderStatus]
    ORDER_STATUS_FILLED: _ClassVar[OrderStatus]
    ORDER_STATUS_CANCELLED: _ClassVar[OrderStatus]
    ORDER_STATUS_REJECTED: _ClassVar[OrderStatus]
    ORDER_STATUS_EXPIRED: _ClassVar[OrderStatus]

class OrderSide(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    ORDER_SIDE_UNSPECIFIED: _ClassVar[OrderSide]
    ORDER_SIDE_BUY: _ClassVar[OrderSide]
    ORDER_SIDE_SELL: _ClassVar[OrderSide]
CONSTRAINT_RESULT_UNSPECIFIED: ConstraintResult
CONSTRAINT_RESULT_PASS: ConstraintResult
CONSTRAINT_RESULT_FAIL: ConstraintResult
CONSTRAINT_RESULT_WARN: ConstraintResult
VIOLATION_SEVERITY_UNSPECIFIED: ViolationSeverity
VIOLATION_SEVERITY_INFO: ViolationSeverity
VIOLATION_SEVERITY_WARNING: ViolationSeverity
VIOLATION_SEVERITY_ERROR: ViolationSeverity
VIOLATION_SEVERITY_CRITICAL: ViolationSeverity
ORDER_STATUS_UNSPECIFIED: OrderStatus
ORDER_STATUS_NEW: OrderStatus
ORDER_STATUS_PENDING: OrderStatus
ORDER_STATUS_ACCEPTED: OrderStatus
ORDER_STATUS_PARTIAL_FILL: OrderStatus
ORDER_STATUS_FILLED: OrderStatus
ORDER_STATUS_CANCELLED: OrderStatus
ORDER_STATUS_REJECTED: OrderStatus
ORDER_STATUS_EXPIRED: OrderStatus
ORDER_SIDE_UNSPECIFIED: OrderSide
ORDER_SIDE_BUY: OrderSide
ORDER_SIDE_SELL: OrderSide

class ConstraintCheck(_message.Message):
    __slots__ = ()
    NAME_FIELD_NUMBER: _ClassVar[int]
    RESULT_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    ACTUAL_VALUE_FIELD_NUMBER: _ClassVar[int]
    THRESHOLD_FIELD_NUMBER: _ClassVar[int]
    name: str
    result: ConstraintResult
    description: str
    actual_value: float
    threshold: float
    def __init__(self, name: _Optional[str] = ..., result: _Optional[_Union[ConstraintResult, str]] = ..., description: _Optional[str] = ..., actual_value: _Optional[float] = ..., threshold: _Optional[float] = ...) -> None: ...

class CheckConstraintsRequest(_message.Message):
    __slots__ = ()
    DECISION_PLAN_FIELD_NUMBER: _ClassVar[int]
    ACCOUNT_STATE_FIELD_NUMBER: _ClassVar[int]
    POSITIONS_FIELD_NUMBER: _ClassVar[int]
    decision_plan: _decision_pb2.DecisionPlan
    account_state: AccountState
    positions: _containers.RepeatedCompositeFieldContainer[Position]
    def __init__(self, decision_plan: _Optional[_Union[_decision_pb2.DecisionPlan, _Mapping]] = ..., account_state: _Optional[_Union[AccountState, _Mapping]] = ..., positions: _Optional[_Iterable[_Union[Position, _Mapping]]] = ...) -> None: ...

class CheckConstraintsResponse(_message.Message):
    __slots__ = ()
    APPROVED_FIELD_NUMBER: _ClassVar[int]
    CHECKS_FIELD_NUMBER: _ClassVar[int]
    VIOLATIONS_FIELD_NUMBER: _ClassVar[int]
    VALIDATED_AT_FIELD_NUMBER: _ClassVar[int]
    REJECTION_REASON_FIELD_NUMBER: _ClassVar[int]
    approved: bool
    checks: _containers.RepeatedCompositeFieldContainer[ConstraintCheck]
    violations: _containers.RepeatedCompositeFieldContainer[ConstraintViolation]
    validated_at: _timestamp_pb2.Timestamp
    rejection_reason: str
    def __init__(self, approved: _Optional[bool] = ..., checks: _Optional[_Iterable[_Union[ConstraintCheck, _Mapping]]] = ..., violations: _Optional[_Iterable[_Union[ConstraintViolation, _Mapping]]] = ..., validated_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., rejection_reason: _Optional[str] = ...) -> None: ...

class ConstraintViolation(_message.Message):
    __slots__ = ()
    CODE_FIELD_NUMBER: _ClassVar[int]
    SEVERITY_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    INSTRUMENT_ID_FIELD_NUMBER: _ClassVar[int]
    FIELD_PATH_FIELD_NUMBER: _ClassVar[int]
    OBSERVED_VALUE_FIELD_NUMBER: _ClassVar[int]
    LIMIT_VALUE_FIELD_NUMBER: _ClassVar[int]
    CONSTRAINT_NAME_FIELD_NUMBER: _ClassVar[int]
    code: str
    severity: ViolationSeverity
    message: str
    instrument_id: str
    field_path: str
    observed_value: float
    limit_value: float
    constraint_name: str
    def __init__(self, code: _Optional[str] = ..., severity: _Optional[_Union[ViolationSeverity, str]] = ..., message: _Optional[str] = ..., instrument_id: _Optional[str] = ..., field_path: _Optional[str] = ..., observed_value: _Optional[float] = ..., limit_value: _Optional[float] = ..., constraint_name: _Optional[str] = ...) -> None: ...

class AccountState(_message.Message):
    __slots__ = ()
    ACCOUNT_ID_FIELD_NUMBER: _ClassVar[int]
    EQUITY_FIELD_NUMBER: _ClassVar[int]
    BUYING_POWER_FIELD_NUMBER: _ClassVar[int]
    MARGIN_USED_FIELD_NUMBER: _ClassVar[int]
    DAY_TRADE_COUNT_FIELD_NUMBER: _ClassVar[int]
    IS_PDT_RESTRICTED_FIELD_NUMBER: _ClassVar[int]
    AS_OF_FIELD_NUMBER: _ClassVar[int]
    account_id: str
    equity: float
    buying_power: float
    margin_used: float
    day_trade_count: int
    is_pdt_restricted: bool
    as_of: _timestamp_pb2.Timestamp
    def __init__(self, account_id: _Optional[str] = ..., equity: _Optional[float] = ..., buying_power: _Optional[float] = ..., margin_used: _Optional[float] = ..., day_trade_count: _Optional[int] = ..., is_pdt_restricted: _Optional[bool] = ..., as_of: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class Position(_message.Message):
    __slots__ = ()
    INSTRUMENT_FIELD_NUMBER: _ClassVar[int]
    QUANTITY_FIELD_NUMBER: _ClassVar[int]
    AVG_ENTRY_PRICE_FIELD_NUMBER: _ClassVar[int]
    MARKET_VALUE_FIELD_NUMBER: _ClassVar[int]
    UNREALIZED_PNL_FIELD_NUMBER: _ClassVar[int]
    UNREALIZED_PNL_PCT_FIELD_NUMBER: _ClassVar[int]
    COST_BASIS_FIELD_NUMBER: _ClassVar[int]
    instrument: _common_pb2.Instrument
    quantity: int
    avg_entry_price: float
    market_value: float
    unrealized_pnl: float
    unrealized_pnl_pct: float
    cost_basis: float
    def __init__(self, instrument: _Optional[_Union[_common_pb2.Instrument, _Mapping]] = ..., quantity: _Optional[int] = ..., avg_entry_price: _Optional[float] = ..., market_value: _Optional[float] = ..., unrealized_pnl: _Optional[float] = ..., unrealized_pnl_pct: _Optional[float] = ..., cost_basis: _Optional[float] = ...) -> None: ...

class SubmitOrderRequest(_message.Message):
    __slots__ = ()
    INSTRUMENT_FIELD_NUMBER: _ClassVar[int]
    SIDE_FIELD_NUMBER: _ClassVar[int]
    QUANTITY_FIELD_NUMBER: _ClassVar[int]
    ORDER_TYPE_FIELD_NUMBER: _ClassVar[int]
    LIMIT_PRICE_FIELD_NUMBER: _ClassVar[int]
    TIME_IN_FORCE_FIELD_NUMBER: _ClassVar[int]
    CLIENT_ORDER_ID_FIELD_NUMBER: _ClassVar[int]
    CYCLE_ID_FIELD_NUMBER: _ClassVar[int]
    instrument: _common_pb2.Instrument
    side: OrderSide
    quantity: int
    order_type: _common_pb2.OrderType
    limit_price: float
    time_in_force: _common_pb2.TimeInForce
    client_order_id: str
    cycle_id: str
    def __init__(self, instrument: _Optional[_Union[_common_pb2.Instrument, _Mapping]] = ..., side: _Optional[_Union[OrderSide, str]] = ..., quantity: _Optional[int] = ..., order_type: _Optional[_Union[_common_pb2.OrderType, str]] = ..., limit_price: _Optional[float] = ..., time_in_force: _Optional[_Union[_common_pb2.TimeInForce, str]] = ..., client_order_id: _Optional[str] = ..., cycle_id: _Optional[str] = ...) -> None: ...

class SubmitOrderResponse(_message.Message):
    __slots__ = ()
    ORDER_ID_FIELD_NUMBER: _ClassVar[int]
    CLIENT_ORDER_ID_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    SUBMITTED_AT_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    order_id: str
    client_order_id: str
    status: OrderStatus
    submitted_at: _timestamp_pb2.Timestamp
    error_message: str
    def __init__(self, order_id: _Optional[str] = ..., client_order_id: _Optional[str] = ..., status: _Optional[_Union[OrderStatus, str]] = ..., submitted_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., error_message: _Optional[str] = ...) -> None: ...

class ExecutionAck(_message.Message):
    __slots__ = ()
    CYCLE_ID_FIELD_NUMBER: _ClassVar[int]
    ENVIRONMENT_FIELD_NUMBER: _ClassVar[int]
    ACK_TIME_FIELD_NUMBER: _ClassVar[int]
    ORDERS_FIELD_NUMBER: _ClassVar[int]
    ERRORS_FIELD_NUMBER: _ClassVar[int]
    cycle_id: str
    environment: _common_pb2.Environment
    ack_time: _timestamp_pb2.Timestamp
    orders: _containers.RepeatedCompositeFieldContainer[OrderState]
    errors: _containers.RepeatedCompositeFieldContainer[ExecutionError]
    def __init__(self, cycle_id: _Optional[str] = ..., environment: _Optional[_Union[_common_pb2.Environment, str]] = ..., ack_time: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., orders: _Optional[_Iterable[_Union[OrderState, _Mapping]]] = ..., errors: _Optional[_Iterable[_Union[ExecutionError, _Mapping]]] = ...) -> None: ...

class OrderState(_message.Message):
    __slots__ = ()
    ORDER_ID_FIELD_NUMBER: _ClassVar[int]
    BROKER_ORDER_ID_FIELD_NUMBER: _ClassVar[int]
    CLIENT_ORDER_ID_FIELD_NUMBER: _ClassVar[int]
    IS_MULTI_LEG_FIELD_NUMBER: _ClassVar[int]
    LEGS_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    SIDE_FIELD_NUMBER: _ClassVar[int]
    ORDER_TYPE_FIELD_NUMBER: _ClassVar[int]
    INSTRUMENT_FIELD_NUMBER: _ClassVar[int]
    REQUESTED_QUANTITY_FIELD_NUMBER: _ClassVar[int]
    FILLED_QUANTITY_FIELD_NUMBER: _ClassVar[int]
    AVG_FILL_PRICE_FIELD_NUMBER: _ClassVar[int]
    LIMIT_PRICE_FIELD_NUMBER: _ClassVar[int]
    STOP_PRICE_FIELD_NUMBER: _ClassVar[int]
    TIME_IN_FORCE_FIELD_NUMBER: _ClassVar[int]
    SUBMITTED_AT_FIELD_NUMBER: _ClassVar[int]
    LAST_UPDATE_AT_FIELD_NUMBER: _ClassVar[int]
    COMMISSION_FIELD_NUMBER: _ClassVar[int]
    CYCLE_ID_FIELD_NUMBER: _ClassVar[int]
    STATUS_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    order_id: str
    broker_order_id: str
    client_order_id: str
    is_multi_leg: bool
    legs: _containers.RepeatedCompositeFieldContainer[OrderLegState]
    status: OrderStatus
    side: OrderSide
    order_type: _common_pb2.OrderType
    instrument: _common_pb2.Instrument
    requested_quantity: int
    filled_quantity: int
    avg_fill_price: float
    limit_price: float
    stop_price: float
    time_in_force: _common_pb2.TimeInForce
    submitted_at: _timestamp_pb2.Timestamp
    last_update_at: _timestamp_pb2.Timestamp
    commission: float
    cycle_id: str
    status_message: str
    def __init__(self, order_id: _Optional[str] = ..., broker_order_id: _Optional[str] = ..., client_order_id: _Optional[str] = ..., is_multi_leg: _Optional[bool] = ..., legs: _Optional[_Iterable[_Union[OrderLegState, _Mapping]]] = ..., status: _Optional[_Union[OrderStatus, str]] = ..., side: _Optional[_Union[OrderSide, str]] = ..., order_type: _Optional[_Union[_common_pb2.OrderType, str]] = ..., instrument: _Optional[_Union[_common_pb2.Instrument, _Mapping]] = ..., requested_quantity: _Optional[int] = ..., filled_quantity: _Optional[int] = ..., avg_fill_price: _Optional[float] = ..., limit_price: _Optional[float] = ..., stop_price: _Optional[float] = ..., time_in_force: _Optional[_Union[_common_pb2.TimeInForce, str]] = ..., submitted_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., last_update_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., commission: _Optional[float] = ..., cycle_id: _Optional[str] = ..., status_message: _Optional[str] = ...) -> None: ...

class OrderLegState(_message.Message):
    __slots__ = ()
    LEG_ID_FIELD_NUMBER: _ClassVar[int]
    INSTRUMENT_FIELD_NUMBER: _ClassVar[int]
    SIDE_FIELD_NUMBER: _ClassVar[int]
    QUANTITY_FIELD_NUMBER: _ClassVar[int]
    ORDER_TYPE_FIELD_NUMBER: _ClassVar[int]
    LIMIT_PRICE_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    FILLED_QUANTITY_FIELD_NUMBER: _ClassVar[int]
    AVG_FILL_PRICE_FIELD_NUMBER: _ClassVar[int]
    LAST_UPDATE_AT_FIELD_NUMBER: _ClassVar[int]
    leg_id: str
    instrument: _common_pb2.Instrument
    side: OrderSide
    quantity: int
    order_type: _common_pb2.OrderType
    limit_price: float
    status: OrderStatus
    filled_quantity: int
    avg_fill_price: float
    last_update_at: _timestamp_pb2.Timestamp
    def __init__(self, leg_id: _Optional[str] = ..., instrument: _Optional[_Union[_common_pb2.Instrument, _Mapping]] = ..., side: _Optional[_Union[OrderSide, str]] = ..., quantity: _Optional[int] = ..., order_type: _Optional[_Union[_common_pb2.OrderType, str]] = ..., limit_price: _Optional[float] = ..., status: _Optional[_Union[OrderStatus, str]] = ..., filled_quantity: _Optional[int] = ..., avg_fill_price: _Optional[float] = ..., last_update_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class ExecutionError(_message.Message):
    __slots__ = ()
    CODE_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    INSTRUMENT_ID_FIELD_NUMBER: _ClassVar[int]
    ORDER_ID_FIELD_NUMBER: _ClassVar[int]
    RETRYABLE_FIELD_NUMBER: _ClassVar[int]
    SUGGESTED_ACTION_FIELD_NUMBER: _ClassVar[int]
    code: str
    message: str
    instrument_id: str
    order_id: str
    retryable: bool
    suggested_action: str
    def __init__(self, code: _Optional[str] = ..., message: _Optional[str] = ..., instrument_id: _Optional[str] = ..., order_id: _Optional[str] = ..., retryable: _Optional[bool] = ..., suggested_action: _Optional[str] = ...) -> None: ...

class GetOrderStateRequest(_message.Message):
    __slots__ = ()
    ORDER_ID_FIELD_NUMBER: _ClassVar[int]
    order_id: str
    def __init__(self, order_id: _Optional[str] = ...) -> None: ...

class GetOrderStateResponse(_message.Message):
    __slots__ = ()
    ORDER_ID_FIELD_NUMBER: _ClassVar[int]
    BROKER_ORDER_ID_FIELD_NUMBER: _ClassVar[int]
    INSTRUMENT_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    SIDE_FIELD_NUMBER: _ClassVar[int]
    ORDER_TYPE_FIELD_NUMBER: _ClassVar[int]
    REQUESTED_QUANTITY_FIELD_NUMBER: _ClassVar[int]
    FILLED_QUANTITY_FIELD_NUMBER: _ClassVar[int]
    AVG_FILL_PRICE_FIELD_NUMBER: _ClassVar[int]
    LIMIT_PRICE_FIELD_NUMBER: _ClassVar[int]
    STOP_PRICE_FIELD_NUMBER: _ClassVar[int]
    SUBMITTED_AT_FIELD_NUMBER: _ClassVar[int]
    LAST_UPDATE_AT_FIELD_NUMBER: _ClassVar[int]
    STATUS_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    order_id: str
    broker_order_id: str
    instrument: _common_pb2.Instrument
    status: OrderStatus
    side: OrderSide
    order_type: _common_pb2.OrderType
    requested_quantity: int
    filled_quantity: int
    avg_fill_price: float
    limit_price: float
    stop_price: float
    submitted_at: _timestamp_pb2.Timestamp
    last_update_at: _timestamp_pb2.Timestamp
    status_message: str
    def __init__(self, order_id: _Optional[str] = ..., broker_order_id: _Optional[str] = ..., instrument: _Optional[_Union[_common_pb2.Instrument, _Mapping]] = ..., status: _Optional[_Union[OrderStatus, str]] = ..., side: _Optional[_Union[OrderSide, str]] = ..., order_type: _Optional[_Union[_common_pb2.OrderType, str]] = ..., requested_quantity: _Optional[int] = ..., filled_quantity: _Optional[int] = ..., avg_fill_price: _Optional[float] = ..., limit_price: _Optional[float] = ..., stop_price: _Optional[float] = ..., submitted_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., last_update_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., status_message: _Optional[str] = ...) -> None: ...

class CancelOrderRequest(_message.Message):
    __slots__ = ()
    ORDER_ID_FIELD_NUMBER: _ClassVar[int]
    order_id: str
    def __init__(self, order_id: _Optional[str] = ...) -> None: ...

class CancelOrderResponse(_message.Message):
    __slots__ = ()
    ACCEPTED_FIELD_NUMBER: _ClassVar[int]
    ORDER_ID_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    accepted: bool
    order_id: str
    status: OrderStatus
    error_message: str
    def __init__(self, accepted: _Optional[bool] = ..., order_id: _Optional[str] = ..., status: _Optional[_Union[OrderStatus, str]] = ..., error_message: _Optional[str] = ...) -> None: ...

class StreamExecutionsRequest(_message.Message):
    __slots__ = ()
    CYCLE_ID_FIELD_NUMBER: _ClassVar[int]
    ORDER_IDS_FIELD_NUMBER: _ClassVar[int]
    cycle_id: str
    order_ids: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, cycle_id: _Optional[str] = ..., order_ids: _Optional[_Iterable[str]] = ...) -> None: ...

class StreamExecutionsResponse(_message.Message):
    __slots__ = ()
    EXECUTION_FIELD_NUMBER: _ClassVar[int]
    execution: ExecutionAck
    def __init__(self, execution: _Optional[_Union[ExecutionAck, _Mapping]] = ...) -> None: ...

class GetAccountStateRequest(_message.Message):
    __slots__ = ()
    ACCOUNT_ID_FIELD_NUMBER: _ClassVar[int]
    account_id: str
    def __init__(self, account_id: _Optional[str] = ...) -> None: ...

class GetAccountStateResponse(_message.Message):
    __slots__ = ()
    ACCOUNT_STATE_FIELD_NUMBER: _ClassVar[int]
    account_state: AccountState
    def __init__(self, account_state: _Optional[_Union[AccountState, _Mapping]] = ...) -> None: ...

class GetPositionsRequest(_message.Message):
    __slots__ = ()
    ACCOUNT_ID_FIELD_NUMBER: _ClassVar[int]
    SYMBOLS_FIELD_NUMBER: _ClassVar[int]
    account_id: str
    symbols: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, account_id: _Optional[str] = ..., symbols: _Optional[_Iterable[str]] = ...) -> None: ...

class GetPositionsResponse(_message.Message):
    __slots__ = ()
    POSITIONS_FIELD_NUMBER: _ClassVar[int]
    AS_OF_FIELD_NUMBER: _ClassVar[int]
    positions: _containers.RepeatedCompositeFieldContainer[Position]
    as_of: _timestamp_pb2.Timestamp
    def __init__(self, positions: _Optional[_Iterable[_Union[Position, _Mapping]]] = ..., as_of: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...
