from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class Environment(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    ENVIRONMENT_UNSPECIFIED: _ClassVar[Environment]
    ENVIRONMENT_PAPER: _ClassVar[Environment]
    ENVIRONMENT_LIVE: _ClassVar[Environment]

class Action(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    ACTION_UNSPECIFIED: _ClassVar[Action]
    ACTION_BUY: _ClassVar[Action]
    ACTION_SELL: _ClassVar[Action]
    ACTION_HOLD: _ClassVar[Action]
    ACTION_INCREASE: _ClassVar[Action]
    ACTION_REDUCE: _ClassVar[Action]
    ACTION_NO_TRADE: _ClassVar[Action]

class Direction(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    DIRECTION_UNSPECIFIED: _ClassVar[Direction]
    DIRECTION_LONG: _ClassVar[Direction]
    DIRECTION_SHORT: _ClassVar[Direction]
    DIRECTION_FLAT: _ClassVar[Direction]

class InstrumentType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    INSTRUMENT_TYPE_UNSPECIFIED: _ClassVar[InstrumentType]
    INSTRUMENT_TYPE_EQUITY: _ClassVar[InstrumentType]
    INSTRUMENT_TYPE_OPTION: _ClassVar[InstrumentType]

class OptionType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    OPTION_TYPE_UNSPECIFIED: _ClassVar[OptionType]
    OPTION_TYPE_CALL: _ClassVar[OptionType]
    OPTION_TYPE_PUT: _ClassVar[OptionType]

class SizeUnit(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    SIZE_UNIT_UNSPECIFIED: _ClassVar[SizeUnit]
    SIZE_UNIT_SHARES: _ClassVar[SizeUnit]
    SIZE_UNIT_CONTRACTS: _ClassVar[SizeUnit]

class OrderType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    ORDER_TYPE_UNSPECIFIED: _ClassVar[OrderType]
    ORDER_TYPE_LIMIT: _ClassVar[OrderType]
    ORDER_TYPE_MARKET: _ClassVar[OrderType]

class TimeInForce(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    TIME_IN_FORCE_UNSPECIFIED: _ClassVar[TimeInForce]
    TIME_IN_FORCE_DAY: _ClassVar[TimeInForce]
    TIME_IN_FORCE_GTC: _ClassVar[TimeInForce]
    TIME_IN_FORCE_IOC: _ClassVar[TimeInForce]
    TIME_IN_FORCE_FOK: _ClassVar[TimeInForce]
    TIME_IN_FORCE_OPG: _ClassVar[TimeInForce]
    TIME_IN_FORCE_CLS: _ClassVar[TimeInForce]

class RiskDenomination(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    RISK_DENOMINATION_UNSPECIFIED: _ClassVar[RiskDenomination]
    RISK_DENOMINATION_UNDERLYING_PRICE: _ClassVar[RiskDenomination]
    RISK_DENOMINATION_OPTION_PRICE: _ClassVar[RiskDenomination]

class StrategyFamily(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    STRATEGY_FAMILY_UNSPECIFIED: _ClassVar[StrategyFamily]
    STRATEGY_FAMILY_TREND: _ClassVar[StrategyFamily]
    STRATEGY_FAMILY_MEAN_REVERSION: _ClassVar[StrategyFamily]
    STRATEGY_FAMILY_EVENT_DRIVEN: _ClassVar[StrategyFamily]
    STRATEGY_FAMILY_VOLATILITY: _ClassVar[StrategyFamily]
    STRATEGY_FAMILY_RELATIVE_VALUE: _ClassVar[StrategyFamily]

class Regime(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    REGIME_UNSPECIFIED: _ClassVar[Regime]
    REGIME_BULL_TREND: _ClassVar[Regime]
    REGIME_BEAR_TREND: _ClassVar[Regime]
    REGIME_RANGE_BOUND: _ClassVar[Regime]
    REGIME_HIGH_VOLATILITY: _ClassVar[Regime]
    REGIME_LOW_VOLATILITY: _ClassVar[Regime]
    REGIME_CRISIS: _ClassVar[Regime]

class MarketStatus(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    MARKET_STATUS_UNSPECIFIED: _ClassVar[MarketStatus]
    MARKET_STATUS_PRE_MARKET: _ClassVar[MarketStatus]
    MARKET_STATUS_OPEN: _ClassVar[MarketStatus]
    MARKET_STATUS_AFTER_HOURS: _ClassVar[MarketStatus]
    MARKET_STATUS_CLOSED: _ClassVar[MarketStatus]
ENVIRONMENT_UNSPECIFIED: Environment
ENVIRONMENT_PAPER: Environment
ENVIRONMENT_LIVE: Environment
ACTION_UNSPECIFIED: Action
ACTION_BUY: Action
ACTION_SELL: Action
ACTION_HOLD: Action
ACTION_INCREASE: Action
ACTION_REDUCE: Action
ACTION_NO_TRADE: Action
DIRECTION_UNSPECIFIED: Direction
DIRECTION_LONG: Direction
DIRECTION_SHORT: Direction
DIRECTION_FLAT: Direction
INSTRUMENT_TYPE_UNSPECIFIED: InstrumentType
INSTRUMENT_TYPE_EQUITY: InstrumentType
INSTRUMENT_TYPE_OPTION: InstrumentType
OPTION_TYPE_UNSPECIFIED: OptionType
OPTION_TYPE_CALL: OptionType
OPTION_TYPE_PUT: OptionType
SIZE_UNIT_UNSPECIFIED: SizeUnit
SIZE_UNIT_SHARES: SizeUnit
SIZE_UNIT_CONTRACTS: SizeUnit
ORDER_TYPE_UNSPECIFIED: OrderType
ORDER_TYPE_LIMIT: OrderType
ORDER_TYPE_MARKET: OrderType
TIME_IN_FORCE_UNSPECIFIED: TimeInForce
TIME_IN_FORCE_DAY: TimeInForce
TIME_IN_FORCE_GTC: TimeInForce
TIME_IN_FORCE_IOC: TimeInForce
TIME_IN_FORCE_FOK: TimeInForce
TIME_IN_FORCE_OPG: TimeInForce
TIME_IN_FORCE_CLS: TimeInForce
RISK_DENOMINATION_UNSPECIFIED: RiskDenomination
RISK_DENOMINATION_UNDERLYING_PRICE: RiskDenomination
RISK_DENOMINATION_OPTION_PRICE: RiskDenomination
STRATEGY_FAMILY_UNSPECIFIED: StrategyFamily
STRATEGY_FAMILY_TREND: StrategyFamily
STRATEGY_FAMILY_MEAN_REVERSION: StrategyFamily
STRATEGY_FAMILY_EVENT_DRIVEN: StrategyFamily
STRATEGY_FAMILY_VOLATILITY: StrategyFamily
STRATEGY_FAMILY_RELATIVE_VALUE: StrategyFamily
REGIME_UNSPECIFIED: Regime
REGIME_BULL_TREND: Regime
REGIME_BEAR_TREND: Regime
REGIME_RANGE_BOUND: Regime
REGIME_HIGH_VOLATILITY: Regime
REGIME_LOW_VOLATILITY: Regime
REGIME_CRISIS: Regime
MARKET_STATUS_UNSPECIFIED: MarketStatus
MARKET_STATUS_PRE_MARKET: MarketStatus
MARKET_STATUS_OPEN: MarketStatus
MARKET_STATUS_AFTER_HOURS: MarketStatus
MARKET_STATUS_CLOSED: MarketStatus

class OptionContract(_message.Message):
    __slots__ = ("underlying", "expiration", "strike", "option_type")
    UNDERLYING_FIELD_NUMBER: _ClassVar[int]
    EXPIRATION_FIELD_NUMBER: _ClassVar[int]
    STRIKE_FIELD_NUMBER: _ClassVar[int]
    OPTION_TYPE_FIELD_NUMBER: _ClassVar[int]
    underlying: str
    expiration: str
    strike: float
    option_type: OptionType
    def __init__(self, underlying: _Optional[str] = ..., expiration: _Optional[str] = ..., strike: _Optional[float] = ..., option_type: _Optional[_Union[OptionType, str]] = ...) -> None: ...

class Instrument(_message.Message):
    __slots__ = ("instrument_id", "instrument_type", "option_contract")
    INSTRUMENT_ID_FIELD_NUMBER: _ClassVar[int]
    INSTRUMENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    OPTION_CONTRACT_FIELD_NUMBER: _ClassVar[int]
    instrument_id: str
    instrument_type: InstrumentType
    option_contract: OptionContract
    def __init__(self, instrument_id: _Optional[str] = ..., instrument_type: _Optional[_Union[InstrumentType, str]] = ..., option_contract: _Optional[_Union[OptionContract, _Mapping]] = ...) -> None: ...

class Size(_message.Message):
    __slots__ = ("quantity", "unit", "target_position_quantity")
    QUANTITY_FIELD_NUMBER: _ClassVar[int]
    UNIT_FIELD_NUMBER: _ClassVar[int]
    TARGET_POSITION_QUANTITY_FIELD_NUMBER: _ClassVar[int]
    quantity: int
    unit: SizeUnit
    target_position_quantity: int
    def __init__(self, quantity: _Optional[int] = ..., unit: _Optional[_Union[SizeUnit, str]] = ..., target_position_quantity: _Optional[int] = ...) -> None: ...

class RiskLevels(_message.Message):
    __slots__ = ("stop_loss_level", "take_profit_level", "denomination")
    STOP_LOSS_LEVEL_FIELD_NUMBER: _ClassVar[int]
    TAKE_PROFIT_LEVEL_FIELD_NUMBER: _ClassVar[int]
    DENOMINATION_FIELD_NUMBER: _ClassVar[int]
    stop_loss_level: float
    take_profit_level: float
    denomination: RiskDenomination
    def __init__(self, stop_loss_level: _Optional[float] = ..., take_profit_level: _Optional[float] = ..., denomination: _Optional[_Union[RiskDenomination, str]] = ...) -> None: ...
