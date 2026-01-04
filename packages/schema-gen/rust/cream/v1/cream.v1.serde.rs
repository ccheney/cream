// @generated
impl serde::Serialize for AccountState {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if !self.account_id.is_empty() {
            len += 1;
        }
        if self.equity != 0. {
            len += 1;
        }
        if self.buying_power != 0. {
            len += 1;
        }
        if self.margin_used != 0. {
            len += 1;
        }
        if self.day_trade_count != 0 {
            len += 1;
        }
        if self.is_pdt_restricted {
            len += 1;
        }
        if self.as_of.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.AccountState", len)?;
        if !self.account_id.is_empty() {
            struct_ser.serialize_field("accountId", &self.account_id)?;
        }
        if self.equity != 0. {
            struct_ser.serialize_field("equity", &self.equity)?;
        }
        if self.buying_power != 0. {
            struct_ser.serialize_field("buyingPower", &self.buying_power)?;
        }
        if self.margin_used != 0. {
            struct_ser.serialize_field("marginUsed", &self.margin_used)?;
        }
        if self.day_trade_count != 0 {
            struct_ser.serialize_field("dayTradeCount", &self.day_trade_count)?;
        }
        if self.is_pdt_restricted {
            struct_ser.serialize_field("isPdtRestricted", &self.is_pdt_restricted)?;
        }
        if let Some(v) = self.as_of.as_ref() {
            struct_ser.serialize_field("asOf", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for AccountState {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "account_id",
            "accountId",
            "equity",
            "buying_power",
            "buyingPower",
            "margin_used",
            "marginUsed",
            "day_trade_count",
            "dayTradeCount",
            "is_pdt_restricted",
            "isPdtRestricted",
            "as_of",
            "asOf",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            AccountId,
            Equity,
            BuyingPower,
            MarginUsed,
            DayTradeCount,
            IsPdtRestricted,
            AsOf,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "accountId" | "account_id" => Ok(GeneratedField::AccountId),
                            "equity" => Ok(GeneratedField::Equity),
                            "buyingPower" | "buying_power" => Ok(GeneratedField::BuyingPower),
                            "marginUsed" | "margin_used" => Ok(GeneratedField::MarginUsed),
                            "dayTradeCount" | "day_trade_count" => Ok(GeneratedField::DayTradeCount),
                            "isPdtRestricted" | "is_pdt_restricted" => Ok(GeneratedField::IsPdtRestricted),
                            "asOf" | "as_of" => Ok(GeneratedField::AsOf),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = AccountState;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.AccountState")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<AccountState, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut account_id__ = None;
                let mut equity__ = None;
                let mut buying_power__ = None;
                let mut margin_used__ = None;
                let mut day_trade_count__ = None;
                let mut is_pdt_restricted__ = None;
                let mut as_of__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::AccountId => {
                            if account_id__.is_some() {
                                return Err(serde::de::Error::duplicate_field("accountId"));
                            }
                            account_id__ = Some(map_.next_value()?);
                        }
                        GeneratedField::Equity => {
                            if equity__.is_some() {
                                return Err(serde::de::Error::duplicate_field("equity"));
                            }
                            equity__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::BuyingPower => {
                            if buying_power__.is_some() {
                                return Err(serde::de::Error::duplicate_field("buyingPower"));
                            }
                            buying_power__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::MarginUsed => {
                            if margin_used__.is_some() {
                                return Err(serde::de::Error::duplicate_field("marginUsed"));
                            }
                            margin_used__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::DayTradeCount => {
                            if day_trade_count__.is_some() {
                                return Err(serde::de::Error::duplicate_field("dayTradeCount"));
                            }
                            day_trade_count__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::IsPdtRestricted => {
                            if is_pdt_restricted__.is_some() {
                                return Err(serde::de::Error::duplicate_field("isPdtRestricted"));
                            }
                            is_pdt_restricted__ = Some(map_.next_value()?);
                        }
                        GeneratedField::AsOf => {
                            if as_of__.is_some() {
                                return Err(serde::de::Error::duplicate_field("asOf"));
                            }
                            as_of__ = map_.next_value()?;
                        }
                    }
                }
                Ok(AccountState {
                    account_id: account_id__.unwrap_or_default(),
                    equity: equity__.unwrap_or_default(),
                    buying_power: buying_power__.unwrap_or_default(),
                    margin_used: margin_used__.unwrap_or_default(),
                    day_trade_count: day_trade_count__.unwrap_or_default(),
                    is_pdt_restricted: is_pdt_restricted__.unwrap_or_default(),
                    as_of: as_of__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.AccountState", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for Action {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let variant = match self {
            Self::Unspecified => "ACTION_UNSPECIFIED",
            Self::Buy => "ACTION_BUY",
            Self::Sell => "ACTION_SELL",
            Self::Hold => "ACTION_HOLD",
            Self::Increase => "ACTION_INCREASE",
            Self::Reduce => "ACTION_REDUCE",
            Self::NoTrade => "ACTION_NO_TRADE",
        };
        serializer.serialize_str(variant)
    }
}
impl<'de> serde::Deserialize<'de> for Action {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "ACTION_UNSPECIFIED",
            "ACTION_BUY",
            "ACTION_SELL",
            "ACTION_HOLD",
            "ACTION_INCREASE",
            "ACTION_REDUCE",
            "ACTION_NO_TRADE",
        ];

        struct GeneratedVisitor;

        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = Action;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(formatter, "expected one of: {:?}", &FIELDS)
            }

            fn visit_i64<E>(self, v: i64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Signed(v), &self)
                    })
            }

