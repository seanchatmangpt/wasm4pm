//! Probabilistic data structures for memory-ephemeral process mining.
//!
//! These structures allow processing arbitrarily large event logs with bounded
//! memory by trading exact answers for approximate ones with quantifiable error.
//!
//! # Structures
//!
//! - [`CountMinSketch`] — frequency estimation for DFG edges
//! - [`HyperLogLog`] — cardinality estimation (unique trace count)
//! - [`BloomFilter`] — set membership for trace deduplication
//! - [`StreamingLog`] — combines all three into a single streaming DFG builder

pub mod bloom;
pub mod count_min;
pub mod hyperloglog;
pub mod streaming_log;

#[cfg(target_arch = "wasm32")]
pub mod wasm_bindings;

pub use bloom::BloomFilter;
pub use count_min::CountMinSketch;
pub use hyperloglog::HyperLogLog;
pub use streaming_log::StreamingLog;
