// @generated
/// Generated client implementations.
pub mod execution_service_client {
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
    pub struct ExecutionServiceClient<T> {
        inner: tonic::client::Grpc<T>,
    }
    impl ExecutionServiceClient<tonic::transport::Channel> {
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
    impl<T> ExecutionServiceClient<T>
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
        ) -> ExecutionServiceClient<InterceptedService<T, F>>
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
            ExecutionServiceClient::new(InterceptedService::new(inner, interceptor))
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
        pub async fn check_constraints(
            &mut self,
            request: impl tonic::IntoRequest<super::CheckConstraintsRequest>,
        ) -> std::result::Result<
            tonic::Response<super::CheckConstraintsResponse>,
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
                "/cream.v1.ExecutionService/CheckConstraints",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new("cream.v1.ExecutionService", "CheckConstraints"),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn submit_order(
            &mut self,
            request: impl tonic::IntoRequest<super::SubmitOrderRequest>,
        ) -> std::result::Result<
            tonic::Response<super::SubmitOrderResponse>,
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
                "/cream.v1.ExecutionService/SubmitOrder",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("cream.v1.ExecutionService", "SubmitOrder"));
            self.inner.unary(req, path, codec).await
        }
        pub async fn get_order_state(
            &mut self,
            request: impl tonic::IntoRequest<super::GetOrderStateRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetOrderStateResponse>,
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
                "/cream.v1.ExecutionService/GetOrderState",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("cream.v1.ExecutionService", "GetOrderState"));
            self.inner.unary(req, path, codec).await
        }
        pub async fn cancel_order(
            &mut self,
            request: impl tonic::IntoRequest<super::CancelOrderRequest>,
        ) -> std::result::Result<
            tonic::Response<super::CancelOrderResponse>,
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
                "/cream.v1.ExecutionService/CancelOrder",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("cream.v1.ExecutionService", "CancelOrder"));
            self.inner.unary(req, path, codec).await
        }
        pub async fn stream_executions(
            &mut self,
            request: impl tonic::IntoRequest<super::StreamExecutionsRequest>,
        ) -> std::result::Result<
            tonic::Response<tonic::codec::Streaming<super::StreamExecutionsResponse>>,
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
                "/cream.v1.ExecutionService/StreamExecutions",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new("cream.v1.ExecutionService", "StreamExecutions"),
                );
            self.inner.server_streaming(req, path, codec).await
        }
        pub async fn get_account_state(
            &mut self,
            request: impl tonic::IntoRequest<super::GetAccountStateRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetAccountStateResponse>,
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
                "/cream.v1.ExecutionService/GetAccountState",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("cream.v1.ExecutionService", "GetAccountState"));
            self.inner.unary(req, path, codec).await
        }
        pub async fn get_positions(
            &mut self,
            request: impl tonic::IntoRequest<super::GetPositionsRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetPositionsResponse>,
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
                "/cream.v1.ExecutionService/GetPositions",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("cream.v1.ExecutionService", "GetPositions"));
            self.inner.unary(req, path, codec).await
        }
    }
}
/// Generated server implementations.
pub mod execution_service_server {
    #![allow(
        unused_variables,
        dead_code,
        missing_docs,
        clippy::wildcard_imports,
        clippy::let_unit_value,
    )]
    use tonic::codegen::*;
    /// Generated trait containing gRPC methods that should be implemented for use with ExecutionServiceServer.
    #[async_trait]
    pub trait ExecutionService: std::marker::Send + std::marker::Sync + 'static {
        async fn check_constraints(
            &self,
            request: tonic::Request<super::CheckConstraintsRequest>,
        ) -> std::result::Result<
            tonic::Response<super::CheckConstraintsResponse>,
            tonic::Status,
        >;
        async fn submit_order(
            &self,
            request: tonic::Request<super::SubmitOrderRequest>,
        ) -> std::result::Result<
            tonic::Response<super::SubmitOrderResponse>,
            tonic::Status,
        >;
        async fn get_order_state(
            &self,
            request: tonic::Request<super::GetOrderStateRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetOrderStateResponse>,
            tonic::Status,
        >;
        async fn cancel_order(
            &self,
            request: tonic::Request<super::CancelOrderRequest>,
        ) -> std::result::Result<
            tonic::Response<super::CancelOrderResponse>,
            tonic::Status,
        >;
        /// Server streaming response type for the StreamExecutions method.
        type StreamExecutionsStream: tonic::codegen::tokio_stream::Stream<
                Item = std::result::Result<
                    super::StreamExecutionsResponse,
                    tonic::Status,
                >,
            >
            + std::marker::Send
            + 'static;
        async fn stream_executions(
            &self,
            request: tonic::Request<super::StreamExecutionsRequest>,
        ) -> std::result::Result<
            tonic::Response<Self::StreamExecutionsStream>,
            tonic::Status,
        >;
        async fn get_account_state(
            &self,
            request: tonic::Request<super::GetAccountStateRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetAccountStateResponse>,
            tonic::Status,
        >;
        async fn get_positions(
            &self,
            request: tonic::Request<super::GetPositionsRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetPositionsResponse>,
            tonic::Status,
        >;
    }
    #[derive(Debug)]
    pub struct ExecutionServiceServer<T> {
        inner: Arc<T>,
        accept_compression_encodings: EnabledCompressionEncodings,
        send_compression_encodings: EnabledCompressionEncodings,
        max_decoding_message_size: Option<usize>,
        max_encoding_message_size: Option<usize>,
    }
    impl<T> ExecutionServiceServer<T> {
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
    impl<T, B> tonic::codegen::Service<http::Request<B>> for ExecutionServiceServer<T>
    where
        T: ExecutionService,
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
                "/cream.v1.ExecutionService/CheckConstraints" => {
                    #[allow(non_camel_case_types)]
                    struct CheckConstraintsSvc<T: ExecutionService>(pub Arc<T>);
                    impl<
                        T: ExecutionService,
                    > tonic::server::UnaryService<super::CheckConstraintsRequest>
                    for CheckConstraintsSvc<T> {
                        type Response = super::CheckConstraintsResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::CheckConstraintsRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as ExecutionService>::check_constraints(&inner, request)
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
                        let method = CheckConstraintsSvc(inner);
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
                "/cream.v1.ExecutionService/SubmitOrder" => {
                    #[allow(non_camel_case_types)]
                    struct SubmitOrderSvc<T: ExecutionService>(pub Arc<T>);
                    impl<
                        T: ExecutionService,
                    > tonic::server::UnaryService<super::SubmitOrderRequest>
                    for SubmitOrderSvc<T> {
                        type Response = super::SubmitOrderResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::SubmitOrderRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as ExecutionService>::submit_order(&inner, request).await
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
                        let method = SubmitOrderSvc(inner);
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
                "/cream.v1.ExecutionService/GetOrderState" => {
                    #[allow(non_camel_case_types)]
                    struct GetOrderStateSvc<T: ExecutionService>(pub Arc<T>);
                    impl<
                        T: ExecutionService,
                    > tonic::server::UnaryService<super::GetOrderStateRequest>
                    for GetOrderStateSvc<T> {
                        type Response = super::GetOrderStateResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::GetOrderStateRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as ExecutionService>::get_order_state(&inner, request)
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
                        let method = GetOrderStateSvc(inner);
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
                "/cream.v1.ExecutionService/CancelOrder" => {
                    #[allow(non_camel_case_types)]
                    struct CancelOrderSvc<T: ExecutionService>(pub Arc<T>);
                    impl<
                        T: ExecutionService,
                    > tonic::server::UnaryService<super::CancelOrderRequest>
                    for CancelOrderSvc<T> {
                        type Response = super::CancelOrderResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::CancelOrderRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as ExecutionService>::cancel_order(&inner, request).await
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
                        let method = CancelOrderSvc(inner);
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
                "/cream.v1.ExecutionService/StreamExecutions" => {
                    #[allow(non_camel_case_types)]
                    struct StreamExecutionsSvc<T: ExecutionService>(pub Arc<T>);
                    impl<
                        T: ExecutionService,
                    > tonic::server::ServerStreamingService<
                        super::StreamExecutionsRequest,
                    > for StreamExecutionsSvc<T> {
                        type Response = super::StreamExecutionsResponse;
                        type ResponseStream = T::StreamExecutionsStream;
                        type Future = BoxFuture<
                            tonic::Response<Self::ResponseStream>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::StreamExecutionsRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as ExecutionService>::stream_executions(&inner, request)
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
                        let method = StreamExecutionsSvc(inner);
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
                "/cream.v1.ExecutionService/GetAccountState" => {
                    #[allow(non_camel_case_types)]
                    struct GetAccountStateSvc<T: ExecutionService>(pub Arc<T>);
                    impl<
                        T: ExecutionService,
                    > tonic::server::UnaryService<super::GetAccountStateRequest>
                    for GetAccountStateSvc<T> {
                        type Response = super::GetAccountStateResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::GetAccountStateRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as ExecutionService>::get_account_state(&inner, request)
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
                        let method = GetAccountStateSvc(inner);
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
                "/cream.v1.ExecutionService/GetPositions" => {
                    #[allow(non_camel_case_types)]
                    struct GetPositionsSvc<T: ExecutionService>(pub Arc<T>);
                    impl<
                        T: ExecutionService,
                    > tonic::server::UnaryService<super::GetPositionsRequest>
                    for GetPositionsSvc<T> {
                        type Response = super::GetPositionsResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::GetPositionsRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as ExecutionService>::get_positions(&inner, request)
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
                        let method = GetPositionsSvc(inner);
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
    impl<T> Clone for ExecutionServiceServer<T> {
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
    pub const SERVICE_NAME: &str = "cream.v1.ExecutionService";
    impl<T> tonic::server::NamedService for ExecutionServiceServer<T> {
        const NAME: &'static str = SERVICE_NAME;
    }
}
/// Generated client implementations.
pub mod market_data_service_client {
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
    pub struct MarketDataServiceClient<T> {
        inner: tonic::client::Grpc<T>,
    }
    impl MarketDataServiceClient<tonic::transport::Channel> {
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
    impl<T> MarketDataServiceClient<T>
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
        ) -> MarketDataServiceClient<InterceptedService<T, F>>
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
            MarketDataServiceClient::new(InterceptedService::new(inner, interceptor))
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
        pub async fn subscribe_market_data(
            &mut self,
            request: impl tonic::IntoRequest<super::SubscribeMarketDataRequest>,
        ) -> std::result::Result<
            tonic::Response<tonic::codec::Streaming<super::SubscribeMarketDataResponse>>,
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
                "/cream.v1.MarketDataService/SubscribeMarketData",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new("cream.v1.MarketDataService", "SubscribeMarketData"),
                );
            self.inner.server_streaming(req, path, codec).await
        }
        pub async fn get_snapshot(
            &mut self,
            request: impl tonic::IntoRequest<super::GetSnapshotRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetSnapshotResponse>,
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
                "/cream.v1.MarketDataService/GetSnapshot",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("cream.v1.MarketDataService", "GetSnapshot"));
            self.inner.unary(req, path, codec).await
        }
        pub async fn get_option_chain(
            &mut self,
            request: impl tonic::IntoRequest<super::GetOptionChainRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetOptionChainResponse>,
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
                "/cream.v1.MarketDataService/GetOptionChain",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("cream.v1.MarketDataService", "GetOptionChain"));
            self.inner.unary(req, path, codec).await
        }
    }
}
/// Generated server implementations.
pub mod market_data_service_server {
    #![allow(
        unused_variables,
        dead_code,
        missing_docs,
        clippy::wildcard_imports,
        clippy::let_unit_value,
    )]
    use tonic::codegen::*;
    /// Generated trait containing gRPC methods that should be implemented for use with MarketDataServiceServer.
    #[async_trait]
    pub trait MarketDataService: std::marker::Send + std::marker::Sync + 'static {
        /// Server streaming response type for the SubscribeMarketData method.
        type SubscribeMarketDataStream: tonic::codegen::tokio_stream::Stream<
                Item = std::result::Result<
                    super::SubscribeMarketDataResponse,
                    tonic::Status,
                >,
            >
            + std::marker::Send
            + 'static;
        async fn subscribe_market_data(
            &self,
            request: tonic::Request<super::SubscribeMarketDataRequest>,
        ) -> std::result::Result<
            tonic::Response<Self::SubscribeMarketDataStream>,
            tonic::Status,
        >;
        async fn get_snapshot(
            &self,
            request: tonic::Request<super::GetSnapshotRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetSnapshotResponse>,
            tonic::Status,
        >;
        async fn get_option_chain(
            &self,
            request: tonic::Request<super::GetOptionChainRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetOptionChainResponse>,
            tonic::Status,
        >;
    }
    #[derive(Debug)]
    pub struct MarketDataServiceServer<T> {
        inner: Arc<T>,
        accept_compression_encodings: EnabledCompressionEncodings,
        send_compression_encodings: EnabledCompressionEncodings,
        max_decoding_message_size: Option<usize>,
        max_encoding_message_size: Option<usize>,
    }
    impl<T> MarketDataServiceServer<T> {
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
    impl<T, B> tonic::codegen::Service<http::Request<B>> for MarketDataServiceServer<T>
    where
        T: MarketDataService,
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
                "/cream.v1.MarketDataService/SubscribeMarketData" => {
                    #[allow(non_camel_case_types)]
                    struct SubscribeMarketDataSvc<T: MarketDataService>(pub Arc<T>);
                    impl<
                        T: MarketDataService,
                    > tonic::server::ServerStreamingService<
                        super::SubscribeMarketDataRequest,
                    > for SubscribeMarketDataSvc<T> {
                        type Response = super::SubscribeMarketDataResponse;
                        type ResponseStream = T::SubscribeMarketDataStream;
                        type Future = BoxFuture<
                            tonic::Response<Self::ResponseStream>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::SubscribeMarketDataRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as MarketDataService>::subscribe_market_data(
                                        &inner,
                                        request,
                                    )
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
                        let method = SubscribeMarketDataSvc(inner);
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
                "/cream.v1.MarketDataService/GetSnapshot" => {
                    #[allow(non_camel_case_types)]
                    struct GetSnapshotSvc<T: MarketDataService>(pub Arc<T>);
                    impl<
                        T: MarketDataService,
                    > tonic::server::UnaryService<super::GetSnapshotRequest>
                    for GetSnapshotSvc<T> {
                        type Response = super::GetSnapshotResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::GetSnapshotRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as MarketDataService>::get_snapshot(&inner, request)
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
                        let method = GetSnapshotSvc(inner);
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
                "/cream.v1.MarketDataService/GetOptionChain" => {
                    #[allow(non_camel_case_types)]
                    struct GetOptionChainSvc<T: MarketDataService>(pub Arc<T>);
                    impl<
                        T: MarketDataService,
                    > tonic::server::UnaryService<super::GetOptionChainRequest>
                    for GetOptionChainSvc<T> {
                        type Response = super::GetOptionChainResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::GetOptionChainRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as MarketDataService>::get_option_chain(&inner, request)
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
                        let method = GetOptionChainSvc(inner);
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
    impl<T> Clone for MarketDataServiceServer<T> {
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
    pub const SERVICE_NAME: &str = "cream.v1.MarketDataService";
    impl<T> tonic::server::NamedService for MarketDataServiceServer<T> {
        const NAME: &'static str = SERVICE_NAME;
    }
}
/// Generated client implementations.
pub mod stream_proxy_service_client {
    #![allow(
        unused_variables,
        dead_code,
        missing_docs,
        clippy::wildcard_imports,
        clippy::let_unit_value,
    )]
    use tonic::codegen::*;
    use tonic::codegen::http::Uri;
    /** StreamProxy service provides real-time market data and order updates
 by proxying Alpaca WebSocket connections through a single gRPC interface.
*/
    #[derive(Debug, Clone)]
    pub struct StreamProxyServiceClient<T> {
        inner: tonic::client::Grpc<T>,
    }
    impl StreamProxyServiceClient<tonic::transport::Channel> {
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
    impl<T> StreamProxyServiceClient<T>
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
        ) -> StreamProxyServiceClient<InterceptedService<T, F>>
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
            StreamProxyServiceClient::new(InterceptedService::new(inner, interceptor))
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
        /** Stream real-time stock quotes (SIP feed)
*/
        pub async fn stream_quotes(
            &mut self,
            request: impl tonic::IntoRequest<super::StreamQuotesRequest>,
        ) -> std::result::Result<
            tonic::Response<tonic::codec::Streaming<super::StreamQuotesResponse>>,
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
                "/cream.v1.StreamProxyService/StreamQuotes",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("cream.v1.StreamProxyService", "StreamQuotes"));
            self.inner.server_streaming(req, path, codec).await
        }
        /** Stream real-time stock trades (SIP feed)
*/
        pub async fn stream_trades(
            &mut self,
            request: impl tonic::IntoRequest<super::StreamTradesRequest>,
        ) -> std::result::Result<
            tonic::Response<tonic::codec::Streaming<super::StreamTradesResponse>>,
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
                "/cream.v1.StreamProxyService/StreamTrades",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("cream.v1.StreamProxyService", "StreamTrades"));
            self.inner.server_streaming(req, path, codec).await
        }
        /** Stream real-time stock bars (SIP feed)
*/
        pub async fn stream_bars(
            &mut self,
            request: impl tonic::IntoRequest<super::StreamBarsRequest>,
        ) -> std::result::Result<
            tonic::Response<tonic::codec::Streaming<super::StreamBarsResponse>>,
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
                "/cream.v1.StreamProxyService/StreamBars",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("cream.v1.StreamProxyService", "StreamBars"));
            self.inner.server_streaming(req, path, codec).await
        }
        /** Stream real-time option quotes (OPRA feed)
*/
        pub async fn stream_option_quotes(
            &mut self,
            request: impl tonic::IntoRequest<super::StreamOptionQuotesRequest>,
        ) -> std::result::Result<
            tonic::Response<tonic::codec::Streaming<super::StreamOptionQuotesResponse>>,
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
                "/cream.v1.StreamProxyService/StreamOptionQuotes",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new("cream.v1.StreamProxyService", "StreamOptionQuotes"),
                );
            self.inner.server_streaming(req, path, codec).await
        }
        /** Stream real-time option trades (OPRA feed)
*/
        pub async fn stream_option_trades(
            &mut self,
            request: impl tonic::IntoRequest<super::StreamOptionTradesRequest>,
        ) -> std::result::Result<
            tonic::Response<tonic::codec::Streaming<super::StreamOptionTradesResponse>>,
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
                "/cream.v1.StreamProxyService/StreamOptionTrades",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new("cream.v1.StreamProxyService", "StreamOptionTrades"),
                );
            self.inner.server_streaming(req, path, codec).await
        }
        /** Stream real-time order updates (trade updates)
*/
        pub async fn stream_order_updates(
            &mut self,
            request: impl tonic::IntoRequest<super::StreamOrderUpdatesRequest>,
        ) -> std::result::Result<
            tonic::Response<tonic::codec::Streaming<super::StreamOrderUpdatesResponse>>,
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
                "/cream.v1.StreamProxyService/StreamOrderUpdates",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new("cream.v1.StreamProxyService", "StreamOrderUpdates"),
                );
            self.inner.server_streaming(req, path, codec).await
        }
        /** Get current connection status
*/
        pub async fn get_connection_status(
            &mut self,
            request: impl tonic::IntoRequest<super::GetConnectionStatusRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetConnectionStatusResponse>,
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
                "/cream.v1.StreamProxyService/GetConnectionStatus",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new("cream.v1.StreamProxyService", "GetConnectionStatus"),
                );
            self.inner.unary(req, path, codec).await
        }
    }
}
/// Generated server implementations.
pub mod stream_proxy_service_server {
    #![allow(
        unused_variables,
        dead_code,
        missing_docs,
        clippy::wildcard_imports,
        clippy::let_unit_value,
    )]
    use tonic::codegen::*;
    /// Generated trait containing gRPC methods that should be implemented for use with StreamProxyServiceServer.
    #[async_trait]
    pub trait StreamProxyService: std::marker::Send + std::marker::Sync + 'static {
        /// Server streaming response type for the StreamQuotes method.
        type StreamQuotesStream: tonic::codegen::tokio_stream::Stream<
                Item = std::result::Result<super::StreamQuotesResponse, tonic::Status>,
            >
            + std::marker::Send
            + 'static;
        /** Stream real-time stock quotes (SIP feed)
*/
        async fn stream_quotes(
            &self,
            request: tonic::Request<super::StreamQuotesRequest>,
        ) -> std::result::Result<
            tonic::Response<Self::StreamQuotesStream>,
            tonic::Status,
        >;
        /// Server streaming response type for the StreamTrades method.
        type StreamTradesStream: tonic::codegen::tokio_stream::Stream<
                Item = std::result::Result<super::StreamTradesResponse, tonic::Status>,
            >
            + std::marker::Send
            + 'static;
        /** Stream real-time stock trades (SIP feed)
*/
        async fn stream_trades(
            &self,
            request: tonic::Request<super::StreamTradesRequest>,
        ) -> std::result::Result<
            tonic::Response<Self::StreamTradesStream>,
            tonic::Status,
        >;
        /// Server streaming response type for the StreamBars method.
        type StreamBarsStream: tonic::codegen::tokio_stream::Stream<
                Item = std::result::Result<super::StreamBarsResponse, tonic::Status>,
            >
            + std::marker::Send
            + 'static;
        /** Stream real-time stock bars (SIP feed)
*/
        async fn stream_bars(
            &self,
            request: tonic::Request<super::StreamBarsRequest>,
        ) -> std::result::Result<tonic::Response<Self::StreamBarsStream>, tonic::Status>;
        /// Server streaming response type for the StreamOptionQuotes method.
        type StreamOptionQuotesStream: tonic::codegen::tokio_stream::Stream<
                Item = std::result::Result<
                    super::StreamOptionQuotesResponse,
                    tonic::Status,
                >,
            >
            + std::marker::Send
            + 'static;
        /** Stream real-time option quotes (OPRA feed)
*/
        async fn stream_option_quotes(
            &self,
            request: tonic::Request<super::StreamOptionQuotesRequest>,
        ) -> std::result::Result<
            tonic::Response<Self::StreamOptionQuotesStream>,
            tonic::Status,
        >;
        /// Server streaming response type for the StreamOptionTrades method.
        type StreamOptionTradesStream: tonic::codegen::tokio_stream::Stream<
                Item = std::result::Result<
                    super::StreamOptionTradesResponse,
                    tonic::Status,
                >,
            >
            + std::marker::Send
            + 'static;
        /** Stream real-time option trades (OPRA feed)
*/
        async fn stream_option_trades(
            &self,
            request: tonic::Request<super::StreamOptionTradesRequest>,
        ) -> std::result::Result<
            tonic::Response<Self::StreamOptionTradesStream>,
            tonic::Status,
        >;
        /// Server streaming response type for the StreamOrderUpdates method.
        type StreamOrderUpdatesStream: tonic::codegen::tokio_stream::Stream<
                Item = std::result::Result<
                    super::StreamOrderUpdatesResponse,
                    tonic::Status,
                >,
            >
            + std::marker::Send
            + 'static;
        /** Stream real-time order updates (trade updates)
*/
        async fn stream_order_updates(
            &self,
            request: tonic::Request<super::StreamOrderUpdatesRequest>,
        ) -> std::result::Result<
            tonic::Response<Self::StreamOrderUpdatesStream>,
            tonic::Status,
        >;
        /** Get current connection status
*/
        async fn get_connection_status(
            &self,
            request: tonic::Request<super::GetConnectionStatusRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetConnectionStatusResponse>,
            tonic::Status,
        >;
    }
    /** StreamProxy service provides real-time market data and order updates
 by proxying Alpaca WebSocket connections through a single gRPC interface.
*/
    #[derive(Debug)]
    pub struct StreamProxyServiceServer<T> {
        inner: Arc<T>,
        accept_compression_encodings: EnabledCompressionEncodings,
        send_compression_encodings: EnabledCompressionEncodings,
        max_decoding_message_size: Option<usize>,
        max_encoding_message_size: Option<usize>,
    }
    impl<T> StreamProxyServiceServer<T> {
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
    impl<T, B> tonic::codegen::Service<http::Request<B>> for StreamProxyServiceServer<T>
    where
        T: StreamProxyService,
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
                "/cream.v1.StreamProxyService/StreamQuotes" => {
                    #[allow(non_camel_case_types)]
                    struct StreamQuotesSvc<T: StreamProxyService>(pub Arc<T>);
                    impl<
                        T: StreamProxyService,
                    > tonic::server::ServerStreamingService<super::StreamQuotesRequest>
                    for StreamQuotesSvc<T> {
                        type Response = super::StreamQuotesResponse;
                        type ResponseStream = T::StreamQuotesStream;
                        type Future = BoxFuture<
                            tonic::Response<Self::ResponseStream>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::StreamQuotesRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as StreamProxyService>::stream_quotes(&inner, request)
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
                        let method = StreamQuotesSvc(inner);
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
                "/cream.v1.StreamProxyService/StreamTrades" => {
                    #[allow(non_camel_case_types)]
                    struct StreamTradesSvc<T: StreamProxyService>(pub Arc<T>);
                    impl<
                        T: StreamProxyService,
                    > tonic::server::ServerStreamingService<super::StreamTradesRequest>
                    for StreamTradesSvc<T> {
                        type Response = super::StreamTradesResponse;
                        type ResponseStream = T::StreamTradesStream;
                        type Future = BoxFuture<
                            tonic::Response<Self::ResponseStream>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::StreamTradesRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as StreamProxyService>::stream_trades(&inner, request)
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
                        let method = StreamTradesSvc(inner);
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
                "/cream.v1.StreamProxyService/StreamBars" => {
                    #[allow(non_camel_case_types)]
                    struct StreamBarsSvc<T: StreamProxyService>(pub Arc<T>);
                    impl<
                        T: StreamProxyService,
                    > tonic::server::ServerStreamingService<super::StreamBarsRequest>
                    for StreamBarsSvc<T> {
                        type Response = super::StreamBarsResponse;
                        type ResponseStream = T::StreamBarsStream;
                        type Future = BoxFuture<
                            tonic::Response<Self::ResponseStream>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::StreamBarsRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as StreamProxyService>::stream_bars(&inner, request)
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
                        let method = StreamBarsSvc(inner);
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
                "/cream.v1.StreamProxyService/StreamOptionQuotes" => {
                    #[allow(non_camel_case_types)]
                    struct StreamOptionQuotesSvc<T: StreamProxyService>(pub Arc<T>);
                    impl<
                        T: StreamProxyService,
                    > tonic::server::ServerStreamingService<
                        super::StreamOptionQuotesRequest,
                    > for StreamOptionQuotesSvc<T> {
                        type Response = super::StreamOptionQuotesResponse;
                        type ResponseStream = T::StreamOptionQuotesStream;
                        type Future = BoxFuture<
                            tonic::Response<Self::ResponseStream>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::StreamOptionQuotesRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as StreamProxyService>::stream_option_quotes(
                                        &inner,
                                        request,
                                    )
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
                        let method = StreamOptionQuotesSvc(inner);
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
                "/cream.v1.StreamProxyService/StreamOptionTrades" => {
                    #[allow(non_camel_case_types)]
                    struct StreamOptionTradesSvc<T: StreamProxyService>(pub Arc<T>);
                    impl<
                        T: StreamProxyService,
                    > tonic::server::ServerStreamingService<
                        super::StreamOptionTradesRequest,
                    > for StreamOptionTradesSvc<T> {
                        type Response = super::StreamOptionTradesResponse;
                        type ResponseStream = T::StreamOptionTradesStream;
                        type Future = BoxFuture<
                            tonic::Response<Self::ResponseStream>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::StreamOptionTradesRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as StreamProxyService>::stream_option_trades(
                                        &inner,
                                        request,
                                    )
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
                        let method = StreamOptionTradesSvc(inner);
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
                "/cream.v1.StreamProxyService/StreamOrderUpdates" => {
                    #[allow(non_camel_case_types)]
                    struct StreamOrderUpdatesSvc<T: StreamProxyService>(pub Arc<T>);
                    impl<
                        T: StreamProxyService,
                    > tonic::server::ServerStreamingService<
                        super::StreamOrderUpdatesRequest,
                    > for StreamOrderUpdatesSvc<T> {
                        type Response = super::StreamOrderUpdatesResponse;
                        type ResponseStream = T::StreamOrderUpdatesStream;
                        type Future = BoxFuture<
                            tonic::Response<Self::ResponseStream>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::StreamOrderUpdatesRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as StreamProxyService>::stream_order_updates(
                                        &inner,
                                        request,
                                    )
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
                        let method = StreamOrderUpdatesSvc(inner);
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
                "/cream.v1.StreamProxyService/GetConnectionStatus" => {
                    #[allow(non_camel_case_types)]
                    struct GetConnectionStatusSvc<T: StreamProxyService>(pub Arc<T>);
                    impl<
                        T: StreamProxyService,
                    > tonic::server::UnaryService<super::GetConnectionStatusRequest>
                    for GetConnectionStatusSvc<T> {
                        type Response = super::GetConnectionStatusResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::GetConnectionStatusRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as StreamProxyService>::get_connection_status(
                                        &inner,
                                        request,
                                    )
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
                        let method = GetConnectionStatusSvc(inner);
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
    impl<T> Clone for StreamProxyServiceServer<T> {
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
    pub const SERVICE_NAME: &str = "cream.v1.StreamProxyService";
    impl<T> tonic::server::NamedService for StreamProxyServiceServer<T> {
        const NAME: &'static str = SERVICE_NAME;
    }
}