            fn visit_u64<E>(self, v: u64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Unsigned(v), &self)
                    })
            }

            fn visit_str<E>(self, value: &str) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                match value {
                    "ACTION_UNSPECIFIED" => Ok(Action::Unspecified),
                    "ACTION_BUY" => Ok(Action::Buy),
                    "ACTION_SELL" => Ok(Action::Sell),
                    "ACTION_HOLD" => Ok(Action::Hold),
                    "ACTION_INCREASE" => Ok(Action::Increase),
                    "ACTION_REDUCE" => Ok(Action::Reduce),
                    "ACTION_NO_TRADE" => Ok(Action::NoTrade),
                    _ => Err(serde::de::Error::unknown_variant(value, FIELDS)),
                }
            }
        }
        deserializer.deserialize_any(GeneratedVisitor)
    }
}
impl serde::Serialize for Bar {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if !self.symbol.is_empty() {
            len += 1;
        }
        if self.timestamp.is_some() {
            len += 1;
        }
        if self.timeframe_minutes != 0 {
            len += 1;
        }
        if self.open != 0. {
            len += 1;
        }
        if self.high != 0. {
            len += 1;
        }
        if self.low != 0. {
            len += 1;
        }
        if self.close != 0. {
            len += 1;
        }
        if self.volume != 0 {
            len += 1;
        }
        if self.vwap.is_some() {
            len += 1;
        }
        if self.trade_count.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.Bar", len)?;
        if !self.symbol.is_empty() {
            struct_ser.serialize_field("symbol", &self.symbol)?;
        }
        if let Some(v) = self.timestamp.as_ref() {
            struct_ser.serialize_field("timestamp", v)?;
        }
        if self.timeframe_minutes != 0 {
            struct_ser.serialize_field("timeframeMinutes", &self.timeframe_minutes)?;
        }
        if self.open != 0. {
            struct_ser.serialize_field("open", &self.open)?;
        }
        if self.high != 0. {
            struct_ser.serialize_field("high", &self.high)?;
        }
        if self.low != 0. {
            struct_ser.serialize_field("low", &self.low)?;
        }
        if self.close != 0. {
            struct_ser.serialize_field("close", &self.close)?;
        }
        if self.volume != 0 {
            #[allow(clippy::needless_borrow)]
            #[allow(clippy::needless_borrows_for_generic_args)]
            struct_ser.serialize_field("volume", ToString::to_string(&self.volume).as_str())?;
        }
        if let Some(v) = self.vwap.as_ref() {
            struct_ser.serialize_field("vwap", v)?;
        }
        if let Some(v) = self.trade_count.as_ref() {
            struct_ser.serialize_field("tradeCount", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for Bar {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "symbol",
            "timestamp",
            "timeframe_minutes",
            "timeframeMinutes",
            "open",
            "high",
            "low",
            "close",
            "volume",
            "vwap",
            "trade_count",
            "tradeCount",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Symbol,
            Timestamp,
            TimeframeMinutes,
            Open,
            High,
            Low,
            Close,
            Volume,
            Vwap,
            TradeCount,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "symbol" => Ok(GeneratedField::Symbol),
                            "timestamp" => Ok(GeneratedField::Timestamp),
                            "timeframeMinutes" | "timeframe_minutes" => Ok(GeneratedField::TimeframeMinutes),
                            "open" => Ok(GeneratedField::Open),
                            "high" => Ok(GeneratedField::High),
                            "low" => Ok(GeneratedField::Low),
                            "close" => Ok(GeneratedField::Close),
                            "volume" => Ok(GeneratedField::Volume),
                            "vwap" => Ok(GeneratedField::Vwap),
                            "tradeCount" | "trade_count" => Ok(GeneratedField::TradeCount),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = Bar;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.Bar")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<Bar, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut symbol__ = None;
                let mut timestamp__ = None;
                let mut timeframe_minutes__ = None;
                let mut open__ = None;
                let mut high__ = None;
                let mut low__ = None;
                let mut close__ = None;
                let mut volume__ = None;
                let mut vwap__ = None;
                let mut trade_count__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Symbol => {
                            if symbol__.is_some() {
                                return Err(serde::de::Error::duplicate_field("symbol"));
                            }
                            symbol__ = Some(map_.next_value()?);
                        }
                        GeneratedField::Timestamp => {
                            if timestamp__.is_some() {
                                return Err(serde::de::Error::duplicate_field("timestamp"));
                            }
                            timestamp__ = map_.next_value()?;
                        }
                        GeneratedField::TimeframeMinutes => {
                            if timeframe_minutes__.is_some() {
                                return Err(serde::de::Error::duplicate_field("timeframeMinutes"));
                            }
                            timeframe_minutes__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::Open => {
                            if open__.is_some() {
                                return Err(serde::de::Error::duplicate_field("open"));
                            }
                            open__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::High => {
                            if high__.is_some() {
                                return Err(serde::de::Error::duplicate_field("high"));
                            }
                            high__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::Low => {
                            if low__.is_some() {
                                return Err(serde::de::Error::duplicate_field("low"));
                            }
                            low__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::Close => {
                            if close__.is_some() {
                                return Err(serde::de::Error::duplicate_field("close"));
                            }
                            close__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::Volume => {
                            if volume__.is_some() {
                                return Err(serde::de::Error::duplicate_field("volume"));
                            }
                            volume__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::Vwap => {
                            if vwap__.is_some() {
                                return Err(serde::de::Error::duplicate_field("vwap"));
                            }
                            vwap__ = 
                                map_.next_value::<::std::option::Option<::pbjson::private::NumberDeserialize<_>>>()?.map(|x| x.0)
                            ;
                        }
                        GeneratedField::TradeCount => {
                            if trade_count__.is_some() {
                                return Err(serde::de::Error::duplicate_field("tradeCount"));
                            }
                            trade_count__ = 
                                map_.next_value::<::std::option::Option<::pbjson::private::NumberDeserialize<_>>>()?.map(|x| x.0)
                            ;
                        }
                    }
                }
                Ok(Bar {
                    symbol: symbol__.unwrap_or_default(),
                    timestamp: timestamp__,
                    timeframe_minutes: timeframe_minutes__.unwrap_or_default(),
                    open: open__.unwrap_or_default(),
                    high: high__.unwrap_or_default(),
                    low: low__.unwrap_or_default(),
                    close: close__.unwrap_or_default(),
                    volume: volume__.unwrap_or_default(),
                    vwap: vwap__,
                    trade_count: trade_count__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.Bar", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for CheckConstraintsRequest {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.decision_plan.is_some() {
            len += 1;
        }
        if self.account_state.is_some() {
            len += 1;
        }
        if !self.positions.is_empty() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.CheckConstraintsRequest", len)?;
        if let Some(v) = self.decision_plan.as_ref() {
            struct_ser.serialize_field("decisionPlan", v)?;
        }
        if let Some(v) = self.account_state.as_ref() {
            struct_ser.serialize_field("accountState", v)?;
        }
        if !self.positions.is_empty() {
            struct_ser.serialize_field("positions", &self.positions)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for CheckConstraintsRequest {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "decision_plan",
            "decisionPlan",
            "account_state",
            "accountState",
            "positions",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            DecisionPlan,
            AccountState,
            Positions,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "decisionPlan" | "decision_plan" => Ok(GeneratedField::DecisionPlan),
                            "accountState" | "account_state" => Ok(GeneratedField::AccountState),
                            "positions" => Ok(GeneratedField::Positions),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = CheckConstraintsRequest;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.CheckConstraintsRequest")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<CheckConstraintsRequest, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut decision_plan__ = None;
                let mut account_state__ = None;
                let mut positions__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::DecisionPlan => {
                            if decision_plan__.is_some() {
                                return Err(serde::de::Error::duplicate_field("decisionPlan"));
                            }
                            decision_plan__ = map_.next_value()?;
                        }
                        GeneratedField::AccountState => {
                            if account_state__.is_some() {
                                return Err(serde::de::Error::duplicate_field("accountState"));
                            }
                            account_state__ = map_.next_value()?;
                        }
                        GeneratedField::Positions => {
                            if positions__.is_some() {
                                return Err(serde::de::Error::duplicate_field("positions"));
                            }
                            positions__ = Some(map_.next_value()?);
                        }
                    }
                }
                Ok(CheckConstraintsRequest {
                    decision_plan: decision_plan__,
                    account_state: account_state__,
                    positions: positions__.unwrap_or_default(),
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.CheckConstraintsRequest", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for CheckConstraintsResponse {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.approved {
            len += 1;
        }
        if !self.checks.is_empty() {
            len += 1;
        }
        if self.validated_at.is_some() {
            len += 1;
        }
        if self.rejection_reason.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.CheckConstraintsResponse", len)?;
        if self.approved {
            struct_ser.serialize_field("approved", &self.approved)?;
        }
        if !self.checks.is_empty() {
            struct_ser.serialize_field("checks", &self.checks)?;
        }
        if let Some(v) = self.validated_at.as_ref() {
            struct_ser.serialize_field("validatedAt", v)?;
        }
        if let Some(v) = self.rejection_reason.as_ref() {
            struct_ser.serialize_field("rejectionReason", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for CheckConstraintsResponse {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "approved",
            "checks",
            "validated_at",
            "validatedAt",
            "rejection_reason",
            "rejectionReason",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Approved,
            Checks,
            ValidatedAt,
            RejectionReason,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "approved" => Ok(GeneratedField::Approved),
                            "checks" => Ok(GeneratedField::Checks),
                            "validatedAt" | "validated_at" => Ok(GeneratedField::ValidatedAt),
                            "rejectionReason" | "rejection_reason" => Ok(GeneratedField::RejectionReason),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = CheckConstraintsResponse;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.CheckConstraintsResponse")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<CheckConstraintsResponse, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut approved__ = None;
                let mut checks__ = None;
                let mut validated_at__ = None;
                let mut rejection_reason__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Approved => {
                            if approved__.is_some() {
                                return Err(serde::de::Error::duplicate_field("approved"));
                            }
                            approved__ = Some(map_.next_value()?);
                        }
                        GeneratedField::Checks => {
                            if checks__.is_some() {
                                return Err(serde::de::Error::duplicate_field("checks"));
                            }
                            checks__ = Some(map_.next_value()?);
                        }
                        GeneratedField::ValidatedAt => {
                            if validated_at__.is_some() {
                                return Err(serde::de::Error::duplicate_field("validatedAt"));
                            }
                            validated_at__ = map_.next_value()?;
                        }
                        GeneratedField::RejectionReason => {
                            if rejection_reason__.is_some() {
                                return Err(serde::de::Error::duplicate_field("rejectionReason"));
                            }
                            rejection_reason__ = map_.next_value()?;
                        }
                    }
                }
                Ok(CheckConstraintsResponse {
                    approved: approved__.unwrap_or_default(),
                    checks: checks__.unwrap_or_default(),
                    validated_at: validated_at__,
                    rejection_reason: rejection_reason__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.CheckConstraintsResponse", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for ConstraintCheck {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if !self.name.is_empty() {
            len += 1;
        }
        if self.result != 0 {
            len += 1;
        }
        if !self.description.is_empty() {
            len += 1;
        }
        if self.actual_value.is_some() {
            len += 1;
        }
        if self.threshold.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.ConstraintCheck", len)?;
        if !self.name.is_empty() {
            struct_ser.serialize_field("name", &self.name)?;
        }
        if self.result != 0 {
            let v = ConstraintResult::try_from(self.result)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.result)))?;
            struct_ser.serialize_field("result", &v)?;
        }
        if !self.description.is_empty() {
            struct_ser.serialize_field("description", &self.description)?;
        }
        if let Some(v) = self.actual_value.as_ref() {
            struct_ser.serialize_field("actualValue", v)?;
        }
        if let Some(v) = self.threshold.as_ref() {
            struct_ser.serialize_field("threshold", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for ConstraintCheck {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "name",
            "result",
            "description",
            "actual_value",
            "actualValue",
            "threshold",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Name,
            Result,
            Description,
            ActualValue,
            Threshold,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "name" => Ok(GeneratedField::Name),
                            "result" => Ok(GeneratedField::Result),
                            "description" => Ok(GeneratedField::Description),
                            "actualValue" | "actual_value" => Ok(GeneratedField::ActualValue),
                            "threshold" => Ok(GeneratedField::Threshold),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = ConstraintCheck;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.ConstraintCheck")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<ConstraintCheck, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut name__ = None;
                let mut result__ = None;
                let mut description__ = None;
                let mut actual_value__ = None;
                let mut threshold__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Name => {
                            if name__.is_some() {
                                return Err(serde::de::Error::duplicate_field("name"));
                            }
                            name__ = Some(map_.next_value()?);
                        }
                        GeneratedField::Result => {
                            if result__.is_some() {
                                return Err(serde::de::Error::duplicate_field("result"));
                            }
                            result__ = Some(map_.next_value::<ConstraintResult>()? as i32);
                        }
                        GeneratedField::Description => {
                            if description__.is_some() {
                                return Err(serde::de::Error::duplicate_field("description"));
                            }
                            description__ = Some(map_.next_value()?);
                        }
                        GeneratedField::ActualValue => {
                            if actual_value__.is_some() {
                                return Err(serde::de::Error::duplicate_field("actualValue"));
                            }
                            actual_value__ = 
                                map_.next_value::<::std::option::Option<::pbjson::private::NumberDeserialize<_>>>()?.map(|x| x.0)
                            ;
                        }
                        GeneratedField::Threshold => {
                            if threshold__.is_some() {
                                return Err(serde::de::Error::duplicate_field("threshold"));
                            }
                            threshold__ = 
                                map_.next_value::<::std::option::Option<::pbjson::private::NumberDeserialize<_>>>()?.map(|x| x.0)
                            ;
                        }
                    }
                }
                Ok(ConstraintCheck {
                    name: name__.unwrap_or_default(),
                    result: result__.unwrap_or_default(),
                    description: description__.unwrap_or_default(),
                    actual_value: actual_value__,
                    threshold: threshold__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.ConstraintCheck", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for ConstraintResult {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let variant = match self {
            Self::Unspecified => "CONSTRAINT_RESULT_UNSPECIFIED",
            Self::Pass => "CONSTRAINT_RESULT_PASS",
            Self::Fail => "CONSTRAINT_RESULT_FAIL",
            Self::Warn => "CONSTRAINT_RESULT_WARN",
        };
        serializer.serialize_str(variant)
    }
}
impl<'de> serde::Deserialize<'de> for ConstraintResult {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "CONSTRAINT_RESULT_UNSPECIFIED",
            "CONSTRAINT_RESULT_PASS",
            "CONSTRAINT_RESULT_FAIL",
            "CONSTRAINT_RESULT_WARN",
        ];

        struct GeneratedVisitor;

        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = ConstraintResult;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(formatter, "expected one of: {:?}", &FIELDS)
            }

            fn visit_i64<E>(self, v: i64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Signed(v), &self)
                    })
            }

            fn visit_u64<E>(self, v: u64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Unsigned(v), &self)
                    })
            }

            fn visit_str<E>(self, value: &str) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                match value {
                    "CONSTRAINT_RESULT_UNSPECIFIED" => Ok(ConstraintResult::Unspecified),
                    "CONSTRAINT_RESULT_PASS" => Ok(ConstraintResult::Pass),
                    "CONSTRAINT_RESULT_FAIL" => Ok(ConstraintResult::Fail),
                    "CONSTRAINT_RESULT_WARN" => Ok(ConstraintResult::Warn),
                    _ => Err(serde::de::Error::unknown_variant(value, FIELDS)),
                }
            }
        }
        deserializer.deserialize_any(GeneratedVisitor)
    }
}
impl serde::Serialize for Decision {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.instrument.is_some() {
            len += 1;
        }
        if self.action != 0 {
            len += 1;
        }
        if self.size.is_some() {
            len += 1;
        }
        if self.order_plan.is_some() {
            len += 1;
        }
        if self.risk_levels.is_some() {
            len += 1;
        }
        if self.strategy_family != 0 {
            len += 1;
        }
        if !self.rationale.is_empty() {
            len += 1;
        }
        if self.confidence != 0. {
            len += 1;
        }
        if self.references.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.Decision", len)?;
        if let Some(v) = self.instrument.as_ref() {
            struct_ser.serialize_field("instrument", v)?;
        }
        if self.action != 0 {
            let v = Action::try_from(self.action)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.action)))?;
            struct_ser.serialize_field("action", &v)?;
        }
        if let Some(v) = self.size.as_ref() {
            struct_ser.serialize_field("size", v)?;
        }
        if let Some(v) = self.order_plan.as_ref() {
            struct_ser.serialize_field("orderPlan", v)?;
        }
        if let Some(v) = self.risk_levels.as_ref() {
            struct_ser.serialize_field("riskLevels", v)?;
        }
        if self.strategy_family != 0 {
            let v = StrategyFamily::try_from(self.strategy_family)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.strategy_family)))?;
            struct_ser.serialize_field("strategyFamily", &v)?;
        }
        if !self.rationale.is_empty() {
            struct_ser.serialize_field("rationale", &self.rationale)?;
        }
        if self.confidence != 0. {
            struct_ser.serialize_field("confidence", &self.confidence)?;
        }
        if let Some(v) = self.references.as_ref() {
            struct_ser.serialize_field("references", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for Decision {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "instrument",
            "action",
            "size",
            "order_plan",
            "orderPlan",
            "risk_levels",
            "riskLevels",
            "strategy_family",
            "strategyFamily",
            "rationale",
            "confidence",
            "references",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Instrument,
            Action,
            Size,
            OrderPlan,
            RiskLevels,
            StrategyFamily,
            Rationale,
            Confidence,
            References,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "instrument" => Ok(GeneratedField::Instrument),
                            "action" => Ok(GeneratedField::Action),
                            "size" => Ok(GeneratedField::Size),
                            "orderPlan" | "order_plan" => Ok(GeneratedField::OrderPlan),
                            "riskLevels" | "risk_levels" => Ok(GeneratedField::RiskLevels),
                            "strategyFamily" | "strategy_family" => Ok(GeneratedField::StrategyFamily),
                            "rationale" => Ok(GeneratedField::Rationale),
                            "confidence" => Ok(GeneratedField::Confidence),
                            "references" => Ok(GeneratedField::References),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = Decision;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.Decision")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<Decision, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut instrument__ = None;
                let mut action__ = None;
                let mut size__ = None;
                let mut order_plan__ = None;
                let mut risk_levels__ = None;
                let mut strategy_family__ = None;
                let mut rationale__ = None;
                let mut confidence__ = None;
                let mut references__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Instrument => {
                            if instrument__.is_some() {
                                return Err(serde::de::Error::duplicate_field("instrument"));
                            }
                            instrument__ = map_.next_value()?;
                        }
                        GeneratedField::Action => {
                            if action__.is_some() {
                                return Err(serde::de::Error::duplicate_field("action"));
                            }
                            action__ = Some(map_.next_value::<Action>()? as i32);
                        }
                        GeneratedField::Size => {
                            if size__.is_some() {
                                return Err(serde::de::Error::duplicate_field("size"));
                            }
                            size__ = map_.next_value()?;
                        }
                        GeneratedField::OrderPlan => {
                            if order_plan__.is_some() {
                                return Err(serde::de::Error::duplicate_field("orderPlan"));
                            }
                            order_plan__ = map_.next_value()?;
                        }
                        GeneratedField::RiskLevels => {
                            if risk_levels__.is_some() {
                                return Err(serde::de::Error::duplicate_field("riskLevels"));
                            }
                            risk_levels__ = map_.next_value()?;
                        }
                        GeneratedField::StrategyFamily => {
                            if strategy_family__.is_some() {
                                return Err(serde::de::Error::duplicate_field("strategyFamily"));
                            }
                            strategy_family__ = Some(map_.next_value::<StrategyFamily>()? as i32);
                        }
                        GeneratedField::Rationale => {
                            if rationale__.is_some() {
                                return Err(serde::de::Error::duplicate_field("rationale"));
                            }
                            rationale__ = Some(map_.next_value()?);
                        }
                        GeneratedField::Confidence => {
                            if confidence__.is_some() {
                                return Err(serde::de::Error::duplicate_field("confidence"));
                            }
                            confidence__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::References => {
                            if references__.is_some() {
                                return Err(serde::de::Error::duplicate_field("references"));
                            }
                            references__ = map_.next_value()?;
                        }
                    }
                }
                Ok(Decision {
                    instrument: instrument__,
                    action: action__.unwrap_or_default(),
                    size: size__,
                    order_plan: order_plan__,
                    risk_levels: risk_levels__,
                    strategy_family: strategy_family__.unwrap_or_default(),
                    rationale: rationale__.unwrap_or_default(),
                    confidence: confidence__.unwrap_or_default(),
                    references: references__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.Decision", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for DecisionPlan {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if !self.cycle_id.is_empty() {
            len += 1;
        }
        if self.as_of_timestamp.is_some() {
            len += 1;
        }
        if self.environment != 0 {
            len += 1;
        }
        if !self.decisions.is_empty() {
            len += 1;
        }
        if self.portfolio_notes.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.DecisionPlan", len)?;
        if !self.cycle_id.is_empty() {
            struct_ser.serialize_field("cycleId", &self.cycle_id)?;
        }
        if let Some(v) = self.as_of_timestamp.as_ref() {
            struct_ser.serialize_field("asOfTimestamp", v)?;
        }
        if self.environment != 0 {
            let v = Environment::try_from(self.environment)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.environment)))?;
            struct_ser.serialize_field("environment", &v)?;
        }
        if !self.decisions.is_empty() {
            struct_ser.serialize_field("decisions", &self.decisions)?;
        }
        if let Some(v) = self.portfolio_notes.as_ref() {
            struct_ser.serialize_field("portfolioNotes", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for DecisionPlan {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "cycle_id",
            "cycleId",
            "as_of_timestamp",
            "asOfTimestamp",
            "environment",
            "decisions",
            "portfolio_notes",
            "portfolioNotes",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            CycleId,
            AsOfTimestamp,
            Environment,
            Decisions,
            PortfolioNotes,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "cycleId" | "cycle_id" => Ok(GeneratedField::CycleId),
                            "asOfTimestamp" | "as_of_timestamp" => Ok(GeneratedField::AsOfTimestamp),
                            "environment" => Ok(GeneratedField::Environment),
                            "decisions" => Ok(GeneratedField::Decisions),
                            "portfolioNotes" | "portfolio_notes" => Ok(GeneratedField::PortfolioNotes),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = DecisionPlan;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.DecisionPlan")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<DecisionPlan, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut cycle_id__ = None;
                let mut as_of_timestamp__ = None;
                let mut environment__ = None;
                let mut decisions__ = None;
                let mut portfolio_notes__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::CycleId => {
                            if cycle_id__.is_some() {
                                return Err(serde::de::Error::duplicate_field("cycleId"));
                            }
                            cycle_id__ = Some(map_.next_value()?);
                        }
                        GeneratedField::AsOfTimestamp => {
                            if as_of_timestamp__.is_some() {
                                return Err(serde::de::Error::duplicate_field("asOfTimestamp"));
                            }
                            as_of_timestamp__ = map_.next_value()?;
                        }
                        GeneratedField::Environment => {
                            if environment__.is_some() {
                                return Err(serde::de::Error::duplicate_field("environment"));
                            }
                            environment__ = Some(map_.next_value::<Environment>()? as i32);
                        }
                        GeneratedField::Decisions => {
                            if decisions__.is_some() {
                                return Err(serde::de::Error::duplicate_field("decisions"));
                            }
                            decisions__ = Some(map_.next_value()?);
                        }
                        GeneratedField::PortfolioNotes => {
                            if portfolio_notes__.is_some() {
                                return Err(serde::de::Error::duplicate_field("portfolioNotes"));
                            }
                            portfolio_notes__ = map_.next_value()?;
                        }
                    }
                }
                Ok(DecisionPlan {
                    cycle_id: cycle_id__.unwrap_or_default(),
                    as_of_timestamp: as_of_timestamp__,
                    environment: environment__.unwrap_or_default(),
                    decisions: decisions__.unwrap_or_default(),
                    portfolio_notes: portfolio_notes__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.DecisionPlan", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for DecisionPlanValidationResult {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.success {
            len += 1;
        }
        if self.decision_plan.is_some() {
            len += 1;
        }
        if !self.errors.is_empty() {
            len += 1;
        }
        if !self.warnings.is_empty() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.DecisionPlanValidationResult", len)?;
        if self.success {
            struct_ser.serialize_field("success", &self.success)?;
        }
        if let Some(v) = self.decision_plan.as_ref() {
            struct_ser.serialize_field("decisionPlan", v)?;
        }
        if !self.errors.is_empty() {
            struct_ser.serialize_field("errors", &self.errors)?;
        }
        if !self.warnings.is_empty() {
            struct_ser.serialize_field("warnings", &self.warnings)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for DecisionPlanValidationResult {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "success",
            "decision_plan",
            "decisionPlan",
            "errors",
            "warnings",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Success,
            DecisionPlan,
            Errors,
            Warnings,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "success" => Ok(GeneratedField::Success),
                            "decisionPlan" | "decision_plan" => Ok(GeneratedField::DecisionPlan),
                            "errors" => Ok(GeneratedField::Errors),
                            "warnings" => Ok(GeneratedField::Warnings),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = DecisionPlanValidationResult;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.DecisionPlanValidationResult")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<DecisionPlanValidationResult, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut success__ = None;
                let mut decision_plan__ = None;
                let mut errors__ = None;
                let mut warnings__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Success => {
                            if success__.is_some() {
                                return Err(serde::de::Error::duplicate_field("success"));
                            }
                            success__ = Some(map_.next_value()?);
                        }
                        GeneratedField::DecisionPlan => {
                            if decision_plan__.is_some() {
                                return Err(serde::de::Error::duplicate_field("decisionPlan"));
                            }
                            decision_plan__ = map_.next_value()?;
                        }
                        GeneratedField::Errors => {
                            if errors__.is_some() {
                                return Err(serde::de::Error::duplicate_field("errors"));
                            }
                            errors__ = Some(map_.next_value()?);
                        }
                        GeneratedField::Warnings => {
                            if warnings__.is_some() {
                                return Err(serde::de::Error::duplicate_field("warnings"));
                            }
                            warnings__ = Some(map_.next_value()?);
                        }
                    }
                }
                Ok(DecisionPlanValidationResult {
                    success: success__.unwrap_or_default(),
                    decision_plan: decision_plan__,
                    errors: errors__.unwrap_or_default(),
                    warnings: warnings__.unwrap_or_default(),
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.DecisionPlanValidationResult", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for Direction {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let variant = match self {
            Self::Unspecified => "DIRECTION_UNSPECIFIED",
            Self::Long => "DIRECTION_LONG",
            Self::Short => "DIRECTION_SHORT",
            Self::Flat => "DIRECTION_FLAT",
        };
        serializer.serialize_str(variant)
    }
}
impl<'de> serde::Deserialize<'de> for Direction {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "DIRECTION_UNSPECIFIED",
            "DIRECTION_LONG",
            "DIRECTION_SHORT",
            "DIRECTION_FLAT",
        ];

        struct GeneratedVisitor;

        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = Direction;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(formatter, "expected one of: {:?}", &FIELDS)
            }

            fn visit_i64<E>(self, v: i64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Signed(v), &self)
                    })
            }

            fn visit_u64<E>(self, v: u64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Unsigned(v), &self)
                    })
            }

            fn visit_str<E>(self, value: &str) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                match value {
                    "DIRECTION_UNSPECIFIED" => Ok(Direction::Unspecified),
                    "DIRECTION_LONG" => Ok(Direction::Long),
                    "DIRECTION_SHORT" => Ok(Direction::Short),
                    "DIRECTION_FLAT" => Ok(Direction::Flat),
                    _ => Err(serde::de::Error::unknown_variant(value, FIELDS)),
                }
            }
        }
        deserializer.deserialize_any(GeneratedVisitor)
    }
}
impl serde::Serialize for Environment {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let variant = match self {
            Self::Unspecified => "ENVIRONMENT_UNSPECIFIED",
            Self::Backtest => "ENVIRONMENT_BACKTEST",
            Self::Paper => "ENVIRONMENT_PAPER",
            Self::Live => "ENVIRONMENT_LIVE",
        };
        serializer.serialize_str(variant)
    }
}
impl<'de> serde::Deserialize<'de> for Environment {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "ENVIRONMENT_UNSPECIFIED",
            "ENVIRONMENT_BACKTEST",
            "ENVIRONMENT_PAPER",
            "ENVIRONMENT_LIVE",
        ];

        struct GeneratedVisitor;

        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = Environment;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(formatter, "expected one of: {:?}", &FIELDS)
            }

            fn visit_i64<E>(self, v: i64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Signed(v), &self)
                    })
            }

            fn visit_u64<E>(self, v: u64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Unsigned(v), &self)
                    })
            }

            fn visit_str<E>(self, value: &str) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                match value {
                    "ENVIRONMENT_UNSPECIFIED" => Ok(Environment::Unspecified),
                    "ENVIRONMENT_BACKTEST" => Ok(Environment::Backtest),
                    "ENVIRONMENT_PAPER" => Ok(Environment::Paper),
                    "ENVIRONMENT_LIVE" => Ok(Environment::Live),
                    _ => Err(serde::de::Error::unknown_variant(value, FIELDS)),
                }
            }
        }
        deserializer.deserialize_any(GeneratedVisitor)
    }
}
impl serde::Serialize for ExecutionAck {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if !self.order_id.is_empty() {
            len += 1;
        }
        if !self.client_order_id.is_empty() {
            len += 1;
        }
        if self.status != 0 {
            len += 1;
        }
        if self.filled_quantity != 0 {
            len += 1;
        }
        if self.avg_fill_price != 0. {
            len += 1;
        }
        if self.remaining_quantity != 0 {
            len += 1;
        }
        if self.updated_at.is_some() {
            len += 1;
        }
        if self.commission != 0. {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.ExecutionAck", len)?;
        if !self.order_id.is_empty() {
            struct_ser.serialize_field("orderId", &self.order_id)?;
        }
        if !self.client_order_id.is_empty() {
            struct_ser.serialize_field("clientOrderId", &self.client_order_id)?;
        }
        if self.status != 0 {
            let v = OrderStatus::try_from(self.status)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.status)))?;
            struct_ser.serialize_field("status", &v)?;
        }
        if self.filled_quantity != 0 {
            struct_ser.serialize_field("filledQuantity", &self.filled_quantity)?;
        }
        if self.avg_fill_price != 0. {
            struct_ser.serialize_field("avgFillPrice", &self.avg_fill_price)?;
        }
        if self.remaining_quantity != 0 {
            struct_ser.serialize_field("remainingQuantity", &self.remaining_quantity)?;
        }
        if let Some(v) = self.updated_at.as_ref() {
            struct_ser.serialize_field("updatedAt", v)?;
        }
        if self.commission != 0. {
            struct_ser.serialize_field("commission", &self.commission)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for ExecutionAck {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "order_id",
            "orderId",
            "client_order_id",
            "clientOrderId",
            "status",
            "filled_quantity",
            "filledQuantity",
            "avg_fill_price",
            "avgFillPrice",
            "remaining_quantity",
            "remainingQuantity",
            "updated_at",
            "updatedAt",
            "commission",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            OrderId,
            ClientOrderId,
            Status,
            FilledQuantity,
            AvgFillPrice,
            RemainingQuantity,
            UpdatedAt,
            Commission,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "orderId" | "order_id" => Ok(GeneratedField::OrderId),
                            "clientOrderId" | "client_order_id" => Ok(GeneratedField::ClientOrderId),
                            "status" => Ok(GeneratedField::Status),
                            "filledQuantity" | "filled_quantity" => Ok(GeneratedField::FilledQuantity),
                            "avgFillPrice" | "avg_fill_price" => Ok(GeneratedField::AvgFillPrice),
                            "remainingQuantity" | "remaining_quantity" => Ok(GeneratedField::RemainingQuantity),
                            "updatedAt" | "updated_at" => Ok(GeneratedField::UpdatedAt),
                            "commission" => Ok(GeneratedField::Commission),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = ExecutionAck;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.ExecutionAck")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<ExecutionAck, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut order_id__ = None;
                let mut client_order_id__ = None;
                let mut status__ = None;
                let mut filled_quantity__ = None;
                let mut avg_fill_price__ = None;
                let mut remaining_quantity__ = None;
                let mut updated_at__ = None;
                let mut commission__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::OrderId => {
                            if order_id__.is_some() {
                                return Err(serde::de::Error::duplicate_field("orderId"));
                            }
                            order_id__ = Some(map_.next_value()?);
                        }
                        GeneratedField::ClientOrderId => {
                            if client_order_id__.is_some() {
                                return Err(serde::de::Error::duplicate_field("clientOrderId"));
                            }
                            client_order_id__ = Some(map_.next_value()?);
                        }
                        GeneratedField::Status => {
                            if status__.is_some() {
                                return Err(serde::de::Error::duplicate_field("status"));
                            }
                            status__ = Some(map_.next_value::<OrderStatus>()? as i32);
                        }
                        GeneratedField::FilledQuantity => {
                            if filled_quantity__.is_some() {
                                return Err(serde::de::Error::duplicate_field("filledQuantity"));
                            }
                            filled_quantity__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::AvgFillPrice => {
                            if avg_fill_price__.is_some() {
                                return Err(serde::de::Error::duplicate_field("avgFillPrice"));
                            }
                            avg_fill_price__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::RemainingQuantity => {
                            if remaining_quantity__.is_some() {
                                return Err(serde::de::Error::duplicate_field("remainingQuantity"));
                            }
                            remaining_quantity__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::UpdatedAt => {
                            if updated_at__.is_some() {
                                return Err(serde::de::Error::duplicate_field("updatedAt"));
                            }
                            updated_at__ = map_.next_value()?;
                        }
                        GeneratedField::Commission => {
                            if commission__.is_some() {
                                return Err(serde::de::Error::duplicate_field("commission"));
                            }
                            commission__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                    }
                }
                Ok(ExecutionAck {
                    order_id: order_id__.unwrap_or_default(),
                    client_order_id: client_order_id__.unwrap_or_default(),
                    status: status__.unwrap_or_default(),
                    filled_quantity: filled_quantity__.unwrap_or_default(),
                    avg_fill_price: avg_fill_price__.unwrap_or_default(),
                    remaining_quantity: remaining_quantity__.unwrap_or_default(),
                    updated_at: updated_at__,
                    commission: commission__.unwrap_or_default(),
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.ExecutionAck", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for GetAccountStateRequest {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.account_id.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.GetAccountStateRequest", len)?;
        if let Some(v) = self.account_id.as_ref() {
            struct_ser.serialize_field("accountId", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for GetAccountStateRequest {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "account_id",
            "accountId",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            AccountId,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "accountId" | "account_id" => Ok(GeneratedField::AccountId),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = GetAccountStateRequest;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.GetAccountStateRequest")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<GetAccountStateRequest, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut account_id__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::AccountId => {
                            if account_id__.is_some() {
                                return Err(serde::de::Error::duplicate_field("accountId"));
                            }
                            account_id__ = map_.next_value()?;
                        }
                    }
                }
                Ok(GetAccountStateRequest {
                    account_id: account_id__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.GetAccountStateRequest", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for GetAccountStateResponse {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.account_state.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.GetAccountStateResponse", len)?;
        if let Some(v) = self.account_state.as_ref() {
            struct_ser.serialize_field("accountState", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for GetAccountStateResponse {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "account_state",
            "accountState",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            AccountState,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "accountState" | "account_state" => Ok(GeneratedField::AccountState),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = GetAccountStateResponse;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.GetAccountStateResponse")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<GetAccountStateResponse, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut account_state__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::AccountState => {
                            if account_state__.is_some() {
                                return Err(serde::de::Error::duplicate_field("accountState"));
                            }
                            account_state__ = map_.next_value()?;
                        }
                    }
                }
                Ok(GetAccountStateResponse {
                    account_state: account_state__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.GetAccountStateResponse", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for GetOptionChainRequest {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if !self.underlying.is_empty() {
            len += 1;
        }
        if !self.expirations.is_empty() {
            len += 1;
        }
        if self.min_strike.is_some() {
            len += 1;
        }
        if self.max_strike.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.GetOptionChainRequest", len)?;
        if !self.underlying.is_empty() {
            struct_ser.serialize_field("underlying", &self.underlying)?;
        }
        if !self.expirations.is_empty() {
            struct_ser.serialize_field("expirations", &self.expirations)?;
        }
        if let Some(v) = self.min_strike.as_ref() {
            struct_ser.serialize_field("minStrike", v)?;
        }
        if let Some(v) = self.max_strike.as_ref() {
            struct_ser.serialize_field("maxStrike", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for GetOptionChainRequest {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "underlying",
            "expirations",
            "min_strike",
            "minStrike",
            "max_strike",
            "maxStrike",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Underlying,
            Expirations,
            MinStrike,
            MaxStrike,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "underlying" => Ok(GeneratedField::Underlying),
                            "expirations" => Ok(GeneratedField::Expirations),
                            "minStrike" | "min_strike" => Ok(GeneratedField::MinStrike),
                            "maxStrike" | "max_strike" => Ok(GeneratedField::MaxStrike),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = GetOptionChainRequest;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.GetOptionChainRequest")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<GetOptionChainRequest, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut underlying__ = None;
                let mut expirations__ = None;
                let mut min_strike__ = None;
                let mut max_strike__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Underlying => {
                            if underlying__.is_some() {
                                return Err(serde::de::Error::duplicate_field("underlying"));
                            }
                            underlying__ = Some(map_.next_value()?);
                        }
                        GeneratedField::Expirations => {
                            if expirations__.is_some() {
                                return Err(serde::de::Error::duplicate_field("expirations"));
                            }
                            expirations__ = Some(map_.next_value()?);
                        }
                        GeneratedField::MinStrike => {
                            if min_strike__.is_some() {
                                return Err(serde::de::Error::duplicate_field("minStrike"));
                            }
                            min_strike__ = 
                                map_.next_value::<::std::option::Option<::pbjson::private::NumberDeserialize<_>>>()?.map(|x| x.0)
                            ;
                        }
                        GeneratedField::MaxStrike => {
                            if max_strike__.is_some() {
                                return Err(serde::de::Error::duplicate_field("maxStrike"));
                            }
                            max_strike__ = 
                                map_.next_value::<::std::option::Option<::pbjson::private::NumberDeserialize<_>>>()?.map(|x| x.0)
                            ;
                        }
                    }
                }
                Ok(GetOptionChainRequest {
                    underlying: underlying__.unwrap_or_default(),
                    expirations: expirations__.unwrap_or_default(),
                    min_strike: min_strike__,
                    max_strike: max_strike__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.GetOptionChainRequest", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for GetOptionChainResponse {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.chain.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.GetOptionChainResponse", len)?;
        if let Some(v) = self.chain.as_ref() {
            struct_ser.serialize_field("chain", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for GetOptionChainResponse {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "chain",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Chain,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "chain" => Ok(GeneratedField::Chain),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = GetOptionChainResponse;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.GetOptionChainResponse")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<GetOptionChainResponse, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut chain__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Chain => {
                            if chain__.is_some() {
                                return Err(serde::de::Error::duplicate_field("chain"));
                            }
                            chain__ = map_.next_value()?;
                        }
                    }
                }
                Ok(GetOptionChainResponse {
                    chain: chain__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.GetOptionChainResponse", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for GetPositionsRequest {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.account_id.is_some() {
            len += 1;
        }
        if !self.symbols.is_empty() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.GetPositionsRequest", len)?;
        if let Some(v) = self.account_id.as_ref() {
            struct_ser.serialize_field("accountId", v)?;
        }
        if !self.symbols.is_empty() {
            struct_ser.serialize_field("symbols", &self.symbols)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for GetPositionsRequest {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "account_id",
            "accountId",
            "symbols",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            AccountId,
            Symbols,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "accountId" | "account_id" => Ok(GeneratedField::AccountId),
                            "symbols" => Ok(GeneratedField::Symbols),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = GetPositionsRequest;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.GetPositionsRequest")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<GetPositionsRequest, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut account_id__ = None;
                let mut symbols__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::AccountId => {
                            if account_id__.is_some() {
                                return Err(serde::de::Error::duplicate_field("accountId"));
                            }
                            account_id__ = map_.next_value()?;
                        }
                        GeneratedField::Symbols => {
                            if symbols__.is_some() {
                                return Err(serde::de::Error::duplicate_field("symbols"));
                            }
                            symbols__ = Some(map_.next_value()?);
                        }
                    }
                }
                Ok(GetPositionsRequest {
                    account_id: account_id__,
                    symbols: symbols__.unwrap_or_default(),
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.GetPositionsRequest", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for GetPositionsResponse {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if !self.positions.is_empty() {
            len += 1;
        }
        if self.as_of.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.GetPositionsResponse", len)?;
        if !self.positions.is_empty() {
            struct_ser.serialize_field("positions", &self.positions)?;
        }
        if let Some(v) = self.as_of.as_ref() {
            struct_ser.serialize_field("asOf", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for GetPositionsResponse {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "positions",
            "as_of",
            "asOf",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Positions,
            AsOf,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "positions" => Ok(GeneratedField::Positions),
                            "asOf" | "as_of" => Ok(GeneratedField::AsOf),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = GetPositionsResponse;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.GetPositionsResponse")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<GetPositionsResponse, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut positions__ = None;
                let mut as_of__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Positions => {
                            if positions__.is_some() {
                                return Err(serde::de::Error::duplicate_field("positions"));
                            }
                            positions__ = Some(map_.next_value()?);
                        }
                        GeneratedField::AsOf => {
                            if as_of__.is_some() {
                                return Err(serde::de::Error::duplicate_field("asOf"));
                            }
                            as_of__ = map_.next_value()?;
                        }
                    }
                }
                Ok(GetPositionsResponse {
                    positions: positions__.unwrap_or_default(),
                    as_of: as_of__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.GetPositionsResponse", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for GetSnapshotRequest {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if !self.symbols.is_empty() {
            len += 1;
        }
        if self.include_bars {
            len += 1;
        }
        if !self.bar_timeframes.is_empty() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.GetSnapshotRequest", len)?;
        if !self.symbols.is_empty() {
            struct_ser.serialize_field("symbols", &self.symbols)?;
        }
        if self.include_bars {
            struct_ser.serialize_field("includeBars", &self.include_bars)?;
        }
        if !self.bar_timeframes.is_empty() {
            struct_ser.serialize_field("barTimeframes", &self.bar_timeframes)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for GetSnapshotRequest {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "symbols",
            "include_bars",
            "includeBars",
            "bar_timeframes",
            "barTimeframes",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Symbols,
            IncludeBars,
            BarTimeframes,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "symbols" => Ok(GeneratedField::Symbols),
                            "includeBars" | "include_bars" => Ok(GeneratedField::IncludeBars),
                            "barTimeframes" | "bar_timeframes" => Ok(GeneratedField::BarTimeframes),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = GetSnapshotRequest;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.GetSnapshotRequest")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<GetSnapshotRequest, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut symbols__ = None;
                let mut include_bars__ = None;
                let mut bar_timeframes__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Symbols => {
                            if symbols__.is_some() {
                                return Err(serde::de::Error::duplicate_field("symbols"));
                            }
                            symbols__ = Some(map_.next_value()?);
                        }
                        GeneratedField::IncludeBars => {
                            if include_bars__.is_some() {
                                return Err(serde::de::Error::duplicate_field("includeBars"));
                            }
                            include_bars__ = Some(map_.next_value()?);
                        }
                        GeneratedField::BarTimeframes => {
                            if bar_timeframes__.is_some() {
                                return Err(serde::de::Error::duplicate_field("barTimeframes"));
                            }
                            bar_timeframes__ = 
                                Some(map_.next_value::<Vec<::pbjson::private::NumberDeserialize<_>>>()?
                                    .into_iter().map(|x| x.0).collect())
                            ;
                        }
                    }
                }
                Ok(GetSnapshotRequest {
                    symbols: symbols__.unwrap_or_default(),
                    include_bars: include_bars__.unwrap_or_default(),
                    bar_timeframes: bar_timeframes__.unwrap_or_default(),
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.GetSnapshotRequest", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for GetSnapshotResponse {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.snapshot.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.GetSnapshotResponse", len)?;
        if let Some(v) = self.snapshot.as_ref() {
            struct_ser.serialize_field("snapshot", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for GetSnapshotResponse {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "snapshot",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Snapshot,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "snapshot" => Ok(GeneratedField::Snapshot),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = GetSnapshotResponse;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.GetSnapshotResponse")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<GetSnapshotResponse, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut snapshot__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Snapshot => {
                            if snapshot__.is_some() {
                                return Err(serde::de::Error::duplicate_field("snapshot"));
                            }
                            snapshot__ = map_.next_value()?;
                        }
                    }
                }
                Ok(GetSnapshotResponse {
                    snapshot: snapshot__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.GetSnapshotResponse", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for Instrument {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if !self.instrument_id.is_empty() {
            len += 1;
        }
        if self.instrument_type != 0 {
            len += 1;
        }
        if self.option_contract.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.Instrument", len)?;
        if !self.instrument_id.is_empty() {
            struct_ser.serialize_field("instrumentId", &self.instrument_id)?;
        }
        if self.instrument_type != 0 {
            let v = InstrumentType::try_from(self.instrument_type)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.instrument_type)))?;
            struct_ser.serialize_field("instrumentType", &v)?;
        }
        if let Some(v) = self.option_contract.as_ref() {
            struct_ser.serialize_field("optionContract", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for Instrument {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "instrument_id",
            "instrumentId",
            "instrument_type",
            "instrumentType",
            "option_contract",
            "optionContract",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            InstrumentId,
            InstrumentType,
            OptionContract,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "instrumentId" | "instrument_id" => Ok(GeneratedField::InstrumentId),
                            "instrumentType" | "instrument_type" => Ok(GeneratedField::InstrumentType),
                            "optionContract" | "option_contract" => Ok(GeneratedField::OptionContract),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = Instrument;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.Instrument")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<Instrument, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut instrument_id__ = None;
                let mut instrument_type__ = None;
                let mut option_contract__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::InstrumentId => {
                            if instrument_id__.is_some() {
                                return Err(serde::de::Error::duplicate_field("instrumentId"));
                            }
                            instrument_id__ = Some(map_.next_value()?);
                        }
                        GeneratedField::InstrumentType => {
                            if instrument_type__.is_some() {
                                return Err(serde::de::Error::duplicate_field("instrumentType"));
                            }
                            instrument_type__ = Some(map_.next_value::<InstrumentType>()? as i32);
                        }
                        GeneratedField::OptionContract => {
                            if option_contract__.is_some() {
                                return Err(serde::de::Error::duplicate_field("optionContract"));
                            }
                            option_contract__ = map_.next_value()?;
                        }
                    }
                }
                Ok(Instrument {
                    instrument_id: instrument_id__.unwrap_or_default(),
                    instrument_type: instrument_type__.unwrap_or_default(),
                    option_contract: option_contract__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.Instrument", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for InstrumentType {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let variant = match self {
            Self::Unspecified => "INSTRUMENT_TYPE_UNSPECIFIED",
            Self::Equity => "INSTRUMENT_TYPE_EQUITY",
            Self::Option => "INSTRUMENT_TYPE_OPTION",
        };
        serializer.serialize_str(variant)
    }
}
impl<'de> serde::Deserialize<'de> for InstrumentType {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "INSTRUMENT_TYPE_UNSPECIFIED",
            "INSTRUMENT_TYPE_EQUITY",
            "INSTRUMENT_TYPE_OPTION",
        ];

        struct GeneratedVisitor;

        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = InstrumentType;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(formatter, "expected one of: {:?}", &FIELDS)
            }

            fn visit_i64<E>(self, v: i64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Signed(v), &self)
                    })
            }

            fn visit_u64<E>(self, v: u64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Unsigned(v), &self)
                    })
            }

            fn visit_str<E>(self, value: &str) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                match value {
                    "INSTRUMENT_TYPE_UNSPECIFIED" => Ok(InstrumentType::Unspecified),
                    "INSTRUMENT_TYPE_EQUITY" => Ok(InstrumentType::Equity),
                    "INSTRUMENT_TYPE_OPTION" => Ok(InstrumentType::Option),
                    _ => Err(serde::de::Error::unknown_variant(value, FIELDS)),
                }
            }
        }
        deserializer.deserialize_any(GeneratedVisitor)
    }
}
impl serde::Serialize for MarketSnapshot {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.environment != 0 {
            len += 1;
        }
        if self.as_of.is_some() {
            len += 1;
        }
        if self.market_status != 0 {
            len += 1;
        }
        if self.regime != 0 {
            len += 1;
        }
        if !self.symbols.is_empty() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.MarketSnapshot", len)?;
        if self.environment != 0 {
            let v = Environment::try_from(self.environment)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.environment)))?;
            struct_ser.serialize_field("environment", &v)?;
        }
        if let Some(v) = self.as_of.as_ref() {
            struct_ser.serialize_field("asOf", v)?;
        }
        if self.market_status != 0 {
            let v = MarketStatus::try_from(self.market_status)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.market_status)))?;
            struct_ser.serialize_field("marketStatus", &v)?;
        }
        if self.regime != 0 {
            let v = Regime::try_from(self.regime)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.regime)))?;
            struct_ser.serialize_field("regime", &v)?;
        }
        if !self.symbols.is_empty() {
            struct_ser.serialize_field("symbols", &self.symbols)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for MarketSnapshot {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "environment",
            "as_of",
            "asOf",
            "market_status",
            "marketStatus",
            "regime",
            "symbols",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Environment,
            AsOf,
            MarketStatus,
            Regime,
            Symbols,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "environment" => Ok(GeneratedField::Environment),
                            "asOf" | "as_of" => Ok(GeneratedField::AsOf),
                            "marketStatus" | "market_status" => Ok(GeneratedField::MarketStatus),
                            "regime" => Ok(GeneratedField::Regime),
                            "symbols" => Ok(GeneratedField::Symbols),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = MarketSnapshot;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.MarketSnapshot")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<MarketSnapshot, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut environment__ = None;
                let mut as_of__ = None;
                let mut market_status__ = None;
                let mut regime__ = None;
                let mut symbols__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Environment => {
                            if environment__.is_some() {
                                return Err(serde::de::Error::duplicate_field("environment"));
                            }
                            environment__ = Some(map_.next_value::<Environment>()? as i32);
                        }
                        GeneratedField::AsOf => {
                            if as_of__.is_some() {
                                return Err(serde::de::Error::duplicate_field("asOf"));
                            }
                            as_of__ = map_.next_value()?;
                        }
                        GeneratedField::MarketStatus => {
                            if market_status__.is_some() {
                                return Err(serde::de::Error::duplicate_field("marketStatus"));
                            }
                            market_status__ = Some(map_.next_value::<MarketStatus>()? as i32);
                        }
                        GeneratedField::Regime => {
                            if regime__.is_some() {
                                return Err(serde::de::Error::duplicate_field("regime"));
                            }
                            regime__ = Some(map_.next_value::<Regime>()? as i32);
                        }
                        GeneratedField::Symbols => {
                            if symbols__.is_some() {
                                return Err(serde::de::Error::duplicate_field("symbols"));
                            }
                            symbols__ = Some(map_.next_value()?);
                        }
                    }
                }
                Ok(MarketSnapshot {
                    environment: environment__.unwrap_or_default(),
                    as_of: as_of__,
                    market_status: market_status__.unwrap_or_default(),
                    regime: regime__.unwrap_or_default(),
                    symbols: symbols__.unwrap_or_default(),
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.MarketSnapshot", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for MarketStatus {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let variant = match self {
            Self::Unspecified => "MARKET_STATUS_UNSPECIFIED",
            Self::PreMarket => "MARKET_STATUS_PRE_MARKET",
            Self::Open => "MARKET_STATUS_OPEN",
            Self::AfterHours => "MARKET_STATUS_AFTER_HOURS",
            Self::Closed => "MARKET_STATUS_CLOSED",
        };
        serializer.serialize_str(variant)
    }
}
impl<'de> serde::Deserialize<'de> for MarketStatus {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "MARKET_STATUS_UNSPECIFIED",
            "MARKET_STATUS_PRE_MARKET",
            "MARKET_STATUS_OPEN",
            "MARKET_STATUS_AFTER_HOURS",
            "MARKET_STATUS_CLOSED",
        ];

        struct GeneratedVisitor;

        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = MarketStatus;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(formatter, "expected one of: {:?}", &FIELDS)
            }

            fn visit_i64<E>(self, v: i64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Signed(v), &self)
                    })
            }

            fn visit_u64<E>(self, v: u64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Unsigned(v), &self)
                    })
            }

            fn visit_str<E>(self, value: &str) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                match value {
                    "MARKET_STATUS_UNSPECIFIED" => Ok(MarketStatus::Unspecified),
                    "MARKET_STATUS_PRE_MARKET" => Ok(MarketStatus::PreMarket),
                    "MARKET_STATUS_OPEN" => Ok(MarketStatus::Open),
                    "MARKET_STATUS_AFTER_HOURS" => Ok(MarketStatus::AfterHours),
                    "MARKET_STATUS_CLOSED" => Ok(MarketStatus::Closed),
                    _ => Err(serde::de::Error::unknown_variant(value, FIELDS)),
                }
            }
        }
        deserializer.deserialize_any(GeneratedVisitor)
    }
}
impl serde::Serialize for OptionChain {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if !self.underlying.is_empty() {
            len += 1;
        }
        if self.underlying_price != 0. {
            len += 1;
        }
        if !self.options.is_empty() {
            len += 1;
        }
        if self.as_of.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.OptionChain", len)?;
        if !self.underlying.is_empty() {
            struct_ser.serialize_field("underlying", &self.underlying)?;
        }
        if self.underlying_price != 0. {
            struct_ser.serialize_field("underlyingPrice", &self.underlying_price)?;
        }
        if !self.options.is_empty() {
            struct_ser.serialize_field("options", &self.options)?;
        }
        if let Some(v) = self.as_of.as_ref() {
            struct_ser.serialize_field("asOf", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for OptionChain {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "underlying",
            "underlying_price",
            "underlyingPrice",
            "options",
            "as_of",
            "asOf",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Underlying,
            UnderlyingPrice,
            Options,
            AsOf,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "underlying" => Ok(GeneratedField::Underlying),
                            "underlyingPrice" | "underlying_price" => Ok(GeneratedField::UnderlyingPrice),
                            "options" => Ok(GeneratedField::Options),
                            "asOf" | "as_of" => Ok(GeneratedField::AsOf),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = OptionChain;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.OptionChain")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<OptionChain, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut underlying__ = None;
                let mut underlying_price__ = None;
                let mut options__ = None;
                let mut as_of__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Underlying => {
                            if underlying__.is_some() {
                                return Err(serde::de::Error::duplicate_field("underlying"));
                            }
                            underlying__ = Some(map_.next_value()?);
                        }
                        GeneratedField::UnderlyingPrice => {
                            if underlying_price__.is_some() {
                                return Err(serde::de::Error::duplicate_field("underlyingPrice"));
                            }
                            underlying_price__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::Options => {
                            if options__.is_some() {
                                return Err(serde::de::Error::duplicate_field("options"));
                            }
                            options__ = Some(map_.next_value()?);
                        }
                        GeneratedField::AsOf => {
                            if as_of__.is_some() {
                                return Err(serde::de::Error::duplicate_field("asOf"));
                            }
                            as_of__ = map_.next_value()?;
                        }
                    }
                }
                Ok(OptionChain {
                    underlying: underlying__.unwrap_or_default(),
                    underlying_price: underlying_price__.unwrap_or_default(),
                    options: options__.unwrap_or_default(),
                    as_of: as_of__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.OptionChain", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for OptionContract {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if !self.underlying.is_empty() {
            len += 1;
        }
        if !self.expiration.is_empty() {
            len += 1;
        }
        if self.strike != 0. {
            len += 1;
        }
        if self.option_type != 0 {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.OptionContract", len)?;
        if !self.underlying.is_empty() {
            struct_ser.serialize_field("underlying", &self.underlying)?;
        }
        if !self.expiration.is_empty() {
            struct_ser.serialize_field("expiration", &self.expiration)?;
        }
        if self.strike != 0. {
            struct_ser.serialize_field("strike", &self.strike)?;
        }
        if self.option_type != 0 {
            let v = OptionType::try_from(self.option_type)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.option_type)))?;
            struct_ser.serialize_field("optionType", &v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for OptionContract {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "underlying",
            "expiration",
            "strike",
            "option_type",
            "optionType",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Underlying,
            Expiration,
            Strike,
            OptionType,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "underlying" => Ok(GeneratedField::Underlying),
                            "expiration" => Ok(GeneratedField::Expiration),
                            "strike" => Ok(GeneratedField::Strike),
                            "optionType" | "option_type" => Ok(GeneratedField::OptionType),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = OptionContract;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.OptionContract")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<OptionContract, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut underlying__ = None;
                let mut expiration__ = None;
                let mut strike__ = None;
                let mut option_type__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Underlying => {
                            if underlying__.is_some() {
                                return Err(serde::de::Error::duplicate_field("underlying"));
                            }
                            underlying__ = Some(map_.next_value()?);
                        }
                        GeneratedField::Expiration => {
                            if expiration__.is_some() {
                                return Err(serde::de::Error::duplicate_field("expiration"));
                            }
                            expiration__ = Some(map_.next_value()?);
                        }
                        GeneratedField::Strike => {
                            if strike__.is_some() {
                                return Err(serde::de::Error::duplicate_field("strike"));
                            }
                            strike__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::OptionType => {
                            if option_type__.is_some() {
                                return Err(serde::de::Error::duplicate_field("optionType"));
                            }
                            option_type__ = Some(map_.next_value::<OptionType>()? as i32);
                        }
                    }
                }
                Ok(OptionContract {
                    underlying: underlying__.unwrap_or_default(),
                    expiration: expiration__.unwrap_or_default(),
                    strike: strike__.unwrap_or_default(),
                    option_type: option_type__.unwrap_or_default(),
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.OptionContract", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for OptionQuote {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.contract.is_some() {
            len += 1;
        }
        if self.quote.is_some() {
            len += 1;
        }
        if self.implied_volatility.is_some() {
            len += 1;
        }
        if self.delta.is_some() {
            len += 1;
        }
        if self.gamma.is_some() {
            len += 1;
        }
        if self.theta.is_some() {
            len += 1;
        }
        if self.vega.is_some() {
            len += 1;
        }
        if self.rho.is_some() {
            len += 1;
        }
        if self.open_interest != 0 {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.OptionQuote", len)?;
        if let Some(v) = self.contract.as_ref() {
            struct_ser.serialize_field("contract", v)?;
        }
        if let Some(v) = self.quote.as_ref() {
            struct_ser.serialize_field("quote", v)?;
        }
        if let Some(v) = self.implied_volatility.as_ref() {
            struct_ser.serialize_field("impliedVolatility", v)?;
        }
        if let Some(v) = self.delta.as_ref() {
            struct_ser.serialize_field("delta", v)?;
        }
        if let Some(v) = self.gamma.as_ref() {
            struct_ser.serialize_field("gamma", v)?;
        }
        if let Some(v) = self.theta.as_ref() {
            struct_ser.serialize_field("theta", v)?;
        }
        if let Some(v) = self.vega.as_ref() {
            struct_ser.serialize_field("vega", v)?;
        }
        if let Some(v) = self.rho.as_ref() {
            struct_ser.serialize_field("rho", v)?;
        }
        if self.open_interest != 0 {
            struct_ser.serialize_field("openInterest", &self.open_interest)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for OptionQuote {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "contract",
            "quote",
            "implied_volatility",
            "impliedVolatility",
            "delta",
            "gamma",
            "theta",
            "vega",
            "rho",
            "open_interest",
            "openInterest",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Contract,
            Quote,
            ImpliedVolatility,
            Delta,
            Gamma,
            Theta,
            Vega,
            Rho,
            OpenInterest,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "contract" => Ok(GeneratedField::Contract),
                            "quote" => Ok(GeneratedField::Quote),
                            "impliedVolatility" | "implied_volatility" => Ok(GeneratedField::ImpliedVolatility),
                            "delta" => Ok(GeneratedField::Delta),
                            "gamma" => Ok(GeneratedField::Gamma),
                            "theta" => Ok(GeneratedField::Theta),
                            "vega" => Ok(GeneratedField::Vega),
                            "rho" => Ok(GeneratedField::Rho),
                            "openInterest" | "open_interest" => Ok(GeneratedField::OpenInterest),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = OptionQuote;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.OptionQuote")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<OptionQuote, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut contract__ = None;
                let mut quote__ = None;
                let mut implied_volatility__ = None;
                let mut delta__ = None;
                let mut gamma__ = None;
                let mut theta__ = None;
                let mut vega__ = None;
                let mut rho__ = None;
                let mut open_interest__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Contract => {
                            if contract__.is_some() {
                                return Err(serde::de::Error::duplicate_field("contract"));
                            }
                            contract__ = map_.next_value()?;
                        }
                        GeneratedField::Quote => {
                            if quote__.is_some() {
                                return Err(serde::de::Error::duplicate_field("quote"));
                            }
                            quote__ = map_.next_value()?;
                        }
                        GeneratedField::ImpliedVolatility => {
                            if implied_volatility__.is_some() {
                                return Err(serde::de::Error::duplicate_field("impliedVolatility"));
                            }
                            implied_volatility__ = 
                                map_.next_value::<::std::option::Option<::pbjson::private::NumberDeserialize<_>>>()?.map(|x| x.0)
                            ;
                        }
                        GeneratedField::Delta => {
                            if delta__.is_some() {
                                return Err(serde::de::Error::duplicate_field("delta"));
                            }
                            delta__ = 
                                map_.next_value::<::std::option::Option<::pbjson::private::NumberDeserialize<_>>>()?.map(|x| x.0)
                            ;
                        }
                        GeneratedField::Gamma => {
                            if gamma__.is_some() {
                                return Err(serde::de::Error::duplicate_field("gamma"));
                            }
                            gamma__ = 
                                map_.next_value::<::std::option::Option<::pbjson::private::NumberDeserialize<_>>>()?.map(|x| x.0)
                            ;
                        }
                        GeneratedField::Theta => {
                            if theta__.is_some() {
                                return Err(serde::de::Error::duplicate_field("theta"));
                            }
                            theta__ = 
                                map_.next_value::<::std::option::Option<::pbjson::private::NumberDeserialize<_>>>()?.map(|x| x.0)
                            ;
                        }
                        GeneratedField::Vega => {
                            if vega__.is_some() {
                                return Err(serde::de::Error::duplicate_field("vega"));
                            }
                            vega__ = 
                                map_.next_value::<::std::option::Option<::pbjson::private::NumberDeserialize<_>>>()?.map(|x| x.0)
                            ;
                        }
                        GeneratedField::Rho => {
                            if rho__.is_some() {
                                return Err(serde::de::Error::duplicate_field("rho"));
                            }
                            rho__ = 
                                map_.next_value::<::std::option::Option<::pbjson::private::NumberDeserialize<_>>>()?.map(|x| x.0)
                            ;
                        }
                        GeneratedField::OpenInterest => {
                            if open_interest__.is_some() {
                                return Err(serde::de::Error::duplicate_field("openInterest"));
                            }
                            open_interest__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                    }
                }
                Ok(OptionQuote {
                    contract: contract__,
                    quote: quote__,
                    implied_volatility: implied_volatility__,
                    delta: delta__,
                    gamma: gamma__,
                    theta: theta__,
                    vega: vega__,
                    rho: rho__,
                    open_interest: open_interest__.unwrap_or_default(),
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.OptionQuote", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for OptionType {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let variant = match self {
            Self::Unspecified => "OPTION_TYPE_UNSPECIFIED",
            Self::Call => "OPTION_TYPE_CALL",
            Self::Put => "OPTION_TYPE_PUT",
        };
        serializer.serialize_str(variant)
    }
}
impl<'de> serde::Deserialize<'de> for OptionType {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "OPTION_TYPE_UNSPECIFIED",
            "OPTION_TYPE_CALL",
            "OPTION_TYPE_PUT",
        ];

        struct GeneratedVisitor;

        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = OptionType;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(formatter, "expected one of: {:?}", &FIELDS)
            }

            fn visit_i64<E>(self, v: i64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Signed(v), &self)
                    })
            }

            fn visit_u64<E>(self, v: u64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Unsigned(v), &self)
                    })
            }

            fn visit_str<E>(self, value: &str) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                match value {
                    "OPTION_TYPE_UNSPECIFIED" => Ok(OptionType::Unspecified),
                    "OPTION_TYPE_CALL" => Ok(OptionType::Call),
                    "OPTION_TYPE_PUT" => Ok(OptionType::Put),
                    _ => Err(serde::de::Error::unknown_variant(value, FIELDS)),
                }
            }
        }
        deserializer.deserialize_any(GeneratedVisitor)
    }
}
impl serde::Serialize for OrderPlan {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.entry_order_type != 0 {
            len += 1;
        }
        if self.entry_limit_price.is_some() {
            len += 1;
        }
        if self.exit_order_type != 0 {
            len += 1;
        }
        if self.time_in_force != 0 {
            len += 1;
        }
        if self.execution_tactic.is_some() {
            len += 1;
        }
        if self.execution_params.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.OrderPlan", len)?;
        if self.entry_order_type != 0 {
            let v = OrderType::try_from(self.entry_order_type)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.entry_order_type)))?;
            struct_ser.serialize_field("entryOrderType", &v)?;
        }
        if let Some(v) = self.entry_limit_price.as_ref() {
            struct_ser.serialize_field("entryLimitPrice", v)?;
        }
        if self.exit_order_type != 0 {
            let v = OrderType::try_from(self.exit_order_type)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.exit_order_type)))?;
            struct_ser.serialize_field("exitOrderType", &v)?;
        }
        if self.time_in_force != 0 {
            let v = TimeInForce::try_from(self.time_in_force)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.time_in_force)))?;
            struct_ser.serialize_field("timeInForce", &v)?;
        }
        if let Some(v) = self.execution_tactic.as_ref() {
            struct_ser.serialize_field("executionTactic", v)?;
        }
        if let Some(v) = self.execution_params.as_ref() {
            struct_ser.serialize_field("executionParams", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for OrderPlan {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "entry_order_type",
            "entryOrderType",
            "entry_limit_price",
            "entryLimitPrice",
            "exit_order_type",
            "exitOrderType",
            "time_in_force",
            "timeInForce",
            "execution_tactic",
            "executionTactic",
            "execution_params",
            "executionParams",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            EntryOrderType,
            EntryLimitPrice,
            ExitOrderType,
            TimeInForce,
            ExecutionTactic,
            ExecutionParams,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "entryOrderType" | "entry_order_type" => Ok(GeneratedField::EntryOrderType),
                            "entryLimitPrice" | "entry_limit_price" => Ok(GeneratedField::EntryLimitPrice),
                            "exitOrderType" | "exit_order_type" => Ok(GeneratedField::ExitOrderType),
                            "timeInForce" | "time_in_force" => Ok(GeneratedField::TimeInForce),
                            "executionTactic" | "execution_tactic" => Ok(GeneratedField::ExecutionTactic),
                            "executionParams" | "execution_params" => Ok(GeneratedField::ExecutionParams),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = OrderPlan;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.OrderPlan")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<OrderPlan, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut entry_order_type__ = None;
                let mut entry_limit_price__ = None;
                let mut exit_order_type__ = None;
                let mut time_in_force__ = None;
                let mut execution_tactic__ = None;
                let mut execution_params__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::EntryOrderType => {
                            if entry_order_type__.is_some() {
                                return Err(serde::de::Error::duplicate_field("entryOrderType"));
                            }
                            entry_order_type__ = Some(map_.next_value::<OrderType>()? as i32);
                        }
                        GeneratedField::EntryLimitPrice => {
                            if entry_limit_price__.is_some() {
                                return Err(serde::de::Error::duplicate_field("entryLimitPrice"));
                            }
                            entry_limit_price__ = 
                                map_.next_value::<::std::option::Option<::pbjson::private::NumberDeserialize<_>>>()?.map(|x| x.0)
                            ;
                        }
                        GeneratedField::ExitOrderType => {
                            if exit_order_type__.is_some() {
                                return Err(serde::de::Error::duplicate_field("exitOrderType"));
                            }
                            exit_order_type__ = Some(map_.next_value::<OrderType>()? as i32);
                        }
                        GeneratedField::TimeInForce => {
                            if time_in_force__.is_some() {
                                return Err(serde::de::Error::duplicate_field("timeInForce"));
                            }
                            time_in_force__ = Some(map_.next_value::<TimeInForce>()? as i32);
                        }
                        GeneratedField::ExecutionTactic => {
                            if execution_tactic__.is_some() {
                                return Err(serde::de::Error::duplicate_field("executionTactic"));
                            }
                            execution_tactic__ = map_.next_value()?;
                        }
                        GeneratedField::ExecutionParams => {
                            if execution_params__.is_some() {
                                return Err(serde::de::Error::duplicate_field("executionParams"));
                            }
                            execution_params__ = map_.next_value()?;
                        }
                    }
                }
                Ok(OrderPlan {
                    entry_order_type: entry_order_type__.unwrap_or_default(),
                    entry_limit_price: entry_limit_price__,
                    exit_order_type: exit_order_type__.unwrap_or_default(),
                    time_in_force: time_in_force__.unwrap_or_default(),
                    execution_tactic: execution_tactic__,
                    execution_params: execution_params__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.OrderPlan", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for OrderSide {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let variant = match self {
            Self::Unspecified => "ORDER_SIDE_UNSPECIFIED",
            Self::Buy => "ORDER_SIDE_BUY",
            Self::Sell => "ORDER_SIDE_SELL",
        };
        serializer.serialize_str(variant)
    }
}
impl<'de> serde::Deserialize<'de> for OrderSide {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "ORDER_SIDE_UNSPECIFIED",
            "ORDER_SIDE_BUY",
            "ORDER_SIDE_SELL",
        ];

        struct GeneratedVisitor;

        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = OrderSide;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(formatter, "expected one of: {:?}", &FIELDS)
            }

            fn visit_i64<E>(self, v: i64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Signed(v), &self)
                    })
            }

            fn visit_u64<E>(self, v: u64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Unsigned(v), &self)
                    })
            }

            fn visit_str<E>(self, value: &str) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                match value {
                    "ORDER_SIDE_UNSPECIFIED" => Ok(OrderSide::Unspecified),
                    "ORDER_SIDE_BUY" => Ok(OrderSide::Buy),
                    "ORDER_SIDE_SELL" => Ok(OrderSide::Sell),
                    _ => Err(serde::de::Error::unknown_variant(value, FIELDS)),
                }
            }
        }
        deserializer.deserialize_any(GeneratedVisitor)
    }
}
impl serde::Serialize for OrderStatus {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let variant = match self {
            Self::Unspecified => "ORDER_STATUS_UNSPECIFIED",
            Self::Pending => "ORDER_STATUS_PENDING",
            Self::Accepted => "ORDER_STATUS_ACCEPTED",
            Self::PartialFill => "ORDER_STATUS_PARTIAL_FILL",
            Self::Filled => "ORDER_STATUS_FILLED",
            Self::Cancelled => "ORDER_STATUS_CANCELLED",
            Self::Rejected => "ORDER_STATUS_REJECTED",
            Self::Expired => "ORDER_STATUS_EXPIRED",
        };
        serializer.serialize_str(variant)
    }
}
impl<'de> serde::Deserialize<'de> for OrderStatus {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "ORDER_STATUS_UNSPECIFIED",
            "ORDER_STATUS_PENDING",
            "ORDER_STATUS_ACCEPTED",
            "ORDER_STATUS_PARTIAL_FILL",
            "ORDER_STATUS_FILLED",
            "ORDER_STATUS_CANCELLED",
            "ORDER_STATUS_REJECTED",
            "ORDER_STATUS_EXPIRED",
        ];

        struct GeneratedVisitor;

        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = OrderStatus;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(formatter, "expected one of: {:?}", &FIELDS)
            }

            fn visit_i64<E>(self, v: i64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Signed(v), &self)
                    })
            }

            fn visit_u64<E>(self, v: u64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Unsigned(v), &self)
                    })
            }

            fn visit_str<E>(self, value: &str) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                match value {
                    "ORDER_STATUS_UNSPECIFIED" => Ok(OrderStatus::Unspecified),
                    "ORDER_STATUS_PENDING" => Ok(OrderStatus::Pending),
                    "ORDER_STATUS_ACCEPTED" => Ok(OrderStatus::Accepted),
                    "ORDER_STATUS_PARTIAL_FILL" => Ok(OrderStatus::PartialFill),
                    "ORDER_STATUS_FILLED" => Ok(OrderStatus::Filled),
                    "ORDER_STATUS_CANCELLED" => Ok(OrderStatus::Cancelled),
                    "ORDER_STATUS_REJECTED" => Ok(OrderStatus::Rejected),
                    "ORDER_STATUS_EXPIRED" => Ok(OrderStatus::Expired),
                    _ => Err(serde::de::Error::unknown_variant(value, FIELDS)),
                }
            }
        }
        deserializer.deserialize_any(GeneratedVisitor)
    }
}
impl serde::Serialize for OrderType {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let variant = match self {
            Self::Unspecified => "ORDER_TYPE_UNSPECIFIED",
            Self::Limit => "ORDER_TYPE_LIMIT",
            Self::Market => "ORDER_TYPE_MARKET",
        };
        serializer.serialize_str(variant)
    }
}
impl<'de> serde::Deserialize<'de> for OrderType {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "ORDER_TYPE_UNSPECIFIED",
            "ORDER_TYPE_LIMIT",
            "ORDER_TYPE_MARKET",
        ];

        struct GeneratedVisitor;

        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = OrderType;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(formatter, "expected one of: {:?}", &FIELDS)
            }

            fn visit_i64<E>(self, v: i64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Signed(v), &self)
                    })
            }

            fn visit_u64<E>(self, v: u64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Unsigned(v), &self)
                    })
            }

            fn visit_str<E>(self, value: &str) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                match value {
                    "ORDER_TYPE_UNSPECIFIED" => Ok(OrderType::Unspecified),
                    "ORDER_TYPE_LIMIT" => Ok(OrderType::Limit),
                    "ORDER_TYPE_MARKET" => Ok(OrderType::Market),
                    _ => Err(serde::de::Error::unknown_variant(value, FIELDS)),
                }
            }
        }
        deserializer.deserialize_any(GeneratedVisitor)
    }
}
impl serde::Serialize for Position {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.instrument.is_some() {
            len += 1;
        }
        if self.quantity != 0 {
            len += 1;
        }
        if self.avg_entry_price != 0. {
            len += 1;
        }
        if self.market_value != 0. {
            len += 1;
        }
        if self.unrealized_pnl != 0. {
            len += 1;
        }
        if self.unrealized_pnl_pct != 0. {
            len += 1;
        }
        if self.cost_basis != 0. {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.Position", len)?;
        if let Some(v) = self.instrument.as_ref() {
            struct_ser.serialize_field("instrument", v)?;
        }
        if self.quantity != 0 {
            struct_ser.serialize_field("quantity", &self.quantity)?;
        }
        if self.avg_entry_price != 0. {
            struct_ser.serialize_field("avgEntryPrice", &self.avg_entry_price)?;
        }
        if self.market_value != 0. {
            struct_ser.serialize_field("marketValue", &self.market_value)?;
        }
        if self.unrealized_pnl != 0. {
            struct_ser.serialize_field("unrealizedPnl", &self.unrealized_pnl)?;
        }
        if self.unrealized_pnl_pct != 0. {
            struct_ser.serialize_field("unrealizedPnlPct", &self.unrealized_pnl_pct)?;
        }
        if self.cost_basis != 0. {
            struct_ser.serialize_field("costBasis", &self.cost_basis)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for Position {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "instrument",
            "quantity",
            "avg_entry_price",
            "avgEntryPrice",
            "market_value",
            "marketValue",
            "unrealized_pnl",
            "unrealizedPnl",
            "unrealized_pnl_pct",
            "unrealizedPnlPct",
            "cost_basis",
            "costBasis",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Instrument,
            Quantity,
            AvgEntryPrice,
            MarketValue,
            UnrealizedPnl,
            UnrealizedPnlPct,
            CostBasis,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "instrument" => Ok(GeneratedField::Instrument),
                            "quantity" => Ok(GeneratedField::Quantity),
                            "avgEntryPrice" | "avg_entry_price" => Ok(GeneratedField::AvgEntryPrice),
                            "marketValue" | "market_value" => Ok(GeneratedField::MarketValue),
                            "unrealizedPnl" | "unrealized_pnl" => Ok(GeneratedField::UnrealizedPnl),
                            "unrealizedPnlPct" | "unrealized_pnl_pct" => Ok(GeneratedField::UnrealizedPnlPct),
                            "costBasis" | "cost_basis" => Ok(GeneratedField::CostBasis),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = Position;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.Position")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<Position, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut instrument__ = None;
                let mut quantity__ = None;
                let mut avg_entry_price__ = None;
                let mut market_value__ = None;
                let mut unrealized_pnl__ = None;
                let mut unrealized_pnl_pct__ = None;
                let mut cost_basis__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Instrument => {
                            if instrument__.is_some() {
                                return Err(serde::de::Error::duplicate_field("instrument"));
                            }
                            instrument__ = map_.next_value()?;
                        }
                        GeneratedField::Quantity => {
                            if quantity__.is_some() {
                                return Err(serde::de::Error::duplicate_field("quantity"));
                            }
                            quantity__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::AvgEntryPrice => {
                            if avg_entry_price__.is_some() {
                                return Err(serde::de::Error::duplicate_field("avgEntryPrice"));
                            }
                            avg_entry_price__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::MarketValue => {
                            if market_value__.is_some() {
                                return Err(serde::de::Error::duplicate_field("marketValue"));
                            }
                            market_value__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::UnrealizedPnl => {
                            if unrealized_pnl__.is_some() {
                                return Err(serde::de::Error::duplicate_field("unrealizedPnl"));
                            }
                            unrealized_pnl__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::UnrealizedPnlPct => {
                            if unrealized_pnl_pct__.is_some() {
                                return Err(serde::de::Error::duplicate_field("unrealizedPnlPct"));
                            }
                            unrealized_pnl_pct__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::CostBasis => {
                            if cost_basis__.is_some() {
                                return Err(serde::de::Error::duplicate_field("costBasis"));
                            }
                            cost_basis__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                    }
                }
                Ok(Position {
                    instrument: instrument__,
                    quantity: quantity__.unwrap_or_default(),
                    avg_entry_price: avg_entry_price__.unwrap_or_default(),
                    market_value: market_value__.unwrap_or_default(),
                    unrealized_pnl: unrealized_pnl__.unwrap_or_default(),
                    unrealized_pnl_pct: unrealized_pnl_pct__.unwrap_or_default(),
                    cost_basis: cost_basis__.unwrap_or_default(),
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.Position", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for Quote {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if !self.symbol.is_empty() {
            len += 1;
        }
        if self.bid != 0. {
            len += 1;
        }
        if self.ask != 0. {
            len += 1;
        }
        if self.bid_size != 0 {
            len += 1;
        }
        if self.ask_size != 0 {
            len += 1;
        }
        if self.last != 0. {
            len += 1;
        }
        if self.last_size != 0 {
            len += 1;
        }
        if self.volume != 0 {
            len += 1;
        }
        if self.timestamp.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.Quote", len)?;
        if !self.symbol.is_empty() {
            struct_ser.serialize_field("symbol", &self.symbol)?;
        }
        if self.bid != 0. {
            struct_ser.serialize_field("bid", &self.bid)?;
        }
        if self.ask != 0. {
            struct_ser.serialize_field("ask", &self.ask)?;
        }
        if self.bid_size != 0 {
            struct_ser.serialize_field("bidSize", &self.bid_size)?;
        }
        if self.ask_size != 0 {
            struct_ser.serialize_field("askSize", &self.ask_size)?;
        }
        if self.last != 0. {
            struct_ser.serialize_field("last", &self.last)?;
        }
        if self.last_size != 0 {
            struct_ser.serialize_field("lastSize", &self.last_size)?;
        }
        if self.volume != 0 {
            #[allow(clippy::needless_borrow)]
            #[allow(clippy::needless_borrows_for_generic_args)]
            struct_ser.serialize_field("volume", ToString::to_string(&self.volume).as_str())?;
        }
        if let Some(v) = self.timestamp.as_ref() {
            struct_ser.serialize_field("timestamp", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for Quote {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "symbol",
            "bid",
            "ask",
            "bid_size",
            "bidSize",
            "ask_size",
            "askSize",
            "last",
            "last_size",
            "lastSize",
            "volume",
            "timestamp",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Symbol,
            Bid,
            Ask,
            BidSize,
            AskSize,
            Last,
            LastSize,
            Volume,
            Timestamp,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "symbol" => Ok(GeneratedField::Symbol),
                            "bid" => Ok(GeneratedField::Bid),
                            "ask" => Ok(GeneratedField::Ask),
                            "bidSize" | "bid_size" => Ok(GeneratedField::BidSize),
                            "askSize" | "ask_size" => Ok(GeneratedField::AskSize),
                            "last" => Ok(GeneratedField::Last),
                            "lastSize" | "last_size" => Ok(GeneratedField::LastSize),
                            "volume" => Ok(GeneratedField::Volume),
                            "timestamp" => Ok(GeneratedField::Timestamp),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = Quote;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.Quote")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<Quote, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut symbol__ = None;
                let mut bid__ = None;
                let mut ask__ = None;
                let mut bid_size__ = None;
                let mut ask_size__ = None;
                let mut last__ = None;
                let mut last_size__ = None;
                let mut volume__ = None;
                let mut timestamp__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Symbol => {
                            if symbol__.is_some() {
                                return Err(serde::de::Error::duplicate_field("symbol"));
                            }
                            symbol__ = Some(map_.next_value()?);
                        }
                        GeneratedField::Bid => {
                            if bid__.is_some() {
                                return Err(serde::de::Error::duplicate_field("bid"));
                            }
                            bid__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::Ask => {
                            if ask__.is_some() {
                                return Err(serde::de::Error::duplicate_field("ask"));
                            }
                            ask__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::BidSize => {
                            if bid_size__.is_some() {
                                return Err(serde::de::Error::duplicate_field("bidSize"));
                            }
                            bid_size__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::AskSize => {
                            if ask_size__.is_some() {
                                return Err(serde::de::Error::duplicate_field("askSize"));
                            }
                            ask_size__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::Last => {
                            if last__.is_some() {
                                return Err(serde::de::Error::duplicate_field("last"));
                            }
                            last__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::LastSize => {
                            if last_size__.is_some() {
                                return Err(serde::de::Error::duplicate_field("lastSize"));
                            }
                            last_size__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::Volume => {
                            if volume__.is_some() {
                                return Err(serde::de::Error::duplicate_field("volume"));
                            }
                            volume__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::Timestamp => {
                            if timestamp__.is_some() {
                                return Err(serde::de::Error::duplicate_field("timestamp"));
                            }
                            timestamp__ = map_.next_value()?;
                        }
                    }
                }
                Ok(Quote {
                    symbol: symbol__.unwrap_or_default(),
                    bid: bid__.unwrap_or_default(),
                    ask: ask__.unwrap_or_default(),
                    bid_size: bid_size__.unwrap_or_default(),
                    ask_size: ask_size__.unwrap_or_default(),
                    last: last__.unwrap_or_default(),
                    last_size: last_size__.unwrap_or_default(),
                    volume: volume__.unwrap_or_default(),
                    timestamp: timestamp__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.Quote", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for References {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if !self.used_indicators.is_empty() {
            len += 1;
        }
        if !self.memory_case_ids.is_empty() {
            len += 1;
        }
        if !self.event_ids.is_empty() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.References", len)?;
        if !self.used_indicators.is_empty() {
            struct_ser.serialize_field("usedIndicators", &self.used_indicators)?;
        }
        if !self.memory_case_ids.is_empty() {
            struct_ser.serialize_field("memoryCaseIds", &self.memory_case_ids)?;
        }
        if !self.event_ids.is_empty() {
            struct_ser.serialize_field("eventIds", &self.event_ids)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for References {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "used_indicators",
            "usedIndicators",
            "memory_case_ids",
            "memoryCaseIds",
            "event_ids",
            "eventIds",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            UsedIndicators,
            MemoryCaseIds,
            EventIds,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "usedIndicators" | "used_indicators" => Ok(GeneratedField::UsedIndicators),
                            "memoryCaseIds" | "memory_case_ids" => Ok(GeneratedField::MemoryCaseIds),
                            "eventIds" | "event_ids" => Ok(GeneratedField::EventIds),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = References;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.References")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<References, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut used_indicators__ = None;
                let mut memory_case_ids__ = None;
                let mut event_ids__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::UsedIndicators => {
                            if used_indicators__.is_some() {
                                return Err(serde::de::Error::duplicate_field("usedIndicators"));
                            }
                            used_indicators__ = Some(map_.next_value()?);
                        }
                        GeneratedField::MemoryCaseIds => {
                            if memory_case_ids__.is_some() {
                                return Err(serde::de::Error::duplicate_field("memoryCaseIds"));
                            }
                            memory_case_ids__ = Some(map_.next_value()?);
                        }
                        GeneratedField::EventIds => {
                            if event_ids__.is_some() {
                                return Err(serde::de::Error::duplicate_field("eventIds"));
                            }
                            event_ids__ = Some(map_.next_value()?);
                        }
                    }
                }
                Ok(References {
                    used_indicators: used_indicators__.unwrap_or_default(),
                    memory_case_ids: memory_case_ids__.unwrap_or_default(),
                    event_ids: event_ids__.unwrap_or_default(),
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.References", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for Regime {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let variant = match self {
            Self::Unspecified => "REGIME_UNSPECIFIED",
            Self::BullTrend => "REGIME_BULL_TREND",
            Self::BearTrend => "REGIME_BEAR_TREND",
            Self::RangeBound => "REGIME_RANGE_BOUND",
            Self::HighVolatility => "REGIME_HIGH_VOLATILITY",
            Self::LowVolatility => "REGIME_LOW_VOLATILITY",
            Self::Crisis => "REGIME_CRISIS",
        };
        serializer.serialize_str(variant)
    }
}
impl<'de> serde::Deserialize<'de> for Regime {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "REGIME_UNSPECIFIED",
            "REGIME_BULL_TREND",
            "REGIME_BEAR_TREND",
            "REGIME_RANGE_BOUND",
            "REGIME_HIGH_VOLATILITY",
            "REGIME_LOW_VOLATILITY",
            "REGIME_CRISIS",
        ];

        struct GeneratedVisitor;

        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = Regime;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(formatter, "expected one of: {:?}", &FIELDS)
            }

            fn visit_i64<E>(self, v: i64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Signed(v), &self)
                    })
            }

            fn visit_u64<E>(self, v: u64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Unsigned(v), &self)
                    })
            }

            fn visit_str<E>(self, value: &str) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                match value {
                    "REGIME_UNSPECIFIED" => Ok(Regime::Unspecified),
                    "REGIME_BULL_TREND" => Ok(Regime::BullTrend),
                    "REGIME_BEAR_TREND" => Ok(Regime::BearTrend),
                    "REGIME_RANGE_BOUND" => Ok(Regime::RangeBound),
                    "REGIME_HIGH_VOLATILITY" => Ok(Regime::HighVolatility),
                    "REGIME_LOW_VOLATILITY" => Ok(Regime::LowVolatility),
                    "REGIME_CRISIS" => Ok(Regime::Crisis),
                    _ => Err(serde::de::Error::unknown_variant(value, FIELDS)),
                }
            }
        }
        deserializer.deserialize_any(GeneratedVisitor)
    }
}
impl serde::Serialize for RiskDenomination {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let variant = match self {
            Self::Unspecified => "RISK_DENOMINATION_UNSPECIFIED",
            Self::UnderlyingPrice => "RISK_DENOMINATION_UNDERLYING_PRICE",
            Self::OptionPrice => "RISK_DENOMINATION_OPTION_PRICE",
        };
        serializer.serialize_str(variant)
    }
}
impl<'de> serde::Deserialize<'de> for RiskDenomination {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "RISK_DENOMINATION_UNSPECIFIED",
            "RISK_DENOMINATION_UNDERLYING_PRICE",
            "RISK_DENOMINATION_OPTION_PRICE",
        ];

        struct GeneratedVisitor;

        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = RiskDenomination;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(formatter, "expected one of: {:?}", &FIELDS)
            }

            fn visit_i64<E>(self, v: i64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Signed(v), &self)
                    })
            }

