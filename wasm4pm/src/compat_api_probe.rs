//! Legacy module path retained as a dependency-direction guard.
//!
//! `wasm4pm` is the process-intelligence execution engine.  It must not depend
//! on `wasm4pm-compat`: adapters are downstream of the engine and may invoke the
//! published WebAssembly artifact, never the reverse.
//!
//! The former implementation imported `wasm4pm-compat` only to compile-probe
//! its public API.  That created an engine -> adapter dependency with no runtime
//! value.  Keep this module path temporarily so downstream Rust code that names
//! it receives an explicit boundary description rather than an unrelated
//! compile break, but expose no compat types from the engine.

/// Stable description of the dependency law for diagnostics and tests.
pub const DEPENDENCY_LAW: &str =
    "wasm4pm-compat -> wasm4pm WebAssembly; wasm4pm -/-> wasm4pm-compat";

/// Returns the dependency law without importing or executing an adapter.
#[must_use]
pub const fn dependency_law() -> &'static str {
    DEPENDENCY_LAW
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn engine_dependency_direction_is_explicit() {
        assert_eq!(
            dependency_law(),
            "wasm4pm-compat -> wasm4pm WebAssembly; wasm4pm -/-> wasm4pm-compat"
        );
    }
}
