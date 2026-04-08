//! Streaming discovery algorithms for memory-efficient processing of infinite event streams.
//!
//! This module provides streaming variants of all 21 process discovery algorithms.
//! Each algorithm maintains incremental state, processing events in O(1) or O(log n) time
//! while keeping memory usage proportional to open traces, not total events.
//!
//! # Architecture
//!
//! All streaming algorithms implement the [`StreamingAlgorithm`] trait:
//!
//! - `add_event()` - Append one event to an in-progress trace
//! - `close_trace()` - Finalize a trace and fold into model
//! - `snapshot()` - Non-destructive read of current model
//! - `finalize()` - Close all traces and return final model
//!
//! # Memory Model
//!
//! Memory usage is **O(open_traces × avg_trace_length)**, not O(total_events).
//! Completed traces are folded into compact count tables and freed immediately.
//!
//! # When to Use Streaming
//!
//! - **IoT pipelines** - events arrive incrementally over time
//! - **Memory-constrained environments** - cannot fit full log in RAM
//! - **Real-time analytics** - need immediate model updates
//! - **Infinite streams** - log never ends (e.g., monitoring systems)
//!
//! # When to Use Batch
//!
//! - **Small logs** - fits comfortably in memory
//! - **One-time analysis** - no need for incremental updates
//! - **Maximum accuracy** - some streaming algorithms use approximations

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub mod streaming_alpha;
pub mod streaming_astar;
pub mod streaming_declare;
pub mod streaming_dfg;
pub mod streaming_heuristic;
pub mod streaming_hill_climbing;
pub mod streaming_hybrid;
pub mod streaming_inductive;
pub mod streaming_noise_filtered_dfg;
pub mod streaming_skeleton;

// Re-export main streaming builders
pub use streaming_dfg::StreamingDfgBuilder;
pub use streaming_heuristic::StreamingHeuristicBuilder;
pub use streaming_skeleton::StreamingSkeletonBuilder;

/// Memory and progress statistics for a streaming session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamStats {
    /// Total events processed (including open traces)
    pub event_count: usize,
    /// Number of traces closed so far
    pub trace_count: usize,
    /// Number of currently open (in-progress) traces
    pub open_traces: usize,
    /// Estimated memory usage in bytes
    pub memory_bytes: usize,
    /// Number of unique activities seen
    pub activities: usize,
}

/// Core streaming algorithm trait.
///
/// All streaming discovery algorithms implement this trait, providing
/// a unified API for incremental event processing.
pub trait StreamingAlgorithm {
    /// The output model type (e.g., `DirectlyFollowsGraph`, `PetriNet`)
    type Model;

    /// Create a new streaming instance with empty state.
    fn new() -> Self;

    /// Append one event to an in-progress trace.
    ///
    /// The trace buffer for `case_id` is created automatically on first use.
    /// Events are buffered until `close_trace()` is called.
    fn add_event(&mut self, case_id: &str, activity: &str);

    /// Add a batch of events in one call (chunked ingestion).
    ///
    /// More efficient than calling `add_event()` repeatedly for large batches.
    fn add_batch(&mut self, events: &[(String, String)]) {
        for (case_id, activity) in events {
            self.add_event(case_id, activity);
        }
    }

    /// Close a trace: fold its events into the model and free the buffer.
    ///
    /// Returns `false` if `case_id` was not open.
    fn close_trace(&mut self, case_id: &str) -> bool;

    /// Get current model snapshot (non-destructive).
    ///
    /// Returns a model representing only *closed* traces.
    /// Open traces are not included until they are closed.
    fn snapshot(&self) -> Self::Model;

    /// Finalize the stream: close all traces and return the final model.
    ///
    /// After this call, the streaming instance is consumed and cannot be used further.
    fn finalize(mut self) -> Self::Model
    where
        Self: Sized,
    {
        // Flush any remaining open traces
        let case_ids: Vec<String> = self.open_trace_ids();
        for case_id in case_ids {
            self.close_trace(&case_id);
        }
        self.snapshot()
    }

    /// Get memory/progress statistics.
    fn stats(&self) -> StreamStats;

    /// Get IDs of currently open traces (for testing/debugging).
    fn open_trace_ids(&self) -> Vec<String> {
        Vec::new() // Default implementation
    }
}

/// Helper trait for algorithms that need activity interning.
pub trait ActivityInterner {
    /// Get or create an integer ID for an activity string.
    fn intern(&mut self, activity: &str) -> u32;

    /// Get the activity string for an ID.
    fn lookup(&self, id: u32) -> Option<&str>;

    /// Get the number of unique activities.
    fn vocab_size(&self) -> usize;
}