            fn visit_u64<E>(self, v: u64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Unsigned(v), &self)
                    })
            }

            fn visit_str<E>(self, value: &str) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                match value {
                    "RISK_DENOMINATION_UNSPECIFIED" => Ok(RiskDenomination::Unspecified),
                    "RISK_DENOMINATION_UNDERLYING_PRICE" => Ok(RiskDenomination::UnderlyingPrice),
                    "RISK_DENOMINATION_OPTION_PRICE" => Ok(RiskDenomination::OptionPrice),
                    _ => Err(serde::de::Error::unknown_variant(value, FIELDS)),
                }
            }
        }
        deserializer.deserialize_any(GeneratedVisitor)
    }
}
impl serde::Serialize for RiskLevels {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.stop_loss_level != 0. {
            len += 1;
        }
        if self.take_profit_level != 0. {
            len += 1;
        }
        if self.denomination != 0 {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.RiskLevels", len)?;
        if self.stop_loss_level != 0. {
            struct_ser.serialize_field("stopLossLevel", &self.stop_loss_level)?;
        }
        if self.take_profit_level != 0. {
            struct_ser.serialize_field("takeProfitLevel", &self.take_profit_level)?;
        }
        if self.denomination != 0 {
            let v = RiskDenomination::try_from(self.denomination)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.denomination)))?;
            struct_ser.serialize_field("denomination", &v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for RiskLevels {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "stop_loss_level",
            "stopLossLevel",
            "take_profit_level",
            "takeProfitLevel",
            "denomination",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            StopLossLevel,
            TakeProfitLevel,
            Denomination,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "stopLossLevel" | "stop_loss_level" => Ok(GeneratedField::StopLossLevel),
                            "takeProfitLevel" | "take_profit_level" => Ok(GeneratedField::TakeProfitLevel),
                            "denomination" => Ok(GeneratedField::Denomination),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = RiskLevels;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.RiskLevels")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<RiskLevels, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut stop_loss_level__ = None;
                let mut take_profit_level__ = None;
                let mut denomination__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::StopLossLevel => {
                            if stop_loss_level__.is_some() {
                                return Err(serde::de::Error::duplicate_field("stopLossLevel"));
                            }
                            stop_loss_level__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::TakeProfitLevel => {
                            if take_profit_level__.is_some() {
                                return Err(serde::de::Error::duplicate_field("takeProfitLevel"));
                            }
                            take_profit_level__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::Denomination => {
                            if denomination__.is_some() {
                                return Err(serde::de::Error::duplicate_field("denomination"));
                            }
                            denomination__ = Some(map_.next_value::<RiskDenomination>()? as i32);
                        }
                    }
                }
                Ok(RiskLevels {
                    stop_loss_level: stop_loss_level__.unwrap_or_default(),
                    take_profit_level: take_profit_level__.unwrap_or_default(),
                    denomination: denomination__.unwrap_or_default(),
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.RiskLevels", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for RiskValidationResult {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.valid {
            len += 1;
        }
        if !self.errors.is_empty() {
            len += 1;
        }
        if !self.warnings.is_empty() {
            len += 1;
        }
        if self.risk_reward_ratio.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.RiskValidationResult", len)?;
        if self.valid {
            struct_ser.serialize_field("valid", &self.valid)?;
        }
        if !self.errors.is_empty() {
            struct_ser.serialize_field("errors", &self.errors)?;
        }
        if !self.warnings.is_empty() {
            struct_ser.serialize_field("warnings", &self.warnings)?;
        }
        if let Some(v) = self.risk_reward_ratio.as_ref() {
            struct_ser.serialize_field("riskRewardRatio", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for RiskValidationResult {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "valid",
            "errors",
            "warnings",
            "risk_reward_ratio",
            "riskRewardRatio",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Valid,
            Errors,
            Warnings,
            RiskRewardRatio,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "valid" => Ok(GeneratedField::Valid),
                            "errors" => Ok(GeneratedField::Errors),
                            "warnings" => Ok(GeneratedField::Warnings),
                            "riskRewardRatio" | "risk_reward_ratio" => Ok(GeneratedField::RiskRewardRatio),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = RiskValidationResult;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.RiskValidationResult")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<RiskValidationResult, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut valid__ = None;
                let mut errors__ = None;
                let mut warnings__ = None;
                let mut risk_reward_ratio__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Valid => {
                            if valid__.is_some() {
                                return Err(serde::de::Error::duplicate_field("valid"));
                            }
                            valid__ = Some(map_.next_value()?);
                        }
                        GeneratedField::Errors => {
                            if errors__.is_some() {
                                return Err(serde::de::Error::duplicate_field("errors"));
                            }
                            errors__ = Some(map_.next_value()?);
                        }
                        GeneratedField::Warnings => {
                            if warnings__.is_some() {
                                return Err(serde::de::Error::duplicate_field("warnings"));
                            }
                            warnings__ = Some(map_.next_value()?);
                        }
                        GeneratedField::RiskRewardRatio => {
                            if risk_reward_ratio__.is_some() {
                                return Err(serde::de::Error::duplicate_field("riskRewardRatio"));
                            }
                            risk_reward_ratio__ = 
                                map_.next_value::<::std::option::Option<::pbjson::private::NumberDeserialize<_>>>()?.map(|x| x.0)
                            ;
                        }
                    }
                }
                Ok(RiskValidationResult {
                    valid: valid__.unwrap_or_default(),
                    errors: errors__.unwrap_or_default(),
                    warnings: warnings__.unwrap_or_default(),
                    risk_reward_ratio: risk_reward_ratio__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.RiskValidationResult", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for Size {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.quantity != 0 {
            len += 1;
        }
        if self.unit != 0 {
            len += 1;
        }
        if self.target_position_quantity != 0 {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.Size", len)?;
        if self.quantity != 0 {
            struct_ser.serialize_field("quantity", &self.quantity)?;
        }
        if self.unit != 0 {
            let v = SizeUnit::try_from(self.unit)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.unit)))?;
            struct_ser.serialize_field("unit", &v)?;
        }
        if self.target_position_quantity != 0 {
            struct_ser.serialize_field("targetPositionQuantity", &self.target_position_quantity)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for Size {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "quantity",
            "unit",
            "target_position_quantity",
            "targetPositionQuantity",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Quantity,
            Unit,
            TargetPositionQuantity,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "quantity" => Ok(GeneratedField::Quantity),
                            "unit" => Ok(GeneratedField::Unit),
                            "targetPositionQuantity" | "target_position_quantity" => Ok(GeneratedField::TargetPositionQuantity),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = Size;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.Size")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<Size, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut quantity__ = None;
                let mut unit__ = None;
                let mut target_position_quantity__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Quantity => {
                            if quantity__.is_some() {
                                return Err(serde::de::Error::duplicate_field("quantity"));
                            }
                            quantity__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::Unit => {
                            if unit__.is_some() {
                                return Err(serde::de::Error::duplicate_field("unit"));
                            }
                            unit__ = Some(map_.next_value::<SizeUnit>()? as i32);
                        }
                        GeneratedField::TargetPositionQuantity => {
                            if target_position_quantity__.is_some() {
                                return Err(serde::de::Error::duplicate_field("targetPositionQuantity"));
                            }
                            target_position_quantity__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                    }
                }
                Ok(Size {
                    quantity: quantity__.unwrap_or_default(),
                    unit: unit__.unwrap_or_default(),
                    target_position_quantity: target_position_quantity__.unwrap_or_default(),
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.Size", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for SizeUnit {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let variant = match self {
            Self::Unspecified => "SIZE_UNIT_UNSPECIFIED",
            Self::Shares => "SIZE_UNIT_SHARES",
            Self::Contracts => "SIZE_UNIT_CONTRACTS",
        };
        serializer.serialize_str(variant)
    }
}
impl<'de> serde::Deserialize<'de> for SizeUnit {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "SIZE_UNIT_UNSPECIFIED",
            "SIZE_UNIT_SHARES",
            "SIZE_UNIT_CONTRACTS",
        ];

        struct GeneratedVisitor;

        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = SizeUnit;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(formatter, "expected one of: {:?}", &FIELDS)
            }

            fn visit_i64<E>(self, v: i64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Signed(v), &self)
                    })
            }

            fn visit_u64<E>(self, v: u64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Unsigned(v), &self)
                    })
            }

            fn visit_str<E>(self, value: &str) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                match value {
                    "SIZE_UNIT_UNSPECIFIED" => Ok(SizeUnit::Unspecified),
                    "SIZE_UNIT_SHARES" => Ok(SizeUnit::Shares),
                    "SIZE_UNIT_CONTRACTS" => Ok(SizeUnit::Contracts),
                    _ => Err(serde::de::Error::unknown_variant(value, FIELDS)),
                }
            }
        }
        deserializer.deserialize_any(GeneratedVisitor)
    }
}
impl serde::Serialize for StrategyFamily {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let variant = match self {
            Self::Unspecified => "STRATEGY_FAMILY_UNSPECIFIED",
            Self::Trend => "STRATEGY_FAMILY_TREND",
            Self::MeanReversion => "STRATEGY_FAMILY_MEAN_REVERSION",
            Self::EventDriven => "STRATEGY_FAMILY_EVENT_DRIVEN",
            Self::Volatility => "STRATEGY_FAMILY_VOLATILITY",
            Self::RelativeValue => "STRATEGY_FAMILY_RELATIVE_VALUE",
        };
        serializer.serialize_str(variant)
    }
}
impl<'de> serde::Deserialize<'de> for StrategyFamily {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "STRATEGY_FAMILY_UNSPECIFIED",
            "STRATEGY_FAMILY_TREND",
            "STRATEGY_FAMILY_MEAN_REVERSION",
            "STRATEGY_FAMILY_EVENT_DRIVEN",
            "STRATEGY_FAMILY_VOLATILITY",
            "STRATEGY_FAMILY_RELATIVE_VALUE",
        ];

        struct GeneratedVisitor;

        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = StrategyFamily;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(formatter, "expected one of: {:?}", &FIELDS)
            }

            fn visit_i64<E>(self, v: i64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Signed(v), &self)
                    })
            }

            fn visit_u64<E>(self, v: u64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Unsigned(v), &self)
                    })
            }

            fn visit_str<E>(self, value: &str) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                match value {
                    "STRATEGY_FAMILY_UNSPECIFIED" => Ok(StrategyFamily::Unspecified),
                    "STRATEGY_FAMILY_TREND" => Ok(StrategyFamily::Trend),
                    "STRATEGY_FAMILY_MEAN_REVERSION" => Ok(StrategyFamily::MeanReversion),
                    "STRATEGY_FAMILY_EVENT_DRIVEN" => Ok(StrategyFamily::EventDriven),
                    "STRATEGY_FAMILY_VOLATILITY" => Ok(StrategyFamily::Volatility),
                    "STRATEGY_FAMILY_RELATIVE_VALUE" => Ok(StrategyFamily::RelativeValue),
                    _ => Err(serde::de::Error::unknown_variant(value, FIELDS)),
                }
            }
        }
        deserializer.deserialize_any(GeneratedVisitor)
    }
}
impl serde::Serialize for StreamExecutionsRequest {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.cycle_id.is_some() {
            len += 1;
        }
        if !self.order_ids.is_empty() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.StreamExecutionsRequest", len)?;
        if let Some(v) = self.cycle_id.as_ref() {
            struct_ser.serialize_field("cycleId", v)?;
        }
        if !self.order_ids.is_empty() {
            struct_ser.serialize_field("orderIds", &self.order_ids)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for StreamExecutionsRequest {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "cycle_id",
            "cycleId",
            "order_ids",
            "orderIds",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            CycleId,
            OrderIds,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "cycleId" | "cycle_id" => Ok(GeneratedField::CycleId),
                            "orderIds" | "order_ids" => Ok(GeneratedField::OrderIds),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = StreamExecutionsRequest;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.StreamExecutionsRequest")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<StreamExecutionsRequest, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut cycle_id__ = None;
                let mut order_ids__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::CycleId => {
                            if cycle_id__.is_some() {
                                return Err(serde::de::Error::duplicate_field("cycleId"));
                            }
                            cycle_id__ = map_.next_value()?;
                        }
                        GeneratedField::OrderIds => {
                            if order_ids__.is_some() {
                                return Err(serde::de::Error::duplicate_field("orderIds"));
                            }
                            order_ids__ = Some(map_.next_value()?);
                        }
                    }
                }
                Ok(StreamExecutionsRequest {
                    cycle_id: cycle_id__,
                    order_ids: order_ids__.unwrap_or_default(),
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.StreamExecutionsRequest", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for StreamExecutionsResponse {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.execution.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.StreamExecutionsResponse", len)?;
        if let Some(v) = self.execution.as_ref() {
            struct_ser.serialize_field("execution", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for StreamExecutionsResponse {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "execution",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Execution,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "execution" => Ok(GeneratedField::Execution),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = StreamExecutionsResponse;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.StreamExecutionsResponse")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<StreamExecutionsResponse, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut execution__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Execution => {
                            if execution__.is_some() {
                                return Err(serde::de::Error::duplicate_field("execution"));
                            }
                            execution__ = map_.next_value()?;
                        }
                    }
                }
                Ok(StreamExecutionsResponse {
                    execution: execution__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.StreamExecutionsResponse", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for SubmitOrderRequest {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.instrument.is_some() {
            len += 1;
        }
        if self.side != 0 {
            len += 1;
        }
        if self.quantity != 0 {
            len += 1;
        }
        if self.order_type != 0 {
            len += 1;
        }
        if self.limit_price.is_some() {
            len += 1;
        }
        if self.time_in_force != 0 {
            len += 1;
        }
        if !self.client_order_id.is_empty() {
            len += 1;
        }
        if !self.cycle_id.is_empty() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.SubmitOrderRequest", len)?;
        if let Some(v) = self.instrument.as_ref() {
            struct_ser.serialize_field("instrument", v)?;
        }
        if self.side != 0 {
            let v = OrderSide::try_from(self.side)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.side)))?;
            struct_ser.serialize_field("side", &v)?;
        }
        if self.quantity != 0 {
            struct_ser.serialize_field("quantity", &self.quantity)?;
        }
        if self.order_type != 0 {
            let v = OrderType::try_from(self.order_type)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.order_type)))?;
            struct_ser.serialize_field("orderType", &v)?;
        }
        if let Some(v) = self.limit_price.as_ref() {
            struct_ser.serialize_field("limitPrice", v)?;
        }
        if self.time_in_force != 0 {
            let v = TimeInForce::try_from(self.time_in_force)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.time_in_force)))?;
            struct_ser.serialize_field("timeInForce", &v)?;
        }
        if !self.client_order_id.is_empty() {
            struct_ser.serialize_field("clientOrderId", &self.client_order_id)?;
        }
        if !self.cycle_id.is_empty() {
            struct_ser.serialize_field("cycleId", &self.cycle_id)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for SubmitOrderRequest {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "instrument",
            "side",
            "quantity",
            "order_type",
            "orderType",
            "limit_price",
            "limitPrice",
            "time_in_force",
            "timeInForce",
            "client_order_id",
            "clientOrderId",
            "cycle_id",
            "cycleId",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Instrument,
            Side,
            Quantity,
            OrderType,
            LimitPrice,
            TimeInForce,
            ClientOrderId,
            CycleId,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "instrument" => Ok(GeneratedField::Instrument),
                            "side" => Ok(GeneratedField::Side),
                            "quantity" => Ok(GeneratedField::Quantity),
                            "orderType" | "order_type" => Ok(GeneratedField::OrderType),
                            "limitPrice" | "limit_price" => Ok(GeneratedField::LimitPrice),
                            "timeInForce" | "time_in_force" => Ok(GeneratedField::TimeInForce),
                            "clientOrderId" | "client_order_id" => Ok(GeneratedField::ClientOrderId),
                            "cycleId" | "cycle_id" => Ok(GeneratedField::CycleId),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = SubmitOrderRequest;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.SubmitOrderRequest")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<SubmitOrderRequest, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut instrument__ = None;
                let mut side__ = None;
                let mut quantity__ = None;
                let mut order_type__ = None;
                let mut limit_price__ = None;
                let mut time_in_force__ = None;
                let mut client_order_id__ = None;
                let mut cycle_id__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Instrument => {
                            if instrument__.is_some() {
                                return Err(serde::de::Error::duplicate_field("instrument"));
                            }
                            instrument__ = map_.next_value()?;
                        }
                        GeneratedField::Side => {
                            if side__.is_some() {
                                return Err(serde::de::Error::duplicate_field("side"));
                            }
                            side__ = Some(map_.next_value::<OrderSide>()? as i32);
                        }
                        GeneratedField::Quantity => {
                            if quantity__.is_some() {
                                return Err(serde::de::Error::duplicate_field("quantity"));
                            }
                            quantity__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::OrderType => {
                            if order_type__.is_some() {
                                return Err(serde::de::Error::duplicate_field("orderType"));
                            }
                            order_type__ = Some(map_.next_value::<OrderType>()? as i32);
                        }
                        GeneratedField::LimitPrice => {
                            if limit_price__.is_some() {
                                return Err(serde::de::Error::duplicate_field("limitPrice"));
                            }
                            limit_price__ = 
                                map_.next_value::<::std::option::Option<::pbjson::private::NumberDeserialize<_>>>()?.map(|x| x.0)
                            ;
                        }
                        GeneratedField::TimeInForce => {
                            if time_in_force__.is_some() {
                                return Err(serde::de::Error::duplicate_field("timeInForce"));
                            }
                            time_in_force__ = Some(map_.next_value::<TimeInForce>()? as i32);
                        }
                        GeneratedField::ClientOrderId => {
                            if client_order_id__.is_some() {
                                return Err(serde::de::Error::duplicate_field("clientOrderId"));
                            }
                            client_order_id__ = Some(map_.next_value()?);
                        }
                        GeneratedField::CycleId => {
                            if cycle_id__.is_some() {
                                return Err(serde::de::Error::duplicate_field("cycleId"));
                            }
                            cycle_id__ = Some(map_.next_value()?);
                        }
                    }
                }
                Ok(SubmitOrderRequest {
                    instrument: instrument__,
                    side: side__.unwrap_or_default(),
                    quantity: quantity__.unwrap_or_default(),
                    order_type: order_type__.unwrap_or_default(),
                    limit_price: limit_price__,
                    time_in_force: time_in_force__.unwrap_or_default(),
                    client_order_id: client_order_id__.unwrap_or_default(),
                    cycle_id: cycle_id__.unwrap_or_default(),
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.SubmitOrderRequest", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for SubmitOrderResponse {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if !self.order_id.is_empty() {
            len += 1;
        }
        if !self.client_order_id.is_empty() {
            len += 1;
        }
        if self.status != 0 {
            len += 1;
        }
        if self.submitted_at.is_some() {
            len += 1;
        }
        if self.error_message.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.SubmitOrderResponse", len)?;
        if !self.order_id.is_empty() {
            struct_ser.serialize_field("orderId", &self.order_id)?;
        }
        if !self.client_order_id.is_empty() {
            struct_ser.serialize_field("clientOrderId", &self.client_order_id)?;
        }
        if self.status != 0 {
            let v = OrderStatus::try_from(self.status)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.status)))?;
            struct_ser.serialize_field("status", &v)?;
        }
        if let Some(v) = self.submitted_at.as_ref() {
            struct_ser.serialize_field("submittedAt", v)?;
        }
        if let Some(v) = self.error_message.as_ref() {
            struct_ser.serialize_field("errorMessage", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for SubmitOrderResponse {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "order_id",
            "orderId",
            "client_order_id",
            "clientOrderId",
            "status",
            "submitted_at",
            "submittedAt",
            "error_message",
            "errorMessage",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            OrderId,
            ClientOrderId,
            Status,
            SubmittedAt,
            ErrorMessage,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "orderId" | "order_id" => Ok(GeneratedField::OrderId),
                            "clientOrderId" | "client_order_id" => Ok(GeneratedField::ClientOrderId),
                            "status" => Ok(GeneratedField::Status),
                            "submittedAt" | "submitted_at" => Ok(GeneratedField::SubmittedAt),
                            "errorMessage" | "error_message" => Ok(GeneratedField::ErrorMessage),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = SubmitOrderResponse;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.SubmitOrderResponse")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<SubmitOrderResponse, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut order_id__ = None;
                let mut client_order_id__ = None;
                let mut status__ = None;
                let mut submitted_at__ = None;
                let mut error_message__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::OrderId => {
                            if order_id__.is_some() {
                                return Err(serde::de::Error::duplicate_field("orderId"));
                            }
                            order_id__ = Some(map_.next_value()?);
                        }
                        GeneratedField::ClientOrderId => {
                            if client_order_id__.is_some() {
                                return Err(serde::de::Error::duplicate_field("clientOrderId"));
                            }
                            client_order_id__ = Some(map_.next_value()?);
                        }
                        GeneratedField::Status => {
                            if status__.is_some() {
                                return Err(serde::de::Error::duplicate_field("status"));
                            }
                            status__ = Some(map_.next_value::<OrderStatus>()? as i32);
                        }
                        GeneratedField::SubmittedAt => {
                            if submitted_at__.is_some() {
                                return Err(serde::de::Error::duplicate_field("submittedAt"));
                            }
                            submitted_at__ = map_.next_value()?;
                        }
                        GeneratedField::ErrorMessage => {
                            if error_message__.is_some() {
                                return Err(serde::de::Error::duplicate_field("errorMessage"));
                            }
                            error_message__ = map_.next_value()?;
                        }
                    }
                }
                Ok(SubmitOrderResponse {
                    order_id: order_id__.unwrap_or_default(),
                    client_order_id: client_order_id__.unwrap_or_default(),
                    status: status__.unwrap_or_default(),
                    submitted_at: submitted_at__,
                    error_message: error_message__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.SubmitOrderResponse", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for SubscribeMarketDataRequest {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if !self.symbols.is_empty() {
            len += 1;
        }
        if self.include_options {
            len += 1;
        }
        if !self.bar_timeframes.is_empty() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.SubscribeMarketDataRequest", len)?;
        if !self.symbols.is_empty() {
            struct_ser.serialize_field("symbols", &self.symbols)?;
        }
        if self.include_options {
            struct_ser.serialize_field("includeOptions", &self.include_options)?;
        }
        if !self.bar_timeframes.is_empty() {
            struct_ser.serialize_field("barTimeframes", &self.bar_timeframes)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for SubscribeMarketDataRequest {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "symbols",
            "include_options",
            "includeOptions",
            "bar_timeframes",
            "barTimeframes",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Symbols,
            IncludeOptions,
            BarTimeframes,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "symbols" => Ok(GeneratedField::Symbols),
                            "includeOptions" | "include_options" => Ok(GeneratedField::IncludeOptions),
                            "barTimeframes" | "bar_timeframes" => Ok(GeneratedField::BarTimeframes),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = SubscribeMarketDataRequest;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.SubscribeMarketDataRequest")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<SubscribeMarketDataRequest, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut symbols__ = None;
                let mut include_options__ = None;
                let mut bar_timeframes__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Symbols => {
                            if symbols__.is_some() {
                                return Err(serde::de::Error::duplicate_field("symbols"));
                            }
                            symbols__ = Some(map_.next_value()?);
                        }
                        GeneratedField::IncludeOptions => {
                            if include_options__.is_some() {
                                return Err(serde::de::Error::duplicate_field("includeOptions"));
                            }
                            include_options__ = Some(map_.next_value()?);
                        }
                        GeneratedField::BarTimeframes => {
                            if bar_timeframes__.is_some() {
                                return Err(serde::de::Error::duplicate_field("barTimeframes"));
                            }
                            bar_timeframes__ = 
                                Some(map_.next_value::<Vec<::pbjson::private::NumberDeserialize<_>>>()?
                                    .into_iter().map(|x| x.0).collect())
                            ;
                        }
                    }
                }
                Ok(SubscribeMarketDataRequest {
                    symbols: symbols__.unwrap_or_default(),
                    include_options: include_options__.unwrap_or_default(),
                    bar_timeframes: bar_timeframes__.unwrap_or_default(),
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.SubscribeMarketDataRequest", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for SubscribeMarketDataResponse {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if self.update.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.SubscribeMarketDataResponse", len)?;
        if let Some(v) = self.update.as_ref() {
            match v {
                subscribe_market_data_response::Update::Quote(v) => {
                    struct_ser.serialize_field("quote", v)?;
                }
                subscribe_market_data_response::Update::Bar(v) => {
                    struct_ser.serialize_field("bar", v)?;
                }
                subscribe_market_data_response::Update::OptionQuote(v) => {
                    struct_ser.serialize_field("optionQuote", v)?;
                }
                subscribe_market_data_response::Update::Snapshot(v) => {
                    struct_ser.serialize_field("snapshot", v)?;
                }
            }
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for SubscribeMarketDataResponse {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "quote",
            "bar",
            "option_quote",
            "optionQuote",
            "snapshot",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Quote,
            Bar,
            OptionQuote,
            Snapshot,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "quote" => Ok(GeneratedField::Quote),
                            "bar" => Ok(GeneratedField::Bar),
                            "optionQuote" | "option_quote" => Ok(GeneratedField::OptionQuote),
                            "snapshot" => Ok(GeneratedField::Snapshot),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = SubscribeMarketDataResponse;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.SubscribeMarketDataResponse")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<SubscribeMarketDataResponse, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut update__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Quote => {
                            if update__.is_some() {
                                return Err(serde::de::Error::duplicate_field("quote"));
                            }
                            update__ = map_.next_value::<::std::option::Option<_>>()?.map(subscribe_market_data_response::Update::Quote)
;
                        }
                        GeneratedField::Bar => {
                            if update__.is_some() {
                                return Err(serde::de::Error::duplicate_field("bar"));
                            }
                            update__ = map_.next_value::<::std::option::Option<_>>()?.map(subscribe_market_data_response::Update::Bar)
;
                        }
                        GeneratedField::OptionQuote => {
                            if update__.is_some() {
                                return Err(serde::de::Error::duplicate_field("optionQuote"));
                            }
                            update__ = map_.next_value::<::std::option::Option<_>>()?.map(subscribe_market_data_response::Update::OptionQuote)
;
                        }
                        GeneratedField::Snapshot => {
                            if update__.is_some() {
                                return Err(serde::de::Error::duplicate_field("snapshot"));
                            }
                            update__ = map_.next_value::<::std::option::Option<_>>()?.map(subscribe_market_data_response::Update::Snapshot)
;
                        }
                    }
                }
                Ok(SubscribeMarketDataResponse {
                    update: update__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.SubscribeMarketDataResponse", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for SymbolSnapshot {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut len = 0;
        if !self.symbol.is_empty() {
            len += 1;
        }
        if self.quote.is_some() {
            len += 1;
        }
        if !self.bars.is_empty() {
            len += 1;
        }
        if self.market_status != 0 {
            len += 1;
        }
        if self.day_high != 0. {
            len += 1;
        }
        if self.day_low != 0. {
            len += 1;
        }
        if self.prev_close != 0. {
            len += 1;
        }
        if self.open != 0. {
            len += 1;
        }
        if self.as_of.is_some() {
            len += 1;
        }
        let mut struct_ser = serializer.serialize_struct("cream.v1.SymbolSnapshot", len)?;
        if !self.symbol.is_empty() {
            struct_ser.serialize_field("symbol", &self.symbol)?;
        }
        if let Some(v) = self.quote.as_ref() {
            struct_ser.serialize_field("quote", v)?;
        }
        if !self.bars.is_empty() {
            struct_ser.serialize_field("bars", &self.bars)?;
        }
        if self.market_status != 0 {
            let v = MarketStatus::try_from(self.market_status)
                .map_err(|_| serde::ser::Error::custom(format!("Invalid variant {}", self.market_status)))?;
            struct_ser.serialize_field("marketStatus", &v)?;
        }
        if self.day_high != 0. {
            struct_ser.serialize_field("dayHigh", &self.day_high)?;
        }
        if self.day_low != 0. {
            struct_ser.serialize_field("dayLow", &self.day_low)?;
        }
        if self.prev_close != 0. {
            struct_ser.serialize_field("prevClose", &self.prev_close)?;
        }
        if self.open != 0. {
            struct_ser.serialize_field("open", &self.open)?;
        }
        if let Some(v) = self.as_of.as_ref() {
            struct_ser.serialize_field("asOf", v)?;
        }
        struct_ser.end()
    }
}
impl<'de> serde::Deserialize<'de> for SymbolSnapshot {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "symbol",
            "quote",
            "bars",
            "market_status",
            "marketStatus",
            "day_high",
            "dayHigh",
            "day_low",
            "dayLow",
            "prev_close",
            "prevClose",
            "open",
            "as_of",
            "asOf",
        ];

        #[allow(clippy::enum_variant_names)]
        enum GeneratedField {
            Symbol,
            Quote,
            Bars,
            MarketStatus,
            DayHigh,
            DayLow,
            PrevClose,
            Open,
            AsOf,
        }
        impl<'de> serde::Deserialize<'de> for GeneratedField {
            fn deserialize<D>(deserializer: D) -> std::result::Result<GeneratedField, D::Error>
            where
                D: serde::Deserializer<'de>,
            {
                struct GeneratedVisitor;

                impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
                    type Value = GeneratedField;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        write!(formatter, "expected one of: {:?}", &FIELDS)
                    }

                    #[allow(unused_variables)]
                    fn visit_str<E>(self, value: &str) -> std::result::Result<GeneratedField, E>
                    where
                        E: serde::de::Error,
                    {
                        match value {
                            "symbol" => Ok(GeneratedField::Symbol),
                            "quote" => Ok(GeneratedField::Quote),
                            "bars" => Ok(GeneratedField::Bars),
                            "marketStatus" | "market_status" => Ok(GeneratedField::MarketStatus),
                            "dayHigh" | "day_high" => Ok(GeneratedField::DayHigh),
                            "dayLow" | "day_low" => Ok(GeneratedField::DayLow),
                            "prevClose" | "prev_close" => Ok(GeneratedField::PrevClose),
                            "open" => Ok(GeneratedField::Open),
                            "asOf" | "as_of" => Ok(GeneratedField::AsOf),
                            _ => Err(serde::de::Error::unknown_field(value, FIELDS)),
                        }
                    }
                }
                deserializer.deserialize_identifier(GeneratedVisitor)
            }
        }
        struct GeneratedVisitor;
        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = SymbolSnapshot;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("struct cream.v1.SymbolSnapshot")
            }

            fn visit_map<V>(self, mut map_: V) -> std::result::Result<SymbolSnapshot, V::Error>
                where
                    V: serde::de::MapAccess<'de>,
            {
                let mut symbol__ = None;
                let mut quote__ = None;
                let mut bars__ = None;
                let mut market_status__ = None;
                let mut day_high__ = None;
                let mut day_low__ = None;
                let mut prev_close__ = None;
                let mut open__ = None;
                let mut as_of__ = None;
                while let Some(k) = map_.next_key()? {
                    match k {
                        GeneratedField::Symbol => {
                            if symbol__.is_some() {
                                return Err(serde::de::Error::duplicate_field("symbol"));
                            }
                            symbol__ = Some(map_.next_value()?);
                        }
                        GeneratedField::Quote => {
                            if quote__.is_some() {
                                return Err(serde::de::Error::duplicate_field("quote"));
                            }
                            quote__ = map_.next_value()?;
                        }
                        GeneratedField::Bars => {
                            if bars__.is_some() {
                                return Err(serde::de::Error::duplicate_field("bars"));
                            }
                            bars__ = Some(map_.next_value()?);
                        }
                        GeneratedField::MarketStatus => {
                            if market_status__.is_some() {
                                return Err(serde::de::Error::duplicate_field("marketStatus"));
                            }
                            market_status__ = Some(map_.next_value::<MarketStatus>()? as i32);
                        }
                        GeneratedField::DayHigh => {
                            if day_high__.is_some() {
                                return Err(serde::de::Error::duplicate_field("dayHigh"));
                            }
                            day_high__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::DayLow => {
                            if day_low__.is_some() {
                                return Err(serde::de::Error::duplicate_field("dayLow"));
                            }
                            day_low__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::PrevClose => {
                            if prev_close__.is_some() {
                                return Err(serde::de::Error::duplicate_field("prevClose"));
                            }
                            prev_close__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::Open => {
                            if open__.is_some() {
                                return Err(serde::de::Error::duplicate_field("open"));
                            }
                            open__ = 
                                Some(map_.next_value::<::pbjson::private::NumberDeserialize<_>>()?.0)
                            ;
                        }
                        GeneratedField::AsOf => {
                            if as_of__.is_some() {
                                return Err(serde::de::Error::duplicate_field("asOf"));
                            }
                            as_of__ = map_.next_value()?;
                        }
                    }
                }
                Ok(SymbolSnapshot {
                    symbol: symbol__.unwrap_or_default(),
                    quote: quote__,
                    bars: bars__.unwrap_or_default(),
                    market_status: market_status__.unwrap_or_default(),
                    day_high: day_high__.unwrap_or_default(),
                    day_low: day_low__.unwrap_or_default(),
                    prev_close: prev_close__.unwrap_or_default(),
                    open: open__.unwrap_or_default(),
                    as_of: as_of__,
                })
            }
        }
        deserializer.deserialize_struct("cream.v1.SymbolSnapshot", FIELDS, GeneratedVisitor)
    }
}
impl serde::Serialize for TimeInForce {
    #[allow(deprecated)]
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let variant = match self {
            Self::Unspecified => "TIME_IN_FORCE_UNSPECIFIED",
            Self::Day => "TIME_IN_FORCE_DAY",
            Self::Gtc => "TIME_IN_FORCE_GTC",
            Self::Ioc => "TIME_IN_FORCE_IOC",
            Self::Fok => "TIME_IN_FORCE_FOK",
        };
        serializer.serialize_str(variant)
    }
}
impl<'de> serde::Deserialize<'de> for TimeInForce {
    #[allow(deprecated)]
    fn deserialize<D>(deserializer: D) -> std::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        const FIELDS: &[&str] = &[
            "TIME_IN_FORCE_UNSPECIFIED",
            "TIME_IN_FORCE_DAY",
            "TIME_IN_FORCE_GTC",
            "TIME_IN_FORCE_IOC",
            "TIME_IN_FORCE_FOK",
        ];

