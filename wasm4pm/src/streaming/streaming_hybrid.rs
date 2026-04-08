//! Hybrid streaming template for batch-recompute algorithms.
//!
//! Some algorithms (ILP, Genetic, PSO, ACO, Simulated Annealing) require full
//! log context for optimal results. This template provides streaming semantics
//! by:
//!
//! 1. Accumulating state cheaply using `StreamingDfgBuilder`
//! 2. Periodically recomputing the batch algorithm on accumulated data
//! 3. Returning the most recent model on snapshot/finalize
//!
//! This provides a good trade-off: memory-efficient state accumulation with
//! periodic full-model updates.

use crate::models::DirectlyFollowsGraph;
use crate::streaming::{StreamStats, StreamingAlgorithm, StreamingDfgBuilder};
use std::marker::PhantomData;

/// Batch algorithm trait for hybrid streaming.
///
/// Implement this for algorithms that need full log recompute.
pub trait BatchAlgorithm {
    type Model: Clone;

    /// Discover model from DFG.
    fn discover_from_dfg(&self, dfg: &DirectlyFollowsGraph) -> Self::Model;
}

/// Hybrid streaming implementation.
///
/// Accumulates state incrementally using `StreamingDfgBuilder`, then
/// periodically recomputes the batch algorithm.
///
/// # Performance
///
/// - **Per-event overhead**: ~100ns (same as DFG, cheap state accumulation)
/// - **Recompute cost**: O(batch_algorithm_cost) every N traces
/// - **Memory**: O(open_traces × avg_trace_length)
///
/// # Example
///
/// ```rust
/// use pictl::streaming::streaming_hybrid::{StreamingHybrid, BatchAlgorithm};
/// use pictl::streaming::StreamingAlgorithm;
///
/// struct GeneticAlgorithm;
///
/// impl BatchAlgorithm for GeneticAlgorithm {
///     type Model = DirectlyFollowsGraph;
///
///     fn discover_from_dfg(&self, dfg: &DirectlyFollowsGraph) -> Self::Model {
///         // Run genetic algorithm on DFG
///         dfg.clone()
///     }
/// }
///
/// let mut stream = StreamingHybrid::<GeneticAlgorithm>::new();
/// stream.add_event("case1", "A");
/// stream.add_event("case1", "B");
/// stream.close_trace("case1");
///
/// let model = stream.snapshot();
/// ```
pub struct StreamingHybrid<A>
where
    A: BatchAlgorithm,
{
    /// Batch algorithm instance
    batch_algorithm: A,
    /// Streaming state accumulator
    state: StreamingDfgBuilder,
    /// Recompute interval (number of traces between recomputes)
    recompute_interval: usize,
    /// Number of traces processed
    trace_count: usize,
    /// Most recent model (from last recompute)
    last_model: Option<A::Model>,
    /// Phantom data for the algorithm type
    _phantom: PhantomData<A>,
}

impl<A> StreamingHybrid<A>
where
    A: BatchAlgorithm,
{
    /// Create a new hybrid streaming instance with default recompute interval (100 traces).
    pub fn new(batch_algorithm: A) -> Self {
        StreamingHybrid {
            batch_algorithm,
            state: StreamingDfgBuilder::new(),
            recompute_interval: 100,
            trace_count: 0,
            last_model: None,
            _phantom: PhantomData,
        }
    }

    /// Create a new hybrid streaming instance with custom recompute interval.
    ///
    /// # Arguments
    ///
    /// * `batch_algorithm` - The batch algorithm to run
    /// * `recompute_interval` - Number of traces between recomputes
    ///
    /// Recommended intervals:
    /// - 50: For expensive algorithms (ILP)
    /// - 100: For moderate algorithms (Genetic, PSO, ACO)
    /// - 200: For fast algorithms
    pub fn with_interval(batch_algorithm: A, recompute_interval: usize) -> Self {
        StreamingHybrid {
            batch_algorithm,
            state: StreamingDfgBuilder::new(),
            recompute_interval,
            trace_count: 0,
            last_model: None,
            _phantom: PhantomData,
        }
    }

    /// Trigger an immediate recompute (useful for final snapshot).
    pub fn recompute(&mut self) {
        let dfg = self.state.snapshot();
        self.last_model = Some(self.batch_algorithm.discover_from_dfg(&dfg));
    }
}

