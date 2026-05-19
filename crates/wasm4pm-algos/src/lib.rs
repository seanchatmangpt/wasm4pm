#![doc = "High-performance, branchless algorithm implementations for wasm4pm process mining."]
#![doc = ""]
#![doc = "This crate implements discovery, conformance, and analysis algorithms optimized for:"]
#![doc = "- Minimal branch misses (cache-friendly execution)"]
#![doc = "- Predictable latency (sub-millisecond for WASM)"]
#![doc = "- Deterministic behavior (same input → same output every time)"]
#![doc = "- SIMD vectorization where applicable"]

pub mod alpha;
pub mod columnar;
pub mod conformance;
pub mod dfg;
pub mod heuristic;
pub mod streaming;

pub use wasm4pm_types;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