        struct GeneratedVisitor;

        impl<'de> serde::de::Visitor<'de> for GeneratedVisitor {
            type Value = TimeInForce;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(formatter, "expected one of: {:?}", &FIELDS)
            }

            fn visit_i64<E>(self, v: i64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Signed(v), &self)
                    })
            }

            fn visit_u64<E>(self, v: u64) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                i32::try_from(v)
                    .ok()
                    .and_then(|x| x.try_into().ok())
                    .ok_or_else(|| {
                        serde::de::Error::invalid_value(serde::de::Unexpected::Unsigned(v), &self)
                    })
            }

            fn visit_str<E>(self, value: &str) -> std::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                match value {
                    "TIME_IN_FORCE_UNSPECIFIED" => Ok(TimeInForce::Unspecified),
                    "TIME_IN_FORCE_DAY" => Ok(TimeInForce::Day),
                    "TIME_IN_FORCE_GTC" => Ok(TimeInForce::Gtc),
                    "TIME_IN_FORCE_IOC" => Ok(TimeInForce::Ioc),
                    "TIME_IN_FORCE_FOK" => Ok(TimeInForce::Fok),
                    _ => Err(serde::de::Error::unknown_variant(value, FIELDS)),
                }
            }
        }
        deserializer.deserialize_any(GeneratedVisitor)
    }
}
