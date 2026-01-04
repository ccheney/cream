import datetime

from cream.v1 import common_pb2 as _common_pb2
from google.protobuf import timestamp_pb2 as _timestamp_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class Quote(_message.Message):
    __slots__ = ()
    SYMBOL_FIELD_NUMBER: _ClassVar[int]
    BID_FIELD_NUMBER: _ClassVar[int]
    ASK_FIELD_NUMBER: _ClassVar[int]
    BID_SIZE_FIELD_NUMBER: _ClassVar[int]
    ASK_SIZE_FIELD_NUMBER: _ClassVar[int]
    LAST_FIELD_NUMBER: _ClassVar[int]
    LAST_SIZE_FIELD_NUMBER: _ClassVar[int]
    VOLUME_FIELD_NUMBER: _ClassVar[int]
    TIMESTAMP_FIELD_NUMBER: _ClassVar[int]
    symbol: str
    bid: float
    ask: float
    bid_size: int
    ask_size: int
    last: float
    last_size: int
    volume: int
    timestamp: _timestamp_pb2.Timestamp
    def __init__(self, symbol: _Optional[str] = ..., bid: _Optional[float] = ..., ask: _Optional[float] = ..., bid_size: _Optional[int] = ..., ask_size: _Optional[int] = ..., last: _Optional[float] = ..., last_size: _Optional[int] = ..., volume: _Optional[int] = ..., timestamp: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class Bar(_message.Message):
    __slots__ = ()
    SYMBOL_FIELD_NUMBER: _ClassVar[int]
    TIMESTAMP_FIELD_NUMBER: _ClassVar[int]
    TIMEFRAME_MINUTES_FIELD_NUMBER: _ClassVar[int]
    OPEN_FIELD_NUMBER: _ClassVar[int]
    HIGH_FIELD_NUMBER: _ClassVar[int]
    LOW_FIELD_NUMBER: _ClassVar[int]
    CLOSE_FIELD_NUMBER: _ClassVar[int]
    VOLUME_FIELD_NUMBER: _ClassVar[int]
    VWAP_FIELD_NUMBER: _ClassVar[int]
    TRADE_COUNT_FIELD_NUMBER: _ClassVar[int]
    symbol: str
    timestamp: _timestamp_pb2.Timestamp
    timeframe_minutes: int
    open: float
    high: float
    low: float
    close: float
    volume: int
    vwap: float
    trade_count: int
    def __init__(self, symbol: _Optional[str] = ..., timestamp: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., timeframe_minutes: _Optional[int] = ..., open: _Optional[float] = ..., high: _Optional[float] = ..., low: _Optional[float] = ..., close: _Optional[float] = ..., volume: _Optional[int] = ..., vwap: _Optional[float] = ..., trade_count: _Optional[int] = ...) -> None: ...

class SymbolSnapshot(_message.Message):
    __slots__ = ()
    SYMBOL_FIELD_NUMBER: _ClassVar[int]
    QUOTE_FIELD_NUMBER: _ClassVar[int]
    BARS_FIELD_NUMBER: _ClassVar[int]
    MARKET_STATUS_FIELD_NUMBER: _ClassVar[int]
    DAY_HIGH_FIELD_NUMBER: _ClassVar[int]
    DAY_LOW_FIELD_NUMBER: _ClassVar[int]
    PREV_CLOSE_FIELD_NUMBER: _ClassVar[int]
    OPEN_FIELD_NUMBER: _ClassVar[int]
    AS_OF_FIELD_NUMBER: _ClassVar[int]
    symbol: str
    quote: Quote
    bars: _containers.RepeatedCompositeFieldContainer[Bar]
    market_status: _common_pb2.MarketStatus
    day_high: float
    day_low: float
    prev_close: float
    open: float
    as_of: _timestamp_pb2.Timestamp
    def __init__(self, symbol: _Optional[str] = ..., quote: _Optional[_Union[Quote, _Mapping]] = ..., bars: _Optional[_Iterable[_Union[Bar, _Mapping]]] = ..., market_status: _Optional[_Union[_common_pb2.MarketStatus, str]] = ..., day_high: _Optional[float] = ..., day_low: _Optional[float] = ..., prev_close: _Optional[float] = ..., open: _Optional[float] = ..., as_of: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class MarketSnapshot(_message.Message):
    __slots__ = ()
    ENVIRONMENT_FIELD_NUMBER: _ClassVar[int]
    AS_OF_FIELD_NUMBER: _ClassVar[int]
    MARKET_STATUS_FIELD_NUMBER: _ClassVar[int]
    REGIME_FIELD_NUMBER: _ClassVar[int]
    SYMBOLS_FIELD_NUMBER: _ClassVar[int]
    environment: _common_pb2.Environment
    as_of: _timestamp_pb2.Timestamp
    market_status: _common_pb2.MarketStatus
    regime: _common_pb2.Regime
    symbols: _containers.RepeatedCompositeFieldContainer[SymbolSnapshot]
    def __init__(self, environment: _Optional[_Union[_common_pb2.Environment, str]] = ..., as_of: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., market_status: _Optional[_Union[_common_pb2.MarketStatus, str]] = ..., regime: _Optional[_Union[_common_pb2.Regime, str]] = ..., symbols: _Optional[_Iterable[_Union[SymbolSnapshot, _Mapping]]] = ...) -> None: ...

class OptionQuote(_message.Message):
    __slots__ = ()
    CONTRACT_FIELD_NUMBER: _ClassVar[int]
    QUOTE_FIELD_NUMBER: _ClassVar[int]
    IMPLIED_VOLATILITY_FIELD_NUMBER: _ClassVar[int]
    DELTA_FIELD_NUMBER: _ClassVar[int]
    GAMMA_FIELD_NUMBER: _ClassVar[int]
    THETA_FIELD_NUMBER: _ClassVar[int]
    VEGA_FIELD_NUMBER: _ClassVar[int]
    RHO_FIELD_NUMBER: _ClassVar[int]
    OPEN_INTEREST_FIELD_NUMBER: _ClassVar[int]
    contract: _common_pb2.OptionContract
    quote: Quote
    implied_volatility: float
    delta: float
    gamma: float
    theta: float
    vega: float
    rho: float
    open_interest: int
    def __init__(self, contract: _Optional[_Union[_common_pb2.OptionContract, _Mapping]] = ..., quote: _Optional[_Union[Quote, _Mapping]] = ..., implied_volatility: _Optional[float] = ..., delta: _Optional[float] = ..., gamma: _Optional[float] = ..., theta: _Optional[float] = ..., vega: _Optional[float] = ..., rho: _Optional[float] = ..., open_interest: _Optional[int] = ...) -> None: ...

class OptionChain(_message.Message):
    __slots__ = ()
    UNDERLYING_FIELD_NUMBER: _ClassVar[int]
    UNDERLYING_PRICE_FIELD_NUMBER: _ClassVar[int]
    OPTIONS_FIELD_NUMBER: _ClassVar[int]
    AS_OF_FIELD_NUMBER: _ClassVar[int]
    underlying: str
    underlying_price: float
    options: _containers.RepeatedCompositeFieldContainer[OptionQuote]
    as_of: _timestamp_pb2.Timestamp
    def __init__(self, underlying: _Optional[str] = ..., underlying_price: _Optional[float] = ..., options: _Optional[_Iterable[_Union[OptionQuote, _Mapping]]] = ..., as_of: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ...) -> None: ...

class SubscribeMarketDataRequest(_message.Message):
    __slots__ = ()
    SYMBOLS_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_OPTIONS_FIELD_NUMBER: _ClassVar[int]
    BAR_TIMEFRAMES_FIELD_NUMBER: _ClassVar[int]
    symbols: _containers.RepeatedScalarFieldContainer[str]
    include_options: bool
    bar_timeframes: _containers.RepeatedScalarFieldContainer[int]
    def __init__(self, symbols: _Optional[_Iterable[str]] = ..., include_options: _Optional[bool] = ..., bar_timeframes: _Optional[_Iterable[int]] = ...) -> None: ...

class SubscribeMarketDataResponse(_message.Message):
    __slots__ = ()
    QUOTE_FIELD_NUMBER: _ClassVar[int]
    BAR_FIELD_NUMBER: _ClassVar[int]
    OPTION_QUOTE_FIELD_NUMBER: _ClassVar[int]
    SNAPSHOT_FIELD_NUMBER: _ClassVar[int]
    quote: Quote
    bar: Bar
    option_quote: OptionQuote
    snapshot: SymbolSnapshot
    def __init__(self, quote: _Optional[_Union[Quote, _Mapping]] = ..., bar: _Optional[_Union[Bar, _Mapping]] = ..., option_quote: _Optional[_Union[OptionQuote, _Mapping]] = ..., snapshot: _Optional[_Union[SymbolSnapshot, _Mapping]] = ...) -> None: ...

class GetSnapshotRequest(_message.Message):
    __slots__ = ()
    SYMBOLS_FIELD_NUMBER: _ClassVar[int]
    INCLUDE_BARS_FIELD_NUMBER: _ClassVar[int]
    BAR_TIMEFRAMES_FIELD_NUMBER: _ClassVar[int]
    symbols: _containers.RepeatedScalarFieldContainer[str]
    include_bars: bool
    bar_timeframes: _containers.RepeatedScalarFieldContainer[int]
    def __init__(self, symbols: _Optional[_Iterable[str]] = ..., include_bars: _Optional[bool] = ..., bar_timeframes: _Optional[_Iterable[int]] = ...) -> None: ...

class GetSnapshotResponse(_message.Message):
    __slots__ = ()
    SNAPSHOT_FIELD_NUMBER: _ClassVar[int]
    snapshot: MarketSnapshot
    def __init__(self, snapshot: _Optional[_Union[MarketSnapshot, _Mapping]] = ...) -> None: ...

class GetOptionChainRequest(_message.Message):
    __slots__ = ()
    UNDERLYING_FIELD_NUMBER: _ClassVar[int]
    EXPIRATIONS_FIELD_NUMBER: _ClassVar[int]
    MIN_STRIKE_FIELD_NUMBER: _ClassVar[int]
    MAX_STRIKE_FIELD_NUMBER: _ClassVar[int]
    underlying: str
    expirations: _containers.RepeatedScalarFieldContainer[str]
    min_strike: float
    max_strike: float
    def __init__(self, underlying: _Optional[str] = ..., expirations: _Optional[_Iterable[str]] = ..., min_strike: _Optional[float] = ..., max_strike: _Optional[float] = ...) -> None: ...

class GetOptionChainResponse(_message.Message):
    __slots__ = ()
    CHAIN_FIELD_NUMBER: _ClassVar[int]
    chain: OptionChain
    def __init__(self, chain: _Optional[_Union[OptionChain, _Mapping]] = ...) -> None: ...
