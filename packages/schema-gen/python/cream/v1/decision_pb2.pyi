import datetime

from cream.v1 import common_pb2 as _common_pb2
from google.protobuf import struct_pb2 as _struct_pb2
from google.protobuf import timestamp_pb2 as _timestamp_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class OrderPlan(_message.Message):
    __slots__ = ()
    ENTRY_ORDER_TYPE_FIELD_NUMBER: _ClassVar[int]
    ENTRY_LIMIT_PRICE_FIELD_NUMBER: _ClassVar[int]
    EXIT_ORDER_TYPE_FIELD_NUMBER: _ClassVar[int]
    TIME_IN_FORCE_FIELD_NUMBER: _ClassVar[int]
    EXECUTION_TACTIC_FIELD_NUMBER: _ClassVar[int]
    EXECUTION_PARAMS_FIELD_NUMBER: _ClassVar[int]
    entry_order_type: _common_pb2.OrderType
    entry_limit_price: float
    exit_order_type: _common_pb2.OrderType
    time_in_force: _common_pb2.TimeInForce
    execution_tactic: str
    execution_params: _struct_pb2.Struct
    def __init__(self, entry_order_type: _Optional[_Union[_common_pb2.OrderType, str]] = ..., entry_limit_price: _Optional[float] = ..., exit_order_type: _Optional[_Union[_common_pb2.OrderType, str]] = ..., time_in_force: _Optional[_Union[_common_pb2.TimeInForce, str]] = ..., execution_tactic: _Optional[str] = ..., execution_params: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ...) -> None: ...

class References(_message.Message):
    __slots__ = ()
    USED_INDICATORS_FIELD_NUMBER: _ClassVar[int]
    MEMORY_CASE_IDS_FIELD_NUMBER: _ClassVar[int]
    EVENT_IDS_FIELD_NUMBER: _ClassVar[int]
    used_indicators: _containers.RepeatedScalarFieldContainer[str]
    memory_case_ids: _containers.RepeatedScalarFieldContainer[str]
    event_ids: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, used_indicators: _Optional[_Iterable[str]] = ..., memory_case_ids: _Optional[_Iterable[str]] = ..., event_ids: _Optional[_Iterable[str]] = ...) -> None: ...

class Decision(_message.Message):
    __slots__ = ()
    INSTRUMENT_FIELD_NUMBER: _ClassVar[int]
    ACTION_FIELD_NUMBER: _ClassVar[int]
    SIZE_FIELD_NUMBER: _ClassVar[int]
    ORDER_PLAN_FIELD_NUMBER: _ClassVar[int]
    RISK_LEVELS_FIELD_NUMBER: _ClassVar[int]
    STRATEGY_FAMILY_FIELD_NUMBER: _ClassVar[int]
    RATIONALE_FIELD_NUMBER: _ClassVar[int]
    CONFIDENCE_FIELD_NUMBER: _ClassVar[int]
    REFERENCES_FIELD_NUMBER: _ClassVar[int]
    instrument: _common_pb2.Instrument
    action: _common_pb2.Action
    size: _common_pb2.Size
    order_plan: OrderPlan
    risk_levels: _common_pb2.RiskLevels
    strategy_family: _common_pb2.StrategyFamily
    rationale: str
    confidence: float
    references: References
    def __init__(self, instrument: _Optional[_Union[_common_pb2.Instrument, _Mapping]] = ..., action: _Optional[_Union[_common_pb2.Action, str]] = ..., size: _Optional[_Union[_common_pb2.Size, _Mapping]] = ..., order_plan: _Optional[_Union[OrderPlan, _Mapping]] = ..., risk_levels: _Optional[_Union[_common_pb2.RiskLevels, _Mapping]] = ..., strategy_family: _Optional[_Union[_common_pb2.StrategyFamily, str]] = ..., rationale: _Optional[str] = ..., confidence: _Optional[float] = ..., references: _Optional[_Union[References, _Mapping]] = ...) -> None: ...

class DecisionPlan(_message.Message):
    __slots__ = ()
    CYCLE_ID_FIELD_NUMBER: _ClassVar[int]
    AS_OF_TIMESTAMP_FIELD_NUMBER: _ClassVar[int]
    ENVIRONMENT_FIELD_NUMBER: _ClassVar[int]
    DECISIONS_FIELD_NUMBER: _ClassVar[int]
    PORTFOLIO_NOTES_FIELD_NUMBER: _ClassVar[int]
    cycle_id: str
    as_of_timestamp: _timestamp_pb2.Timestamp
    environment: _common_pb2.Environment
    decisions: _containers.RepeatedCompositeFieldContainer[Decision]
    portfolio_notes: str
    def __init__(self, cycle_id: _Optional[str] = ..., as_of_timestamp: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., environment: _Optional[_Union[_common_pb2.Environment, str]] = ..., decisions: _Optional[_Iterable[_Union[Decision, _Mapping]]] = ..., portfolio_notes: _Optional[str] = ...) -> None: ...

class RiskValidationResult(_message.Message):
    __slots__ = ()
    VALID_FIELD_NUMBER: _ClassVar[int]
    ERRORS_FIELD_NUMBER: _ClassVar[int]
    WARNINGS_FIELD_NUMBER: _ClassVar[int]
    RISK_REWARD_RATIO_FIELD_NUMBER: _ClassVar[int]
    valid: bool
    errors: _containers.RepeatedScalarFieldContainer[str]
    warnings: _containers.RepeatedScalarFieldContainer[str]
    risk_reward_ratio: float
    def __init__(self, valid: _Optional[bool] = ..., errors: _Optional[_Iterable[str]] = ..., warnings: _Optional[_Iterable[str]] = ..., risk_reward_ratio: _Optional[float] = ...) -> None: ...

class DecisionPlanValidationResult(_message.Message):
    __slots__ = ()
    SUCCESS_FIELD_NUMBER: _ClassVar[int]
    DECISION_PLAN_FIELD_NUMBER: _ClassVar[int]
    ERRORS_FIELD_NUMBER: _ClassVar[int]
    WARNINGS_FIELD_NUMBER: _ClassVar[int]
    success: bool
    decision_plan: DecisionPlan
    errors: _containers.RepeatedScalarFieldContainer[str]
    warnings: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, success: _Optional[bool] = ..., decision_plan: _Optional[_Union[DecisionPlan, _Mapping]] = ..., errors: _Optional[_Iterable[str]] = ..., warnings: _Optional[_Iterable[str]] = ...) -> None: ...
