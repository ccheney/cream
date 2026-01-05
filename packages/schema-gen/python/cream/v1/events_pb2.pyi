import datetime

from google.protobuf import timestamp_pb2 as _timestamp_pb2
from google.protobuf import struct_pb2 as _struct_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class EventType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    EVENT_TYPE_UNSPECIFIED: _ClassVar[EventType]
    EVENT_TYPE_EARNINGS: _ClassVar[EventType]
    EVENT_TYPE_GUIDANCE: _ClassVar[EventType]
    EVENT_TYPE_MACRO: _ClassVar[EventType]
    EVENT_TYPE_NEWS: _ClassVar[EventType]
    EVENT_TYPE_SENTIMENT_SPIKE: _ClassVar[EventType]
    EVENT_TYPE_SEC_FILING: _ClassVar[EventType]
    EVENT_TYPE_DIVIDEND: _ClassVar[EventType]
    EVENT_TYPE_SPLIT: _ClassVar[EventType]
    EVENT_TYPE_M_AND_A: _ClassVar[EventType]
    EVENT_TYPE_ANALYST_RATING: _ClassVar[EventType]
    EVENT_TYPE_CONFERENCE: _ClassVar[EventType]
    EVENT_TYPE_PRODUCT_LAUNCH: _ClassVar[EventType]
    EVENT_TYPE_REGULATORY: _ClassVar[EventType]
    EVENT_TYPE_EXECUTIVE_CHANGE: _ClassVar[EventType]
    EVENT_TYPE_LEGAL: _ClassVar[EventType]
    EVENT_TYPE_OTHER: _ClassVar[EventType]

