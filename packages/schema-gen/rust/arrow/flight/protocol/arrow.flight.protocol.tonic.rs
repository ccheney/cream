// @generated
/// Generated client implementations.
pub mod flight_service_client {
    #![allow(
        unused_variables,
        dead_code,
        missing_docs,
        clippy::wildcard_imports,
        clippy::let_unit_value,
    )]
    use tonic::codegen::*;
    use tonic::codegen::http::Uri;
    #[derive(Debug, Clone)]
    pub struct FlightServiceClient<T> {
        inner: tonic::client::Grpc<T>,
    }
    impl FlightServiceClient<tonic::transport::Channel> {
        /// Attempt to create a new client by connecting to a given endpoint.
        pub async fn connect<D>(dst: D) -> Result<Self, tonic::transport::Error>
        where
            D: TryInto<tonic::transport::Endpoint>,
            D::Error: Into<StdError>,
        {
            let conn = tonic::transport::Endpoint::new(dst)?.connect().await?;
            Ok(Self::new(conn))
        }
    }
    impl<T> FlightServiceClient<T>
    where
        T: tonic::client::GrpcService<tonic::body::Body>,
        T::Error: Into<StdError>,
        T::ResponseBody: Body<Data = Bytes> + std::marker::Send + 'static,
        <T::ResponseBody as Body>::Error: Into<StdError> + std::marker::Send,
    {
        pub fn new(inner: T) -> Self {
            let inner = tonic::client::Grpc::new(inner);
            Self { inner }
        }
        pub fn with_origin(inner: T, origin: Uri) -> Self {
            let inner = tonic::client::Grpc::with_origin(inner, origin);
            Self { inner }
        }
        pub fn with_interceptor<F>(
            inner: T,
            interceptor: F,
        ) -> FlightServiceClient<InterceptedService<T, F>>
        where
            F: tonic::service::Interceptor,
            T::ResponseBody: Default,
            T: tonic::codegen::Service<
                http::Request<tonic::body::Body>,
                Response = http::Response<
                    <T as tonic::client::GrpcService<tonic::body::Body>>::ResponseBody,
                >,
            >,
            <T as tonic::codegen::Service<
                http::Request<tonic::body::Body>,
            >>::Error: Into<StdError> + std::marker::Send + std::marker::Sync,
        {
            FlightServiceClient::new(InterceptedService::new(inner, interceptor))
        }
        /// Compress requests with the given encoding.
        ///
        /// This requires the server to support it otherwise it might respond with an
        /// error.
        #[must_use]
        pub fn send_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.inner = self.inner.send_compressed(encoding);
            self
        }
        /// Enable decompressing responses.
        #[must_use]
        pub fn accept_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.inner = self.inner.accept_compressed(encoding);
            self
        }
        /// Limits the maximum size of a decoded message.
        ///
        /// Default: `4MB`
        #[must_use]
        pub fn max_decoding_message_size(mut self, limit: usize) -> Self {
            self.inner = self.inner.max_decoding_message_size(limit);
            self
        }
        /// Limits the maximum size of an encoded message.
        ///
        /// Default: `usize::MAX`
        #[must_use]
        pub fn max_encoding_message_size(mut self, limit: usize) -> Self {
            self.inner = self.inner.max_encoding_message_size(limit);
            self
        }
        pub async fn handshake(
            &mut self,
            request: impl tonic::IntoStreamingRequest<Message = super::HandshakeRequest>,
        ) -> std::result::Result<
            tonic::Response<tonic::codec::Streaming<super::HandshakeResponse>>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/arrow.flight.protocol.FlightService/Handshake",
            );
            let mut req = request.into_streaming_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new("arrow.flight.protocol.FlightService", "Handshake"),
                );
            self.inner.streaming(req, path, codec).await
        }
        pub async fn list_flights(
            &mut self,
            request: impl tonic::IntoRequest<super::Criteria>,
        ) -> std::result::Result<
            tonic::Response<tonic::codec::Streaming<super::FlightInfo>>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/arrow.flight.protocol.FlightService/ListFlights",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new("arrow.flight.protocol.FlightService", "ListFlights"),
                );
            self.inner.server_streaming(req, path, codec).await
        }
        pub async fn get_flight_info(
            &mut self,
            request: impl tonic::IntoRequest<super::FlightDescriptor>,
        ) -> std::result::Result<tonic::Response<super::FlightInfo>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/arrow.flight.protocol.FlightService/GetFlightInfo",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "arrow.flight.protocol.FlightService",
                        "GetFlightInfo",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn poll_flight_info(
            &mut self,
            request: impl tonic::IntoRequest<super::FlightDescriptor>,
        ) -> std::result::Result<tonic::Response<super::PollInfo>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/arrow.flight.protocol.FlightService/PollFlightInfo",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new(
                        "arrow.flight.protocol.FlightService",
                        "PollFlightInfo",
                    ),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn get_schema(
            &mut self,
            request: impl tonic::IntoRequest<super::FlightDescriptor>,
        ) -> std::result::Result<tonic::Response<super::SchemaResult>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/arrow.flight.protocol.FlightService/GetSchema",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new("arrow.flight.protocol.FlightService", "GetSchema"),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn do_get(
            &mut self,
            request: impl tonic::IntoRequest<super::Ticket>,
        ) -> std::result::Result<
            tonic::Response<tonic::codec::Streaming<super::FlightData>>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/arrow.flight.protocol.FlightService/DoGet",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("arrow.flight.protocol.FlightService", "DoGet"));
            self.inner.server_streaming(req, path, codec).await
        }
        pub async fn do_put(
            &mut self,
            request: impl tonic::IntoStreamingRequest<Message = super::FlightData>,
        ) -> std::result::Result<
            tonic::Response<tonic::codec::Streaming<super::PutResult>>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/arrow.flight.protocol.FlightService/DoPut",
            );
            let mut req = request.into_streaming_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("arrow.flight.protocol.FlightService", "DoPut"));
            self.inner.streaming(req, path, codec).await
        }
        pub async fn do_exchange(
            &mut self,
            request: impl tonic::IntoStreamingRequest<Message = super::FlightData>,
        ) -> std::result::Result<
            tonic::Response<tonic::codec::Streaming<super::FlightData>>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/arrow.flight.protocol.FlightService/DoExchange",
            );
            let mut req = request.into_streaming_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new("arrow.flight.protocol.FlightService", "DoExchange"),
                );
            self.inner.streaming(req, path, codec).await
        }
        pub async fn do_action(
            &mut self,
            request: impl tonic::IntoRequest<super::Action>,
        ) -> std::result::Result<
            tonic::Response<tonic::codec::Streaming<super::Result>>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/arrow.flight.protocol.FlightService/DoAction",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new("arrow.flight.protocol.FlightService", "DoAction"),
                );
            self.inner.server_streaming(req, path, codec).await
        }
        pub async fn list_actions(
            &mut self,
            request: impl tonic::IntoRequest<super::Empty>,
        ) -> std::result::Result<
            tonic::Response<tonic::codec::Streaming<super::ActionType>>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/arrow.flight.protocol.FlightService/ListActions",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new("arrow.flight.protocol.FlightService", "ListActions"),
                );
            self.inner.server_streaming(req, path, codec).await
        }
    }
}
/// Generated server implementations.
pub mod flight_service_server {
    #![allow(
        unused_variables,
        dead_code,
        missing_docs,
        clippy::wildcard_imports,
        clippy::let_unit_value,
    )]
    use tonic::codegen::*;
    /// Generated trait containing gRPC methods that should be implemented for use with FlightServiceServer.
    #[async_trait]
    pub trait FlightService: std::marker::Send + std::marker::Sync + 'static {
        /// Server streaming response type for the Handshake method.
        type HandshakeStream: tonic::codegen::tokio_stream::Stream<
                Item = std::result::Result<super::HandshakeResponse, tonic::Status>,
            >
            + std::marker::Send
            + 'static;
        async fn handshake(
            &self,
            request: tonic::Request<tonic::Streaming<super::HandshakeRequest>>,
        ) -> std::result::Result<tonic::Response<Self::HandshakeStream>, tonic::Status>;
        /// Server streaming response type for the ListFlights method.
        type ListFlightsStream: tonic::codegen::tokio_stream::Stream<
                Item = std::result::Result<super::FlightInfo, tonic::Status>,
            >
            + std::marker::Send
            + 'static;
        async fn list_flights(
            &self,
            request: tonic::Request<super::Criteria>,
        ) -> std::result::Result<
            tonic::Response<Self::ListFlightsStream>,
            tonic::Status,
        >;
        async fn get_flight_info(
            &self,
            request: tonic::Request<super::FlightDescriptor>,
        ) -> std::result::Result<tonic::Response<super::FlightInfo>, tonic::Status>;
        async fn poll_flight_info(
            &self,
            request: tonic::Request<super::FlightDescriptor>,
        ) -> std::result::Result<tonic::Response<super::PollInfo>, tonic::Status>;
        async fn get_schema(
            &self,
            request: tonic::Request<super::FlightDescriptor>,
        ) -> std::result::Result<tonic::Response<super::SchemaResult>, tonic::Status>;
        /// Server streaming response type for the DoGet method.
        type DoGetStream: tonic::codegen::tokio_stream::Stream<
                Item = std::result::Result<super::FlightData, tonic::Status>,
            >
            + std::marker::Send
            + 'static;
        async fn do_get(
            &self,
            request: tonic::Request<super::Ticket>,
        ) -> std::result::Result<tonic::Response<Self::DoGetStream>, tonic::Status>;
        /// Server streaming response type for the DoPut method.
        type DoPutStream: tonic::codegen::tokio_stream::Stream<
                Item = std::result::Result<super::PutResult, tonic::Status>,
            >
            + std::marker::Send
            + 'static;
        async fn do_put(
            &self,
            request: tonic::Request<tonic::Streaming<super::FlightData>>,
        ) -> std::result::Result<tonic::Response<Self::DoPutStream>, tonic::Status>;
        /// Server streaming response type for the DoExchange method.
        type DoExchangeStream: tonic::codegen::tokio_stream::Stream<
                Item = std::result::Result<super::FlightData, tonic::Status>,
            >
            + std::marker::Send
            + 'static;
        async fn do_exchange(
            &self,
            request: tonic::Request<tonic::Streaming<super::FlightData>>,
        ) -> std::result::Result<tonic::Response<Self::DoExchangeStream>, tonic::Status>;
        /// Server streaming response type for the DoAction method.
        type DoActionStream: tonic::codegen::tokio_stream::Stream<
                Item = std::result::Result<super::Result, tonic::Status>,
            >
            + std::marker::Send
            + 'static;
        async fn do_action(
            &self,
            request: tonic::Request<super::Action>,
        ) -> std::result::Result<tonic::Response<Self::DoActionStream>, tonic::Status>;
        /// Server streaming response type for the ListActions method.
        type ListActionsStream: tonic::codegen::tokio_stream::Stream<
                Item = std::result::Result<super::ActionType, tonic::Status>,
            >
            + std::marker::Send
            + 'static;
        async fn list_actions(
            &self,
            request: tonic::Request<super::Empty>,
        ) -> std::result::Result<
            tonic::Response<Self::ListActionsStream>,
            tonic::Status,
        >;
    }
    #[derive(Debug)]
    pub struct FlightServiceServer<T> {
        inner: Arc<T>,
        accept_compression_encodings: EnabledCompressionEncodings,
        send_compression_encodings: EnabledCompressionEncodings,
        max_decoding_message_size: Option<usize>,
        max_encoding_message_size: Option<usize>,
    }
    impl<T> FlightServiceServer<T> {
        pub fn new(inner: T) -> Self {
            Self::from_arc(Arc::new(inner))
        }
        pub fn from_arc(inner: Arc<T>) -> Self {
            Self {
                inner,
                accept_compression_encodings: Default::default(),
                send_compression_encodings: Default::default(),
                max_decoding_message_size: None,
                max_encoding_message_size: None,
            }
        }
        pub fn with_interceptor<F>(
            inner: T,
            interceptor: F,
        ) -> InterceptedService<Self, F>
        where
            F: tonic::service::Interceptor,
        {
            InterceptedService::new(Self::new(inner), interceptor)
        }
        /// Enable decompressing requests with the given encoding.
        #[must_use]
        pub fn accept_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.accept_compression_encodings.enable(encoding);
            self
        }
        /// Compress responses with the given encoding, if the client supports it.
        #[must_use]
        pub fn send_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.send_compression_encodings.enable(encoding);
            self
        }
        /// Limits the maximum size of a decoded message.
        ///
        /// Default: `4MB`
        #[must_use]
        pub fn max_decoding_message_size(mut self, limit: usize) -> Self {
            self.max_decoding_message_size = Some(limit);
            self
        }
        /// Limits the maximum size of an encoded message.
        ///
        /// Default: `usize::MAX`
        #[must_use]
        pub fn max_encoding_message_size(mut self, limit: usize) -> Self {
            self.max_encoding_message_size = Some(limit);
            self
        }
    }
    impl<T, B> tonic::codegen::Service<http::Request<B>> for FlightServiceServer<T>
    where
        T: FlightService,
        B: Body + std::marker::Send + 'static,
        B::Error: Into<StdError> + std::marker::Send + 'static,
    {
        type Response = http::Response<tonic::body::Body>;
        type Error = std::convert::Infallible;
        type Future = BoxFuture<Self::Response, Self::Error>;
        fn poll_ready(
            &mut self,
            _cx: &mut Context<'_>,
        ) -> Poll<std::result::Result<(), Self::Error>> {
            Poll::Ready(Ok(()))
        }
        fn call(&mut self, req: http::Request<B>) -> Self::Future {
            match req.uri().path() {
                "/arrow.flight.protocol.FlightService/Handshake" => {
                    #[allow(non_camel_case_types)]
                    struct HandshakeSvc<T: FlightService>(pub Arc<T>);
                    impl<
                        T: FlightService,
                    > tonic::server::StreamingService<super::HandshakeRequest>
                    for HandshakeSvc<T> {
                        type Response = super::HandshakeResponse;
                        type ResponseStream = T::HandshakeStream;
                        type Future = BoxFuture<
                            tonic::Response<Self::ResponseStream>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<
                                tonic::Streaming<super::HandshakeRequest>,
                            >,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as FlightService>::handshake(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = HandshakeSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.streaming(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/arrow.flight.protocol.FlightService/ListFlights" => {
                    #[allow(non_camel_case_types)]
                    struct ListFlightsSvc<T: FlightService>(pub Arc<T>);
                    impl<
                        T: FlightService,
                    > tonic::server::ServerStreamingService<super::Criteria>
                    for ListFlightsSvc<T> {
                        type Response = super::FlightInfo;
                        type ResponseStream = T::ListFlightsStream;
                        type Future = BoxFuture<
                            tonic::Response<Self::ResponseStream>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::Criteria>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as FlightService>::list_flights(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = ListFlightsSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.server_streaming(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/arrow.flight.protocol.FlightService/GetFlightInfo" => {
                    #[allow(non_camel_case_types)]
                    struct GetFlightInfoSvc<T: FlightService>(pub Arc<T>);
                    impl<
                        T: FlightService,
                    > tonic::server::UnaryService<super::FlightDescriptor>
                    for GetFlightInfoSvc<T> {
                        type Response = super::FlightInfo;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::FlightDescriptor>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as FlightService>::get_flight_info(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = GetFlightInfoSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/arrow.flight.protocol.FlightService/PollFlightInfo" => {
                    #[allow(non_camel_case_types)]
                    struct PollFlightInfoSvc<T: FlightService>(pub Arc<T>);
                    impl<
                        T: FlightService,
                    > tonic::server::UnaryService<super::FlightDescriptor>
                    for PollFlightInfoSvc<T> {
                        type Response = super::PollInfo;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::FlightDescriptor>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as FlightService>::poll_flight_info(&inner, request)
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = PollFlightInfoSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/arrow.flight.protocol.FlightService/GetSchema" => {
                    #[allow(non_camel_case_types)]
                    struct GetSchemaSvc<T: FlightService>(pub Arc<T>);
                    impl<
                        T: FlightService,
                    > tonic::server::UnaryService<super::FlightDescriptor>
                    for GetSchemaSvc<T> {
                        type Response = super::SchemaResult;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::FlightDescriptor>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as FlightService>::get_schema(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = GetSchemaSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/arrow.flight.protocol.FlightService/DoGet" => {
                    #[allow(non_camel_case_types)]
                    struct DoGetSvc<T: FlightService>(pub Arc<T>);
                    impl<
                        T: FlightService,
                    > tonic::server::ServerStreamingService<super::Ticket>
                    for DoGetSvc<T> {
                        type Response = super::FlightData;
                        type ResponseStream = T::DoGetStream;
                        type Future = BoxFuture<
                            tonic::Response<Self::ResponseStream>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::Ticket>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as FlightService>::do_get(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = DoGetSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.server_streaming(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/arrow.flight.protocol.FlightService/DoPut" => {
                    #[allow(non_camel_case_types)]
                    struct DoPutSvc<T: FlightService>(pub Arc<T>);
                    impl<
                        T: FlightService,
                    > tonic::server::StreamingService<super::FlightData>
                    for DoPutSvc<T> {
                        type Response = super::PutResult;
                        type ResponseStream = T::DoPutStream;
                        type Future = BoxFuture<
                            tonic::Response<Self::ResponseStream>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<tonic::Streaming<super::FlightData>>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as FlightService>::do_put(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = DoPutSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.streaming(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/arrow.flight.protocol.FlightService/DoExchange" => {
                    #[allow(non_camel_case_types)]
                    struct DoExchangeSvc<T: FlightService>(pub Arc<T>);
                    impl<
                        T: FlightService,
                    > tonic::server::StreamingService<super::FlightData>
                    for DoExchangeSvc<T> {
                        type Response = super::FlightData;
                        type ResponseStream = T::DoExchangeStream;
                        type Future = BoxFuture<
                            tonic::Response<Self::ResponseStream>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<tonic::Streaming<super::FlightData>>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as FlightService>::do_exchange(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = DoExchangeSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.streaming(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/arrow.flight.protocol.FlightService/DoAction" => {
                    #[allow(non_camel_case_types)]
                    struct DoActionSvc<T: FlightService>(pub Arc<T>);
                    impl<
                        T: FlightService,
                    > tonic::server::ServerStreamingService<super::Action>
                    for DoActionSvc<T> {
                        type Response = super::Result;
                        type ResponseStream = T::DoActionStream;
                        type Future = BoxFuture<
                            tonic::Response<Self::ResponseStream>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::Action>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as FlightService>::do_action(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = DoActionSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.server_streaming(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/arrow.flight.protocol.FlightService/ListActions" => {
                    #[allow(non_camel_case_types)]
                    struct ListActionsSvc<T: FlightService>(pub Arc<T>);
                    impl<
                        T: FlightService,
                    > tonic::server::ServerStreamingService<super::Empty>
                    for ListActionsSvc<T> {
                        type Response = super::ActionType;
                        type ResponseStream = T::ListActionsStream;
                        type Future = BoxFuture<
                            tonic::Response<Self::ResponseStream>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::Empty>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as FlightService>::list_actions(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = ListActionsSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.server_streaming(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                _ => {
                    Box::pin(async move {
                        let mut response = http::Response::new(
                            tonic::body::Body::default(),
                        );
                        let headers = response.headers_mut();
                        headers
                            .insert(
                                tonic::Status::GRPC_STATUS,
                                (tonic::Code::Unimplemented as i32).into(),
                            );
                        headers
                            .insert(
                                http::header::CONTENT_TYPE,
                                tonic::metadata::GRPC_CONTENT_TYPE,
                            );
                        Ok(response)
                    })
                }
            }
        }
    }
    impl<T> Clone for FlightServiceServer<T> {
        fn clone(&self) -> Self {
            let inner = self.inner.clone();
            Self {
                inner,
                accept_compression_encodings: self.accept_compression_encodings,
                send_compression_encodings: self.send_compression_encodings,
                max_decoding_message_size: self.max_decoding_message_size,
                max_encoding_message_size: self.max_encoding_message_size,
            }
        }
    }
    /// Generated gRPC service name
    pub const SERVICE_NAME: &str = "arrow.flight.protocol.FlightService";
    impl<T> tonic::server::NamedService for FlightServiceServer<T> {
        const NAME: &'static str = SERVICE_NAME;
    }
}