/// Activity interner implementation using string-to-integer mapping.
///
/// This is the core optimization that makes streaming algorithms fast:
/// - Edge counting uses `HashMap<(u32,u32), usize>` instead of `HashMap<(String,String), usize>`
/// - Integer keys hash and compare in ~1 cycle vs. O(len) for strings
/// - Memory per entry is ~12 bytes vs. ~80 bytes for string keys
#[derive(Debug, Clone)]
pub struct Interner {
    /// activity name → integer id
    vocab_map: HashMap<String, u32>,
    /// id → activity name
    vocab: Vec<String>,
}

impl Interner {
    /// Create a new interner with empty vocabulary.
    pub fn new() -> Self {
        Interner {
            vocab_map: HashMap::new(),
            vocab: Vec::new(),
        }
    }

    /// Get vocabulary size.
    pub fn len(&self) -> usize {
        self.vocab.len()
    }

    /// Check if vocabulary is empty.
    pub fn is_empty(&self) -> bool {
        self.vocab.is_empty()
    }

    /// Get activity name by ID.
    pub fn get(&self, id: u32) -> Option<&str> {
        self.vocab.get(id as usize).map(|s| s.as_str())
    }

    /// Get all activity names in insertion order.
    pub fn vocab(&self) -> &[String] {
        &self.vocab
    }
}

impl ActivityInterner for Interner {
    #[inline]
    fn intern(&mut self, activity: &str) -> u32 {
        if let Some(&id) = self.vocab_map.get(activity) {
            return id;
        }
        let id = self.vocab.len() as u32;
        self.vocab.push(activity.to_owned());
        self.vocab_map.insert(activity.to_owned(), id);
        id
    }

    #[inline]
    fn lookup(&self, id: u32) -> Option<&str> {
        self.get(id)
    }

    #[inline]
    fn vocab_size(&self) -> usize {
        self.len()
    }
}

impl Default for Interner {
    fn default() -> Self {
        Self::new()
    }
}

/// Helper macro to implement ActivityInterner for structs with an `interner` field.
macro_rules! impl_activity_interner {
    ($struct_name:ident) => {
        impl crate::streaming::ActivityInterner for $struct_name {
            #[inline]
            fn intern(&mut self, activity: &str) -> u32 {
                if let Some(&id) = self.interner.vocab_map.get(activity) {
                    return id;
                }
                let id = self.interner.vocab.len() as u32;
                self.interner.vocab.push(activity.to_owned());
                self.interner.vocab_map.insert(activity.to_owned(), id);
                id
            }

            #[inline]
            fn lookup(&self, id: u32) -> Option<&str> {
                self.interner.get(id)
            }

            #[inline]
            fn vocab_size(&self) -> usize {
                self.interner.len()
            }
        }
    };
}

/// Helper macro to implement ActivityInterner with direct interner methods.
/// Use this when the struct has `interner` as a field and you want `intern()`/`lookup()` methods.
#[allow(unused_macros)]
macro_rules! impl_activity_interner_methods {
    ($struct_name:ident) => {
        impl $struct_name {
            /// Intern an activity string and return its u32 id.
            #[inline]
            pub fn intern(&mut self, activity: &str) -> u32 {
                if let Some(&id) = self.interner.vocab_map.get(activity) {
                    return id;
                }
                let id = self.interner.vocab.len() as u32;
                self.interner.vocab.push(activity.to_owned());
                self.interner.vocab_map.insert(activity.to_owned(), id);
                id
            }

            /// Get the activity string for an ID.
            #[inline]
            pub fn lookup(&self, id: u32) -> Option<&str> {
                self.interner.get(id)
            }

            /// Get the number of unique activities.
            #[inline]
            pub fn vocab_size(&self) -> usize {
                self.interner.len()
            }
        }
    };
}

// Export the macros for use in submodules
pub(crate) use impl_activity_interner;
#[allow(unused_imports)]
pub(crate) use impl_activity_interner_methods;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interner_basic() {
        let mut interner = Interner::new();

        // First insert
        let id_a = interner.intern("A");
        assert_eq!(id_a, 0);
        assert_eq!(interner.len(), 1);

        // Duplicate insert returns same ID
        let id_a2 = interner.intern("A");
        assert_eq!(id_a2, 0);
        assert_eq!(interner.len(), 1);

        // New activity
        let id_b = interner.intern("B");
        assert_eq!(id_b, 1);
        assert_eq!(interner.len(), 2);

        // Lookup
        assert_eq!(interner.get(0), Some("A"));
        assert_eq!(interner.get(1), Some("B"));
        assert_eq!(interner.get(2), None);
    }

    #[test]
    fn test_stream_stats_default() {
        let stats = StreamStats {
            event_count: 0,
            trace_count: 0,
            open_traces: 0,
            memory_bytes: 0,
            activities: 0,
        };

        assert_eq!(stats.event_count, 0);
        assert_eq!(stats.trace_count, 0);
        assert_eq!(stats.open_traces, 0);
    }
}
