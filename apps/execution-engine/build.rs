//! Build Script for Execution Engine
//!
//! Handles coverage instrumentation and build-time configuration.
//! See: docs/plans/14-testing.md lines 866-873
//!
//! Coverage exclusions are handled via:
//! 1. `#[cfg(not(coverage))]` attributes on code
//! 2. `LLVM_PROFILE_FILE` environment variable
//! 3. `cargo-llvm-cov` ignore comments

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
    println!("cargo:rerun-if-changed=../../packages/schema/proto/");

    // Emit cfg for coverage detection
    // Usage: #[cfg(coverage)] or #[cfg(not(coverage))]
    if std::env::var("CARGO_LLVM_COV").is_ok()
        || std::env::var("LLVM_PROFILE_FILE").is_ok()
        || std::env::var("RUSTFLAGS")
            .map(|f| f.contains("instrument-coverage"))
            .unwrap_or(false)
    {
        println!("cargo:rustc-cfg=coverage");
    }
}
