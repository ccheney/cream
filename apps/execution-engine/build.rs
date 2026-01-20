//! Build Script for Execution Engine
//!
//! Handles coverage instrumentation and build-time configuration.
//! See: docs/plans/14-testing.md lines 866-873
//!
//! Coverage exclusions are handled via:
//! 1. `#[cfg(not(coverage))]` attributes on code
//! 2. `LLVM_PROFILE_FILE` environment variable
//! 3. `cargo-llvm-cov` ignore comments
//!
//! # Panics Policy
//!
//! Build scripts intentionally use `.expect()` and panic on failure because:
//! - Build scripts MUST halt the build process when prerequisites are missing
//! - There is no caller to propagate errors to - the build system handles panics
//! - Descriptive panic messages guide developers to fix configuration issues
//! - This is the idiomatic pattern for Cargo build scripts
#![allow(clippy::expect_used)]

use prost::Message;
use std::{env, fs, path::PathBuf, process::Command};

fn main() {
    // Set profile file pattern for coverage runs
    // This ensures unique profile files per process/module
    #[cfg(coverage)]
    {
        println!("cargo:rustc-env=LLVM_PROFILE_FILE=coverage-%p-%m.profraw");
    }

    // Rerun build script if it changes
    println!("cargo:rerun-if-changed=build.rs");

    // Rerun if proto files change (for future protobuf generation)
    println!("cargo:rerun-if-changed=../../packages/proto/cream/");

    // Emit cfg for coverage detection
    // Usage: #[cfg(coverage)] or #[cfg(not(coverage))]
    if env::var("CARGO_LLVM_COV").is_ok()
        || env::var("LLVM_PROFILE_FILE").is_ok()
        || env::var("RUSTFLAGS")
            .map(|f| f.contains("instrument-coverage"))
            .unwrap_or(false)
    {
        println!("cargo:rustc-cfg=coverage");
    }

    // Generate Rust protobuf stubs at build time from workspace proto definitions.
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let proto_root = manifest_dir.join("../../packages/proto");
    let proto_files = [
        proto_root.join("cream/v1/common.proto"),
        proto_root.join("cream/v1/decision.proto"),
        proto_root.join("cream/v1/events.proto"),
        proto_root.join("cream/v1/execution.proto"),
        proto_root.join("cream/v1/market_snapshot.proto"),
    ];

    for proto in &proto_files {
        println!("cargo:rerun-if-changed={}", proto.display());
    }

    // Use Buf to produce a file descriptor set (avoids requiring protoc in PATH).
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR not set"));
    let descriptor_path = out_dir.join("cream_descriptor.pb");
    let status = Command::new("buf")
        .arg("build")
        .arg("--output")
        .arg(&descriptor_path)
        .current_dir(&proto_root)
        .status()
        .expect("Failed to run buf build");

    assert!(
        status.success(),
        "buf build failed; ensure buf is installed and available in PATH"
    );

    let descriptor_bytes =
        fs::read(&descriptor_path).expect("Failed to read buf descriptor set output");
    let fds = prost_types::FileDescriptorSet::decode(&*descriptor_bytes)
        .expect("Failed to decode descriptor set");

    tonic_prost_build::configure()
        .build_client(false)
        .build_server(true)
        .compile_fds(fds)
        .expect("Failed to compile protobuf definitions");
}