class DataSource(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    DATA_SOURCE_UNSPECIFIED: _ClassVar[DataSource]
    DATA_SOURCE_FMP: _ClassVar[DataSource]
    DATA_SOURCE_ALPHA_VANTAGE: _ClassVar[DataSource]
    DATA_SOURCE_POLYGON: _ClassVar[DataSource]
    DATA_SOURCE_BENZINGA: _ClassVar[DataSource]
    DATA_SOURCE_SEC_EDGAR: _ClassVar[DataSource]
    DATA_SOURCE_SOCIAL: _ClassVar[DataSource]
    DATA_SOURCE_INTERNAL: _ClassVar[DataSource]

class Sentiment(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    SENTIMENT_UNSPECIFIED: _ClassVar[Sentiment]
    SENTIMENT_BULLISH: _ClassVar[Sentiment]
    SENTIMENT_BEARISH: _ClassVar[Sentiment]
    SENTIMENT_NEUTRAL: _ClassVar[Sentiment]
EVENT_TYPE_UNSPECIFIED: EventType
EVENT_TYPE_EARNINGS: EventType
EVENT_TYPE_GUIDANCE: EventType
EVENT_TYPE_MACRO: EventType
EVENT_TYPE_NEWS: EventType
EVENT_TYPE_SENTIMENT_SPIKE: EventType
EVENT_TYPE_SEC_FILING: EventType
EVENT_TYPE_DIVIDEND: EventType
EVENT_TYPE_SPLIT: EventType
EVENT_TYPE_M_AND_A: EventType
EVENT_TYPE_ANALYST_RATING: EventType
EVENT_TYPE_CONFERENCE: EventType
EVENT_TYPE_PRODUCT_LAUNCH: EventType
EVENT_TYPE_REGULATORY: EventType
EVENT_TYPE_EXECUTIVE_CHANGE: EventType
EVENT_TYPE_LEGAL: EventType
EVENT_TYPE_OTHER: EventType
DATA_SOURCE_UNSPECIFIED: DataSource
DATA_SOURCE_FMP: DataSource
DATA_SOURCE_ALPHA_VANTAGE: DataSource
DATA_SOURCE_POLYGON: DataSource
DATA_SOURCE_BENZINGA: DataSource
DATA_SOURCE_SEC_EDGAR: DataSource
DATA_SOURCE_SOCIAL: DataSource
DATA_SOURCE_INTERNAL: DataSource
SENTIMENT_UNSPECIFIED: Sentiment
SENTIMENT_BULLISH: Sentiment
SENTIMENT_BEARISH: Sentiment
SENTIMENT_NEUTRAL: Sentiment

class EarningsEventPayload(_message.Message):
    __slots__ = ()
    SYMBOL_FIELD_NUMBER: _ClassVar[int]
    QUARTER_FIELD_NUMBER: _ClassVar[int]
    YEAR_FIELD_NUMBER: _ClassVar[int]
    EPS_ACTUAL_FIELD_NUMBER: _ClassVar[int]
    EPS_EXPECTED_FIELD_NUMBER: _ClassVar[int]
    EPS_SURPRISE_PCT_FIELD_NUMBER: _ClassVar[int]
    REVENUE_ACTUAL_FIELD_NUMBER: _ClassVar[int]
    REVENUE_EXPECTED_FIELD_NUMBER: _ClassVar[int]
    REVENUE_SURPRISE_PCT_FIELD_NUMBER: _ClassVar[int]
    GUIDANCE_SUMMARY_FIELD_NUMBER: _ClassVar[int]
    TRANSCRIPT_AVAILABLE_FIELD_NUMBER: _ClassVar[int]
    symbol: str
    quarter: str
    year: int
    eps_actual: float
    eps_expected: float
    eps_surprise_pct: float
    revenue_actual: float
    revenue_expected: float
    revenue_surprise_pct: float
    guidance_summary: str
    transcript_available: bool
    def __init__(self, symbol: _Optional[str] = ..., quarter: _Optional[str] = ..., year: _Optional[int] = ..., eps_actual: _Optional[float] = ..., eps_expected: _Optional[float] = ..., eps_surprise_pct: _Optional[float] = ..., revenue_actual: _Optional[float] = ..., revenue_expected: _Optional[float] = ..., revenue_surprise_pct: _Optional[float] = ..., guidance_summary: _Optional[str] = ..., transcript_available: _Optional[bool] = ...) -> None: ...

class MacroEventPayload(_message.Message):
    __slots__ = ()
    INDICATOR_NAME_FIELD_NUMBER: _ClassVar[int]
    VALUE_FIELD_NUMBER: _ClassVar[int]
    PREVIOUS_VALUE_FIELD_NUMBER: _ClassVar[int]
    EXPECTED_VALUE_FIELD_NUMBER: _ClassVar[int]
    SURPRISE_PCT_FIELD_NUMBER: _ClassVar[int]
    UNIT_FIELD_NUMBER: _ClassVar[int]
    COUNTRY_FIELD_NUMBER: _ClassVar[int]
    PERIOD_FIELD_NUMBER: _ClassVar[int]
    indicator_name: str
    value: float
    previous_value: float
    expected_value: float
    surprise_pct: float
    unit: str
    country: str
    period: str
    def __init__(self, indicator_name: _Optional[str] = ..., value: _Optional[float] = ..., previous_value: _Optional[float] = ..., expected_value: _Optional[float] = ..., surprise_pct: _Optional[float] = ..., unit: _Optional[str] = ..., country: _Optional[str] = ..., period: _Optional[str] = ...) -> None: ...

class NewsEventPayload(_message.Message):
    __slots__ = ()
    HEADLINE_FIELD_NUMBER: _ClassVar[int]
    BODY_FIELD_NUMBER: _ClassVar[int]
    SOURCE_FIELD_NUMBER: _ClassVar[int]
    URL_FIELD_NUMBER: _ClassVar[int]
    ENTITIES_FIELD_NUMBER: _ClassVar[int]
    KEY_INSIGHTS_FIELD_NUMBER: _ClassVar[int]
    headline: str
    body: str
    source: str
    url: str
    entities: _containers.RepeatedCompositeFieldContainer[ExtractedEntity]
    key_insights: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, headline: _Optional[str] = ..., body: _Optional[str] = ..., source: _Optional[str] = ..., url: _Optional[str] = ..., entities: _Optional[_Iterable[_Union[ExtractedEntity, _Mapping]]] = ..., key_insights: _Optional[_Iterable[str]] = ...) -> None: ...

class ExtractedEntity(_message.Message):
    __slots__ = ()
    NAME_FIELD_NUMBER: _ClassVar[int]
    ENTITY_TYPE_FIELD_NUMBER: _ClassVar[int]
    TICKER_FIELD_NUMBER: _ClassVar[int]
    name: str
    entity_type: str
    ticker: str
    def __init__(self, name: _Optional[str] = ..., entity_type: _Optional[str] = ..., ticker: _Optional[str] = ...) -> None: ...

class SentimentEventPayload(_message.Message):
    __slots__ = ()
    PLATFORM_FIELD_NUMBER: _ClassVar[int]
    MENTION_COUNT_FIELD_NUMBER: _ClassVar[int]
    AVERAGE_VOLUME_FIELD_NUMBER: _ClassVar[int]
    VOLUME_ZSCORE_FIELD_NUMBER: _ClassVar[int]
    AGGREGATE_SENTIMENT_FIELD_NUMBER: _ClassVar[int]
    WINDOW_MINUTES_FIELD_NUMBER: _ClassVar[int]
    platform: str
    mention_count: int
    average_volume: int
    volume_zscore: float
    aggregate_sentiment: Sentiment
    window_minutes: int
    def __init__(self, platform: _Optional[str] = ..., mention_count: _Optional[int] = ..., average_volume: _Optional[int] = ..., volume_zscore: _Optional[float] = ..., aggregate_sentiment: _Optional[_Union[Sentiment, str]] = ..., window_minutes: _Optional[int] = ...) -> None: ...

class MergerAcquisitionPayload(_message.Message):
    __slots__ = ()
    TRANSACTION_TYPE_FIELD_NUMBER: _ClassVar[int]
    ACQUIRER_SYMBOL_FIELD_NUMBER: _ClassVar[int]
    TARGET_SYMBOL_FIELD_NUMBER: _ClassVar[int]
    DEAL_VALUE_FIELD_NUMBER: _ClassVar[int]
    CURRENCY_FIELD_NUMBER: _ClassVar[int]
    EXPECTED_CLOSE_DATE_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    transaction_type: str
    acquirer_symbol: str
    target_symbol: str
    deal_value: float
    currency: str
    expected_close_date: str
    status: str
    def __init__(self, transaction_type: _Optional[str] = ..., acquirer_symbol: _Optional[str] = ..., target_symbol: _Optional[str] = ..., deal_value: _Optional[float] = ..., currency: _Optional[str] = ..., expected_close_date: _Optional[str] = ..., status: _Optional[str] = ...) -> None: ...

class AnalystRatingPayload(_message.Message):
    __slots__ = ()
    FIRM_FIELD_NUMBER: _ClassVar[int]
    ANALYST_NAME_FIELD_NUMBER: _ClassVar[int]
    PREVIOUS_RATING_FIELD_NUMBER: _ClassVar[int]
    NEW_RATING_FIELD_NUMBER: _ClassVar[int]
    PREVIOUS_TARGET_FIELD_NUMBER: _ClassVar[int]
    NEW_TARGET_FIELD_NUMBER: _ClassVar[int]
    ACTION_TYPE_FIELD_NUMBER: _ClassVar[int]
    firm: str
    analyst_name: str
    previous_rating: str
    new_rating: str
    previous_target: float
    new_target: float
    action_type: str
    def __init__(self, firm: _Optional[str] = ..., analyst_name: _Optional[str] = ..., previous_rating: _Optional[str] = ..., new_rating: _Optional[str] = ..., previous_target: _Optional[float] = ..., new_target: _Optional[float] = ..., action_type: _Optional[str] = ...) -> None: ...

class RegulatoryPayload(_message.Message):
    __slots__ = ()
    REGULATORY_BODY_FIELD_NUMBER: _ClassVar[int]
    ACTION_TYPE_FIELD_NUMBER: _ClassVar[int]
    SUBJECT_FIELD_NUMBER: _ClassVar[int]
    DECISION_FIELD_NUMBER: _ClassVar[int]
    NEXT_STEPS_FIELD_NUMBER: _ClassVar[int]
    regulatory_body: str
    action_type: str
    subject: str
    decision: str
    next_steps: str
    def __init__(self, regulatory_body: _Optional[str] = ..., action_type: _Optional[str] = ..., subject: _Optional[str] = ..., decision: _Optional[str] = ..., next_steps: _Optional[str] = ...) -> None: ...

class DividendPayload(_message.Message):
    __slots__ = ()
    AMOUNT_FIELD_NUMBER: _ClassVar[int]
    CURRENCY_FIELD_NUMBER: _ClassVar[int]
    EX_DATE_FIELD_NUMBER: _ClassVar[int]
    RECORD_DATE_FIELD_NUMBER: _ClassVar[int]
    PAYMENT_DATE_FIELD_NUMBER: _ClassVar[int]
    DIVIDEND_TYPE_FIELD_NUMBER: _ClassVar[int]
    YOY_CHANGE_PCT_FIELD_NUMBER: _ClassVar[int]
    amount: float
    currency: str
    ex_date: str
    record_date: str
    payment_date: str
    dividend_type: str
    yoy_change_pct: float
    def __init__(self, amount: _Optional[float] = ..., currency: _Optional[str] = ..., ex_date: _Optional[str] = ..., record_date: _Optional[str] = ..., payment_date: _Optional[str] = ..., dividend_type: _Optional[str] = ..., yoy_change_pct: _Optional[float] = ...) -> None: ...

class SplitPayload(_message.Message):
    __slots__ = ()
    SPLIT_FROM_FIELD_NUMBER: _ClassVar[int]
    SPLIT_TO_FIELD_NUMBER: _ClassVar[int]
    EFFECTIVE_DATE_FIELD_NUMBER: _ClassVar[int]
    ANNOUNCEMENT_DATE_FIELD_NUMBER: _ClassVar[int]
    split_from: int
    split_to: int
    effective_date: str
    announcement_date: str
    def __init__(self, split_from: _Optional[int] = ..., split_to: _Optional[int] = ..., effective_date: _Optional[str] = ..., announcement_date: _Optional[str] = ...) -> None: ...

class ExternalEvent(_message.Message):
    __slots__ = ()
    EVENT_ID_FIELD_NUMBER: _ClassVar[int]
    EVENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    EVENT_TIME_FIELD_NUMBER: _ClassVar[int]
    EARNINGS_FIELD_NUMBER: _ClassVar[int]
    MACRO_FIELD_NUMBER: _ClassVar[int]
    NEWS_FIELD_NUMBER: _ClassVar[int]
    SENTIMENT_SPIKE_FIELD_NUMBER: _ClassVar[int]
    MERGER_ACQUISITION_FIELD_NUMBER: _ClassVar[int]
    ANALYST_RATING_FIELD_NUMBER: _ClassVar[int]
    REGULATORY_FIELD_NUMBER: _ClassVar[int]
    DIVIDEND_FIELD_NUMBER: _ClassVar[int]
    SPLIT_FIELD_NUMBER: _ClassVar[int]
    GENERIC_PAYLOAD_FIELD_NUMBER: _ClassVar[int]
    RELATED_INSTRUMENT_IDS_FIELD_NUMBER: _ClassVar[int]
    SOURCE_FIELD_NUMBER: _ClassVar[int]
    HEADLINE_FIELD_NUMBER: _ClassVar[int]
    SENTIMENT_SCORE_FIELD_NUMBER: _ClassVar[int]
    IMPORTANCE_SCORE_FIELD_NUMBER: _ClassVar[int]
    SURPRISE_SCORE_FIELD_NUMBER: _ClassVar[int]
    CONFIDENCE_FIELD_NUMBER: _ClassVar[int]
    PROCESSED_AT_FIELD_NUMBER: _ClassVar[int]
    ORIGINAL_CONTENT_FIELD_NUMBER: _ClassVar[int]
    event_id: str
    event_type: EventType
    event_time: _timestamp_pb2.Timestamp
    earnings: EarningsEventPayload
    macro: MacroEventPayload
    news: NewsEventPayload
    sentiment_spike: SentimentEventPayload
    merger_acquisition: MergerAcquisitionPayload
    analyst_rating: AnalystRatingPayload
    regulatory: RegulatoryPayload
    dividend: DividendPayload
    split: SplitPayload
    generic_payload: _struct_pb2.Struct
    related_instrument_ids: _containers.RepeatedScalarFieldContainer[str]
    source: DataSource
    headline: str
    sentiment_score: float
    importance_score: float
    surprise_score: float
    confidence: float
    processed_at: _timestamp_pb2.Timestamp
    original_content: str
    def __init__(self, event_id: _Optional[str] = ..., event_type: _Optional[_Union[EventType, str]] = ..., event_time: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., earnings: _Optional[_Union[EarningsEventPayload, _Mapping]] = ..., macro: _Optional[_Union[MacroEventPayload, _Mapping]] = ..., news: _Optional[_Union[NewsEventPayload, _Mapping]] = ..., sentiment_spike: _Optional[_Union[SentimentEventPayload, _Mapping]] = ..., merger_acquisition: _Optional[_Union[MergerAcquisitionPayload, _Mapping]] = ..., analyst_rating: _Optional[_Union[AnalystRatingPayload, _Mapping]] = ..., regulatory: _Optional[_Union[RegulatoryPayload, _Mapping]] = ..., dividend: _Optional[_Union[DividendPayload, _Mapping]] = ..., split: _Optional[_Union[SplitPayload, _Mapping]] = ..., generic_payload: _Optional[_Union[_struct_pb2.Struct, _Mapping]] = ..., related_instrument_ids: _Optional[_Iterable[str]] = ..., source: _Optional[_Union[DataSource, str]] = ..., headline: _Optional[str] = ..., sentiment_score: _Optional[float] = ..., importance_score: _Optional[float] = ..., surprise_score: _Optional[float] = ..., confidence: _Optional[float] = ..., processed_at: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., original_content: _Optional[str] = ...) -> None: ...

class ExternalEventList(_message.Message):
    __slots__ = ()
    EVENTS_FIELD_NUMBER: _ClassVar[int]
    TOTAL_COUNT_FIELD_NUMBER: _ClassVar[int]
    NEXT_CURSOR_FIELD_NUMBER: _ClassVar[int]
    events: _containers.RepeatedCompositeFieldContainer[ExternalEvent]
    total_count: int
    next_cursor: str
    def __init__(self, events: _Optional[_Iterable[_Union[ExternalEvent, _Mapping]]] = ..., total_count: _Optional[int] = ..., next_cursor: _Optional[str] = ...) -> None: ...

class EventQueryRequest(_message.Message):
    __slots__ = ()
    EVENT_TYPES_FIELD_NUMBER: _ClassVar[int]
    INSTRUMENT_IDS_FIELD_NUMBER: _ClassVar[int]
    START_TIME_FIELD_NUMBER: _ClassVar[int]
    END_TIME_FIELD_NUMBER: _ClassVar[int]
    LIMIT_FIELD_NUMBER: _ClassVar[int]
    CURSOR_FIELD_NUMBER: _ClassVar[int]
    MIN_IMPORTANCE_FIELD_NUMBER: _ClassVar[int]
    event_types: _containers.RepeatedScalarFieldContainer[EventType]
    instrument_ids: _containers.RepeatedScalarFieldContainer[str]
    start_time: _timestamp_pb2.Timestamp
    end_time: _timestamp_pb2.Timestamp
    limit: int
    cursor: str
    min_importance: float
    def __init__(self, event_types: _Optional[_Iterable[_Union[EventType, str]]] = ..., instrument_ids: _Optional[_Iterable[str]] = ..., start_time: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., end_time: _Optional[_Union[datetime.datetime, _timestamp_pb2.Timestamp, _Mapping]] = ..., limit: _Optional[int] = ..., cursor: _Optional[str] = ..., min_importance: _Optional[float] = ...) -> None: ...