impl<A> StreamingAlgorithm for StreamingHybrid<A>
where
    A: BatchAlgorithm,
{
    type Model = A::Model;

    fn new() -> Self {
        // This requires A: Default, which may not always be available
        // Users should use StreamingHybrid::new(batch_algorithm) instead
        panic!("StreamingHybrid::new() not supported. Use StreamingHybrid::new(batch_algorithm) instead.");
    }

    fn add_event(&mut self, case_id: &str, activity: &str) {
        self.state.add_event(case_id, activity);
    }

    fn close_trace(&mut self, case_id: &str) -> bool {
        let closed = self.state.close_trace(case_id);
        if closed {
            self.trace_count += 1;

            // Trigger recompute if interval reached
            if self.trace_count % self.recompute_interval == 0 {
                self.recompute();
            }
        }
        closed
    }

    fn snapshot(&self) -> Self::Model {
        // Return last computed model, or compute now if none exists
        if let Some(ref model) = self.last_model {
            // Note: this requires Model: Clone. For non-cloneable models,
            // we'd need a different approach (e.g., Arc<Model>)
            model.clone()
        } else {
            // No model yet, compute from current state
            let dfg = self.state.snapshot();
            self.batch_algorithm.discover_from_dfg(&dfg)
        }
    }

    fn finalize(mut self) -> Self::Model {
        // Final recompute to include all traces
        self.recompute();
        self.last_model.unwrap()
    }

    fn stats(&self) -> StreamStats {
        self.state.stats()
    }

    fn open_trace_ids(&self) -> Vec<String> {
        self.state.open_trace_ids()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Mock batch algorithm for testing
    struct MockBatchAlgorithm;

    impl BatchAlgorithm for MockBatchAlgorithm {
        type Model = DirectlyFollowsGraph;

        fn discover_from_dfg(&self, dfg: &DirectlyFollowsGraph) -> Self::Model {
            // Simply return the DFG (in real algorithms, this would do work)
            dfg.clone()
        }
    }

    #[test]
    fn test_hybrid_basic() {
        let batch_algo = MockBatchAlgorithm;
        let mut stream = StreamingHybrid::with_interval(batch_algo, 2);

        // Add 2 traces (should trigger one recompute)
        stream.add_event("case1", "A");
        stream.add_event("case1", "B");
        stream.close_trace("case1");

        stream.add_event("case2", "A");
        stream.add_event("case2", "B");
        stream.close_trace("case2");

        // Should have recomputed after trace 2
        let stats = stream.stats();
        assert_eq!(stats.trace_count, 2);
    }

    #[test]
    fn test_hybrid_recompute_interval() {
        let batch_algo = MockBatchAlgorithm;
        let mut stream = StreamingHybrid::with_interval(batch_algo, 5);

        // Add 4 traces (no recompute yet)
        for i in 1..=4 {
            stream.add_event(&format!("case{}", i), "A");
            stream.add_event(&format!("case{}", i), "B");
            stream.close_trace(&format!("case{}", i));
        }

        // No model computed yet (interval is 5)
        assert!(stream.last_model.is_none());

        // Add 5th trace (triggers recompute)
        stream.add_event("case5", "A");
        stream.add_event("case5", "B");
        stream.close_trace("case5");

        // Now model should be computed
        assert!(stream.last_model.is_some());
    }

    #[test]
    fn test_hybrid_finalize() {
        let batch_algo = MockBatchAlgorithm;
        let mut stream = StreamingHybrid::with_interval(batch_algo, 100);

        // Add traces
        for i in 1..=3 {
            stream.add_event(&format!("case{}", i), "A");
            stream.add_event(&format!("case{}", i), "B");
            stream.close_trace(&format!("case{}", i));
        }

        // Finalize should trigger recompute
        let model = stream.finalize();

        // Model should have data from all traces
        assert_eq!(model.nodes.len(), 2);
        assert_eq!(model.edges.len(), 1);
    }
}
